// Actual isolated PostgreSQL plus inactive v2 transport. Auth/current-policy
// metadata are fictional trusted-host inputs; no verifier, live account,
// provider call, runtime route or native multi-connection race executes.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { readFile, readdir, realpath } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createVoiceV2ParentIssuanceRpcPorts } from "../service/voice-v2-parent-issuance-rpc.server";
import { createVoiceV2PreissueRpcPorts } from "../service/voice-v2-preissue-rpc.server";

interface LocalDatabase {
  exec(sql: string): Promise<unknown>;
  query(sql: string, parameters?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  close(): Promise<void>;
  dumpDataDir(compression: string): Promise<unknown>;
  readonly closed: boolean;
}
type Args = Readonly<Record<string, unknown>>;
type Role = "anon" | "authenticated" | "service_role";
const enginePath = process.env.BFA_PGLITE_MODULE;
const sqlSuite = enginePath ? describe : describe.skip;
const ROOT = process.cwd();
const MAX = Number.MAX_SAFE_INTEGER;
const NIL = "00000000-0000-0000-0000-000000000000";
const SOURCE = "2026-11-03T09:15:42.123456Z";
const names = ["bfa_p5_v2_read_current_thread", "bfa_p5_v2_register_generation"] as const;
const parentNames = [
  "bfa_p5_v2_observe_parent",
  "bfa_p5_v2_revoke_parent",
  "bfa_p5_v2_read_parent",
  "bfa_p5_v2_register_issuance",
  "bfa_p5_v2_read_issuance",
] as const;
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
  "bfa_p5_voice_v2.auth_parents",
  "bfa_p5_voice_v2.issuance_auth_bindings",
];
const fingerprint = () => createHash("sha256").update(randomUUID()).digest("hex");
interface Fixture {
  ownerId: string;
  authSessionId: string;
  parentVersion: number;
  threadId: string;
  verifiedAt: number;
  authExpiresAt: number;
  threadRevision: number;
  sourceCreatedAt: string;
}
const query = (q: Fixture) => ({
  ownerId: q.ownerId,
  authSessionId: q.authSessionId,
  parentVersion: q.parentVersion,
  threadId: q.threadId,
  verifiedAt: q.verifiedAt,
  authExpiresAt: q.authExpiresAt,
});
const registration = (q: Fixture) => ({
  ...query(q),
  threadRevision: q.threadRevision,
  sourceCreatedAt: q.sourceCreatedAt,
});
const pair = (q: Fixture) => ({ ownerId: q.ownerId, authSessionId: q.authSessionId });
const args = (q: Fixture, write = false) => ({
  p_owner_id: q.ownerId,
  p_auth_session_id: q.authSessionId,
  p_parent_version: q.parentVersion,
  p_thread_id: q.threadId,
  p_verified_ms: q.verifiedAt,
  p_auth_expires_ms: q.authExpiresAt,
  ...(write ? { p_revision: q.threadRevision, p_source_created_at: q.sourceCreatedAt } : {}),
});

sqlSuite("P5 v2 pre-issuance lifecycle in isolated PostgreSQL", () => {
  let db: LocalDatabase | undefined;
  let seed: LocalDatabase | undefined;
  let realClockDefinition: string | undefined;
  const database = () => {
    if (!db) throw new Error("Offline fixture database unavailable");
    return db;
  };
  const one = async (sql: string, parameters: unknown[] = []) =>
    (await database().query(sql, parameters)).rows[0]!;
  beforeAll(async () => {
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
    db = await PGlite.create({ loadDataDir: bundle, database: "bfa_p5_offline_fixture" });
    expect((await one("SELECT current_database() AS name;")).name).toBe("bfa_p5_offline_fixture");
    expect((await one("SHOW server_version;")).server_version).toMatch(/^18\.6/);
    const install = async (name: string) =>
      database().exec(await readFile(path.join(ROOT, name), "utf8"));
    await install("scripts/conversation-eval/p5-sql/bootstrap.sql");
    const migrations = (await readdir(path.join(ROOT, "drizzle/migrations")))
      .filter((n) => /^000[0-5]_.*\.sql$/.test(n))
      .sort();
    expect(migrations).toHaveLength(6);
    for (const name of migrations) await install(`drizzle/migrations/${name}`);
    for (const name of [
      "admission",
      "reads",
      "preissue-read",
      "capacity",
      "session-revoke",
      "session-provision",
      "v2-parent-issuance",
      "v2-preissue",
    ])
      await install(`docs/pilot/conversation/sql-drafts/p5-voice-${name}.sql`);
    // Prove this new route has no dependency on the legacy enabling registrar.
    await database().exec(
      "REVOKE EXECUTE ON FUNCTION public.bfa_p5_voice_register_generation(uuid,uuid) FROM service_role;",
    );
    realClockDefinition = (
      await one("SELECT pg_get_functiondef('bfa_p5_voice.ms()'::regprocedure) AS definition;")
    ).definition as string;
  }, 60000);
  afterEach(async () => {
    if (db && !db.closed && realClockDefinition) await db.exec(realClockDefinition);
  });
  afterAll(async () => {
    for (const instance of [seed, db]) {
      if (instance && !instance.closed) await instance.close();
      if (instance) expect(instance.closed).toBe(true);
    }
  });
  async function asRole(role: Role, sql: string, parameters: unknown[] = []) {
    await database().exec(`BEGIN; SET LOCAL ROLE ${role};`);
    try {
      expect((await one("SELECT current_user AS role;")).role).toBe(role);
      const row = await one(sql, parameters);
      await database().exec("COMMIT;");
      return row;
    } catch (error) {
      await database().exec("ROLLBACK;");
      throw error;
    }
  }
  async function raw(name: string, values: Args, role: Role = "service_role") {
    expect([...names, ...parentNames]).toContain(name);
    const types: Record<string, string> = {
      p_owner_id: "uuid",
      p_auth_session_id: "uuid",
      p_parent_version: "bigint",
      p_thread_id: "uuid",
      p_revision: "bigint",
      p_source_created_at: "text",
      p_verified_ms: "bigint",
      p_auth_expires_ms: "bigint",
      p_incarnation: "uuid",
      p_fingerprint: "text",
      p_issued_ms: "bigint",
      p_expires_ms: "bigint",
    };
    const entries = Object.entries(values);
    for (const [key] of entries) expect(Object.hasOwn(types, key)).toBe(true);
    const named = entries.map(([key], i) => `${key}=>$${i + 1}::${types[key]}`).join(",");
    return (
      await asRole(
        role,
        `SELECT public.${name}(${named}) AS value;`,
        entries.map(([, value]) => value),
      )
    ).value;
  }
  function transport() {
    const calls: { name: string; committed: boolean }[] = [];
    const hooks: { afterCommit?: (name: string, data: unknown) => Promise<unknown> } = {};
    const client = {
      async rpc(name: string, values: Args) {
        const call = { name, committed: false };
        calls.push(call);
        const data = await raw(name, values);
        call.committed = true;
        return {
          data: hooks.afterCommit ? await hooks.afterCommit(name, data) : data,
          error: null,
          status: 200,
        };
      },
    };
    return {
      calls,
      hooks,
      ports: createVoiceV2PreissueRpcPorts(client),
      parents: createVoiceV2ParentIssuanceRpcPorts(client),
    };
  }
  const ports = () => transport().ports;
  async function setClock(value: number) {
    expect(Number.isInteger(value)).toBe(true);
    await database().exec(
      `CREATE OR REPLACE FUNCTION bfa_p5_voice.ms() RETURNS bigint LANGUAGE sql VOLATILE SET search_path=pg_catalog,pg_temp AS $$ SELECT ${value}::bigint $$;`,
    );
  }
  async function fixture(observe = true): Promise<Fixture> {
    const now = Date.now(),
      ownerId = randomUUID(),
      threadId = randomUUID();
    await setClock(now);
    await database().query(
      "INSERT INTO public.bfa_p3b_staging_accounts(user_id,admitted,expires_at) VALUES($1,true,to_timestamp($2/1000.0));",
      [ownerId, now + 7200000],
    );
    await database().query(
      "INSERT INTO public.bfa_p3b_threads(id,owner_id,created_at,saved_snapshot,saved_at) VALUES($1,$2,$3::timestamptz,to_jsonb('fictional private source must not escape'::text),clock_timestamp());",
      [threadId, ownerId, SOURCE],
    );
    const q = {
      ownerId,
      authSessionId: randomUUID(),
      parentVersion: 0,
      threadId,
      verifiedAt: now,
      authExpiresAt: now + 1800000,
      threadRevision: 0,
      sourceCreatedAt: SOURCE,
    };
    if (observe)
      expect(
        await transport().parents.observeParent({
          ...pair(q),
          verifiedAt: q.verifiedAt,
          authExpiresAt: q.authExpiresAt,
        }),
      ).toMatchObject({ protocol: 2, ...pair(q), parentVersion: 0, revoked: false });
    return q;
  }
  const current = (q: Fixture) => ports().readCurrentThread(query(q));
  const register = (q: Fixture) => ports().registerGeneration(registration(q));
  const generationRow = (q: Fixture) =>
    one(
      "SELECT g.*,xmin::text AS xmin,ctid::text AS ctid,to_char(source_created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS source_text FROM bfa_p5_voice.generations g WHERE thread_id=$1;",
      [q.threadId],
    );
  const parentRow = (q: Fixture) =>
    one(
      "SELECT p.*,xmin::text AS xmin,ctid::text AS ctid FROM bfa_p5_voice_v2.auth_parents p WHERE owner_id=$1 AND auth_session_id=$2;",
      [q.ownerId, q.authSessionId],
    );
  async function fence(q: Fixture, action: "cancel" | "delete") {
    return asRole("service_role", "SELECT public.bfa_p3b_fence($1,$2,$3) AS revision;", [
      q.ownerId,
      q.threadId,
      action,
    ]);
  }
  async function snapshot() {
    const result: Record<string, Record<string, unknown>[]> = {};
    for (const table of tables)
      result[table] = (
        await one(
          `SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS rows FROM ${table} t;`,
        )
      ).rows as Record<string, unknown>[];
    expect(Object.keys(result)).toHaveLength(22);
    return result;
  }
  async function unchangedExcept(
    before: Awaited<ReturnType<typeof snapshot>>,
    allowed: string[] = [],
    ownerId?: string,
  ) {
    const after = await snapshot();
    for (const table of tables) {
      if (allowed.includes(table)) {
        expect(ownerId).toBeDefined();
        const unrelated = (rows: Record<string, unknown>[]) =>
          rows.filter((row) => row.owner_id !== ownerId);
        expect(unrelated(after[table]!), table).toEqual(unrelated(before[table]!));
      } else expect(after[table], table).toEqual(before[table]);
    }
  }
  async function seedHolds(q: Fixture) {
    const claimId = randomUUID(),
      cleanupId = randomUUID(),
      poolId = randomUUID(),
      policyId = randomUUID(),
      attemptId = randomUUID();
    const claim = JSON.stringify({
      claimId,
      expiresAt: q.authExpiresAt,
      binding: {
        ownerId: q.ownerId,
        threadId: q.threadId,
        threadIncarnation: randomUUID(),
        threadRevision: 0,
        attemptId,
        approvalId: randomUUID(),
        approvalDigest: fingerprint(),
        scope: "developer-voice-session",
      },
    });
    await database().query("INSERT INTO public.bfa_p3b_allowances VALUES($1,'voice',7,3);", [
      q.ownerId,
    ]);
    await database().query(
      "INSERT INTO public.bfa_p3b_admissions(owner_id,request_id,thread_id,thread_revision,mode,fingerprint,reserved_units,state) VALUES($1,$2,$3,0,'voice',$4,3,'uncertain');",
      [q.ownerId, randomUUID(), q.threadId, fingerprint()],
    );
    await database().query("INSERT INTO bfa_p5_voice.quotas VALUES($1,$2,7,3,true);", [
      q.ownerId,
      policyId,
    ]);
    await database().query(
      "INSERT INTO bfa_p5_voice.cleanup_owners(cleanup_id,claim_id,owner_id,claim,effective_expires_ms) VALUES($1,$2,$3,$4,$5);",
      [cleanupId, claimId, q.ownerId, claim, q.authExpiresAt],
    );
    await database().query("INSERT INTO bfa_p5_voice.claims VALUES($1,$2,$3,$4,'claimed',$5,3);", [
      claimId,
      q.ownerId,
      claim,
      q.authExpiresAt,
      policyId,
    ]);
    await database().query(
      "INSERT INTO bfa_p5_capacity.pools(pool_id,active_limit,unit_limit,reservation_units,occupied,held_units,enabled) VALUES($1,4,12,3,1,3,true);",
      [poolId],
    );
    await database().query("INSERT INTO bfa_p5_capacity.routes VALUES($1,$2,$3);", [
      q.ownerId,
      policyId,
      poolId,
    ]);
    await database().query(
      "INSERT INTO bfa_p5_capacity.allocations(claim_id,owner_id,attempt_id,claim,cleanup_id,pool_id,pool_version,units,operation_id) VALUES($1,$2,$3,$4,$5,$6,1,3,$7);",
      [claimId, q.ownerId, attemptId, claim, cleanupId, poolId, randomUUID()],
    );
  }

  it("reads content-free current metadata before generation or issuance exists", async () => {
    const q = await fixture();
    await seedHolds(q);
    const before = await snapshot(),
      parent = await parentRow(q);
    const result = await current(q);
    expect(result).toEqual({
      protocol: 2,
      ...pair(q),
      parentVersion: 0,
      threadId: q.threadId,
      threadRevision: 0,
      sourceCreatedAt: SOURCE,
      threadIncarnation: null,
      deleted: false,
      allowlist: { ownerId: q.ownerId, admitted: true, expiresAt: q.verifiedAt + 7200000 },
    });
    expect(JSON.stringify(result)).not.toContain("fictional private source");
    expect(await generationRow(q)).toBeUndefined();
    expect(await parentRow(q)).toEqual(parent);
    expect(
      (
        await one("SELECT count(*)::integer AS n FROM bfa_p5_voice.issuances WHERE owner_id=$1;", [
          q.ownerId,
        ])
      ).n,
    ).toBe(0);
    await unchangedExcept(before);
  });

  it("registers one shared permanent generation, preserves six microseconds and re-observes the exact row", async () => {
    const q = await fixture();
    await seedHolds(q);
    const before = await snapshot(),
      parent = await parentRow(q);
    const first = await register(q);
    expect(first).toMatchObject({
      protocol: 2,
      ...pair(q),
      parentVersion: 0,
      threadId: q.threadId,
      threadRevision: 0,
      sourceCreatedAt: SOURCE,
      deleted: false,
    });
    expect(first!.threadIncarnation).toMatch(/^[0-9a-f-]{36}$/);
    const original = await generationRow(q);
    expect(original.source_text).toBe(SOURCE);
    expect(original.incarnation).toBe(first!.threadIncarnation);
    await unchangedExcept(before, ["bfa_p5_voice.generations"], q.ownerId);
    await setClock(q.verifiedAt + 1);
    q.verifiedAt += 1;
    const replayBefore = await snapshot();
    expect(await register(q)).toEqual(first);
    expect(await current(q)).toEqual(first);
    expect(await generationRow(q)).toEqual(original);
    expect(await parentRow(q)).toEqual(parent);
    await unchangedExcept(replayBefore, ["bfa_p5_voice.owner_clocks"], q.ownerId);
  });

  it("composes v2 read, generation and bounded issuance with legacy registrar execution disabled", async () => {
    const q = await fixture();
    expect(
      (
        await one(
          "SELECT has_function_privilege('service_role','public.bfa_p5_voice_register_generation(uuid,uuid)','EXECUTE') AS allowed;",
        )
      ).allowed,
    ).toBe(false);
    const t = transport(),
      pre = await t.ports.readCurrentThread(query(q));
    expect(pre!.threadIncarnation).toBeNull();
    const generation = await t.ports.registerGeneration({
      ...query(q),
      threadRevision: pre!.threadRevision,
      sourceCreatedAt: pre!.sourceCreatedAt,
    });
    const digest = fingerprint();
    const issuance = {
      ...query(q),
      threadIncarnation: generation!.threadIncarnation,
      threadRevision: generation!.threadRevision,
      authorityFingerprint: digest,
      issuedAt: q.verifiedAt,
      expiresAt: q.verifiedAt + 60000,
    };
    expect(await t.parents.registerIssuance(issuance)).toMatchObject({
      protocol: 2,
      ...pair(q),
      parentVersion: 0,
      threadIncarnation: generation!.threadIncarnation,
      authorityFingerprint: digest,
    });
    expect(
      await t.parents.readIssuance({ ...pair(q), parentVersion: 0, authorityFingerprint: digest }),
    ).not.toBeNull();
    expect(t.calls.map((c) => c.name)).toEqual([
      "bfa_p5_v2_read_current_thread",
      "bfa_p5_v2_register_generation",
      "bfa_p5_v2_register_issuance",
      "bfa_p5_v2_read_issuance",
    ]);
    expect(t.calls.every((c) => c.committed)).toBe(true);
    expect(
      (
        await one("SELECT count(*)::integer AS n FROM bfa_p5_voice.approvals WHERE owner_id=$1;", [
          q.ownerId,
        ])
      ).n,
    ).toBe(0);
    expect(
      (
        await one("SELECT count(*)::integer AS n FROM bfa_p5_voice.claims WHERE owner_id=$1;", [
          q.ownerId,
        ])
      ).n,
    ).toBe(0);
  });

  it("does not create missing parents or reopen revoke-before-first-use tombstones", async () => {
    const absent = await fixture(false);
    const before = await snapshot();
    expect(await current(absent)).toBeNull();
    expect(await register(absent)).toBeNull();
    expect(await parentRow(absent)).toBeUndefined();
    await unchangedExcept(before);
    await transport().parents.revokeParent(pair(absent));
    const tombstone = await parentRow(absent),
      closed = await snapshot();
    expect(await current(absent)).toBeNull();
    expect(await register(absent)).toBeNull();
    expect(await parentRow(absent)).toEqual(tombstone);
    await unchangedExcept(closed);
  });

  it("denies mixed parent identity/version and missing protected metadata without creating a generation", async () => {
    const q = await fixture();
    for (const changed of [
      { ownerId: randomUUID() },
      { authSessionId: randomUUID() },
      { parentVersion: 1 },
      { threadId: randomUUID() },
    ]) {
      const before = await snapshot();
      expect(await current({ ...q, ...changed })).toBeNull();
      expect(await register({ ...q, ...changed })).toBeNull();
      await unchangedExcept(before);
    }
    await database().query("DELETE FROM public.bfa_p3b_staging_accounts WHERE user_id=$1;", [
      q.ownerId,
    ]);
    const before = await snapshot();
    expect(await current(q)).toBeNull();
    expect(await register(q)).toBeNull();
    await unchangedExcept(before);
  });

  it.each(["active", "expired", "revoked"] as const)(
    "rejects every retained legacy %s fence without adopting or changing it",
    async (state) => {
      const q = await fixture();
      await database().query("INSERT INTO bfa_p5_voice.session_fences VALUES($1,$2,0,$3,$4);", [
        q.ownerId,
        q.authSessionId,
        state === "expired" ? 1 : q.authExpiresAt,
        state === "revoked",
      ]);
      await seedHolds(q);
      const before = await snapshot();
      expect(await current(q)).toBeNull();
      expect(await register(q)).toBeNull();
      await unchangedExcept(before);
      expect(await transport().parents.revokeParent(pair(q))).toMatchObject({ revoked: true });
      expect(await generationRow(q)).toBeUndefined();
      await unchangedExcept(before, ["bfa_p5_voice_v2.auth_parents"], q.ownerId);
    },
  );

  it("late legacy revoke blocks current read and registration while retaining the already registered generation", async () => {
    const q = await fixture();
    expect(await register(q)).not.toBeNull();
    await seedHolds(q);
    await asRole("service_role", "SELECT public.bfa_p5_voice_revoke_session($1,$2) AS value;", [
      q.ownerId,
      q.authSessionId,
    ]);
    const row = await generationRow(q),
      before = await snapshot();
    expect(await current(q)).toBeNull();
    expect(await register(q)).toBeNull();
    expect(await generationRow(q)).toEqual(row);
    await unchangedExcept(before);
  });

  it("terminal parent revocation dominates both paths even when version has saturated", async () => {
    const q = await fixture();
    await database().query(
      "UPDATE bfa_p5_voice_v2.auth_parents SET version=$3 WHERE owner_id=$1 AND auth_session_id=$2;",
      [q.ownerId, q.authSessionId, MAX],
    );
    q.parentVersion = MAX;
    expect(await register(q)).toMatchObject({ parentVersion: MAX });
    expect(await transport().parents.revokeParent(pair(q))).toMatchObject({
      parentVersion: MAX,
      revoked: true,
    });
    const before = await snapshot(),
      generation = await generationRow(q);
    expect(await current(q)).toBeNull();
    expect(await register(q)).toBeNull();
    expect(await generationRow(q)).toEqual(generation);
    await unchangedExcept(before);
  });

  it("requires exact current revision and canonical source creation without rounding", async () => {
    const q = await fixture();
    await seedHolds(q);
    const before = await snapshot();
    for (const change of [
      { threadRevision: 1 },
      { sourceCreatedAt: "2026-11-03T09:15:42.123000Z" },
      { sourceCreatedAt: "2026-11-03T09:15:42.123457Z" },
    ])
      expect(await register({ ...q, ...change })).toBeNull();
    for (const source of [
      null,
      "infinity",
      "2026-11-03T09:15:42.123456+00:00",
      "2026-02-31T09:15:42.123456Z",
      "not a timestamp",
    ])
      expect(await raw(names[1], { ...args(q, true), p_source_created_at: source })).toBeNull();
    expect(await generationRow(q)).toBeUndefined();
    await unchangedExcept(before);
  });

  it("retains exact UTC microseconds independent of database TimeZone and DateStyle", async () => {
    const q = await fixture();
    await database().exec("SET TimeZone='Pacific/Honolulu'; SET DateStyle='SQL, DMY';");
    try {
      expect(await current(q)).toMatchObject({ sourceCreatedAt: SOURCE });
      expect(await register(q)).toMatchObject({ sourceCreatedAt: SOURCE });
      expect((await generationRow(q)).source_text).toBe(SOURCE);
    } finally {
      await database().exec("SET TimeZone='UTC'; SET DateStyle='ISO, MDY';");
    }
  });

  it("honors actual P3b Stop revision and Delete without releasing retained accounting", async () => {
    const q = await fixture();
    const first = await register(q);
    await seedHolds(q);
    const generation = await generationRow(q);
    await fence(q, "cancel");
    const stopped = await snapshot();
    expect(await current(q)).toMatchObject({
      threadRevision: 1,
      threadIncarnation: first!.threadIncarnation,
    });
    expect(await register(q)).toBeNull();
    expect(await register({ ...q, threadRevision: 1 })).toMatchObject({
      threadRevision: 1,
      threadIncarnation: first!.threadIncarnation,
    });
    expect(await generationRow(q)).toEqual(generation);
    await unchangedExcept(stopped);
    await fence(q, "delete");
    const deleted = await snapshot();
    expect(await current({ ...q, threadRevision: 2 })).toBeNull();
    expect(await register({ ...q, threadRevision: 2 })).toBeNull();
    await unchangedExcept(deleted);
  });

  it.each(["retired", "foreign", "recreated", "nil"] as const)(
    "denies a retained %s generation rather than treating it as absent",
    async (kind) => {
      const q = await fixture();
      expect(await register(q)).not.toBeNull();
      if (kind === "retired")
        await database().query(
          "UPDATE bfa_p5_voice.generations SET retired=true WHERE thread_id=$1;",
          [q.threadId],
        );
      if (kind === "foreign")
        await database().query(
          "UPDATE bfa_p5_voice.generations SET owner_id=$2 WHERE thread_id=$1;",
          [q.threadId, randomUUID()],
        );
      if (kind === "recreated") {
        await database().query(
          "UPDATE public.bfa_p3b_threads SET created_at=created_at+interval '1 microsecond' WHERE id=$1;",
          [q.threadId],
        );
        q.sourceCreatedAt = "2026-11-03T09:15:42.123457Z";
      }
      if (kind === "nil")
        await database().query(
          "UPDATE bfa_p5_voice.generations SET incarnation=$2 WHERE thread_id=$1;",
          [q.threadId, NIL],
        );
      const retained = await generationRow(q),
        before = await snapshot();
      expect(await current(q)).toBeNull();
      expect(await register(q)).toBeNull();
      expect(await generationRow(q)).toEqual(retained);
      await unchangedExcept(before);
    },
  );

  it("preserves the registered thread FK against physical identity deletion", async () => {
    const q = await fixture();
    expect(await register(q)).not.toBeNull();
    const before = await snapshot();
    await expect(
      database().query("DELETE FROM public.bfa_p3b_threads WHERE id=$1;", [q.threadId]),
    ).rejects.toThrow();
    await unchangedExcept(before);
  });

  it("does not silently refresh a stale verification time or accept future verification", async () => {
    const q = await fixture();
    const before = await snapshot();
    for (const verifiedAt of [q.verifiedAt + 1, q.verifiedAt - 30000]) {
      expect(await current({ ...q, verifiedAt })).toBeNull();
      expect(await register({ ...q, verifiedAt })).toBeNull();
    }
    expect(await generationRow(q)).toBeUndefined();
    await unchangedExcept(before);
    expect(await current({ ...q, verifiedAt: q.verifiedAt - 29999 })).not.toBeNull();
    expect(await register({ ...q, verifiedAt: q.verifiedAt - 29999 })).not.toBeNull();
  });

  it("denies an exact Auth deadline and retains its observed time against rollback", async () => {
    const q = await fixture();
    q.authExpiresAt = q.verifiedAt + 10;
    await setClock(q.authExpiresAt);
    const before = await snapshot();
    expect(await current(q)).toBeNull();
    expect(await register(q)).toBeNull();
    await unchangedExcept(before, ["bfa_p5_voice.owner_clocks"], q.ownerId);
    expect(
      (
        await one("SELECT observed_ms FROM bfa_p5_voice.owner_clocks WHERE owner_id=$1;", [
          q.ownerId,
        ])
      ).observed_ms,
    ).toBe(q.authExpiresAt);
    await setClock(q.authExpiresAt - 1);
    q.verifiedAt = q.authExpiresAt - 1;
    const retained = await snapshot();
    expect(await current(q)).toBeNull();
    expect(await register(q)).toBeNull();
    expect(await generationRow(q)).toBeUndefined();
    await unchangedExcept(retained);
  });

  it("requires current finite admitted allowlist and conservatively floors its deadline", async () => {
    const q = await fixture();
    const initial = q.verifiedAt;
    for (const deadline of [
      "-infinity",
      "infinity",
      "0001-01-01T00:00:00Z",
      "290000-01-01T00:00:00Z",
    ]) {
      await database().query(
        "UPDATE public.bfa_p3b_staging_accounts SET expires_at=$2::timestamptz WHERE user_id=$1;",
        [q.ownerId, deadline],
      );
      const before = await snapshot();
      expect(await current(q)).toBeNull();
      expect(await register(q)).toBeNull();
      await unchangedExcept(before);
    }
    await database().query(
      "UPDATE public.bfa_p3b_staging_accounts SET expires_at=to_timestamp($2/1000.0),admitted=false WHERE user_id=$1;",
      [q.ownerId, q.authExpiresAt],
    );
    const withdrawn = await snapshot();
    expect(await current(q)).toBeNull();
    expect(await register(q)).toBeNull();
    await unchangedExcept(withdrawn);
    await database().query(
      "UPDATE public.bfa_p3b_staging_accounts SET expires_at=to_timestamp($2/1000.0),admitted=true WHERE user_id=$1;",
      [q.ownerId, initial + 0.9],
    );
    expect(await current(q)).toBeNull();
    expect(await register(q)).toBeNull();
    await database().query(
      "UPDATE public.bfa_p3b_staging_accounts SET expires_at=to_timestamp($2/1000.0) WHERE user_id=$1;",
      [q.ownerId, initial + 1.9],
    );
    expect(await current(q)).toMatchObject({ allowlist: { expiresAt: initial + 1 } });
    expect(await register(q)).toMatchObject({ allowlist: { expiresAt: initial + 1 } });
  });

  it("denies nonfinite/out-of-wire creation timestamps and unsafe revision without registering", async () => {
    const q = await fixture();
    for (const created of ["infinity", "-infinity", "0001-01-01 BC", "10000-01-01T00:00:00Z"]) {
      await database().query(
        "UPDATE public.bfa_p3b_threads SET created_at=$2::timestamptz WHERE id=$1;",
        [q.threadId, created],
      );
      const before = await snapshot();
      expect(await current(q)).toBeNull();
      expect(await register(q)).toBeNull();
      await unchangedExcept(before);
    }
    await database().query(
      "UPDATE public.bfa_p3b_threads SET created_at=$2::timestamptz,revision=$3 WHERE id=$1;",
      [q.threadId, SOURCE, "9007199254740992"],
    );
    const unsafe = await snapshot();
    expect(await current(q)).toBeNull();
    expect(await register(q)).toBeNull();
    await unchangedExcept(unsafe);
    await database().query("UPDATE public.bfa_p3b_threads SET revision=$2 WHERE id=$1;", [
      q.threadId,
      MAX,
    ]);
    expect(await current(q)).toMatchObject({ threadRevision: MAX });
    expect(await register({ ...q, threadRevision: MAX })).toMatchObject({ threadRevision: MAX });
  });

  it("denies malformed direct SQL scalars before mutation", async () => {
    const q = await fixture(),
      before = await snapshot();
    const mutations: Args[] = [
      { p_owner_id: null },
      { p_owner_id: NIL },
      { p_auth_session_id: null },
      { p_auth_session_id: NIL },
      { p_thread_id: null },
      { p_thread_id: NIL },
      { p_parent_version: null },
      { p_parent_version: -1 },
      { p_parent_version: "9007199254740992" },
      { p_verified_ms: null },
      { p_verified_ms: -1 },
      { p_verified_ms: "9223372036854775807" },
      { p_auth_expires_ms: null },
      { p_auth_expires_ms: 0 },
      { p_auth_expires_ms: "9223372036854775807" },
    ];
    for (const change of mutations)
      for (const [i, name] of names.entries())
        expect(await raw(name, { ...args(q, i === 1), ...change })).toBeNull();
    for (const revision of [null, -1, "9007199254740992"])
      expect(await raw(names[1], { ...args(q, true), p_revision: revision })).toBeNull();
    await unchangedExcept(before);
  });

  it("unsafe current clocks deny enabling work but do not erase existing parent/generation/holds", async () => {
    const q = await fixture();
    expect(await register(q)).not.toBeNull();
    await seedHolds(q);
    const before = await snapshot();
    for (const time of [-1, MAX + 1]) {
      await setClock(time);
      expect(await current(q)).toBeNull();
      expect(await register(q)).toBeNull();
      await unchangedExcept(before);
    }
    expect(await transport().parents.revokeParent(pair(q))).toMatchObject({ revoked: true });
    await unchangedExcept(before, ["bfa_p5_voice_v2.auth_parents"], q.ownerId);
  });

  it("retains committed current-read time even when the transport discards the response", async () => {
    const q = await fixture(),
      t = transport();
    await setClock(q.verifiedAt + 5);
    const before = await snapshot();
    t.hooks.afterCommit = async () => {
      throw new Error("fictional response loss after COMMIT");
    };
    await expect(t.ports.readCurrentThread(query(q))).rejects.toThrow(
      "voice-v2-preissue-rpc-unavailable",
    );
    expect(t.calls).toEqual([{ name: names[0], committed: true }]);
    expect(await generationRow(q)).toBeUndefined();
    await unchangedExcept(before, ["bfa_p5_voice.owner_clocks"], q.ownerId);
    await setClock(q.verifiedAt + 4);
    expect(await current(q)).toBeNull();
  });

  it.each(["lost", "malformed"] as const)(
    "retains one committed generation after a %s response without retry or replacement",
    async (failure) => {
      const q = await fixture();
      await seedHolds(q);
      const before = await snapshot(),
        t = transport();
      t.hooks.afterCommit = async (_name, data) => {
        if (failure === "lost") throw new Error("fictional transport loss after COMMIT");
        return { ...(data as object), threadId: randomUUID() };
      };
      await expect(t.ports.registerGeneration(registration(q))).rejects.toThrow(
        "voice-v2-preissue-rpc-unavailable",
      );
      expect(t.calls).toEqual([{ name: names[1], committed: true }]);
      const retained = await generationRow(q);
      expect(retained).toBeDefined();
      await unchangedExcept(before, ["bfa_p5_voice.generations"], q.ownerId);
      // Deliberate exact metadata observation, not an automatic write retry.
      expect(await current(q)).toMatchObject({ threadIncarnation: retained.incarnation });
      expect(await generationRow(q)).toEqual(retained);
      expect(t.calls).toHaveLength(1);
    },
  );

  it("a late generation receipt is historical after revocation and cannot authorize issuance", async () => {
    const q = await fixture(),
      t = transport();
    t.hooks.afterCommit = async (_name, data) => {
      await transport().parents.revokeParent(pair(q));
      return data;
    };
    const late = await t.ports.registerGeneration(registration(q));
    expect(late).not.toBeNull();
    expect(t.calls).toHaveLength(1);
    const before = await snapshot();
    expect(await current(q)).toBeNull();
    expect(await register(q)).toBeNull();
    expect(
      await transport().parents.registerIssuance({
        ...query(q),
        threadIncarnation: late!.threadIncarnation,
        threadRevision: 0,
        authorityFingerprint: fingerprint(),
        issuedAt: q.verifiedAt,
        expiresAt: q.verifiedAt + 60000,
      }),
    ).toBeNull();
    await unchangedExcept(before);
  });

  it("a failed generation insert rolls back both new row and incidental clock advance", async () => {
    const q = await fixture();
    await seedHolds(q);
    const before = await snapshot();
    await setClock(q.verifiedAt + 1);
    await database().exec(
      "CREATE FUNCTION bfa_p5_voice.fixture_reject_generation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture generation insert failed'; END $$; CREATE TRIGGER fixture_reject_generation BEFORE INSERT ON bfa_p5_voice.generations FOR EACH ROW EXECUTE FUNCTION bfa_p5_voice.fixture_reject_generation();",
    );
    try {
      const t = transport();
      await expect(t.ports.registerGeneration(registration(q))).rejects.toThrow(
        "voice-v2-preissue-rpc-unavailable",
      );
      expect(t.calls).toEqual([{ name: names[1], committed: false }]);
      expect(await generationRow(q)).toBeUndefined();
      await unchangedExcept(before);
    } finally {
      await database().exec(
        "DROP TRIGGER fixture_reject_generation ON bfa_p5_voice.generations; DROP FUNCTION bfa_p5_voice.fixture_reject_generation();",
      );
    }
  });

  it("keeps both exact RPCs service-only without granting private schema/table/helper access", async () => {
    const q = await fixture(),
      before = await snapshot();
    for (const role of ["anon", "authenticated"] as const)
      for (const [i, name] of names.entries())
        await expect(raw(name, args(q, i === 1), role)).rejects.toThrow();
    for (const role of ["anon", "authenticated", "service_role"] as const) {
      for (const schema of ["bfa_p5_voice", "bfa_p5_voice_v2"]) {
        expect(
          (await one("SELECT has_schema_privilege($1,$2,'USAGE') AS allowed;", [role, schema]))
            .allowed,
        ).toBe(false);
        const helpers = (
          await database().query(
            "SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1;",
            [schema],
          )
        ).rows;
        for (const helper of helpers)
          expect(
            (
              await one("SELECT has_function_privilege($1,$2::oid,'EXECUTE') AS allowed;", [
                role,
                helper.oid,
              ])
            ).allowed,
          ).toBe(false);
      }
      for (const table of tables.filter((n) => n.startsWith("bfa_p5_voice")))
        for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"])
          expect(
            (
              await one("SELECT has_table_privilege($1,$2,$3) AS allowed;", [
                role,
                table,
                privilege,
              ])
            ).allowed,
          ).toBe(false);
    }
    const defs = (
      await database().query(
        "SELECT prosecdef,proconfig,has_function_privilege('service_role',p.oid,'EXECUTE') AS allowed FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname=ANY($1::text[]);",
        [[...names]],
      )
    ).rows;
    expect(defs).toHaveLength(2);
    for (const def of defs)
      expect(def).toEqual({
        prosecdef: true,
        proconfig: ["search_path=pg_catalog, pg_temp"],
        allowed: true,
      });
    await unchangedExcept(before);
  });
});
