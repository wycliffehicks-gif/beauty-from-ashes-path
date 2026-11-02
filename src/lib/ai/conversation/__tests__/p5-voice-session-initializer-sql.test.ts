// Optional actual single-connection PostgreSQL integration. The initializer,
// SQL/RPC adapters and downstream issuer/admission crypto are real local code;
// Auth and initial administrative records are explicitly fictional. Delayed
// local calls and discarded committed results are not HTTP fault injection,
// remote Auth acceptance, provider evidence or native contention.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ConversationService } from "../service/service";
import { fingerprint, seal, unseal } from "../staging/seal.server";
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
const MAX = Number.MAX_SAFE_INTEGER;
const PROVISION = "bfa_p5_voice_provision_session";
const READ = "bfa_p5_voice_read_session_fence";
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

sqlSuite("P5 trusted session initialization in isolated PostgreSQL", () => {
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
    vi.stubEnv("BFA_P3B_STATE_SECRET", `offline-session-initializer-${crypto.randomUUID()}`);
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

  function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((yes) => {
      resolve = yes;
    });
    return { promise, resolve };
  }
  function fixture(maxFenceAgeMs = 300_000) {
    const q = query(),
      t = transport();
    const identity = { ...pair(q), expiresAt: q.verifiedAt + 600_000 };
    const clockState = { override: undefined as number | undefined };
    const authenticate = vi.fn(async () => ({ ...identity }));
    const initializer = createVoiceSessionInitializer({
      ...t.provision,
      readSessionFence: t.reads.readSessionFence,
      authenticate,
      maxFenceAgeMs,
      now: () => clockState.override ?? Date.now(),
    });
    return { q, t, identity, authenticate, clockState, initializer };
  }
  const writes = (f: ReturnType<typeof fixture>) =>
    f.t.calls.filter((call) => call.name === PROVISION);
  function retained(f: ReturnType<typeof fixture>) {
    const value = f.initializer.snapshot().request;
    expect(value).not.toBeNull();
    return value!;
  }
  async function assertNoAutomaticRepeat(f: ReturnType<typeof fixture>) {
    const calls = f.t.calls.length;
    const previous = f.initializer.snapshot();
    expect(await f.initializer.initialize()).toBeNull();
    expect(f.t.calls).toHaveLength(calls);
    expect(f.initializer.snapshot()).toEqual(previous);
  }

  it("derives one immutable bounded request from fictional Auth and obtains exact protected SQL evidence", async () => {
    const f = fixture(),
      before = await snapshot();
    const result = await f.initializer.initialize();
    const request = retained(f);
    expect(request).toMatchObject(pair(f.q));
    expect(request.expiresAt - request.verifiedAt).toBe(300_000);
    expect(request.expiresAt).toBeLessThanOrEqual(f.identity.expiresAt);
    expect(result).toEqual({
      state: "observed",
      fence: { ...pair(f.q), version: 0, expiresAt: request.expiresAt, revoked: false },
    });
    expect(writes(f)).toEqual([
      {
        name: PROVISION,
        args: {
          p_owner_id: request.ownerId,
          p_session_id: request.sessionId,
          p_verified_ms: request.verifiedAt,
          p_expires_ms: request.expiresAt,
        },
        committed: true,
      },
    ]);
    expect(await readSession(f.q)).toEqual(result!.fence);
    expect(Object.isFrozen(request)).toBe(true);
    expect(f.initializer.snapshot()).toMatchObject({
      state: "observed",
      expectedVersion: 0,
      writeAttempted: true,
      acknowledgment: result!.fence,
    });
    await assertOnlyOwnSessionClockChanged(before, f.q);
    await assertNoAutomaticRepeat(f);
  });
  it("fences a second local caller while the single retained write waits before SQL execution", async () => {
    const f = fixture(),
      reached = deferred(),
      release = deferred();
    f.t.hooks.beforeCall = async (name) => {
      if (name === PROVISION) {
        reached.resolve();
        await release.promise;
      }
    };
    const pending = f.initializer.initialize();
    await reached.promise;
    const request = retained(f);
    expect(f.initializer.snapshot()).toMatchObject({
      state: "pending",
      request,
      writeAttempted: true,
    });
    expect(await f.initializer.initialize()).toBeNull();
    expect(writes(f)).toHaveLength(1);
    expect(writes(f)[0]!.committed).toBe(false);
    release.resolve();
    expect(await pending).toMatchObject({ state: "observed" });
    expect(retained(f)).toBe(request);
    await assertNoAutomaticRepeat(f);
  });
  it("preserves exact original expiry and nonzero safe versions without rewriting an active fence", async () => {
    for (const version of [0, 17, MAX]) {
      const f = fixture();
      await provision(f.q);
      if (version)
        await database().query(
          "UPDATE bfa_p5_voice.session_fences SET version=$3 WHERE owner_id=$1 AND session_id=$2;",
          [f.q.ownerId, f.q.sessionId, version],
        );
      const row = await sessionRow(f.q),
        before = await snapshot();
      expect(await f.initializer.initialize()).toEqual({
        state: "observed",
        fence: { ...pair(f.q), version, expiresAt: f.q.expiresAt, revoked: false },
      });
      expect(retained(f).expiresAt).toBe(f.q.expiresAt);
      expect(f.initializer.snapshot().expectedVersion).toBe(version);
      expect(await sessionRow(f.q)).toEqual(row);
      await assertOnlyOwnSessionClockChanged(before, f.q);
    }
  });
  it("refuses to shorten or replace an existing lifetime beyond configured or current Auth bounds", async () => {
    for (const boundary of ["configuration", "auth"]) {
      const f = fixture(boundary === "configuration" ? 30_000 : 300_000);
      await provision(f.q);
      if (boundary === "auth") f.identity.expiresAt = Date.now() + 30_000;
      const before = await snapshot();
      expect(await f.initializer.initialize()).toBeNull();
      expect(writes(f)).toHaveLength(0);
      expect(await snapshot()).toEqual(before);
      await assertNoAutomaticRepeat(f);
    }
  });
  it("lets SQL reject a revoked tombstone hidden by the initial null reader", async () => {
    const f = fixture();
    await revoke(f.q);
    expect(await readSession(f.q)).toBeNull();
    const row = await sessionRow(f.q),
      before = await snapshot();
    expect(await f.initializer.initialize()).toBeNull();
    expect(writes(f)).toHaveLength(1);
    expect(writes(f)[0]!.committed).toBe(true);
    expect(f.initializer.snapshot()).toMatchObject({
      expectedVersion: 0,
      writeAttempted: true,
      acknowledgment: null,
    });
    expect(await sessionRow(f.q)).toEqual(row);
    await assertOnlyOwnSessionClockChanged(before, f.q);
    await assertNoAutomaticRepeat(f);
  });
  it("cannot replace an expired existing pair when its protected read returns null", async () => {
    const f = fixture();
    await database().query("INSERT INTO bfa_p5_voice.session_fences VALUES($1,$2,5,$3,false);", [
      f.q.ownerId,
      f.q.sessionId,
      Date.now() - 1,
    ]);
    const row = await sessionRow(f.q),
      before = await snapshot();
    expect(await f.initializer.initialize()).toBeNull();
    expect(writes(f)).toHaveLength(1);
    expect(await sessionRow(f.q)).toEqual(row);
    expect(await readSession(f.q)).toBeNull();
    await assertOnlyOwnSessionClockChanged(before, f.q);
  });
  it("preserves a competing committed fence with a different expiry rather than replacing it", async () => {
    const f = fixture();
    let winner: unknown;
    f.t.hooks.beforeCall = async (name, args) => {
      if (name !== PROVISION) return;
      const conflicting = {
        ...pair(f.q),
        verifiedAt: args.p_verified_ms as number,
        expiresAt: (args.p_expires_ms as number) - 1,
      };
      expect(await provision(conflicting)).not.toBeNull();
      winner = await sessionRow(f.q);
    };
    expect(await f.initializer.initialize()).toBeNull();
    expect(writes(f)).toHaveLength(1);
    expect(await sessionRow(f.q)).toEqual(winner);
    expect((await sessionRow(f.q)).expires_ms).toBe(retained(f).expiresAt - 1);
    await assertNoAutomaticRepeat(f);
  });
  it("lets a revoke committed after the null read win before the provisioning SQL call", async () => {
    const f = fixture();
    f.t.hooks.beforeCall = async (name) => {
      if (name === PROVISION) await revoke(f.q);
    };
    expect(await f.initializer.initialize()).toBeNull();
    expect(await sessionRow(f.q)).toMatchObject({ version: 0, expires_ms: 1, revoked: true });
    expect(writes(f)).toHaveLength(1);
    await assertNoAutomaticRepeat(f);
  });
  it("withholds an active reply when revocation commits before final protected reads", async () => {
    const f = fixture();
    f.t.hooks.afterCommit = async (name, _args, data) => {
      if (name === PROVISION) await revoke(f.q);
      return data;
    };
    expect(await f.initializer.initialize()).toBeNull();
    expect(f.initializer.snapshot().acknowledgment).toMatchObject({ version: 0, revoked: false });
    expect(await sessionRow(f.q)).toMatchObject({ version: 1, revoked: true });
    expect(await readSession(f.q)).toBeNull();
    await assertNoAutomaticRepeat(f);
  });
  it("retains committed request and row after lost, null or malformed acknowledgments without retry", async () => {
    for (const response of ["lost", "null", "malformed", "wrong-expiry"]) {
      const f = fixture(),
        before = await snapshot();
      f.t.hooks.afterCommit = async (name, _args, data) => {
        if (name !== PROVISION) return data;
        if (response === "lost") throw new Error("fictional lost committed response");
        if (response === "null") return null;
        if (response === "malformed") return false;
        return { ...(data as Record<string, unknown>), expiresAt: retained(f).expiresAt + 1 };
      };
      expect(await f.initializer.initialize()).toBeNull();
      expect(writes(f)).toHaveLength(1);
      expect(writes(f)[0]!.committed).toBe(true);
      expect(await sessionRow(f.q)).toMatchObject({
        expires_ms: retained(f).expiresAt,
        version: 0,
        revoked: false,
      });
      expect(f.initializer.snapshot()).toMatchObject({
        writeAttempted: true,
        acknowledgment: null,
      });
      await assertOnlyOwnSessionClockChanged(before, f.q);
      await assertNoAutomaticRepeat(f);
    }
  });
  it("cancels while a read response returns without starting a provisioning write", async () => {
    const f = fixture(),
      before = await snapshot();
    f.t.hooks.afterCommit = async (name, _args, data) => {
      if (name === READ) f.initializer.cancel();
      return data;
    };
    expect(await f.initializer.initialize()).toBeNull();
    expect(writes(f)).toHaveLength(0);
    expect(await snapshot()).toEqual(before);
    expect(f.initializer.snapshot().state).toBe("cancelled");
    await assertNoAutomaticRepeat(f);
  });
  it("withholds a cancelled committed reply while retaining the exact attempted request and row", async () => {
    const f = fixture(),
      before = await snapshot();
    f.t.hooks.afterCommit = async (name, _args, data) => {
      if (name === PROVISION) f.initializer.cancel();
      return data;
    };
    expect(await f.initializer.initialize()).toBeNull();
    expect(f.initializer.snapshot()).toMatchObject({ state: "cancelled", writeAttempted: true });
    expect(await sessionRow(f.q)).toMatchObject({
      expires_ms: retained(f).expiresAt,
      revoked: false,
    });
    await assertOnlyOwnSessionClockChanged(before, f.q);
    await assertNoAutomaticRepeat(f);
  });
  it("rejects a changed Auth owner or session after initial protected reads without writing", async () => {
    for (const changed of ["ownerId", "sessionId"] as const) {
      const f = fixture(),
        before = await snapshot();
      f.t.hooks.afterCommit = async (name, _args, data) => {
        if (name === READ) f.identity[changed] = crypto.randomUUID();
        return data;
      };
      expect(await f.initializer.initialize()).toBeNull();
      expect(writes(f)).toHaveLength(0);
      expect(await snapshot()).toEqual(before);
    }
  });
  it("rejects changed Auth or shortened eligibility after commit without deleting or renewing evidence", async () => {
    for (const changed of ["ownerId", "sessionId", "expiresAt"] as const) {
      const f = fixture(),
        before = await snapshot();
      f.t.hooks.afterCommit = async (name, _args, data) => {
        if (name === PROVISION) {
          if (changed === "expiresAt") f.identity.expiresAt = retained(f).expiresAt - 1;
          else f.identity[changed] = crypto.randomUUID();
        }
        return data;
      };
      expect(await f.initializer.initialize()).toBeNull();
      expect(f.initializer.snapshot().acknowledgment).toMatchObject({
        expiresAt: retained(f).expiresAt,
      });
      expect(await sessionRow(f.q)).toMatchObject({
        expires_ms: retained(f).expiresAt,
        revoked: false,
      });
      await assertOnlyOwnSessionClockChanged(before, f.q);
      await assertNoAutomaticRepeat(f);
    }
  });
  it("rejects a protected version change discovered after the provisioning acknowledgment", async () => {
    const f = fixture();
    f.t.hooks.afterCommit = async (name, _args, data) => {
      if (name === PROVISION)
        await database().query(
          "UPDATE bfa_p5_voice.session_fences SET version=1 WHERE owner_id=$1 AND session_id=$2;",
          [f.q.ownerId, f.q.sessionId],
        );
      return data;
    };
    expect(await f.initializer.initialize()).toBeNull();
    expect(f.initializer.snapshot()).toMatchObject({
      expectedVersion: 0,
      acknowledgment: { version: 0 },
    });
    expect(await sessionRow(f.q)).toMatchObject({ version: 1, revoked: false });
    await assertNoAutomaticRepeat(f);
  });
  it("refuses a fresh local request when the actual database retains a higher clock observation", async () => {
    const f = fixture();
    await database().query("INSERT INTO bfa_p5_voice.owner_clocks VALUES($1,$2);", [
      f.q.ownerId,
      MAX,
    ]);
    const before = await snapshot();
    expect(await f.initializer.initialize()).toBeNull();
    expect(writes(f)).toHaveLength(1);
    expect(await snapshot()).toEqual(before);
    expect(await sessionRow(f.q)).toBeUndefined();
  });
  it("denies after a modeled thirty-second read delay before any possible write", async () => {
    const f = fixture(),
      n = Date.now(),
      before = await snapshot();
    f.clockState.override = n;
    f.t.hooks.afterCommit = async (name, _args, data) => {
      if (name === READ) f.clockState.override = n + 30_000;
      return data;
    };
    await withClock(n, async () => expect(await f.initializer.initialize()).toBeNull());
    expect(writes(f)).toHaveLength(0);
    expect(await snapshot()).toEqual(before);
  });
  it("retains an expired-on-arrival committed row without reporting local success under modeled time", async () => {
    const f = fixture(1000),
      n = Date.now();
    f.clockState.override = n;
    f.t.hooks.afterCommit = async (name, _args, data) => {
      if (name === PROVISION) f.clockState.override = retained(f).expiresAt;
      return data;
    };
    await withClock(n, async () => expect(await f.initializer.initialize()).toBeNull());
    expect(await sessionRow(f.q)).toMatchObject({ expires_ms: n + 1000, revoked: false });
    expect(writes(f)).toHaveLength(1);
    await assertNoAutomaticRepeat(f);
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
  it("supplies real admission through local crypto while preserving both cumulative holds on later initialization", async () => {
    const f = await admissionFixture();
    const ports = {
      ...f.t.provision,
      readSessionFence: f.t.reads.readSessionFence,
      authenticate: async () => ({ ...pair(f.q), expiresAt: f.q.expiresAt }),
      now: Date.now,
      maxFenceAgeMs: 300_000,
    };
    expect(await f.bridge.admit(f.request)).toBeNull();
    const initializer = createVoiceSessionInitializer(ports);
    expect(await initializer.initialize()).toMatchObject({
      state: "observed",
      fence: { expiresAt: f.q.expiresAt },
    });
    const lease = await f.bridge.admit(f.request);
    expect(lease?.snapshot().state).toBe("active");
    const retainedHolds = await held(f.q.ownerId, f.pool);
    expect(retainedHolds).toEqual({ remaining: 9, original_hold: 1, occupied: 1, pool_hold: 1 });
    const before = await snapshot();
    const second = createVoiceSessionInitializer(ports);
    expect(await second.initialize()).toMatchObject({
      state: "observed",
      fence: { version: 0, expiresAt: f.q.expiresAt },
    });
    expect(await held(f.q.ownerId, f.pool)).toEqual(retainedHolds);
    await assertOnlyOwnSessionClockChanged(before, f.q);
    await revoke(f.q);
    expect(await lease!.revalidate()).toBe(false);
    expect(await held(f.q.ownerId, f.pool)).toEqual(retainedHolds);
    await lease!.close();
    expect(await held(f.q.ownerId, f.pool)).toEqual({
      remaining: 9,
      original_hold: 1,
      occupied: 0,
      pool_hold: 1,
    });
    expect(JSON.stringify(initializer.snapshot())).not.toContain(f.request.activeAuthority);
  });
  it("supports actual issuer and protected reads but cannot substitute for later Auth or revocation checks", async () => {
    const f = fixture(60_000),
      threadId = crypto.randomUUID();
    const sourceCreatedAt = "2026-10-01T12:34:56.123456Z";
    await database().query(
      "INSERT INTO public.bfa_p3b_staging_accounts(user_id,admitted,expires_at) VALUES($1,true,to_timestamp($2/1000.0));",
      [f.q.ownerId, f.identity.expiresAt],
    );
    await database().query(
      "INSERT INTO public.bfa_p3b_threads(id,owner_id,created_at,saved_snapshot,saved_at) VALUES($1,$2,$3::timestamptz,to_jsonb('fictional private writing is not initialization input'::text),clock_timestamp());",
      [threadId, f.q.ownerId, sourceCreatedAt],
    );
    const service = new ConversationService({ verifiedOwnerId: f.q.ownerId });
    service.ensureThread(threadId, false);
    const issuer = createVoiceAuthorityIssuer({
      ...f.t.issuerWrites,
      ...f.t.preissue,
      readSessionFence: f.t.reads.readSessionFence,
      authenticate: f.authenticate,
      now: Date.now,
      maxAuthorityAgeMs: 120_000,
    });
    const input = { service, threadId, threadRevision: 0, sourceCreatedAt };
    expect(await issuer.issue(input)).toBeNull();
    expect(
      (
        await one(
          "SELECT count(*)::integer AS count FROM bfa_p5_voice.generations WHERE owner_id=$1;",
          [f.q.ownerId],
        )
      ).count,
    ).toBe(0);
    expect(await f.initializer.initialize()).toMatchObject({ state: "observed" });
    const issued = await issuer.issue(input);
    expect(issued).not.toBeNull();
    expect(issued!.expiresAt).toBeLessThanOrEqual(retained(f).expiresAt);
    const envelope = await unseal(issued!.activeAuthority, f.q.ownerId, threadId, 0);
    expect(envelope).toMatchObject({
      owner: f.q.ownerId,
      thread: threadId,
      revision: 0,
      expires: issued!.expiresAt,
    });
    expect(
      (
        await one("SELECT fingerprint FROM bfa_p5_voice.issuances WHERE owner_id=$1;", [
          f.q.ownerId,
        ])
      ).fingerprint,
    ).toBe(await fingerprint(issued!.activeAuthority));
    f.authenticate.mockResolvedValueOnce({ ...f.identity, ownerId: crypto.randomUUID() });
    expect(await issuer.issue(input)).toBeNull();
    await revoke(f.q);
    expect(await issuer.issue(input)).toBeNull();
    expect(
      (
        await one(
          "SELECT count(*)::integer AS count FROM bfa_p5_voice.issuances WHERE owner_id=$1;",
          [f.q.ownerId],
        )
      ).count,
    ).toBe(1);
    expect(JSON.stringify(f.initializer.snapshot())).not.toContain(issued!.activeAuthority);
  });
});
