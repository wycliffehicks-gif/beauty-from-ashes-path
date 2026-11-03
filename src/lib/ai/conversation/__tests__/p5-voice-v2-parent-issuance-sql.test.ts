// Actual isolated PostgreSQL + the inactive v2 transport adapter. All Auth and
// eligibility metadata are fictional trusted-host inputs; no verifier, live
// account, HTTP/provider call, participant grant or native concurrency executes.
// Administrative fixture mutations/clock movement below are not runtime ports.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { readFile, readdir, realpath } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createVoiceV2ParentIssuanceRpcPorts,
  type VoiceV2ParentIssuanceRpcName,
  type VoiceV2IssuanceRegistration,
  type VoiceV2ParentQuery,
} from "../service/voice-v2-parent-issuance-rpc.server";

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
const names = [
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
const pair = (q: VoiceV2ParentQuery) => ({ ownerId: q.ownerId, authSessionId: q.authSessionId });
const observation = (q: VoiceV2IssuanceRegistration) => ({
  ...pair(q),
  verifiedAt: q.verifiedAt,
  authExpiresAt: q.authExpiresAt,
});
const association = (q: VoiceV2IssuanceRegistration) => ({
  ...pair(q),
  parentVersion: q.parentVersion,
  authorityFingerprint: q.authorityFingerprint,
});
const pairArgs = (q: VoiceV2ParentQuery) => ({
  p_owner_id: q.ownerId,
  p_auth_session_id: q.authSessionId,
});
const registrationArgs = (q: VoiceV2IssuanceRegistration) => ({
  ...pairArgs(q),
  p_parent_version: q.parentVersion,
  p_thread_id: q.threadId,
  p_incarnation: q.threadIncarnation,
  p_revision: q.threadRevision,
  p_fingerprint: q.authorityFingerprint,
  p_verified_ms: q.verifiedAt,
  p_auth_expires_ms: q.authExpiresAt,
  p_issued_ms: q.issuedAt,
  p_expires_ms: q.expiresAt,
});

sqlSuite("P5 proposed v2 parent and issuance in isolated PostgreSQL", () => {
  let db: LocalDatabase | undefined;
  let seed: LocalDatabase | undefined;
  let realClockDefinition: string | undefined;
  const database = () => {
    if (!db) throw new Error("Offline fixture database unavailable");
    return db;
  };
  const one = async (sql: string, args: unknown[] = []) =>
    (await database().query(sql, args)).rows[0]!;
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
    const install = async (relative: string) =>
      database().exec(await readFile(path.join(ROOT, relative), "utf8"));
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
    ])
      await install(`docs/pilot/conversation/sql-drafts/p5-voice-${name}.sql`);
    realClockDefinition = (
      await one("SELECT pg_get_functiondef('bfa_p5_voice.ms()'::regprocedure) AS definition;")
    ).definition as string;
  }, 60_000);
  afterEach(async () => {
    if (db && !db.closed && realClockDefinition) await db.exec(realClockDefinition);
  });
  afterAll(async () => {
    for (const instance of [seed, db]) {
      if (instance && !instance.closed) await instance.close();
      if (instance) expect(instance.closed).toBe(true);
    }
  });
  async function asRole(role: Role, sql: string, args: unknown[] = []) {
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
  async function raw(name: VoiceV2ParentIssuanceRpcName, args: Args, role: Role = "service_role") {
    expect(names).toContain(name);
    const types: Record<string, string> = {
      p_owner_id: "uuid",
      p_auth_session_id: "uuid",
      p_parent_version: "bigint",
      p_thread_id: "uuid",
      p_incarnation: "uuid",
      p_revision: "bigint",
      p_fingerprint: "text",
      p_verified_ms: "bigint",
      p_auth_expires_ms: "bigint",
      p_issued_ms: "bigint",
      p_expires_ms: "bigint",
    };
    const entries = Object.entries(args);
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
    const calls: { name: VoiceV2ParentIssuanceRpcName; committed: boolean }[] = [];
    const hooks: {
      afterCommit?: (name: VoiceV2ParentIssuanceRpcName, data: unknown) => Promise<unknown>;
    } = {};
    return {
      calls,
      hooks,
      ports: createVoiceV2ParentIssuanceRpcPorts({
        async rpc(name, args) {
          const call = { name, committed: false };
          calls.push(call);
          const data = await raw(name, args);
          call.committed = true;
          return {
            data: hooks.afterCommit ? await hooks.afterCommit(name, data) : data,
            error: null,
            status: 200,
          };
        },
      }),
    };
  }
  const ports = () => transport().ports;
  async function setClock(value: number) {
    expect(Number.isInteger(value)).toBe(true);
    await database().exec(
      `CREATE OR REPLACE FUNCTION bfa_p5_voice.ms() RETURNS bigint LANGUAGE sql VOLATILE SET search_path=pg_catalog,pg_temp AS $$ SELECT ${value}::bigint $$;`,
    );
  }
  async function fixture(): Promise<VoiceV2IssuanceRegistration> {
    const now = Date.now(),
      ownerId = randomUUID(),
      threadId = randomUUID();
    await setClock(now);
    await database().query(
      "INSERT INTO public.bfa_p3b_staging_accounts(user_id,admitted,expires_at) VALUES($1,true,to_timestamp($2/1000.0));",
      [ownerId, now + 7_200_000],
    );
    await database().query(
      "INSERT INTO public.bfa_p3b_threads(id,owner_id,saved_snapshot,saved_at) VALUES($1,$2,to_jsonb('fictional private source must not escape'::text),clock_timestamp());",
      [threadId, ownerId],
    );
    const threadIncarnation = (
      await asRole("service_role", "SELECT public.bfa_p5_voice_register_generation($1,$2) AS id;", [
        ownerId,
        threadId,
      ])
    ).id as string;
    return {
      ownerId,
      authSessionId: randomUUID(),
      parentVersion: 0,
      threadId,
      threadIncarnation,
      threadRevision: 0,
      authorityFingerprint: fingerprint(),
      verifiedAt: now,
      authExpiresAt: now + 1_800_000,
      issuedAt: now,
      expiresAt: now + 60_000,
    };
  }
  async function observe(q: VoiceV2IssuanceRegistration) {
    return ports().observeParent(observation(q));
  }
  async function registered() {
    const q = await fixture();
    expect(await observe(q)).toMatchObject({
      protocol: 2,
      ...pair(q),
      parentVersion: 0,
      revoked: false,
    });
    expect(await ports().registerIssuance(q)).toMatchObject({
      ...association(q),
      issuedAt: q.issuedAt,
      expiresAt: q.expiresAt,
    });
    return q;
  }
  const parentRow = (q: VoiceV2ParentQuery) =>
    one(
      "SELECT p.*,xmin::text AS xmin,ctid::text AS ctid FROM bfa_p5_voice_v2.auth_parents p WHERE owner_id=$1 AND auth_session_id=$2;",
      [q.ownerId, q.authSessionId],
    );
  const issuanceRow = (q: VoiceV2IssuanceRegistration) =>
    one(
      "SELECT i.*,xmin::text AS xmin,ctid::text AS ctid FROM bfa_p5_voice.issuances i WHERE fingerprint=$1;",
      [q.authorityFingerprint],
    );
  const bindingRow = (q: VoiceV2IssuanceRegistration) =>
    one(
      "SELECT b.*,xmin::text AS xmin,ctid::text AS ctid FROM bfa_p5_voice_v2.issuance_auth_bindings b WHERE fingerprint=$1;",
      [q.authorityFingerprint],
    );
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
  async function seedHolds(q: VoiceV2IssuanceRegistration) {
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
        threadIncarnation: q.threadIncarnation,
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

  it("re-observes one timeless parent while issuing successive bounded authorities after old expiry", async () => {
    const q = await registered();
    await seedHolds(q);
    const parent = await parentRow(q),
      issuance = await issuanceRow(q),
      binding = await bindingRow(q),
      before = await snapshot();
    const now = q.expiresAt + 1;
    await setClock(now);
    const next = {
      ...q,
      authorityFingerprint: fingerprint(),
      verifiedAt: now,
      issuedAt: now,
      expiresAt: now + 60_000,
    };
    expect(await observe(next)).toMatchObject({ parentVersion: 0, revoked: false });
    expect(await ports().registerIssuance(next)).toMatchObject({ expiresAt: next.expiresAt });
    expect(await ports().readIssuance(association(q))).toBeNull();
    expect(await ports().readIssuance(association(next))).toMatchObject({
      expiresAt: next.expiresAt,
    });
    // A later independently verified fictional Auth deadline can support a
    // fresh bounded issuance; the negative parent itself gains no allowance.
    const later = q.authExpiresAt + 1;
    await setClock(later);
    const third = {
      ...q,
      authorityFingerprint: fingerprint(),
      verifiedAt: later,
      issuedAt: later,
      authExpiresAt: later + 300_000,
      expiresAt: later + 60_000,
    };
    expect(await observe(third)).toMatchObject({ parentVersion: 0, revoked: false });
    expect(await ports().registerIssuance(third)).not.toBeNull();
    expect(await ports().readIssuance(association(next))).toBeNull();
    expect(await parentRow(q)).toEqual(parent);
    expect(await issuanceRow(q)).toEqual(issuance);
    expect(await bindingRow(q)).toEqual(binding);
    expect(Object.keys(parent).sort()).toEqual(
      ["owner_id", "auth_session_id", "version", "revoked", "xmin", "ctid"].sort(),
    );
    await unchangedExcept(
      before,
      [
        "bfa_p5_voice.owner_clocks",
        "bfa_p5_voice.issuances",
        "bfa_p5_voice_v2.issuance_auth_bindings",
      ],
      q.ownerId,
    );
  });

  it("records terminal absence revocation without clock, staging or legacy eligibility", async () => {
    const q = await fixture();
    await database().query("DELETE FROM public.bfa_p3b_staging_accounts WHERE user_id=$1;", [
      q.ownerId,
    ]);
    await setClock(-1);
    expect(await ports().revokeParent(pair(q))).toEqual({
      protocol: 2,
      ...pair(q),
      parentVersion: 0,
      revoked: true,
    });
    const row = await parentRow(q);
    expect(await ports().revokeParent(pair(q))).toMatchObject({ parentVersion: 0, revoked: true });
    expect(await parentRow(q)).toEqual(row);
    await setClock(q.verifiedAt);
    expect(await observe(q)).toBeNull();
    expect(await ports().registerIssuance(q)).toBeNull();
    expect(await ports().readParent(pair(q))).toMatchObject({ revoked: true });
  });

  it("terminally revokes an observed parent and retains issued records, uncertain claims and held capacity", async () => {
    const q = await registered();
    await seedHolds(q);
    const before = await snapshot();
    expect(await ports().revokeParent(pair(q))).toMatchObject({ parentVersion: 1, revoked: true });
    const row = await parentRow(q);
    expect(await ports().revokeParent(pair(q))).toMatchObject({ parentVersion: 1, revoked: true });
    expect(await parentRow(q)).toEqual(row);
    expect(await observe(q)).toBeNull();
    expect(
      await ports().registerIssuance({
        ...q,
        authorityFingerprint: fingerprint(),
        parentVersion: 1,
      }),
    ).toBeNull();
    expect(await ports().readIssuance(association(q))).toBeNull();
    await unchangedExcept(before, ["bfa_p5_voice_v2.auth_parents"], q.ownerId);
  });

  it("revocation saturates a safe maximum version and stays terminal", async () => {
    const q = await fixture();
    await database().query("INSERT INTO bfa_p5_voice_v2.auth_parents VALUES($1,$2,$3,false);", [
      q.ownerId,
      q.authSessionId,
      MAX,
    ]);
    expect(await ports().revokeParent(pair(q))).toMatchObject({
      parentVersion: MAX,
      revoked: true,
    });
    expect(await observe(q)).toBeNull();
    expect(await ports().registerIssuance({ ...q, parentVersion: MAX })).toBeNull();
  });

  it.each(["active", "expired", "revoked"] as const)(
    "denies v2 when any %s v1 fence exists and never adopts it",
    async (state) => {
      const q = await fixture();
      await database().query("INSERT INTO bfa_p5_voice.session_fences VALUES($1,$2,0,$3,$4);", [
        q.ownerId,
        q.authSessionId,
        state === "expired" ? q.issuedAt - 1 : q.expiresAt,
        state === "revoked",
      ]);
      const before = await snapshot();
      expect(await observe(q)).toBeNull();
      expect(await ports().readParent(pair(q))).toBeNull();
      expect(await ports().registerIssuance(q)).toBeNull();
      expect(await ports().readIssuance(association(q))).toBeNull();
      await unchangedExcept(before);
      expect(await ports().revokeParent(pair(q))).toMatchObject({ revoked: true });
      expect(await ports().readParent(pair(q))).toBeNull();
      await unchangedExcept(before, ["bfa_p5_voice_v2.auth_parents"], q.ownerId);
    },
  );

  it("a late actual legacy revoke prevents every positive v2 observation without erasing v2 records", async () => {
    const q = await registered();
    const parent = await parentRow(q),
      issuance = await issuanceRow(q),
      binding = await bindingRow(q);
    await asRole("service_role", "SELECT public.bfa_p5_voice_revoke_session($1,$2) AS value;", [
      q.ownerId,
      q.authSessionId,
    ]);
    const before = await snapshot();
    expect(await observe(q)).toBeNull();
    expect(await ports().readParent(pair(q))).toBeNull();
    expect(await ports().registerIssuance(q)).toBeNull();
    expect(await ports().readIssuance(association(q))).toBeNull();
    expect(await parentRow(q)).toEqual(parent);
    expect(await issuanceRow(q)).toEqual(issuance);
    expect(await bindingRow(q)).toEqual(binding);
    await unchangedExcept(before);
  });

  it("never backfills an actual v1 issuance or an administratively orphaned association", async () => {
    const q = await fixture();
    expect(await observe(q)).not.toBeNull();
    expect(
      (
        await asRole(
          "service_role",
          "SELECT public.bfa_p5_voice_register_issuance($1,$2,$3,$4,$5,$6,$7) AS value;",
          [
            q.ownerId,
            q.threadId,
            q.threadIncarnation,
            0,
            q.authorityFingerprint,
            q.issuedAt,
            q.expiresAt,
          ],
        )
      ).value,
    ).toBe(true);
    const before = await snapshot();
    expect(await ports().registerIssuance(q)).toBeNull();
    expect(await ports().readIssuance(association(q))).toBeNull();
    await unchangedExcept(before);
    const other = { ...q, authorityFingerprint: fingerprint() };
    expect(await ports().registerIssuance(other)).not.toBeNull();
    await database().query(
      "DELETE FROM bfa_p5_voice_v2.issuance_auth_bindings WHERE fingerprint=$1;",
      [other.authorityFingerprint],
    );
    const orphan = await snapshot();
    expect(await ports().registerIssuance(other)).toBeNull();
    expect(await ports().readIssuance(association(other))).toBeNull();
    await unchangedExcept(orphan);
  });

  it("acknowledges only an exact immutable tuple, without updating issuance, association or parent bytes", async () => {
    const q = await registered();
    const parent = await parentRow(q),
      issuance = await issuanceRow(q),
      binding = await bindingRow(q);
    await setClock(q.issuedAt + 1);
    expect(
      await ports().registerIssuance({
        ...q,
        verifiedAt: q.verifiedAt + 1,
        authExpiresAt: q.authExpiresAt + 1,
      }),
    ).not.toBeNull();
    for (const changes of [
      { expiresAt: q.expiresAt + 1 },
      { expiresAt: q.expiresAt - 1 },
      { issuedAt: q.issuedAt + 1 },
      { parentVersion: 1 },
      { threadRevision: 1 },
      { threadIncarnation: randomUUID() },
    ])
      expect(await ports().registerIssuance({ ...q, ...changes })).toBeNull();
    const otherSession = { ...q, authSessionId: randomUUID() };
    expect(await observe(otherSession)).not.toBeNull();
    expect(await ports().registerIssuance(otherSession)).toBeNull();
    const otherOwner = await fixture();
    expect(await observe(otherOwner)).not.toBeNull();
    expect(
      await ports().registerIssuance({
        ...otherOwner,
        authorityFingerprint: q.authorityFingerprint,
      }),
    ).toBeNull();
    expect(await parentRow(q)).toEqual(parent);
    expect(await issuanceRow(q)).toEqual(issuance);
    expect(await bindingRow(q)).toEqual(binding);
  });

  it("does not replay or read an explicitly revoked issuance", async () => {
    const q = await registered();
    await database().query("UPDATE bfa_p5_voice.issuances SET revoked=true WHERE fingerprint=$1;", [
      q.authorityFingerprint,
    ]);
    const before = await snapshot();
    expect(await ports().registerIssuance(q)).toBeNull();
    expect(await ports().readIssuance(association(q))).toBeNull();
    await unchangedExcept(before);
  });

  it("cannot rebind an existing fingerprint to a changed current parent version or delete its referenced records", async () => {
    const q = await registered();
    // Deliberate administrative corruption: no v2 RPC can advance a clear
    // parent. Even then, the immutable issuance association is not adopted.
    await database().query(
      "UPDATE bfa_p5_voice_v2.auth_parents SET version=1 WHERE owner_id=$1 AND auth_session_id=$2;",
      [q.ownerId, q.authSessionId],
    );
    const before = await snapshot();
    expect(await ports().registerIssuance({ ...q, parentVersion: 1 })).toBeNull();
    expect(await ports().readIssuance({ ...association(q), parentVersion: 1 })).toBeNull();
    await expect(
      database().query("DELETE FROM bfa_p5_voice.issuances WHERE fingerprint=$1;", [
        q.authorityFingerprint,
      ]),
    ).rejects.toThrow(/foreign key/);
    await expect(
      database().query(
        "DELETE FROM bfa_p5_voice_v2.auth_parents WHERE owner_id=$1 AND auth_session_id=$2;",
        [q.ownerId, q.authSessionId],
      ),
    ).rejects.toThrow(/foreign key/);
    await unchangedExcept(before);
  });

  it.each([-1, MAX + 1])(
    "fails closed on invalid database clock %s while revocation remains deny-only",
    async (clock) => {
      const q = await registered();
      const before = await snapshot();
      await setClock(clock);
      expect(await observe(q)).toBeNull();
      expect(await ports().registerIssuance(q)).toBeNull();
      expect(await ports().readIssuance(association(q))).toBeNull();
      await unchangedExcept(before);
      await database().query(
        "UPDATE public.bfa_p3b_staging_accounts SET admitted=false,expires_at=to_timestamp($2/1000.0) WHERE user_id=$1;",
        [q.ownerId, q.issuedAt - 1],
      );
      await database().query("INSERT INTO bfa_p5_voice.session_fences VALUES($1,$2,0,$3,true);", [
        q.ownerId,
        q.authSessionId,
        q.issuedAt - 1,
      ]);
      const fenced = await snapshot();
      expect(await ports().revokeParent(pair(q))).toMatchObject({
        parentVersion: 1,
        revoked: true,
      });
      await unchangedExcept(fenced, ["bfa_p5_voice_v2.auth_parents"], q.ownerId);
    },
  );

  it("enforces fresh verified and issued times independently at the strict 30000ms edge", async () => {
    const q = await fixture();
    expect(await observe(q)).not.toBeNull();
    for (const changes of [
      { verifiedAt: q.issuedAt - 30_000 },
      { verifiedAt: q.issuedAt + 1 },
      { issuedAt: q.issuedAt - 30_000 },
      { issuedAt: q.issuedAt + 1 },
    ])
      expect(
        await ports().registerIssuance({ ...q, ...changes, authorityFingerprint: fingerprint() }),
      ).toBeNull();
    expect(
      await ports().registerIssuance({
        ...q,
        verifiedAt: q.issuedAt - 29_999,
        issuedAt: q.issuedAt - 29_999,
      }),
    ).not.toBeNull();
    expect(
      await ports().observeParent({ ...observation(q), verifiedAt: q.issuedAt - 30_000 }),
    ).toBeNull();
    expect(
      await ports().observeParent({ ...observation(q), verifiedAt: q.issuedAt + 1 }),
    ).toBeNull();
    expect(
      await ports().observeParent({
        ...observation(q),
        verifiedAt: q.issuedAt - 1,
        authExpiresAt: q.issuedAt,
      }),
    ).toBeNull();
  });

  it("bounds lifetime by fifteen minutes, current Auth and current allowlist with equality accepted", async () => {
    const q = await fixture();
    expect(await observe(q)).not.toBeNull();
    expect(
      await ports().registerIssuance({ ...q, expiresAt: q.issuedAt + 900_000 }),
    ).not.toBeNull();
    const base = registrationArgs({ ...q, authorityFingerprint: fingerprint() });
    for (const changes of [
      { p_expires_ms: q.issuedAt + 900_001 },
      { p_expires_ms: q.issuedAt },
      { p_auth_expires_ms: q.expiresAt - 1 },
    ])
      expect(await raw("bfa_p5_v2_register_issuance", { ...base, ...changes })).toBeNull();
    await database().query(
      "UPDATE public.bfa_p3b_staging_accounts SET expires_at=to_timestamp($2/1000.0) WHERE user_id=$1;",
      [q.ownerId, q.expiresAt],
    );
    expect(
      await ports().registerIssuance({
        ...q,
        authorityFingerprint: fingerprint(),
        authExpiresAt: q.expiresAt,
      }),
    ).not.toBeNull();
    expect(
      await ports().registerIssuance({
        ...q,
        authorityFingerprint: fingerprint(),
        expiresAt: q.expiresAt + 1,
      }),
    ).toBeNull();
  });

  it("rejects raw SQL null, nil, unsafe and overflow-prone metadata before retaining any rows", async () => {
    const q = await fixture();
    expect(await observe(q)).not.toBeNull();
    const before = await snapshot(),
      base = registrationArgs(q);
    for (const [key, value] of [
      ["p_owner_id", null],
      ["p_auth_session_id", NIL],
      ["p_thread_id", NIL],
      ["p_incarnation", NIL],
      ["p_parent_version", -1],
      ["p_parent_version", "9007199254740992"],
      ["p_revision", null],
      ["p_verified_ms", "9223372036854775807"],
      ["p_issued_ms", "-9223372036854775808"],
      ["p_auth_expires_ms", "9007199254740992"],
      ["p_expires_ms", null],
      ["p_fingerprint", "A".repeat(64)],
    ] as const)
      expect(await raw("bfa_p5_v2_register_issuance", { ...base, [key]: value })).toBeNull();
    for (const name of [
      "bfa_p5_v2_observe_parent",
      "bfa_p5_v2_revoke_parent",
      "bfa_p5_v2_read_parent",
      "bfa_p5_v2_read_issuance",
    ] as const) {
      const args =
        name === "bfa_p5_v2_observe_parent"
          ? { ...pairArgs(q), p_verified_ms: q.verifiedAt, p_auth_expires_ms: q.authExpiresAt }
          : name === "bfa_p5_v2_read_issuance"
            ? { ...pairArgs(q), p_parent_version: 0, p_fingerprint: q.authorityFingerprint }
            : pairArgs(q);
      expect(await raw(name, { ...args, p_owner_id: NIL })).toBeNull();
      expect(await raw(name, { ...args, p_auth_session_id: null })).toBeNull();
    }
    await unchangedExcept(before);
  });

  it("reads exact current metadata without issuing approval, Auth, proof, quota or dispatch permission", async () => {
    const q = await registered();
    await seedHolds(q);
    const before = await snapshot();
    const parent = await ports().readParent(pair(q)),
      issuance = await ports().readIssuance(association(q));
    expect(Object.keys(parent!).sort()).toEqual(
      ["protocol", "ownerId", "authSessionId", "parentVersion", "revoked"].sort(),
    );
    expect(Object.keys(issuance!).sort()).toEqual(
      [
        "protocol",
        "ownerId",
        "authSessionId",
        "parentVersion",
        "threadId",
        "threadIncarnation",
        "threadRevision",
        "authorityFingerprint",
        "issuedAt",
        "expiresAt",
        "revoked",
      ].sort(),
    );
    for (const changes of [
      { ownerId: randomUUID() },
      { authSessionId: randomUUID() },
      { parentVersion: 1 },
      { authorityFingerprint: fingerprint() },
    ])
      expect(await ports().readIssuance({ ...association(q), ...changes })).toBeNull();
    await unchangedExcept(before);
    await setClock(-1);
    expect(await ports().readParent(pair(q))).toEqual(parent);
    expect(await ports().readIssuance(association(q))).toBeNull();
    await unchangedExcept(before);
  });

  it("retains observed expiry high-water so rollback cannot revive the same issuance or create another", async () => {
    const q = await registered();
    const issuance = await issuanceRow(q),
      binding = await bindingRow(q),
      parent = await parentRow(q);
    await setClock(q.expiresAt);
    expect(await ports().readIssuance(association(q))).toBeNull();
    const before = await snapshot();
    await setClock(q.issuedAt + 1);
    expect(await ports().readIssuance(association(q))).toBeNull();
    expect(
      await ports().registerIssuance({ ...q, authorityFingerprint: fingerprint() }),
    ).toBeNull();
    expect(await observe(q)).toBeNull();
    expect(await parentRow(q)).toEqual(parent);
    expect(await issuanceRow(q)).toEqual(issuance);
    expect(await bindingRow(q)).toEqual(binding);
    await unchangedExcept(before);
    await setClock(q.expiresAt + 1);
    expect(
      await ports().registerIssuance({
        ...q,
        authorityFingerprint: fingerprint(),
        verifiedAt: q.expiresAt + 1,
        issuedAt: q.expiresAt + 1,
        expiresAt: q.expiresAt + 60_001,
      }),
    ).not.toBeNull();
  });

  it.each([
    "deleted",
    "revision",
    "retired",
    "created-at",
    "generation-owner",
    "thread-owner",
  ] as const)(
    "denies current issuance reads and writes after %s changes without erasing evidence",
    async (change) => {
      const q = await registered();
      if (change === "deleted")
        await database().query(
          "UPDATE public.bfa_p3b_threads SET saved_snapshot=NULL,saved_at=NULL,deleted_at=clock_timestamp() WHERE id=$1;",
          [q.threadId],
        );
      if (change === "revision")
        await database().query(
          "UPDATE public.bfa_p3b_threads SET revision=revision+1 WHERE id=$1;",
          [q.threadId],
        );
      if (change === "retired")
        await database().query(
          "UPDATE bfa_p5_voice.generations SET retired=true WHERE thread_id=$1;",
          [q.threadId],
        );
      if (change === "created-at")
        await database().query(
          "UPDATE public.bfa_p3b_threads SET created_at=created_at+interval '1 second' WHERE id=$1;",
          [q.threadId],
        );
      if (change === "generation-owner")
        await database().query(
          "UPDATE bfa_p5_voice.generations SET owner_id=$2 WHERE thread_id=$1;",
          [q.threadId, randomUUID()],
        );
      if (change === "thread-owner")
        await database().query("UPDATE public.bfa_p3b_threads SET owner_id=$2 WHERE id=$1;", [
          q.threadId,
          randomUUID(),
        ]);
      const before = await snapshot();
      expect(await ports().readIssuance(association(q))).toBeNull();
      expect(await ports().registerIssuance(q)).toBeNull();
      expect(
        await ports().registerIssuance({ ...q, authorityFingerprint: fingerprint() }),
      ).toBeNull();
      await unchangedExcept(before);
    },
  );

  it.each(["unadmitted", "expired", "missing", "infinite", "unsafe"] as const)(
    "denies current issuance when allowlist becomes %s while parent remains only an observation",
    async (change) => {
      const q = await registered();
      if (change === "unadmitted")
        await database().query(
          "UPDATE public.bfa_p3b_staging_accounts SET admitted=false WHERE user_id=$1;",
          [q.ownerId],
        );
      if (change === "expired")
        await database().query(
          "UPDATE public.bfa_p3b_staging_accounts SET expires_at=to_timestamp($2/1000.0) WHERE user_id=$1;",
          [q.ownerId, q.issuedAt],
        );
      if (change === "missing")
        await database().query("DELETE FROM public.bfa_p3b_staging_accounts WHERE user_id=$1;", [
          q.ownerId,
        ]);
      if (change === "infinite")
        await database().query(
          "UPDATE public.bfa_p3b_staging_accounts SET expires_at='infinity' WHERE user_id=$1;",
          [q.ownerId],
        );
      if (change === "unsafe")
        await database().query(
          "UPDATE public.bfa_p3b_staging_accounts SET expires_at=to_timestamp(9007199254742) WHERE user_id=$1;",
          [q.ownerId],
        );
      const before = await snapshot();
      expect(await ports().readIssuance(association(q))).toBeNull();
      expect(await ports().registerIssuance(q)).toBeNull();
      expect(
        await ports().registerIssuance({ ...q, authorityFingerprint: fingerprint() }),
      ).toBeNull();
      expect(await ports().readParent(pair(q))).toMatchObject({ revoked: false });
      await unchangedExcept(before);
    },
  );

  it("restricts all five RPCs to service role and withholds private schema/table/helper privileges", async () => {
    const q = await registered();
    const args: Record<VoiceV2ParentIssuanceRpcName, Args> = {
      bfa_p5_v2_observe_parent: {
        ...pairArgs(q),
        p_verified_ms: q.verifiedAt,
        p_auth_expires_ms: q.authExpiresAt,
      },
      bfa_p5_v2_revoke_parent: pairArgs(q),
      bfa_p5_v2_read_parent: pairArgs(q),
      bfa_p5_v2_register_issuance: registrationArgs(q),
      bfa_p5_v2_read_issuance: {
        ...pairArgs(q),
        p_parent_version: 0,
        p_fingerprint: q.authorityFingerprint,
      },
    };
    const before = await snapshot();
    for (const role of ["anon", "authenticated"] as const)
      for (const name of names)
        await expect(raw(name, args[name], role)).rejects.toThrow(/permission denied/);
    for (const role of ["anon", "authenticated", "service_role"] as const) {
      expect(
        (await one("SELECT has_schema_privilege($1,'bfa_p5_voice_v2','USAGE') AS allowed;", [role]))
          .allowed,
      ).toBe(false);
      for (const table of ["auth_parents", "issuance_auth_bindings"])
        expect(
          (
            await one(
              "SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS allowed;",
              [role, `bfa_p5_voice_v2.${table}`],
            )
          ).allowed,
        ).toBe(false);
      const helpers = (
        await database().query(
          "SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='bfa_p5_voice_v2';",
        )
      ).rows;
      expect(helpers.length).toBeGreaterThan(0);
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
    const definitions = (
      await database().query(
        "SELECT prosecdef,proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname=ANY($1::text[]);",
        [[...names]],
      )
    ).rows;
    expect(definitions).toHaveLength(5);
    for (const definition of definitions) {
      expect(definition.prosecdef).toBe(true);
      expect(definition.proconfig).toEqual(["search_path=pg_catalog, pg_temp"]);
    }
    await unchangedExcept(before);
  });

  it.each(["observe", "register", "revoke"] as const)(
    "lost committed %s ACK causes no retry, rollback assumption or accounting release",
    async (operation) => {
      const q = await fixture();
      if (operation !== "observe") expect(await observe(q)).not.toBeNull();
      await seedHolds(q);
      const before = await snapshot(),
        t = transport();
      t.hooks.afterCommit = async () => {
        throw new Error("fictional transport loss after COMMIT");
      };
      const action =
        operation === "observe"
          ? t.ports.observeParent(observation(q))
          : operation === "register"
            ? t.ports.registerIssuance(q)
            : t.ports.revokeParent(pair(q));
      await expect(action).rejects.toThrow("voice-v2-parent-issuance-rpc-unavailable");
      expect(t.calls).toHaveLength(1);
      expect(t.calls[0]!.committed).toBe(true);
      expect(await parentRow(q)).toMatchObject({ revoked: operation === "revoke" });
      if (operation === "register") {
        expect(await issuanceRow(q)).toMatchObject({ fingerprint: q.authorityFingerprint });
        expect(await bindingRow(q)).toMatchObject({
          fingerprint: q.authorityFingerprint,
          auth_session_id: q.authSessionId,
        });
      }
      await unchangedExcept(
        before,
        operation === "register"
          ? ["bfa_p5_voice.issuances", "bfa_p5_voice_v2.issuance_auth_bindings"]
          : operation === "observe"
            ? ["bfa_p5_voice_v2.auth_parents", "bfa_p5_voice.owner_clocks"]
            : ["bfa_p5_voice_v2.auth_parents"],
        q.ownerId,
      );
    },
  );

  it("late registration receipt is only a historical observation after parent revocation", async () => {
    const q = await fixture();
    expect(await observe(q)).not.toBeNull();
    const t = transport();
    t.hooks.afterCommit = async (name, data) => {
      expect(name).toBe("bfa_p5_v2_register_issuance");
      await ports().revokeParent(pair(q));
      return data;
    };
    expect(await t.ports.registerIssuance(q)).toMatchObject({ parentVersion: 0, revoked: false });
    expect(t.calls).toHaveLength(1);
    expect(await ports().readParent(pair(q))).toMatchObject({ parentVersion: 1, revoked: true });
    expect(await ports().readIssuance(association(q))).toBeNull();
    expect(await issuanceRow(q)).toBeDefined();
    expect(await bindingRow(q)).toBeDefined();
  });

  it("rolls back both issuance records and the clock if the association insert fails atomically", async () => {
    const q = await fixture();
    expect(await observe(q)).not.toBeNull();
    await seedHolds(q);
    const before = await snapshot();
    await setClock(q.issuedAt + 1);
    await database().exec(
      "CREATE FUNCTION bfa_p5_voice_v2.fixture_reject_binding() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture sidecar insert failed'; END $$; CREATE TRIGGER fixture_reject_binding BEFORE INSERT ON bfa_p5_voice_v2.issuance_auth_bindings FOR EACH ROW EXECUTE FUNCTION bfa_p5_voice_v2.fixture_reject_binding();",
    );
    try {
      const t = transport();
      await expect(t.ports.registerIssuance(q)).rejects.toThrow(
        "voice-v2-parent-issuance-rpc-unavailable",
      );
      expect(t.calls).toEqual([{ name: "bfa_p5_v2_register_issuance", committed: false }]);
      await unchangedExcept(before);
      expect(await issuanceRow(q)).toBeUndefined();
      expect(await bindingRow(q)).toBeUndefined();
    } finally {
      await database().exec(
        "DROP TRIGGER fixture_reject_binding ON bfa_p5_voice_v2.issuance_auth_bindings; DROP FUNCTION bfa_p5_voice_v2.fixture_reject_binding();",
      );
    }
  });
});
