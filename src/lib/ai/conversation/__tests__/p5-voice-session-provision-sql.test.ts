// Optional actual single-connection PostgreSQL integration. Auth metadata and
// administrator policy records are fictional preconditions. Most cases use the
// actual database clock; explicitly marked boundary cases replace only the
// isolated fixture clock and restore it. No remote Auth, HTTP, provider or
// native contention evidence is claimed.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ConversationService } from "../service/service";
import { fingerprint, seal } from "../staging/seal.server";
import { createVoiceRpcStore, type VoiceRpcName } from "../service/voice-rpc-store.server";
import { createVoiceReadRpcPorts, type VoiceReadRpcName } from "../service/voice-read-rpc.server";
import {
  createVoiceSessionRevokeRpcPorts,
  type VoiceSessionRevokeRpcName,
} from "../service/voice-session-revoke-rpc.server";
import {
  createVoiceSessionProvisionRpcPorts,
  type VoiceSessionProvisionRpcName,
  type VoiceSessionProvisioningQuery,
} from "../service/voice-session-provision-rpc.server";
import { createVoiceStoreAdmission } from "../service/voice-store-adapter.server";

interface LocalDatabase {
  exec(sql: string): Promise<unknown>;
  query(sql: string, parameters?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  close(): Promise<void>;
  dumpDataDir(compression: string): Promise<unknown>;
  readonly closed: boolean;
}
const enginePath = process.env.BFA_PGLITE_MODULE;
const sqlSuite = enginePath ? describe : describe.skip;
const ROOT = process.cwd();
const MAX = Number.MAX_SAFE_INTEGER;
type RpcName =
  | VoiceRpcName
  | VoiceReadRpcName
  | VoiceSessionRevokeRpcName
  | VoiceSessionProvisionRpcName;
type Args = Readonly<Record<string, unknown>>;
const tables = [
  ...["staging_accounts", "threads", "allowances", "admissions"].map((n) => `public.bfa_p3b_${n}`),
  ...[
    "generations",
    "owner_clocks",
    "session_fences",
    "issuances",
    "quotas",
    "approvals",
    "cleanup_owners",
    "proofs",
    "attempts",
    "claims",
  ].map((n) => `bfa_p5_voice.${n}`),
  ...["pools", "routes", "allocations", "sessions", "evidence", "conflicts"].map(
    (n) => `bfa_p5_capacity.${n}`,
  ),
];

sqlSuite("P5 insert-once session provisioning in isolated PostgreSQL", () => {
  let db: LocalDatabase | undefined;
  let seed: LocalDatabase | undefined;
  let realClockDefinition: string;
  let existingPrivileges: unknown;
  const database = () => {
    if (!db) throw new Error("Offline fixture database unavailable");
    return db;
  };
  async function one(sql: string, args: unknown[] = []) {
    return (await database().query(sql, args)).rows[0]!;
  }
  async function privileges() {
    return (
      await one(`SELECT jsonb_build_object(
      'schemas',(SELECT jsonb_agg(jsonb_build_array(nspname,nspacl::text) ORDER BY nspname) FROM pg_namespace WHERE nspname IN ('bfa_p5_voice','bfa_p5_capacity')),
      'tables',(SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relacl::text) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('bfa_p5_voice','bfa_p5_capacity') AND c.relkind='r'),
      'helpers',(SELECT jsonb_agg(jsonb_build_array(n.nspname,p.proname,p.proacl::text) ORDER BY n.nspname,p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('bfa_p5_voice','bfa_p5_capacity'))
    ) AS value;`)
    ).value;
  }
  beforeAll(async () => {
    vi.stubEnv("BFA_P3B_STATE_SECRET", `offline-session-provision-${crypto.randomUUID()}`);
    if (!enginePath || !path.isAbsolute(enginePath))
      throw new Error("Absolute local engine path required");
    const modulePath = await realpath(enginePath);
    const pkg = JSON.parse(await readFile(path.resolve(modulePath, "../../package.json"), "utf8"));
    expect({ name: pkg.name, version: pkg.version }).toEqual({
      name: "@electric-sql/pglite",
      version: "0.5.12",
    });
    const { PGlite } = await import(/* @vite-ignore */ pathToFileURL(modulePath).href);
    seed = await PGlite.create();
    await seed!.exec("CREATE DATABASE bfa_p5_offline_fixture;");
    const bundle = await seed!.dumpDataDir("none");
    await seed!.close();
    expect(seed!.closed).toBe(true);
    seed = undefined;
    db = await PGlite.create({ loadDataDir: bundle, database: "bfa_p5_offline_fixture" });
    expect((await one("SELECT current_database() AS name;")).name).toBe("bfa_p5_offline_fixture");
    expect((await one("SHOW server_version;")).server_version).toMatch(/^18\.6/);
    const install = async (relative: string) =>
      database().exec(await readFile(path.join(ROOT, relative), "utf8"));
    await install("scripts/conversation-eval/p5-sql/bootstrap.sql");
    const migrations = (await readdir(path.join(ROOT, "drizzle/migrations")))
      .filter((n) => /^000[0-5]_.*\.sql$/.test(n))
      .sort();
    expect(migrations).toHaveLength(6);
    for (const name of migrations) await install(`drizzle/migrations/${name}`);
    for (const name of ["admission", "reads", "capacity", "session-revoke"])
      await install(`docs/pilot/conversation/sql-drafts/p5-voice-${name}.sql`);
    realClockDefinition = (
      await one("SELECT pg_get_functiondef('bfa_p5_voice.ms()'::regprocedure) AS definition;")
    ).definition as string;
    existingPrivileges = await privileges();
    await install("docs/pilot/conversation/sql-drafts/p5-voice-session-provision.sql");
  }, 60_000);
  afterAll(async () => {
    try {
      for (const instance of [seed, db]) {
        if (instance && !instance.closed) await instance.close();
        if (instance) expect(instance.closed).toBe(true);
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });
  async function asRole(
    role: "anon" | "authenticated" | "service_role",
    sql: string,
    args: unknown[] = [],
  ) {
    await database().exec(`BEGIN; SET LOCAL ROLE ${role};`);
    try {
      expect((await one("SELECT current_user AS role;")).role).toBe(role);
      const row = await one(sql, args);
      await database().exec("COMMIT;");
      return row;
    } catch (error) {
      await database().exec("ROLLBACK;");
      throw error;
    }
  }
  async function snapshot() {
    const result: Record<string, unknown> = {};
    for (const table of tables)
      result[table] = (
        await one(
          `SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS rows FROM ${table} t;`,
        )
      ).rows;
    return result;
  }
  async function assertOnlyOwnSessionClockChanged(
    before: Record<string, unknown>,
    q: { ownerId: string; sessionId: string },
  ) {
    const after = await snapshot();
    for (const table of tables) {
      const excluded =
        table === "bfa_p5_voice.owner_clocks" || table === "bfa_p5_voice.session_fences";
      const unaffected = (value: unknown) =>
        (value as Record<string, unknown>[]).filter(
          (row) =>
            row.owner_id !== q.ownerId ||
            (table === "bfa_p5_voice.session_fences" && row.session_id !== q.sessionId),
        );
      expect(excluded ? unaffected(after[table]) : after[table]).toEqual(
        excluded ? unaffected(before[table]) : before[table],
      );
    }
  }
  async function sessionRow(q: { ownerId: string; sessionId: string }) {
    return one(
      "SELECT owner_id,session_id,version,expires_ms,revoked,xmin::text AS xmin,ctid::text AS ctid FROM bfa_p5_voice.session_fences WHERE owner_id=$1 AND session_id=$2;",
      [q.ownerId, q.sessionId],
    );
  }
  async function clock(ownerId: string) {
    return (
      await one("SELECT observed_ms FROM bfa_p5_voice.owner_clocks WHERE owner_id=$1;", [ownerId])
    )?.observed_ms;
  }
  async function withClock<T>(value: number | null, operation: () => Promise<T>) {
    // Fixture-only model of a clock boundary, not clock/network fault injection.
    if (value !== null && !Number.isInteger(value)) throw new Error("Invalid fixture time");
    await database().exec(
      `CREATE OR REPLACE FUNCTION bfa_p5_voice.ms() RETURNS bigint LANGUAGE sql VOLATILE SET search_path=pg_catalog,pg_temp AS $$ SELECT ${value === null ? "NULL" : value}::bigint $$;`,
    );
    try {
      return await operation();
    } finally {
      await database().exec(realClockDefinition);
    }
  }
  function query(offset = 0): VoiceSessionProvisioningQuery {
    const verifiedAt = Date.now() + offset;
    return {
      ownerId: crypto.randomUUID(),
      sessionId: crypto.randomUUID(),
      verifiedAt,
      expiresAt: verifiedAt + 300_000,
    };
  }
  const pair = (q: { ownerId: string; sessionId: string }) => ({
    ownerId: q.ownerId,
    sessionId: q.sessionId,
  });
  async function rawProvision(args: unknown[]) {
    return (
      await asRole(
        "service_role",
        "SELECT public.bfa_p5_voice_provision_session($1::uuid,$2::uuid,$3::bigint,$4::bigint) AS value;",
        args,
      )
    ).value;
  }
  function transport() {
    const calls: { name: RpcName; args: Args; committed: boolean }[] = [];
    const hooks: {
      beforeCall?: (name: RpcName, args: Args) => Promise<void>;
      afterCommit?: (name: RpcName, args: Args, data: unknown) => Promise<unknown>;
    } = {};
    const client = {
      async rpc(name: RpcName, args: Args) {
        expect([
          "bfa_p5_voice_provision_session",
          "bfa_p5_voice_revoke_session",
          "bfa_p5_voice_read_session_fence",
          "bfa_p5_voice_read_current",
          "bfa_p5_voice_register_cleanup",
          "bfa_p5_voice_register_proof",
          "bfa_p5_capacity_claim",
          "bfa_p5_voice_inspect",
          "bfa_p5_capacity_close",
        ]).toContain(name);
        const call = { name, args, committed: false };
        calls.push(call);
        if (hooks.beforeCall) await hooks.beforeCall(name, args);
        const types: Record<string, string> = {
          p_owner_id: "uuid",
          p_session_id: "uuid",
          p_verified_ms: "bigint",
          p_expires_ms: "bigint",
          p_thread_id: "uuid",
          p_attempt_id: "uuid",
          p_authority_fingerprint: "text",
          p_cleanup_id: "uuid",
          p_receipt_id: "uuid",
          p_claim: "jsonb",
          p_proof: "jsonb",
        };
        const entries = Object.entries(args);
        const parameters = entries.map(([key, value]) => {
          expect(Object.hasOwn(types, key)).toBe(true);
          return types[key] === "jsonb" ? JSON.stringify(value) : value;
        });
        const named = entries.map(([key], i) => `${key}=>$${i + 1}::${types[key]}`).join(",");
        const row = await asRole(
          "service_role",
          `SELECT public.${name}(${named}) AS value;`,
          parameters,
        );
        call.committed = true;
        return {
          data: hooks.afterCommit ? await hooks.afterCommit(name, args, row.value) : row.value,
          error: null,
          status: 200,
        };
      },
    };
    return {
      calls,
      hooks,
      provision: createVoiceSessionProvisionRpcPorts(client),
      revoke: createVoiceSessionRevokeRpcPorts(client),
      reads: createVoiceReadRpcPorts(client),
      store: createVoiceRpcStore(client),
    };
  }
  const provision = (q: VoiceSessionProvisioningQuery) => transport().provision.provisionSession(q);
  const revoke = (q: { ownerId: string; sessionId: string }) =>
    transport().revoke.revokeSession(pair(q));
  const readSession = (q: { ownerId: string; sessionId: string }) =>
    transport().reads.readSessionFence(pair(q));

  it("commits one exact active fence and its clock through the actual named service-role mapping", async () => {
    const q = query(),
      t = transport(),
      before = await snapshot();
    const observed = await t.provision.provisionSession(q);
    expect(observed).toEqual({ ...pair(q), version: 0, expiresAt: q.expiresAt, revoked: false });
    expect(t.calls).toEqual([
      {
        name: "bfa_p5_voice_provision_session",
        args: {
          p_owner_id: q.ownerId,
          p_session_id: q.sessionId,
          p_verified_ms: q.verifiedAt,
          p_expires_ms: q.expiresAt,
        },
        committed: true,
      },
    ]);
    expect(await readSession(q)).toEqual(observed);
    expect(Number(await clock(q.ownerId))).toBeGreaterThanOrEqual(q.verifiedAt);
    await assertOnlyOwnSessionClockChanged(before, q);
  });
  it("acknowledges exact active metadata without updating its row or resetting its version", async () => {
    for (const version of [0, 17, MAX]) {
      const q = query();
      await provision(q);
      if (version)
        await database().query(
          "UPDATE bfa_p5_voice.session_fences SET version=$3 WHERE owner_id=$1 AND session_id=$2;",
          [q.ownerId, q.sessionId, version],
        );
      const row = await sessionRow(q),
        before = await snapshot();
      expect(await provision({ ...q, verifiedAt: Date.now() })).toEqual({
        ...pair(q),
        version,
        expiresAt: q.expiresAt,
        revoked: false,
      });
      expect(await sessionRow(q)).toEqual(row);
      await assertOnlyOwnSessionClockChanged(before, q);
    }
  });
  it("refuses both longer and shorter conflicting expiries without rewriting the original fence", async () => {
    const q = query();
    await provision(q);
    const row = await sessionRow(q),
      before = await snapshot();
    for (const delta of [-1, 1])
      expect(await provision({ ...q, expiresAt: q.expiresAt + delta })).toBeNull();
    expect(await sessionRow(q)).toEqual(row);
    await assertOnlyOwnSessionClockChanged(before, q);
  });
  it("keeps revoke-before-provision tombstones terminal across repeated valid provisioning", async () => {
    const q = query();
    await revoke(q);
    const row = await sessionRow(q),
      before = await snapshot();
    expect(row).toMatchObject({ version: 0, expires_ms: 1, revoked: true });
    for (let i = 0; i < 2; i++) expect(await provision(q)).toBeNull();
    expect(await sessionRow(q)).toEqual(row);
    expect(await readSession(q)).toBeNull();
    await assertOnlyOwnSessionClockChanged(before, q);
  });
  it("keeps provision-before-revoke terminal without resetting its advanced version or expiry", async () => {
    const q = query();
    await provision(q);
    expect(await revoke(q)).toEqual({
      ...pair(q),
      version: 1,
      expiresAt: q.expiresAt,
      revoked: true,
    });
    const row = await sessionRow(q),
      before = await snapshot();
    expect(await provision(q)).toBeNull();
    expect(await sessionRow(q)).toEqual(row);
    expect(await readSession(q)).toBeNull();
    await assertOnlyOwnSessionClockChanged(before, q);
  });
  it("cannot resurrect a terminal maximum-version fence", async () => {
    const q = query();
    await provision(q);
    await database().query(
      "UPDATE bfa_p5_voice.session_fences SET version=$3 WHERE owner_id=$1 AND session_id=$2;",
      [q.ownerId, q.sessionId, MAX],
    );
    await revoke(q);
    const row = await sessionRow(q);
    expect(await provision(q)).toBeNull();
    expect(await sessionRow(q)).toEqual(row);
    expect(row).toMatchObject({ version: MAX, revoked: true });
  });
  it("isolates another session and the same session UUID under a different exact owner pair", async () => {
    const q = query(),
      otherSession = { ...q, sessionId: crypto.randomUUID() },
      otherOwner = { ...q, ownerId: crypto.randomUUID() };
    await revoke(q);
    const before = await snapshot();
    expect(await provision(otherSession)).not.toBeNull();
    await assertOnlyOwnSessionClockChanged(before, otherSession);
    const second = await snapshot();
    expect(await provision(otherOwner)).not.toBeNull();
    await assertOnlyOwnSessionClockChanged(second, otherOwner);
    expect(await provision(q)).toBeNull();
  });
  it("denies invalid scalar SQL inputs before any persistence mutation", async () => {
    const q = query(),
      before = await snapshot();
    const valid = [q.ownerId, q.sessionId, q.verifiedAt, q.expiresAt];
    const invalid = [
      [null, q.sessionId, q.verifiedAt, q.expiresAt],
      [q.ownerId, null, q.verifiedAt, q.expiresAt],
      [q.ownerId, q.sessionId, null, q.expiresAt],
      [q.ownerId, q.sessionId, q.verifiedAt, null],
      [q.ownerId, q.sessionId, -1, q.expiresAt],
      [q.ownerId, q.sessionId, MAX + 1, MAX],
      [q.ownerId, q.sessionId, q.verifiedAt, 0],
      [q.ownerId, q.sessionId, q.verifiedAt, MAX + 1],
      [q.ownerId, q.sessionId, q.verifiedAt, q.verifiedAt],
      [q.ownerId, q.sessionId, q.verifiedAt, q.verifiedAt - 1],
      [q.ownerId, q.sessionId, q.verifiedAt, q.verifiedAt + 900_001],
    ];
    expect(valid).toHaveLength(4);
    for (const values of invalid) expect(await rawProvision(values)).toBeNull();
    expect(await snapshot()).toEqual(before);
  });
  it("denies future, stale and expired valid-shaped metadata while retaining the observed clock", async () => {
    const start = Date.now();
    for (const [verifiedAt, expiresAt] of [
      [start + 60_000, start + 120_000],
      [start - 31_000, start + 120_000],
      [start - 10_000, start - 1],
    ]) {
      const q = { ...query(), verifiedAt, expiresAt },
        before = await snapshot();
      expect(await provision(q)).toBeNull();
      expect(await sessionRow(q)).toBeUndefined();
      expect(Number(await clock(q.ownerId))).toBeGreaterThanOrEqual(start);
      await assertOnlyOwnSessionClockChanged(before, q);
    }
  });
  it("enforces exact verification-age and lifetime boundaries with a modeled isolated clock", async () => {
    const n = 1_800_000_000_000;
    await withClock(n, async () => {
      const atAge = { ...query(), verifiedAt: n - 30_000, expiresAt: n + 870_000 };
      expect(await provision(atAge)).toMatchObject({ expiresAt: n + 870_000 });
      const stale = { ...query(), verifiedAt: n - 30_001, expiresAt: n + 1000 };
      expect(await provision(stale)).toBeNull();
      const fullLifetime = { ...query(), verifiedAt: n, expiresAt: n + 900_000 };
      expect(await provision(fullLifetime)).toMatchObject({ expiresAt: n + 900_000 });
      const tooLong = { ...query(), verifiedAt: n, expiresAt: n + 900_001 },
        before = await snapshot();
      expect(
        await rawProvision([
          tooLong.ownerId,
          tooLong.sessionId,
          tooLong.verifiedAt,
          tooLong.expiresAt,
        ]),
      ).toBeNull();
      expect(await snapshot()).toEqual(before);
      expect(await provision({ ...query(), verifiedAt: n - 1, expiresAt: n })).toBeNull();
    });
  });
  it("retains observed expiry across a modeled clock rollback and cannot revive the same fence", async () => {
    const n = 1_800_000_000_000,
      q = { ...query(), verifiedAt: n, expiresAt: n + 100 };
    await withClock(n, async () => expect(await provision(q)).not.toBeNull());
    const row = await sessionRow(q);
    await withClock(n + 100, async () => expect(await provision(q)).toBeNull());
    expect(await clock(q.ownerId)).toBe(n + 100);
    const before = await snapshot();
    await withClock(n + 50, async () => {
      expect(await provision(q)).toBeNull();
      expect(await readSession(q)).toBeNull();
    });
    expect(await sessionRow(q)).toEqual(row);
    expect(await snapshot()).toEqual(before);
  });
  it("fails closed for unsafe modeled database time without creating a session or clock", async () => {
    for (const n of [-1, MAX + 1]) {
      const q = query(),
        before = await snapshot();
      await withClock(n, async () => expect(await provision(q)).toBeNull());
      expect(await snapshot()).toEqual(before);
    }
    const q = query(),
      before = await snapshot();
    await withClock(null, async () =>
      expect(provision(q)).rejects.toThrow("voice-session-provision-rpc-unavailable"),
    );
    expect(await snapshot()).toEqual(before);
  });
  it("denies a clock below retained high-water without changing any protected record", async () => {
    const q = query();
    await database().query("INSERT INTO bfa_p5_voice.owner_clocks VALUES($1,$2);", [
      q.ownerId,
      MAX,
    ]);
    const before = await snapshot();
    expect(await provision(q)).toBeNull();
    expect(await sessionRow(q)).toBeUndefined();
    expect(await snapshot()).toEqual(before);
  });
  it("preserves safe integer endpoints exactly under explicit modeled clock inputs", async () => {
    const low = { ...query(), verifiedAt: 0, expiresAt: 1 };
    await withClock(0, async () =>
      expect(await provision(low)).toMatchObject({ expiresAt: 1, version: 0 }),
    );
    const high = { ...query(), verifiedAt: MAX - 900_000, expiresAt: MAX };
    await withClock(high.verifiedAt, async () => {
      expect(await provision(high)).toMatchObject({ expiresAt: MAX, version: 0 });
      expect(await clock(high.ownerId)).toBe(high.verifiedAt);
    });
  });
  it("retains a committed session after a discarded reply and permits only deliberate exact acknowledgment", async () => {
    const q = query(),
      t = transport();
    t.hooks.afterCommit = async () => {
      throw new Error("fictional discarded committed reply");
    };
    await expect(t.provision.provisionSession(q)).rejects.toThrow(
      "voice-session-provision-rpc-unavailable",
    );
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0]!.committed).toBe(true);
    const row = await sessionRow(q);
    expect(row).toMatchObject({ version: 0, expires_ms: q.expiresAt, revoked: false });
    t.hooks.afterCommit = undefined;
    expect(await t.provision.provisionSession(q)).toMatchObject({
      version: 0,
      expiresAt: q.expiresAt,
    });
    expect(t.calls).toHaveLength(2);
    expect(t.calls[0]!.args).toEqual(t.calls[1]!.args);
    expect(await sessionRow(q)).toEqual(row);
  });
  it("retains committed state after null or malformed replies without an automatic replay", async () => {
    for (const response of [null, false, { revoked: false }]) {
      const q = query(),
        t = transport();
      t.hooks.afterCommit = async () => response;
      if (response === null) expect(await t.provision.provisionSession(q)).toBeNull();
      else
        await expect(t.provision.provisionSession(q)).rejects.toThrow(
          "voice-session-provision-rpc-unavailable",
        );
      expect(t.calls).toHaveLength(1);
      expect(await sessionRow(q)).toMatchObject({
        version: 0,
        expires_ms: q.expiresAt,
        revoked: false,
      });
      expect(await readSession(q)).toMatchObject({ expiresAt: q.expiresAt });
    }
  });
  it("does not treat a successful provisioning receipt as fresh eligibility after later revocation", async () => {
    const q = query(),
      t = transport();
    t.hooks.afterCommit = async (_name, _args, data) => {
      await revoke(q);
      return data;
    };
    expect(await t.provision.provisionSession(q)).toEqual({
      ...pair(q),
      version: 0,
      expiresAt: q.expiresAt,
      revoked: false,
    });
    expect(await readSession(q)).toBeNull();
    expect(await sessionRow(q)).toMatchObject({ version: 1, revoked: true });
  });
  it("lets a committed revoke-before-call win before the delayed provisioning invocation", async () => {
    const q = query(),
      t = transport();
    t.hooks.beforeCall = async () => {
      await revoke(q);
    };
    expect(await t.provision.provisionSession(q)).toBeNull();
    expect(await sessionRow(q)).toMatchObject({ version: 0, expires_ms: 1, revoked: true });
  });

  async function admissionFixture() {
    const q = query(),
      thread = crypto.randomUUID(),
      policy = crypto.randomUUID(),
      approval = crypto.randomUUID(),
      attempt = crypto.randomUUID(),
      pool = crypto.randomUUID();
    await database().query(
      "INSERT INTO public.bfa_p3b_staging_accounts(user_id,admitted,expires_at) VALUES($1,true,to_timestamp($2/1000.0));",
      [q.ownerId, q.expiresAt],
    );
    await database().query(
      "INSERT INTO public.bfa_p3b_threads(id,owner_id,saved_snapshot,saved_at) VALUES($1,$2,to_jsonb('fictional private source must not escape'::text),clock_timestamp());",
      [thread, q.ownerId],
    );
    const incarnation = (
      await asRole("service_role", "SELECT public.bfa_p5_voice_register_generation($1,$2) AS id;", [
        q.ownerId,
        thread,
      ])
    ).id as string;
    const service = new ConversationService({ verifiedOwnerId: q.ownerId });
    service.ensureThread(thread, false);
    const activeAuthority = await seal({
      owner: q.ownerId,
      thread,
      revision: 0,
      expires: q.expiresAt,
      authority: service.exportAuthority(thread),
    });
    expect(
      (
        await asRole(
          "service_role",
          "SELECT public.bfa_p5_voice_register_issuance($1,$2,$3,0,$4,$5,$6) AS registered;",
          [
            q.ownerId,
            thread,
            incarnation,
            await fingerprint(activeAuthority),
            q.verifiedAt,
            q.expiresAt,
          ],
        )
      ).registered,
    ).toBe(true);
    // Fictional administrative policy/approval setup only. Session creation is
    // intentionally absent until the real new provision RPC is called.
    await database().query("INSERT INTO bfa_p5_voice.quotas VALUES($1,$2,10,1,true);", [
      q.ownerId,
      policy,
    ]);
    await database().query(
      "INSERT INTO bfa_p5_voice.approvals VALUES($1,repeat('b',64),$2,$3,$4,0,$5,'developer-voice-session',$6,false,$7);",
      [approval, q.ownerId, thread, incarnation, attempt, q.expiresAt, policy],
    );
    await database().query(
      "INSERT INTO bfa_p5_capacity.pools(pool_id,active_limit,unit_limit,reservation_units,enabled) VALUES($1,2,20,1,true);",
      [pool],
    );
    await database().query("INSERT INTO bfa_p5_capacity.routes VALUES($1,$2,$3);", [
      q.ownerId,
      policy,
      pool,
    ]);
    const t = transport(),
      request = {
        threadId: thread,
        threadIncarnation: incarnation,
        threadRevision: 0,
        attemptId: attempt,
        activeAuthority,
      };
    const bridge = createVoiceStoreAdmission({
      ...t.store,
      ...t.reads,
      now: Date.now,
      maxProofAgeMs: 20_000,
      authenticate: async () => ({ ...pair(q), expiresAt: q.expiresAt }),
    });
    return { q, thread, pool, t, request, bridge };
  }
  async function held(ownerId: string, pool: string) {
    return one(
      "SELECT (SELECT remaining_units FROM bfa_p5_voice.quotas WHERE owner_id=$1) AS remaining,(SELECT COALESCE(sum(held_units),0)::integer FROM bfa_p5_voice.claims WHERE owner_id=$1) AS original_hold,occupied,held_units AS pool_hold FROM bfa_p5_capacity.pools WHERE pool_id=$2;",
      [ownerId, pool],
    );
  }
  it("supplies the missing reader prerequisite for real admission and preserves holds after revocation", async () => {
    const f = await admissionFixture();
    expect(await f.bridge.admit(f.request)).toBeNull();
    expect(await held(f.q.ownerId, f.pool)).toEqual({
      remaining: 10,
      original_hold: 0,
      occupied: 0,
      pool_hold: 0,
    });
    expect(await f.t.provision.provisionSession(f.q)).not.toBeNull();
    const lease = await f.bridge.admit(f.request);
    expect(lease?.snapshot().state).toBe("active");
    const heldState = { remaining: 9, original_hold: 1, occupied: 1, pool_hold: 1 };
    expect(await held(f.q.ownerId, f.pool)).toEqual(heldState);
    await revoke(f.q);
    const before = await snapshot();
    expect(await provision(f.q)).toBeNull();
    await assertOnlyOwnSessionClockChanged(before, f.q);
    expect(await lease!.revalidate()).toBe(false);
    expect(await held(f.q.ownerId, f.pool)).toEqual(heldState);
    await lease!.close();
    expect(await held(f.q.ownerId, f.pool)).toEqual({ ...heldState, occupied: 0 });
    // Deliberately committed content-free holds remain, not empty rollback evidence.
    expect(
      (
        await one(
          "SELECT count(*)::integer AS n FROM bfa_p5_voice.claims WHERE owner_id=$1 AND held_units=1;",
          [f.q.ownerId],
        )
      ).n,
    ).toBe(1);
  });
  it("does not grant thread eligibility merely because an exact session record can be provisioned", async () => {
    for (const action of ["cancel", "delete"]) {
      const f = await admissionFixture();
      await asRole("service_role", "SELECT public.bfa_p3b_fence($1,$2,$3) AS revision;", [
        f.q.ownerId,
        f.thread,
        action,
      ]);
      expect(await provision(f.q)).not.toBeNull();
      expect(await readSession(f.q)).not.toBeNull();
      expect(await f.bridge.admit(f.request)).toBeNull();
      expect(await held(f.q.ownerId, f.pool)).toEqual({
        remaining: 10,
        original_hold: 0,
        occupied: 0,
        pool_hold: 0,
      });
    }
  });
  it("restricts the new RPC to service role without opening private schemas tables or helpers", async () => {
    const q = query(),
      before = await snapshot();
    expect(await privileges()).toEqual(existingPrivileges);
    for (const role of ["anon", "authenticated"] as const)
      await expect(
        asRole(role, "SELECT public.bfa_p5_voice_provision_session($1,$2,$3,$4);", [
          q.ownerId,
          q.sessionId,
          q.verifiedAt,
          q.expiresAt,
        ]),
      ).rejects.toMatchObject({ code: "42501" });
    for (const role of ["anon", "authenticated", "service_role"] as const) {
      for (const table of tables.filter((n) => n.startsWith("bfa_p5_")))
        await expect(asRole(role, `SELECT * FROM ${table};`)).rejects.toMatchObject({
          code: "42501",
        });
      for (const sql of [
        "UPDATE bfa_p5_voice.session_fences SET revoked=false;",
        "DELETE FROM bfa_p5_voice.session_fences;",
        "SELECT bfa_p5_voice.lock_owner($1);",
      ])
        await expect(
          asRole(role, sql, sql.includes("$1") ? [q.ownerId] : []),
        ).rejects.toMatchObject({ code: "42501" });
    }
    expect(
      await one(
        "SELECT p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') AS anon,has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role,EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='bfa_p5_voice_provision_session';",
      ),
    ).toEqual({
      prosecdef: true,
      proconfig: ["search_path=pg_catalog, pg_temp"],
      anon: false,
      authenticated: false,
      service_role: true,
      public_execute: false,
    });
    expect(await snapshot()).toEqual(before);
  });
});
