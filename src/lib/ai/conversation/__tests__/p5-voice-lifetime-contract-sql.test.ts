// Executable counterexamples for the CURRENT v1 lifetime contract, not a v2
// implementation. Actual isolated single-connection PostgreSQL + existing
// adapters/issuer/admission/local crypto execute. Auth, policy and refreshed
// eligibility are fictional. Clock movement is fixture-only; no live Auth,
// HTTP fault injection, native concurrency or provider acceptance is claimed.
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
import { createVoiceSessionInitializer } from "../service/voice-session-initializer.server";
import { createVoiceAuthorityIssuer } from "../service/voice-issuance.server";
import {
  createVoiceIssuanceRpcPorts,
  type VoiceIssuanceRpcName,
} from "../service/voice-issuance-rpc.server";
import {
  createVoicePreissueReadRpcPorts,
  type VoicePreissueReadRpcName,
} from "../service/voice-preissue-read-rpc.server";

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
const PROVISION = "bfa_p5_voice_provision_session";
type RpcName =
  | VoiceRpcName
  | VoiceReadRpcName
  | VoiceSessionRevokeRpcName
  | VoiceSessionProvisionRpcName
  | VoiceIssuanceRpcName
  | VoicePreissueReadRpcName;
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

sqlSuite("P5 v1 lifetime counterexamples in isolated PostgreSQL", () => {
  let db: LocalDatabase | undefined;
  let seed: LocalDatabase | undefined;
  let realClockDefinition: string;

  const database = () => {
    if (!db) throw new Error("Offline fixture database unavailable");
    return db;
  };
  async function one(sql: string, args: unknown[] = []) {
    return (await database().query(sql, args)).rows[0]!;
  }
  beforeAll(async () => {
    vi.stubEnv("BFA_P3B_STATE_SECRET", `offline-lifetime-contract-${crypto.randomUUID()}`);
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
    for (const name of ["admission", "reads", "preissue-read", "capacity", "session-revoke"])
      await install(`docs/pilot/conversation/sql-drafts/p5-voice-${name}.sql`);
    realClockDefinition = (
      await one("SELECT pg_get_functiondef('bfa_p5_voice.ms()'::regprocedure) AS definition;")
    ).definition as string;
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
  async function setClock(value: number) {
    // Fixture-only time model; restore original definition after each case.
    if (!Number.isSafeInteger(value)) throw new Error("Invalid fixture time");
    await database().exec(
      `CREATE OR REPLACE FUNCTION bfa_p5_voice.ms() RETURNS bigint LANGUAGE sql VOLATILE SET search_path=pg_catalog,pg_temp AS $$ SELECT ${value}::bigint $$;`,
    );
  }
  async function withClock<T>(value: number, operation: () => Promise<T>) {
    await setClock(value);
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
          "bfa_p5_voice_register_generation",
          "bfa_p5_voice_register_issuance",
          "bfa_p5_voice_read_current_thread",
        ]).toContain(name);
        const call = { name, args, committed: false };
        calls.push(call);
        if (hooks.beforeCall) await hooks.beforeCall(name, args);
        const types: Record<string, string> = {
          p_owner_id: "uuid",
          p_owner: "uuid",
          p_thread: "uuid",
          p_incarnation: "uuid",
          p_revision: "bigint",
          p_fingerprint: "text",
          p_issued_ms: "bigint",
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
      issuerWrites: createVoiceIssuanceRpcPorts(client),
      preissue: createVoicePreissueReadRpcPorts(client),
    };
  }
  const provision = (q: VoiceSessionProvisioningQuery) => transport().provision.provisionSession(q);
  const revoke = (q: { ownerId: string; sessionId: string }) =>
    transport().revoke.revokeSession(pair(q));
  const readSession = (q: { ownerId: string; sessionId: string }) =>
    transport().reads.readSessionFence(pair(q));

  async function admissionFixture() {
    const q = { ...query() },
      thread = crypto.randomUUID(),
      policy = crypto.randomUUID(),
      approval = crypto.randomUUID(),
      attempt = crypto.randomUUID(),
      pool = crypto.randomUUID();
    q.expiresAt = q.verifiedAt + 60_000;
    const clock = { now: q.verifiedAt };
    const identity = { ...pair(q), expiresAt: q.verifiedAt + 600_000 };
    await setClock(clock.now);
    await database().query(
      "INSERT INTO public.bfa_p3b_staging_accounts(user_id,admitted,expires_at) VALUES($1,true,to_timestamp($2/1000.0));",
      [q.ownerId, identity.expiresAt],
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
      [approval, q.ownerId, thread, incarnation, attempt, identity.expiresAt, policy],
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
      now: () => clock.now,
      maxProofAgeMs: 20_000,
      authenticate: async () => ({ ...identity }),
    });
    const ports = {
      ...t.provision,
      readSessionFence: t.reads.readSessionFence,
      authenticate: async () => ({ ...identity }),
      maxFenceAgeMs: 60_000,
      now: () => clock.now,
    };
    const issuer = createVoiceAuthorityIssuer({
      ...t.issuerWrites,
      ...t.preissue,
      readSessionFence: t.reads.readSessionFence,
      authenticate: async () => ({ ...identity }),
      maxAuthorityAgeMs: 120_000,
      now: () => clock.now,
    });
    const current = await t.preissue.readCurrentThread({ ownerId: q.ownerId, threadId: thread });
    expect(current).toMatchObject({ sourceCreatedAt: expect.any(String) });
    const sourceCreatedAt = (current as { sourceCreatedAt: string }).sourceCreatedAt;
    const input = {
      service,
      threadId: thread,
      threadRevision: 0,
      sourceCreatedAt,
    };
    return {
      q,
      thread,
      pool,
      t,
      request,
      bridge,
      clock,
      identity,
      ports,
      issuer,
      input,
      incarnation,
      service,
    };
  }
  async function held(ownerId: string, pool: string) {
    return one(
      "SELECT (SELECT remaining_units FROM bfa_p5_voice.quotas WHERE owner_id=$1) AS remaining,(SELECT COALESCE(sum(held_units),0)::integer FROM bfa_p5_voice.claims WHERE owner_id=$1) AS original_hold,occupied,held_units AS pool_hold FROM bfa_p5_capacity.pools WHERE pool_id=$2;",
      [ownerId, pool],
    );
  }

  async function issuanceRows(ownerId: string) {
    return (
      await one(
        "SELECT jsonb_agg(to_jsonb(i) ORDER BY fingerprint) AS rows FROM bfa_p5_voice.issuances i WHERE owner_id=$1;",
        [ownerId],
      )
    ).rows as Record<string, unknown>[];
  }
  async function advance(f: Awaited<ReturnType<typeof admissionFixture>>, now: number) {
    f.clock.now = now;
    await setClock(now);
  }

  it("a refreshed fictional token permits another envelope only within the original unrenewed fence", async () => {
    const f = await admissionFixture();
    await withClock(f.clock.now, async () => {
      const first = createVoiceSessionInitializer(f.ports);
      expect(await first.initialize()).toMatchObject({ state: "observed" });
      const row = await sessionRow(f.q);
      const a = await f.issuer.issue(f.input);
      expect(a).not.toBeNull();
      await advance(f, f.clock.now + 10_000);
      f.identity.expiresAt += 600_000; // Fictional refresh, same Auth owner/session.
      const second = createVoiceSessionInitializer(f.ports);
      expect(await second.initialize()).toMatchObject({
        state: "observed",
        fence: { version: 0, expiresAt: f.q.expiresAt },
      });
      const b = await f.issuer.issue(f.input);
      expect(b).not.toBeNull();
      expect(b!.activeAuthority).not.toBe(a!.activeAuthority);
      expect(a!.expiresAt).toBe(f.q.expiresAt);
      expect(b!.expiresAt).toBe(f.q.expiresAt);
      expect(await sessionRow(f.q)).toEqual(row);
      expect(await held(f.q.ownerId, f.pool)).toEqual({
        remaining: 10,
        original_hold: 0,
        occupied: 0,
        pool_hold: 0,
      });
    });
  });

  it("after exact fence expiry, fresh same-login eligibility cannot initialize or issue again", async () => {
    const f = await admissionFixture();
    await withClock(f.clock.now, async () => {
      expect(await createVoiceSessionInitializer(f.ports).initialize()).not.toBeNull();
      expect(await f.issuer.issue(f.input)).not.toBeNull();
      const row = await sessionRow(f.q),
        before = await snapshot();
      await advance(f, f.q.expiresAt);
      f.identity.expiresAt = f.clock.now + 600_000;
      expect(await readSession(f.q)).toBeNull();
      const retry = createVoiceSessionInitializer(f.ports);
      expect(await retry.initialize()).toBeNull();
      expect(retry.snapshot()).toMatchObject({ writeAttempted: true, acknowledgment: null });
      expect(await f.issuer.issue(f.input)).toBeNull();
      expect(await sessionRow(f.q)).toEqual(row);
      await assertOnlyOwnSessionClockChanged(before, f.q);
    });
  });

  it("a new privileged issuance fingerprint after parent expiry is a dormant record, not restored admission", async () => {
    const f = await admissionFixture();
    await withClock(f.clock.now, async () => {
      expect(await provision(f.q)).not.toBeNull();
      const parent = await sessionRow(f.q),
        originalIssuances = await issuanceRows(f.q.ownerId);
      await advance(f, f.q.expiresAt + 1);
      f.identity.expiresAt = f.clock.now + 600_000;
      const fresh = await seal({
        owner: f.q.ownerId,
        thread: f.thread,
        revision: 0,
        expires: f.clock.now + 60_000,
        authority: f.service.exportAuthority(f.thread),
      });
      // Existing privileged RPC has no Auth-session arguments. Its success must
      // never be promoted to a session/current-policy or admission guarantee.
      expect(
        (
          await asRole(
            "service_role",
            "SELECT public.bfa_p5_voice_register_issuance($1,$2,$3,0,$4,$5,$6) AS registered;",
            [
              f.q.ownerId,
              f.thread,
              f.incarnation,
              await fingerprint(fresh),
              f.clock.now,
              f.clock.now + 60_000,
            ],
          )
        ).registered,
      ).toBe(true);
      const records = await issuanceRows(f.q.ownerId);
      expect(records).toHaveLength(originalIssuances.length + 1);
      expect(records).toEqual(expect.arrayContaining(originalIssuances));
      expect(await f.bridge.admit({ ...f.request, activeAuthority: fresh })).toBeNull();
      expect(await f.issuer.issue(f.input)).toBeNull();
      expect(await sessionRow(f.q)).toEqual(parent);
      expect(await held(f.q.ownerId, f.pool)).toEqual({
        remaining: 10,
        original_hold: 0,
        occupied: 0,
        pool_hold: 0,
      });
    });
  });

  it("one terminal Auth-parent fence denies both existing bounded authorities without deleting them", async () => {
    const f = await admissionFixture();
    await withClock(f.clock.now, async () => {
      expect(await provision(f.q)).not.toBeNull();
      const a = await f.issuer.issue(f.input),
        b = await f.issuer.issue(f.input);
      expect(a).not.toBeNull();
      expect(b).not.toBeNull();
      expect(a!.activeAuthority).not.toBe(b!.activeAuthority);
      const records = await issuanceRows(f.q.ownerId);
      expect(await revoke(f.q)).toMatchObject({
        version: 1,
        revoked: true,
        expiresAt: f.q.expiresAt,
      });
      f.identity.expiresAt += 600_000;
      for (const activeAuthority of [a!.activeAuthority, b!.activeAuthority])
        expect(await f.bridge.admit({ ...f.request, activeAuthority })).toBeNull();
      expect(await f.issuer.issue(f.input)).toBeNull();
      expect(await issuanceRows(f.q.ownerId)).toEqual(records);
      expect(await held(f.q.ownerId, f.pool)).toEqual({
        remaining: 10,
        original_hold: 0,
        occupied: 0,
        pool_hold: 0,
      });
    });
  });

  it("expired-parent re-entry denial preserves an existing lease's holds and exact cleanup", async () => {
    const f = await admissionFixture();
    await withClock(f.clock.now, async () => {
      expect(await provision(f.q)).not.toBeNull();
      const lease = await f.bridge.admit(f.request);
      expect(lease?.snapshot().state).toBe("active");
      const retained = await held(f.q.ownerId, f.pool);
      expect(retained).toEqual({ remaining: 9, original_hold: 1, occupied: 1, pool_hold: 1 });
      const parent = await sessionRow(f.q);
      await advance(f, f.q.expiresAt);
      f.identity.expiresAt += 600_000;
      expect(await createVoiceSessionInitializer(f.ports).initialize()).toBeNull();
      expect(await f.bridge.admit(f.request)).toBeNull();
      expect(await lease!.revalidate()).toBe(false);
      expect(await held(f.q.ownerId, f.pool)).toEqual(retained);
      expect(await sessionRow(f.q)).toEqual(parent);
      await lease!.close();
      expect(await held(f.q.ownerId, f.pool)).toEqual({ ...retained, occupied: 0 });
      expect(await sessionRow(f.q)).toEqual(parent);
    });
  });

  it("lost committed provisioning response retains the old lifetime and cannot justify a fresh one", async () => {
    const f = await admissionFixture();
    await withClock(f.clock.now, async () => {
      const before = await snapshot();
      f.t.hooks.afterCommit = async (name, _args, value) => {
        if (name === PROVISION) throw new Error("fictional lost committed reply");
        return value;
      };
      const first = createVoiceSessionInitializer(f.ports);
      expect(await first.initialize()).toBeNull();
      const retained = first.snapshot();
      expect(retained).toMatchObject({
        writeAttempted: true,
        acknowledgment: null,
        request: { ...pair(f.q), verifiedAt: f.q.verifiedAt, expiresAt: f.q.expiresAt },
      });
      const row = await sessionRow(f.q);
      expect(row).toMatchObject({ version: 0, expires_ms: f.q.expiresAt, revoked: false });
      expect(f.t.calls.filter((c) => c.name === PROVISION && c.committed)).toHaveLength(1);
      const calls = f.t.calls.length;
      expect(await first.initialize()).toBeNull();
      expect(f.t.calls).toHaveLength(calls);
      delete f.t.hooks.afterCommit;
      await advance(f, f.q.expiresAt + 1);
      f.identity.expiresAt += 600_000;
      expect(await createVoiceSessionInitializer(f.ports).initialize()).toBeNull();
      expect(first.snapshot()).toEqual(retained);
      expect(await sessionRow(f.q)).toEqual(row);
      await assertOnlyOwnSessionClockChanged(before, f.q);
    });
  });

  it("an issuance committed before a late reply expires remains dormant and does not permit re-entry", async () => {
    const f = await admissionFixture();
    await withClock(f.clock.now, async () => {
      expect(await provision(f.q)).not.toBeNull();
      const records = await issuanceRows(f.q.ownerId),
        parent = await sessionRow(f.q);
      f.t.hooks.afterCommit = async (name, _args, value) => {
        if (name === "bfa_p5_voice_register_issuance") {
          await advance(f, f.q.expiresAt);
          f.identity.expiresAt += 600_000;
        }
        return value;
      };
      expect(await f.issuer.issue(f.input)).toBeNull();
      const retained = await issuanceRows(f.q.ownerId);
      expect(retained).toHaveLength(records.length + 1);
      expect(retained).toEqual(expect.arrayContaining(records));
      delete f.t.hooks.afterCommit;
      expect(await f.issuer.issue(f.input)).toBeNull();
      expect(await issuanceRows(f.q.ownerId)).toEqual(retained);
      expect(await sessionRow(f.q)).toEqual(parent);
      expect(await held(f.q.ownerId, f.pool)).toEqual({
        remaining: 10,
        original_hold: 0,
        occupied: 0,
        pool_hold: 0,
      });
    });
  });

  it("revoke-before-first-use keeps its terminal tombstone despite fresh same-login metadata", async () => {
    const f = await admissionFixture();
    await withClock(f.clock.now, async () => {
      expect(await revoke(f.q)).toMatchObject({ version: 0, expiresAt: 1, revoked: true });
      const tombstone = await sessionRow(f.q),
        before = await snapshot();
      f.identity.expiresAt += 600_000;
      const initializer = createVoiceSessionInitializer(f.ports);
      expect(await initializer.initialize()).toBeNull();
      expect(await f.issuer.issue(f.input)).toBeNull();
      expect(await f.bridge.admit(f.request)).toBeNull();
      expect(await sessionRow(f.q)).toEqual(tombstone);
      await assertOnlyOwnSessionClockChanged(before, f.q);
    });
  });
});
