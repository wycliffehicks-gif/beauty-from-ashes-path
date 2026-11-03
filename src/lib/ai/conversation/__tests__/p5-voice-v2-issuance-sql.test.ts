// Actual inactive v2 issuer + unchanged local P3b seal/HMAC + actual v2 SQL.
// Auth is explicitly fictional trusted-host input. No connected database, live
// Auth verifier, provider, runtime route or native concurrent SQL executes.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile, readdir, realpath } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ConversationService } from "../service/service";
import { fingerprint as tokenFingerprint, unseal } from "../staging/seal.server";
import { createVoiceV2AuthorityIssuer } from "../service/voice-v2-issuance.server";
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
  service: ConversationService;
  now: number;
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
sqlSuite("P5 inactive v2 trusted issuer in isolated PostgreSQL", () => {
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
    vi.stubEnv("BFA_P3B_STATE_SECRET", `offline-v2-issuer-fixture-${randomUUID()}`);
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
      "REVOKE EXECUTE ON FUNCTION public.bfa_p5_voice_register_generation(uuid,uuid),public.bfa_p5_voice_register_issuance(uuid,uuid,uuid,bigint,text,bigint,bigint) FROM service_role;",
    );
    realClockDefinition = (
      await one("SELECT pg_get_functiondef('bfa_p5_voice.ms()'::regprocedure) AS definition;")
    ).definition as string;
  }, 60000);
  afterEach(async () => {
    if (db && !db.closed && realClockDefinition) await db.exec(realClockDefinition);
  });
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
    const calls: { name: string; args: Args; committed: boolean }[] = [];
    const hooks: {
      before?: (name: string, values: Args) => Promise<void>;
      afterCommit?: (name: string, values: Args, data: unknown) => Promise<unknown>;
    } = {};
    const client = {
      async rpc(name: string, values: Args) {
        const call = { name, args: values, committed: false };
        calls.push(call);
        await hooks.before?.(name, values);
        const data = await raw(name, values);
        call.committed = true;
        return {
          data: hooks.afterCommit ? await hooks.afterCommit(name, values, data) : data,
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
  async function fixture(observe = false): Promise<Fixture> {
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
    const service = new ConversationService({ verifiedOwnerId: ownerId });
    service.ensureThread(threadId, false);
    const q = {
      service,
      now,
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

  const changedTables = [
    "bfa_p5_voice_v2.auth_parents",
    "bfa_p5_voice.owner_clocks",
    "bfa_p5_voice.generations",
    "bfa_p5_voice.issuances",
    "bfa_p5_voice_v2.issuance_auth_bindings",
  ];
  function issuer(q: Fixture, maxAuthorityAgeMs = 60000) {
    const t = transport();
    const auth = { ownerId: q.ownerId, sessionId: q.authSessionId, expiresAt: q.authExpiresAt };
    const state = { authAvailable: true, auth, authCalls: 0 };
    const instance = createVoiceV2AuthorityIssuer({
      ...t.ports,
      ...t.parents,
      maxAuthorityAgeMs,
      now: () => q.now,
      async authenticate() {
        state.authCalls += 1;
        return state.authAvailable ? { ...state.auth } : null;
      },
    });
    const issue = () =>
      instance.issue({
        service: q.service,
        threadId: q.threadId,
        threadRevision: q.threadRevision,
        sourceCreatedAt: q.sourceCreatedAt,
      });
    return { ...t, instance, issue, state };
  }
  async function advance(q: Fixture, milliseconds: number) {
    q.now += milliseconds;
    await setClock(q.now);
  }
  async function issuanceRows(q: Fixture) {
    return (
      await database().query(
        "SELECT i.*,xmin::text AS xmin,ctid::text AS ctid FROM bfa_p5_voice.issuances i WHERE owner_id=$1 ORDER BY fingerprint;",
        [q.ownerId],
      )
    ).rows;
  }
  async function bindingRows(q: Fixture) {
    return (
      await database().query(
        "SELECT b.*,xmin::text AS xmin,ctid::text AS ctid FROM bfa_p5_voice_v2.issuance_auth_bindings b WHERE owner_id=$1 ORDER BY fingerprint;",
        [q.ownerId],
      )
    ).rows;
  }
  async function legacy(q: Fixture, status: "active" | "expired" | "revoked" = "revoked") {
    await database().query(
      "INSERT INTO bfa_p5_voice.session_fences(owner_id,session_id,version,expires_ms,revoked) VALUES($1,$2,0,$3,$4);",
      [
        q.ownerId,
        q.authSessionId,
        status === "expired" ? q.now - 1 : q.authExpiresAt,
        status === "revoked",
      ],
    );
  }
  async function revoke(q: Fixture) {
    return transport().parents.revokeParent(pair(q));
  }
  function writeCalls(t: ReturnType<typeof issuer>) {
    return t.calls.filter((call) =>
      /observe_parent|register_generation|register_issuance/.test(call.name),
    );
  }
  async function noRetry(t: ReturnType<typeof issuer>) {
    const calls = t.calls.length;
    const evidence = t.instance.snapshot();
    expect(await t.issue()).toBeNull();
    expect(t.calls).toHaveLength(calls);
    expect(t.instance.snapshot()).toEqual(evidence);
  }

  it("issues a newly sealed owned snapshot with exact v2 association while legacy writes cannot execute", async () => {
    const q = await fixture();
    await seedHolds(q);
    const before = await snapshot(),
      t = issuer(q);
    const authority = q.service.exportAuthority(q.threadId);
    const result = await t.issue();
    expect(result).toMatchObject({
      protocol: 2,
      ...pair(q),
      parentVersion: 0,
      threadId: q.threadId,
      threadRevision: 0,
      issuedAt: q.now,
      expiresAt: q.now + 60000,
    });
    expect(await tokenFingerprint(result!.activeAuthority)).toBe(result!.authorityFingerprint);
    expect(await unseal(result!.activeAuthority, q.ownerId, q.threadId, 0)).toEqual({
      owner: q.ownerId,
      thread: q.threadId,
      revision: 0,
      expires: q.now + 60000,
      authority,
    });
    expect(await issuanceRows(q)).toEqual([
      expect.objectContaining({
        fingerprint: result!.authorityFingerprint,
        owner_id: q.ownerId,
        thread_id: q.threadId,
        incarnation: result!.threadIncarnation,
        revision: 0,
        issued_ms: q.now,
        expires_ms: q.now + 60000,
        revoked: false,
      }),
    ]);
    expect(await bindingRows(q)).toEqual([
      expect.objectContaining({
        fingerprint: result!.authorityFingerprint,
        protocol: 2,
        owner_id: q.ownerId,
        auth_session_id: q.authSessionId,
        parent_version: 0,
      }),
    ]);
    expect((await generationRow(q)).source_text).toBe(SOURCE);
    expect((await parentRow(q)).revoked).toBe(false);
    const receipt = t.instance.snapshot();
    expect(receipt).toMatchObject({
      state: "issued",
      expectedParentVersion: 0,
      parentWriteAttempted: true,
      generationWriteAttempted: true,
      issuanceWriteAttempted: true,
    });
    expect(receipt.issuanceRequest).toMatchObject({
      authorityFingerprint: result!.authorityFingerprint,
    });
    expect(receipt.issuanceAcknowledgment).toMatchObject({
      authorityFingerprint: result!.authorityFingerprint,
    });
    expect(Object.isFrozen(receipt)).toBe(true);
    for (const value of [
      receipt.parentRequest,
      receipt.parentAcknowledgment,
      receipt.generationRequest,
      receipt.generationAcknowledgment,
      receipt.issuanceRequest,
      receipt.issuanceAcknowledgment,
    ])
      expect(Object.isFrozen(value)).toBe(true);
    expect(JSON.stringify(receipt)).not.toContain(result!.activeAuthority);
    expect(JSON.stringify(receipt)).not.toContain("fictional private source");
    expect(JSON.stringify(receipt)).not.toContain('"authority":');
    expect(writeCalls(t).map((c) => c.name)).toEqual([
      "bfa_p5_v2_observe_parent",
      "bfa_p5_v2_register_generation",
      "bfa_p5_v2_register_issuance",
    ]);
    const privileges = await one(
      "SELECT has_function_privilege('service_role','public.bfa_p5_voice_register_generation(uuid,uuid)','EXECUTE') AS generation,has_function_privilege('service_role','public.bfa_p5_voice_register_issuance(uuid,uuid,uuid,bigint,text,bigint,bigint)','EXECUTE') AS issuance;",
    );
    expect(privileges).toEqual({ generation: false, issuance: false });
    await unchangedExcept(before, changedTables, q.ownerId);
    await noRetry(t);
  });

  it("reuses the permanent generation and clear parent for a later bounded authority while retaining the expired first issuance", async () => {
    const q = await fixture(true);
    await seedHolds(q);
    const generation = await register(q),
      genRow = await generationRow(q),
      parent = await parentRow(q);
    const first = await issuer(q, 1000).issue();
    expect(first!.threadIncarnation).toBe(generation!.threadIncarnation);
    const originalIssuances = await issuanceRows(q),
      originalBindings = await bindingRows(q);
    const before = await snapshot();
    await advance(q, 1001);
    const second = await issuer(q, 60000).issue();
    expect(second!.authorityFingerprint).not.toBe(first!.authorityFingerprint);
    expect(second!.activeAuthority).not.toBe(first!.activeAuthority);
    expect(second!.threadIncarnation).toBe(first!.threadIncarnation);
    expect(second!.parentVersion).toBe(first!.parentVersion);
    expect(second!.expiresAt).toBe(q.now + 60000);
    expect(await generationRow(q)).toEqual(genRow);
    expect(await parentRow(q)).toEqual(parent);
    expect(await issuanceRows(q)).toEqual(expect.arrayContaining(originalIssuances));
    expect(await bindingRows(q)).toEqual(expect.arrayContaining(originalBindings));
    expect(await issuanceRows(q)).toHaveLength(2);
    expect(
      await transport().parents.readIssuance({
        ...pair(q),
        parentVersion: 0,
        authorityFingerprint: first!.authorityFingerprint,
      }),
    ).toBeNull();
    expect(
      await transport().parents.readIssuance({
        ...pair(q),
        parentVersion: 0,
        authorityFingerprint: second!.authorityFingerprint,
      }),
    ).not.toBeNull();
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

  it.each(["active", "expired", "revoked"] as const)(
    "denies a retained %s v1 row before any positive v2 write",
    async (status) => {
      const q = await fixture();
      await seedHolds(q);
      await legacy(q, status);
      const before = await snapshot(),
        t = issuer(q);
      expect(await t.issue()).toBeNull();
      expect(await parentRow(q)).toBeUndefined();
      expect(await generationRow(q)).toBeUndefined();
      expect(await issuanceRows(q)).toEqual([]);
      expect(await bindingRows(q)).toEqual([]);
      await unchangedExcept(before, ["bfa_p5_voice.owner_clocks"], q.ownerId);
      await noRetry(t);
    },
  );

  it("does not reset a terminal parent or issue under its changed version", async () => {
    const q = await fixture(true);
    await seedHolds(q);
    await revoke(q);
    const before = await snapshot(),
      parent = await parentRow(q),
      t = issuer(q);
    expect(await t.issue()).toBeNull();
    expect(await parentRow(q)).toEqual(parent);
    expect(await generationRow(q)).toBeUndefined();
    expect(writeCalls(t)).toEqual([]);
    await unchangedExcept(before);
    await noRetry(t);
  });

  it.each(["cancel", "delete"] as const)(
    "denies an already %s-fenced thread without changing retained accounting",
    async (action) => {
      const q = await fixture(true);
      await seedHolds(q);
      await fence(q, action);
      const before = await snapshot(),
        t = issuer(q);
      expect(await t.issue()).toBeNull();
      expect(await generationRow(q)).toBeUndefined();
      expect(await issuanceRows(q)).toEqual([]);
      await unchangedExcept(before, ["bfa_p5_voice.owner_clocks"], q.ownerId);
      await noRetry(t);
    },
  );

  const changes = [
    "Auth session",
    "parent revoke",
    "legacy fence",
    "thread Stop",
    "thread Delete",
    "service cancellation",
  ] as const;
  for (const stage of ["generation", "issuance"] as const) {
    it.each(changes)(
      `withholds the token when %s changes after committed ${stage}`,
      async (change) => {
        const q = await fixture(true);
        await seedHolds(q);
        const before = await snapshot(),
          t = issuer(q);
        let changed = false;
        const target = `bfa_p5_v2_register_${stage}`;
        t.hooks.afterCommit = async (name, _args, data) => {
          if (name === target) {
            changed = true;
            if (change === "Auth session") t.state.auth.sessionId = randomUUID();
            if (change === "parent revoke") await revoke(q);
            if (change === "legacy fence") await legacy(q);
            if (change === "thread Stop") await fence(q, "cancel");
            if (change === "thread Delete") await fence(q, "delete");
            if (change === "service cancellation")
              q.service.cancelThread(q.threadId, "offline issuer fixture");
          }
          return data;
        };
        expect(await t.issue()).toBeNull();
        expect(changed).toBe(true);
        const receipt = t.instance.snapshot();
        expect(receipt.generationAcknowledgment).not.toBeNull();
        expect(await generationRow(q)).toBeDefined();
        expect(await issuanceRows(q)).toHaveLength(stage === "issuance" ? 1 : 0);
        expect(await bindingRows(q)).toHaveLength(stage === "issuance" ? 1 : 0);
        if (stage === "issuance") expect(receipt.issuanceAcknowledgment).not.toBeNull();
        else expect(receipt.issuanceWriteAttempted).toBe(false);
        const allowed = [...changedTables];
        if (change === "legacy fence") allowed.push("bfa_p5_voice.session_fences");
        if (change === "thread Stop" || change === "thread Delete")
          allowed.push("public.bfa_p3b_threads");
        await unchangedExcept(before, allowed, q.ownerId);
        await noRetry(t);
      },
    );
  }

  for (const stage of ["parent", "generation", "issuance"] as const) {
    it.each(["lost", "malformed"] as const)(
      `retains committed ${stage} evidence after a %s reply and never retries`,
      async (fault) => {
        const q = await fixture();
        await seedHolds(q);
        const before = await snapshot(),
          t = issuer(q);
        const target =
          stage === "parent" ? "bfa_p5_v2_observe_parent" : `bfa_p5_v2_register_${stage}`;
        let committed: unknown = null;
        t.hooks.afterCommit = async (name, _args, data) => {
          if (name === target) {
            committed = data;
            if (fault === "lost") throw new Error("fictional response lost after commit");
            return { ...(data as object), unexpected: "private malformed reply must not survive" };
          }
          return data;
        };
        expect(await t.issue()).toBeNull();
        expect(committed).not.toBeNull();
        const receipt = t.instance.snapshot();
        expect(receipt.state).toBe("unconfirmed");
        expect(receipt[`${stage}WriteAttempted`]).toBe(true);
        expect(receipt[`${stage}Request`]).not.toBeNull();
        expect(receipt[`${stage}Acknowledgment`]).toBeNull();
        expect(JSON.stringify(receipt)).not.toContain("private malformed");
        expect(await parentRow(q)).toBeDefined();
        if (stage === "parent") expect(await generationRow(q)).toBeUndefined();
        else expect(await generationRow(q)).toBeDefined();
        expect(await issuanceRows(q)).toHaveLength(stage === "issuance" ? 1 : 0);
        expect(await bindingRows(q)).toHaveLength(stage === "issuance" ? 1 : 0);
        expect(t.calls.filter((c) => c.name === target && c.committed)).toHaveLength(1);
        const retained = await snapshot();
        await noRetry(t);
        expect(await snapshot()).toEqual(retained);
        await unchangedExcept(before, changedTables, q.ownerId);
      },
    );

    it(`synchronous cancellation while the ${stage} write is in flight retains its late acknowledgment`, async () => {
      const q = await fixture();
      await seedHolds(q);
      const before = await snapshot(),
        t = issuer(q);
      const target =
        stage === "parent" ? "bfa_p5_v2_observe_parent" : `bfa_p5_v2_register_${stage}`;
      let cancelled = false;
      t.hooks.afterCommit = async (name, _args, data) => {
        if (name === target) {
          t.instance.cancel();
          cancelled = true;
          expect(t.instance.snapshot().state).toBe("cancelled");
        }
        return data;
      };
      expect(await t.issue()).toBeNull();
      expect(cancelled).toBe(true);
      const receipt = t.instance.snapshot();
      expect(receipt.state).toBe("cancelled");
      expect(receipt[`${stage}WriteAttempted`]).toBe(true);
      expect(receipt[`${stage}Request`]).not.toBeNull();
      expect(receipt[`${stage}Acknowledgment`]).not.toBeNull();
      expect(await issuanceRows(q)).toHaveLength(stage === "issuance" ? 1 : 0);
      await unchangedExcept(before, changedTables, q.ownerId);
      await noRetry(t);
    });
  }

  it("retains an initial shorter Auth ceiling when later verification returns a longer expiry", async () => {
    const q = await fixture();
    await seedHolds(q);
    const t = issuer(q);
    t.state.auth.expiresAt = q.now + 20000;
    t.hooks.afterCommit = async (name, _args, data) => {
      if (name === "bfa_p5_v2_observe_parent") t.state.auth.expiresAt = q.now + 600000;
      return data;
    };
    const result = await t.issue();
    expect(result!.expiresAt).toBe(q.now + 20000);
    expect(t.instance.snapshot().issuanceRequest!.expiresAt).toBe(q.now + 20000);
  });

  it("withholds an already committed issuance when final Auth becomes shorter than its immutable ceiling", async () => {
    const q = await fixture();
    await seedHolds(q);
    const before = await snapshot(),
      t = issuer(q);
    t.hooks.afterCommit = async (name, _args, data) => {
      if (name === "bfa_p5_v2_register_issuance") t.state.auth.expiresAt = q.now + 10000;
      return data;
    };
    expect(await t.issue()).toBeNull();
    expect(t.instance.snapshot().issuanceAcknowledgment!.expiresAt).toBe(q.now + 60000);
    expect((await issuanceRows(q))[0]!.expires_ms).toBe(q.now + 60000);
    await unchangedExcept(before, changedTables, q.ownerId);
    await noRetry(t);
  });

  it.each([30000, 60000])(
    "withholds an exact committed receipt arriving %i ms after the original verification",
    async (delay) => {
      const q = await fixture();
      await seedHolds(q);
      const before = await snapshot(),
        started = q.now,
        t = issuer(q);
      t.hooks.afterCommit = async (name, _args, data) => {
        if (name === "bfa_p5_v2_register_issuance") await advance(q, delay);
        return data;
      };
      expect(await t.issue()).toBeNull();
      expect(t.instance.snapshot().issuanceAcknowledgment).toMatchObject({
        issuedAt: started,
        expiresAt: started + 60000,
      });
      expect(await issuanceRows(q)).toHaveLength(1);
      expect(await bindingRows(q)).toHaveLength(1);
      await unchangedExcept(before, changedTables, q.ownerId);
      await noRetry(t);
    },
  );

  it("rejects clock rollback after commit while preserving the owner's SQL high water and retained holds", async () => {
    const q = await fixture();
    await seedHolds(q);
    const before = await snapshot(),
      started = q.now,
      t = issuer(q);
    t.hooks.afterCommit = async (name, _args, data) => {
      if (name === "bfa_p5_v2_register_issuance") await advance(q, -1);
      return data;
    };
    expect(await t.issue()).toBeNull();
    expect(t.instance.snapshot().issuanceAcknowledgment).not.toBeNull();
    const clock = await one(
      "SELECT observed_ms FROM bfa_p5_voice.owner_clocks WHERE owner_id=$1;",
      [q.ownerId],
    );
    expect(clock.observed_ms).toBe(started);
    expect(await issuanceRows(q)).toHaveLength(1);
    await unchangedExcept(before, changedTables, q.ownerId);
    await noRetry(t);
  });

  it.each(["missing", "malformed"] as const)(
    "withholds a registered token on a %s final exact issuance read",
    async (fault) => {
      const q = await fixture();
      await seedHolds(q);
      const before = await snapshot(),
        t = issuer(q);
      let affected = false;
      t.hooks.afterCommit = async (name, _args, data) => {
        if (name === "bfa_p5_v2_read_issuance") {
          affected = true;
          return fault === "missing"
            ? null
            : { ...(data as object), authorityFingerprint: fingerprint() };
        }
        return data;
      };
      expect(await t.issue()).toBeNull();
      expect(affected).toBe(true);
      expect(t.instance.snapshot().issuanceAcknowledgment).not.toBeNull();
      expect(await issuanceRows(q)).toHaveLength(1);
      expect(await bindingRows(q)).toHaveLength(1);
      await unchangedExcept(before, changedTables, q.ownerId);
      await noRetry(t);
    },
  );
});
