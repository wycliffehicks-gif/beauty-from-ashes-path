// Disposable catalog privilege candidate plus actual existing v2 lifecycle.
// Candidate grants/revokes below are fixture-only and are never a migration.
// Auth/policy/approval and timing/response faults are fictional local fixtures.
// No deployed Auth, HTTP, provider/device, native scheduling or runtime wiring.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile, readdir, realpath } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  P5_V2_CUTOVER_FUNCTIONS,
  P5_V2_CUTOVER_CATALOG_SQL,
  evaluateP5V2CutoverCatalog,
} from "../../../../../scripts/conversation-eval/p5-sql/cutover-inventory";
import { ConversationService } from "../service/service";
import { fingerprint as tokenFingerprint } from "../staging/seal.server";
import {
  createVoiceV2AuthorityIssuer,
  type VoiceV2AuthorityIssuanceResult,
} from "../service/voice-v2-issuance.server";
import { createVoiceV2CapacityAdmission } from "../service/voice-v2-admission.server";
import { createVoiceV2MarkRpcPorts } from "../service/voice-v2-mark-rpc.server";
import { createVoiceV2CleanupRpcPorts } from "../service/voice-v2-cleanup-rpc.server";
import { createVoiceV2ProofRpcPorts } from "../service/voice-v2-proof-rpc.server";
import { createVoiceV2CapacityRpcPorts } from "../service/voice-v2-capacity-rpc.server";
import { createVoiceRpcStore } from "../service/voice-rpc-store.server";
import { createVoiceV2CurrentRpcPorts } from "../service/voice-v2-current-rpc.server";
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
const SOURCE = "2001-02-03T04:05:06.123456Z";
const digest = () => createHash("sha256").update(randomUUID()).digest("hex");
const names = [
  "bfa_p5_v2_read_current",
  "bfa_p5_v2_read_current_thread",
  "bfa_p5_v2_read_issuance",
  "bfa_p5_v2_register_cleanup",
  "bfa_p5_v2_read_cleanup",
  "bfa_p5_v2_register_proof",
  "bfa_p5_v2_capacity_claim",
  "bfa_p5_v2_capacity_mark",
  "bfa_p5_v2_voice_inspect",
  "bfa_p5_capacity_close",
  "bfa_p5_v2_read_parent",
  "bfa_p5_v2_observe_parent",
  "bfa_p5_v2_revoke_parent",
  "bfa_p5_v2_register_issuance",
  "bfa_p5_v2_register_generation",
];
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

sqlSuite("P5 exact no-fallback cutover preflight in isolated PostgreSQL", () => {
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
    vi.stubEnv("BFA_P3B_STATE_SECRET", `offline-v2-cutover-${randomUUID()}`);
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
      "v2-preissue",
    ])
      await install(`docs/pilot/conversation/sql-drafts/p5-voice-${name}.sql`);
    await install("docs/pilot/conversation/sql-drafts/p5-voice-v2-cleanup.sql");
    await install("docs/pilot/conversation/sql-drafts/p5-voice-v2-proof.sql");
    await install("docs/pilot/conversation/sql-drafts/p5-voice-v2-capacity.sql");
    await install("docs/pilot/conversation/sql-drafts/p5-voice-v2-mark.sql");
    await install("docs/pilot/conversation/sql-drafts/p5-voice-v2-current.sql");
    realClockDefinition = (
      await one("SELECT pg_get_functiondef('bfa_p5_voice.ms()'::regprocedure) AS definition;")
    ).definition as string;
  }, 60000);
  afterEach(async () => {
    vi.restoreAllMocks();
    if (db && !db.closed && realClockDefinition) {
      await db.exec(realClockDefinition);
      expect(
        (await one("SELECT pg_get_functiondef('bfa_p5_voice.ms()'::regprocedure) AS definition;"))
          .definition,
      ).toBe(realClockDefinition);
    }
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    for (const instance of [seed, db]) {
      if (instance && !instance.closed) await instance.close();
      if (instance) expect(instance.closed).toBe(true);
    }
  });
  // Serialize complete transactions on this one local connection. Concurrent
  // JavaScript callers are tested; native PostgreSQL scheduling is not.
  let sqlTurn: Promise<void> = Promise.resolve();
  async function asRole(role: Role, sql: string, args: unknown[] = []) {
    const previous = sqlTurn;
    let release!: () => void;
    sqlTurn = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
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
    } finally {
      release();
    }
  }
  async function raw(name: string, args: Args, role: Role = "service_role") {
    expect(names).toContain(name);
    const types: Record<string, string> = {
      p_request: "jsonb",
      p_proof: "jsonb",
      p_cleanup_id: "uuid",
      p_claim: "jsonb",
      p_owner_id: "uuid",
      p_auth_session_id: "uuid",
      p_parent_version: "bigint",
      p_fingerprint: "text",
      p_verified_ms: "bigint",
      p_auth_expires_ms: "bigint",
      p_thread_id: "uuid",
      p_revision: "bigint",
      p_incarnation: "uuid",
      p_issued_ms: "bigint",
      p_expires_ms: "bigint",
      p_source_created_at: "text",
    };
    const entries = Object.entries(args);
    for (const [key] of entries) expect(Object.hasOwn(types, key)).toBe(true);
    const named = entries.map(([key], i) => `${key}=>$${i + 1}::${types[key]}`).join(",");
    return (
      await asRole(
        role,
        `SELECT public.${name}(${named}) AS value;`,
        entries.map(([key, value]) =>
          ["p_claim", "p_proof", "p_request"].includes(key) ? JSON.stringify(value) : value,
        ),
      )
    ).value;
  }
  function transport() {
    const calls: { name: string; args: Args; committed: boolean }[] = [];
    const hooks: {
      before?: (name: string, args: Args) => Promise<void>;
      afterCommit?: (name: string, data: unknown, args: Args) => Promise<unknown>;
    } = {};
    const client = {
      async rpc(name: string, args: Args) {
        const call = { name, args, committed: false };
        calls.push(call);
        await hooks.before?.(name, args);
        const data = await raw(name, args);
        call.committed = true;
        return {
          data: hooks.afterCommit ? await hooks.afterCommit(name, data, args) : data,
          error: null,
          status: 200,
        };
      },
    };
    return {
      calls,
      hooks,
      current: createVoiceV2CurrentRpcPorts(client),
      cleanup: createVoiceV2CleanupRpcPorts(client),
      proofs: createVoiceV2ProofRpcPorts(client),
      capacity: createVoiceV2CapacityRpcPorts(client),
      marker: createVoiceV2MarkRpcPorts(client),
      close: createVoiceRpcStore(client).close,
      parents: createVoiceV2ParentIssuanceRpcPorts(client),
      preissue: createVoiceV2PreissueRpcPorts(client),
    };
  }
  async function setClock(value: number) {
    expect(Number.isInteger(value)).toBe(true);
    await database().exec(
      `CREATE OR REPLACE FUNCTION bfa_p5_voice.ms() RETURNS bigint LANGUAGE sql VOLATILE SET search_path=pg_catalog,pg_temp AS $$ SELECT ${value}::bigint $$;`,
    );
  }
  async function fixture(at = Date.now()) {
    const clock = { now: at },
      ownerId = randomUUID(),
      authSessionId = randomUUID(),
      threadId = randomUUID(),
      policyId = randomUUID(),
      poolId = randomUUID();
    vi.spyOn(Date, "now").mockImplementation(() => clock.now);
    await setClock(at);
    await database().query(
      "INSERT INTO public.bfa_p3b_staging_accounts(user_id,admitted,expires_at) VALUES($1,true,to_timestamp($2/1000.0));",
      [ownerId, at + 7200000],
    );
    await database().query(
      "INSERT INTO public.bfa_p3b_threads(id,owner_id,created_at,saved_snapshot,saved_at) VALUES($1,$2,$3::timestamptz,to_jsonb('fictional saved writing never implicitly read'::text),clock_timestamp());",
      [threadId, ownerId, SOURCE],
    );
    await database().query("INSERT INTO bfa_p5_voice.quotas VALUES($1,$2,30,3,true);", [
      ownerId,
      policyId,
    ]);
    await database().query(
      "INSERT INTO bfa_p5_capacity.pools(pool_id,active_limit,unit_limit,reservation_units,enabled) VALUES($1,5,30,3,true);",
      [poolId],
    );
    await database().query("INSERT INTO bfa_p5_capacity.routes VALUES($1,$2,$3);", [
      ownerId,
      policyId,
      poolId,
    ]);
    const service = new ConversationService({ verifiedOwnerId: ownerId });
    service.ensureThread(threadId, false);
    return {
      now: at,
      clock,
      ownerId,
      authSessionId,
      threadId,
      policyId,
      poolId,
      service,
      identity: { ownerId, sessionId: authSessionId, expiresAt: at + 1800000 },
    };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  function issuer(f: Fixture, t = transport()) {
    const authenticate = vi.fn(async () => structuredClone(f.identity));
    const instance = createVoiceV2AuthorityIssuer({
      maxAuthorityAgeMs: 60000,
      now: () => f.clock.now,
      authenticate,
      readParent: t.parents.readParent,
      observeParent: t.parents.observeParent,
      readCurrentThread: t.preissue.readCurrentThread,
      registerGeneration: t.preissue.registerGeneration,
      registerIssuance: t.parents.registerIssuance,
      readIssuance: t.parents.readIssuance,
    });
    const input = {
      service: f.service,
      threadId: f.threadId,
      threadRevision: 0,
      sourceCreatedAt: SOURCE,
    };
    return { t, authenticate, instance, input };
  }
  async function issue(f: Fixture) {
    const i = issuer(f),
      result = await i.instance.issue(i.input);
    expect(result).not.toBeNull();
    expect(i.instance.snapshot().state).toBe("issued");
    return { i, result: result! };
  }
  async function approve(f: Fixture, a: VoiceV2AuthorityIssuanceResult) {
    const attemptId = randomUUID(),
      approvalId = randomUUID(),
      approvalDigest = digest();
    await database().query(
      "INSERT INTO bfa_p5_voice.approvals VALUES($1,$2,$3,$4,$5,$6,$7,'developer-voice-session',$8,false,$9);",
      [
        approvalId,
        approvalDigest,
        f.ownerId,
        f.threadId,
        a.threadIncarnation,
        a.threadRevision,
        attemptId,
        a.expiresAt,
        f.policyId,
      ],
    );
    return { attemptId, approvalId, approvalDigest };
  }
  type Approval = Awaited<ReturnType<typeof approve>>;
  function admission(
    f: Fixture,
    a: VoiceV2AuthorityIssuanceResult,
    approval: Approval,
    t = transport(),
  ) {
    const authenticate = vi.fn(async () => structuredClone(f.identity));
    const api = createVoiceV2CapacityAdmission({
      maxProofAgeMs: 10000,
      expectedPoolVersion: 1,
      now: () => f.clock.now,
      authenticate,
      readParent: t.parents.readParent,
      readCurrent: t.current.readCurrent,
      registerCleanup: t.cleanup.registerCleanup,
      registerProof: t.proofs.registerProof,
      claim: t.capacity.claim,
      inspect: t.capacity.inspect,
      close: t.close,
      mark: t.marker.mark,
    });
    // Exact released ciphertext, never resealed or manually registered here.
    const request = {
      threadId: a.threadId,
      threadIncarnation: a.threadIncarnation,
      threadRevision: a.threadRevision,
      attemptId: approval.attemptId,
      activeAuthority: a.activeAuthority,
    };
    return { f, a, approval, t, authenticate, api, request };
  }
  type Admission = ReturnType<typeof admission>;
  async function ready(f: Fixture) {
    const issued = await issue(f),
      approval = await approve(f, issued.result),
      h = admission(f, issued.result, approval);
    expect(await h.api.admit(h.request)).toBe(true);
    return { issued, h };
  }
  const owned = (h: Admission) => {
    const value = h.api.snapshot().ownership;
    expect(value).not.toBeNull();
    return value!;
  };
  async function accounting(f: Fixture) {
    return {
      quota: await one(
        "SELECT remaining_units FROM bfa_p5_voice.quotas WHERE owner_id=$1 AND policy_id=$2;",
        [f.ownerId, f.policyId],
      ),
      pool: await one("SELECT occupied,held_units FROM bfa_p5_capacity.pools WHERE pool_id=$1;", [
        f.poolId,
      ]),
    };
  }
  async function retained(h: Admission) {
    const o = owned(h);
    return {
      issuance: await one("SELECT * FROM bfa_p5_voice.issuances WHERE fingerprint=$1;", [
        h.a.authorityFingerprint,
      ]),
      binding: await one(
        "SELECT * FROM bfa_p5_voice_v2.issuance_auth_bindings WHERE fingerprint=$1;",
        [h.a.authorityFingerprint],
      ),
      cleanup: await one("SELECT * FROM bfa_p5_voice.cleanup_owners WHERE cleanup_id=$1;", [
        o.cleanupId,
      ]),
      claim: await one("SELECT * FROM bfa_p5_voice.claims WHERE claim_id=$1;", [o.claim.claimId]),
      proofs: (
        await database().query(
          "SELECT * FROM bfa_p5_voice.proofs WHERE claim_id=$1 ORDER BY receipt_id;",
          [o.claim.claimId],
        )
      ).rows,
      allocation: await one("SELECT * FROM bfa_p5_capacity.allocations WHERE claim_id=$1;", [
        o.claim.claimId,
      ]),
    };
  }
  async function advance(f: Fixture, time: number) {
    f.clock.now = time;
    await setClock(time);
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
  async function preserveBaseline(before: Awaited<ReturnType<typeof snapshot>>, f: Fixture) {
    const after = await snapshot();
    for (const table of tables)
      for (const row of before[table]!) {
        if (table === "bfa_p5_voice.owner_clocks" && row.owner_id === f.ownerId) continue;
        if (
          table === "bfa_p5_voice.quotas" &&
          row.owner_id === f.ownerId &&
          row.policy_id === f.policyId
        )
          continue;
        if (table === "bfa_p5_capacity.pools" && row.pool_id === f.poolId) continue;
        expect(after[table], table).toContainEqual(row);
      }
  }
  function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((yes) => {
      resolve = yes;
    });
    return { promise, resolve };
  }
  async function closeMarked(h: Admission) {
    expect(await h.api.close()).toBe(true);
    const records = await retained(h);
    expect(records.claim.state).toBe("closed");
    expect(records.allocation).toMatchObject({
      closed: true,
      slot_held: true,
      operation_id: h.api.markerSnapshot()!.operationId,
      units: 3,
    });
  }

  const signature = (entry: (typeof P5_V2_CUTOVER_FUNCTIONS)[number]) =>
    `${entry.schema}.${entry.name}(${entry.arguments})`;
  const functions = P5_V2_CUTOVER_FUNCTIONS;
  const legacyEnablers = functions.filter((entry) => entry.category === "legacy-enable");
  const candidateRoles = ["PUBLIC", "anon", "authenticated", "service_role"] as const;
  async function report() {
    const row = await one(P5_V2_CUTOVER_CATALOG_SQL);
    return evaluateP5V2CutoverCatalog(row.catalog, { trustedOwnerRole: "postgres" });
  }
  async function candidate() {
    // Explicit disposable fixture mutation only. There is no emitted migration,
    // connected client, automatic cutover or changed application route.
    for (const entry of functions) {
      await database().exec(
        `REVOKE ALL ON FUNCTION ${signature(entry)} FROM PUBLIC,anon,authenticated,service_role;`,
      );
      if (entry.serviceExecute)
        await database().exec(`GRANT EXECUTE ON FUNCTION ${signature(entry)} TO service_role;`);
    }
    for (const schema of ["bfa_p5_voice", "bfa_p5_capacity", "bfa_p5_voice_v2"])
      await database().exec(
        `REVOKE ALL ON SCHEMA ${schema} FROM PUBLIC,anon,authenticated,service_role;`,
      );
    await database().exec(
      "REVOKE CREATE ON SCHEMA public FROM PUBLIC,anon,authenticated,service_role;",
    );
    await database().exec(
      "GRANT USAGE ON SCHEMA public TO PUBLIC,anon,authenticated,service_role;",
    );
  }
  async function failed() {
    const value = await report();
    expect(value.catalogStatus).toBe("fail");
    expect(value.deployable).toBe(false);
    expect(value.issues.length).toBeGreaterThan(0);
    return value;
  }
  async function passed() {
    const value = await report();
    expect(value).toMatchObject({ catalogStatus: "pass", deployable: false, issues: [] });
    expect(value.limitations.length).toBeGreaterThan(0);
    return value;
  }
  async function mutateAndReject(up: string, down: string) {
    try {
      await database().exec(up);
      await failed();
    } finally {
      await database().exec(down);
    }
    await passed();
  }
  async function deny(role: Role, entry: (typeof P5_V2_CUTOVER_FUNCTIONS)[number]) {
    const args = entry.arguments
      ? entry.arguments
          .split(",")
          .map((type) => `NULL::${type}`)
          .join(",")
      : "";
    await expect(
      asRole(role, `SELECT ${entry.schema}.${entry.name}(${args}) AS value;`),
    ).rejects.toMatchObject({ code: "42501" });
  }

  it("fails unchanged source privileges without changing catalog, lifecycle or accounting", async () => {
    const before = await snapshot();
    const catalogBefore = (await one(P5_V2_CUTOVER_CATALOG_SQL)).catalog;
    const result = await failed();
    expect(legacyEnablers).toHaveLength(9);
    expect(functions.filter((entry) => entry.category === "legacy-terminal")).toHaveLength(4);
    expect(functions.filter((entry) => entry.category === "legacy-read")).toHaveLength(3);
    expect(functions.filter((entry) => entry.category === "trusted-policy-admin")).toHaveLength(1);
    expect(functions.filter((entry) => entry.category === "v2")).toHaveLength(14);
    expect(result.issues.length).toBeGreaterThanOrEqual(9);
    expect((await one(P5_V2_CUTOVER_CATALOG_SQL)).catalog).toEqual(catalogBefore);
    expect(await snapshot()).toEqual(before);
  });

  describe("explicit disposable candidate", () => {
    beforeEach(candidate);

    it("passes exact role inventory while remaining nondeployable and read-only", async () => {
      const before = await snapshot();
      const catalogBefore = (await one(P5_V2_CUTOVER_CATALOG_SQL)).catalog;
      await passed();
      expect((await one(P5_V2_CUTOVER_CATALOG_SQL)).catalog).toEqual(catalogBefore);
      expect(await snapshot()).toEqual(before);
      for (const entry of functions.filter((item) => item.schema === "public")) {
        for (const role of ["anon", "authenticated"] as const) await deny(role, entry);
        if (!entry.serviceExecute) await deny("service_role", entry);
      }
      for (const entry of functions.filter((item) => item.category === "private-helper"))
        for (const role of ["anon", "authenticated", "service_role"] as const)
          await deny(role, entry);
      expect(await snapshot()).toEqual(before);
    });

    it.each(["PUBLIC", "anon", "authenticated"] as const)(
      "rejects an extra %s execute grant",
      async (role) => {
        await mutateAndReject(
          `GRANT EXECUTE ON FUNCTION public.bfa_p5_v2_read_current(jsonb) TO ${role};`,
          `REVOKE EXECUTE ON FUNCTION public.bfa_p5_v2_read_current(jsonb) FROM ${role};`,
        );
      },
    );

    it.each([
      ["legacy enable", "public.bfa_p5_voice_register_proof(jsonb)", "GRANT", "REVOKE"],
      ["v2 current", "public.bfa_p5_v2_read_current(jsonb)", "REVOKE", "GRANT"],
      ["legacy cleanup", "public.bfa_p5_capacity_close(uuid,jsonb)", "REVOKE", "GRANT"],
      ["legacy reader", "public.bfa_p5_voice_read_session_fence(uuid,uuid)", "REVOKE", "GRANT"],
      [
        "separate policy admin",
        "public.bfa_p5_capacity_policy(uuid,bigint,bigint,bigint,boolean)",
        "REVOKE",
        "GRANT",
      ],
    ])("rejects wrong service execution for %s", async (_label, sig, up, down) => {
      const change = (verb: string) =>
        `${verb} EXECUTE ON FUNCTION ${sig} ${verb === "GRANT" ? "TO" : "FROM"} service_role;`;
      await mutateAndReject(change(up), change(down));
    });

    it.each(candidateRoles)("rejects %s exposure of a private helper", async (role) => {
      await mutateAndReject(
        `GRANT EXECUTE ON FUNCTION bfa_p5_voice.ms() TO ${role};`,
        `REVOKE EXECUTE ON FUNCTION bfa_p5_voice.ms() FROM ${role};`,
      );
    });

    it.each([
      [
        "public CREATE",
        "GRANT CREATE ON SCHEMA public TO authenticated;",
        "REVOKE CREATE ON SCHEMA public FROM authenticated;",
      ],
      [
        "private USAGE",
        "GRANT USAGE ON SCHEMA bfa_p5_voice_v2 TO service_role;",
        "REVOKE USAGE ON SCHEMA bfa_p5_voice_v2 FROM service_role;",
      ],
      [
        "private PUBLIC CREATE",
        "GRANT CREATE ON SCHEMA bfa_p5_capacity TO PUBLIC;",
        "REVOKE CREATE ON SCHEMA bfa_p5_capacity FROM PUBLIC;",
      ],
      [
        "SECURITY INVOKER",
        "ALTER FUNCTION public.bfa_p5_v2_read_current(jsonb) SECURITY INVOKER;",
        "ALTER FUNCTION public.bfa_p5_v2_read_current(jsonb) SECURITY DEFINER;",
      ],
      [
        "missing search_path",
        "ALTER FUNCTION public.bfa_p5_v2_read_current(jsonb) RESET search_path;",
        "ALTER FUNCTION public.bfa_p5_v2_read_current(jsonb) SET search_path=pg_catalog,pg_temp;",
      ],
      [
        "unsafe search_path",
        "ALTER FUNCTION public.bfa_p5_v2_read_current(jsonb) SET search_path=public,pg_catalog;",
        "ALTER FUNCTION public.bfa_p5_v2_read_current(jsonb) SET search_path=pg_catalog,pg_temp;",
      ],
      [
        "extra function configuration",
        "ALTER FUNCTION public.bfa_p5_v2_read_current(jsonb) SET statement_timeout='10s';",
        "ALTER FUNCTION public.bfa_p5_v2_read_current(jsonb) RESET statement_timeout;",
      ],
      [
        "service superuser",
        "ALTER ROLE service_role SUPERUSER;",
        "ALTER ROLE service_role NOSUPERUSER;",
      ],
      [
        "service role management",
        "ALTER ROLE service_role CREATEROLE;",
        "ALTER ROLE service_role NOCREATEROLE;",
      ],
      ["owner membership", "GRANT postgres TO service_role;", "REVOKE postgres FROM service_role;"],
    ])("rejects %s drift", async (_label, up, down) => {
      await mutateAndReject(up, down);
    });

    it("rejects inherited legacy EXECUTE without a direct service ACL grant", async () => {
      await database().exec("CREATE ROLE offline_cutover_delegate NOLOGIN;");
      try {
        await mutateAndReject(
          "GRANT EXECUTE ON FUNCTION public.bfa_p5_voice_register_proof(jsonb) TO offline_cutover_delegate; GRANT offline_cutover_delegate TO service_role;",
          "REVOKE offline_cutover_delegate FROM service_role; REVOKE EXECUTE ON FUNCTION public.bfa_p5_voice_register_proof(jsonb) FROM offline_cutover_delegate;",
        );
      } finally {
        await database().exec("DROP ROLE offline_cutover_delegate;");
      }
    });

    it("rejects an omitted exact signature even if its renamed body survives", async () => {
      await mutateAndReject(
        "ALTER FUNCTION public.bfa_p5_v2_read_current(jsonb) RENAME TO offline_hidden_current_reader;",
        "ALTER FUNCTION public.offline_hidden_current_reader(jsonb) RENAME TO bfa_p5_v2_read_current;",
      );
    });

    it.each([
      ["extra overload", "bfa_p5_v2_read_current", "uuid"],
      ["new prefixed entry", "bfa_p5_unreviewed_entry", "jsonb"],
    ])("rejects an %s even when app execution is denied", async (_label, name, arg) => {
      await mutateAndReject(
        `CREATE FUNCTION public.${name}(${arg}) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$ SELECT NULL::jsonb $$; REVOKE ALL ON FUNCTION public.${name}(${arg}) FROM PUBLIC,anon,authenticated,service_role;`,
        `DROP FUNCTION public.${name}(${arg});`,
      );
    });

    it("rejects a new private helper even when all app roles are denied", async () => {
      await mutateAndReject(
        "CREATE FUNCTION bfa_p5_voice_v2.unreviewed_helper() RETURNS boolean LANGUAGE sql SET search_path=pg_catalog,pg_temp AS $$ SELECT false $$; REVOKE ALL ON FUNCTION bfa_p5_voice_v2.unreviewed_helper() FROM PUBLIC,anon,authenticated,service_role;",
        "DROP FUNCTION bfa_p5_voice_v2.unreviewed_helper();",
      );
    });

    it("rejects a function owned by a different explicitly untrusted role", async () => {
      await database().exec(
        "CREATE ROLE offline_cutover_owner NOLOGIN; GRANT CREATE ON SCHEMA public TO offline_cutover_owner;",
      );
      try {
        await mutateAndReject(
          "ALTER FUNCTION public.bfa_p5_v2_read_current(jsonb) OWNER TO offline_cutover_owner;",
          "ALTER FUNCTION public.bfa_p5_v2_read_current(jsonb) OWNER TO postgres;",
        );
      } finally {
        await database().exec(
          "REVOKE CREATE ON SCHEMA public FROM offline_cutover_owner; DROP ROLE offline_cutover_owner;",
        );
      }
    });

    it.each([
      ["set-returning result", "p_request jsonb", "SETOF jsonb"],
      ["named argument drift", "different_argument jsonb", "jsonb"],
      ["default argument", "p_request jsonb DEFAULT NULL::jsonb", "jsonb"],
    ])(
      "rejects %s despite identical input types and execution grants",
      async (_label, args, result) => {
        const sig = "public.bfa_p5_v2_read_current(jsonb)";
        const definition = (
          await one("SELECT pg_get_functiondef($1::regprocedure) AS definition;", [sig])
        ).definition as string;
        try {
          await database().exec(
            `DROP FUNCTION ${sig}; CREATE FUNCTION public.bfa_p5_v2_read_current(${args}) RETURNS ${result} LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$ SELECT NULL::jsonb $$;`,
          );
          await candidate();
          await failed();
        } finally {
          await database().exec(`DROP FUNCTION ${sig};`);
          await database().exec(definition);
          await candidate();
        }
        await passed();
      },
    );

    it("rejects an unlisted executor even before it joins an app role", async () => {
      await database().exec("CREATE ROLE offline_unlisted_executor NOLOGIN;");
      try {
        await mutateAndReject(
          "GRANT EXECUTE ON FUNCTION public.bfa_p5_v2_read_current(jsonb) TO offline_unlisted_executor;",
          "REVOKE EXECUTE ON FUNCTION public.bfa_p5_v2_read_current(jsonb) FROM offline_unlisted_executor;",
        );
      } finally {
        await database().exec("DROP ROLE offline_unlisted_executor;");
      }
    });

    it("rejects service delegation through EXECUTE WITH GRANT OPTION", async () => {
      await mutateAndReject(
        "GRANT EXECUTE ON FUNCTION public.bfa_p5_v2_read_current(jsonb) TO service_role WITH GRANT OPTION;",
        "REVOKE GRANT OPTION FOR EXECUTE ON FUNCTION public.bfa_p5_v2_read_current(jsonb) FROM service_role;",
      );
    });

    it("rejects NOINHERIT anon membership that can SET ROLE to the v2 executor", async () => {
      await database().exec("BEGIN; SET LOCAL SESSION AUTHORIZATION anon;");
      try {
        expect(await one("SELECT session_user AS session, current_user AS role;")).toEqual({
          session: "anon",
          role: "anon",
        });
        await expect(database().exec("SET LOCAL ROLE service_role;")).rejects.toMatchObject({
          code: "42501",
        });
      } finally {
        await database().exec("ROLLBACK; SET SESSION AUTHORIZATION postgres; RESET ROLE;");
        expect(await one("SELECT session_user AS session,current_user AS role;")).toEqual({
          session: "postgres",
          role: "postgres",
        });
      }
      try {
        await database().exec("ALTER ROLE anon NOINHERIT; GRANT service_role TO anon;");
        expect(
          (
            await one(
              "SELECT has_function_privilege('anon','public.bfa_p5_v2_read_current(jsonb)','EXECUTE') AS allowed;",
            )
          ).allowed,
        ).toBe(false);
        await database().exec("BEGIN; SET LOCAL SESSION AUTHORIZATION anon;");
        try {
          await database().exec("SET LOCAL ROLE service_role;");
          expect(await one("SELECT session_user AS session, current_user AS role;")).toEqual({
            session: "anon",
            role: "service_role",
          });
        } finally {
          await database().exec("ROLLBACK; SET SESSION AUTHORIZATION postgres; RESET ROLE;");
          expect(await one("SELECT session_user AS session,current_user AS role;")).toEqual({
            session: "postgres",
            role: "postgres",
          });
        }
        expect((await failed()).issues).toContainEqual({ code: "unsafe-role", subject: "anon" });
      } finally {
        await database().exec("REVOKE service_role FROM anon; ALTER ROLE anon INHERIT;");
      }
      await passed();
    });

    it("rejects NOINHERIT service membership that can SET ROLE to a legacy executor", async () => {
      await database().exec(
        "CREATE ROLE offline_legacy_executor NOLOGIN; GRANT EXECUTE ON FUNCTION public.bfa_p5_voice_register_proof(jsonb) TO offline_legacy_executor;",
      );
      try {
        await database().exec("BEGIN; SET LOCAL SESSION AUTHORIZATION service_role;");
        try {
          expect(await one("SELECT session_user AS session, current_user AS role;")).toEqual({
            session: "service_role",
            role: "service_role",
          });
          await expect(
            database().exec("SET LOCAL ROLE offline_legacy_executor;"),
          ).rejects.toMatchObject({ code: "42501" });
        } finally {
          await database().exec("ROLLBACK; SET SESSION AUTHORIZATION postgres; RESET ROLE;");
          expect(await one("SELECT session_user AS session,current_user AS role;")).toEqual({
            session: "postgres",
            role: "postgres",
          });
        }
        await database().exec(
          "ALTER ROLE service_role NOINHERIT; GRANT offline_legacy_executor TO service_role;",
        );
        expect(
          (
            await one(
              "SELECT has_function_privilege('service_role','public.bfa_p5_voice_register_proof(jsonb)','EXECUTE') AS allowed;",
            )
          ).allowed,
        ).toBe(false);
        await database().exec("BEGIN; SET LOCAL SESSION AUTHORIZATION service_role;");
        try {
          await database().exec("SET LOCAL ROLE offline_legacy_executor;");
          expect(
            await one(
              "SELECT session_user AS session,current_user AS role,has_function_privilege(current_user,'public.bfa_p5_voice_register_proof(jsonb)','EXECUTE') AS allowed;",
            ),
          ).toEqual({ session: "service_role", role: "offline_legacy_executor", allowed: true });
        } finally {
          await database().exec("ROLLBACK; SET SESSION AUTHORIZATION postgres; RESET ROLE;");
          expect(await one("SELECT session_user AS session,current_user AS role;")).toEqual({
            session: "postgres",
            role: "postgres",
          });
        }
        expect((await failed()).issues).toContainEqual({
          code: "unsafe-role",
          subject: "service_role",
        });
      } finally {
        await database().exec(
          "REVOKE offline_legacy_executor FROM service_role; ALTER ROLE service_role INHERIT; REVOKE EXECUTE ON FUNCTION public.bfa_p5_voice_register_proof(jsonb) FROM offline_legacy_executor; DROP ROLE offline_legacy_executor;",
        );
      }
      await passed();
    });

    it("runs actual issuer to owned admission and marker while all old enablers deny", async () => {
      const f = await fixture(),
        before = await snapshot(),
        { issued, h } = await ready(f);
      const a = issued.result;
      expect(h.request.activeAuthority).toBe(a.activeAuthority);
      expect(await tokenFingerprint(a.activeAuthority)).toBe(a.authorityFingerprint);
      expect(await h.api.markCapacity()).toMatchObject({
        protocol: 2,
        status: "marked",
        claim: owned(h).claim,
      });
      expect(await accounting(f)).toEqual({
        quota: { remaining_units: 27 },
        pool: { occupied: 1, held_units: 3 },
      });
      const retainedBefore = await retained(h);
      for (const entry of legacyEnablers) await deny("service_role", entry);
      expect(await retained(h)).toEqual(retainedBefore);
      expect(
        [...issued.i.t.calls, ...h.t.calls].every((call) => call.name.startsWith("bfa_p5_v2_")),
      ).toBe(true);
      expect(retainedBefore.issuance).toMatchObject({
        fingerprint: a.authorityFingerprint,
        issued_ms: a.issuedAt,
        expires_ms: a.expiresAt,
      });
      await passed();
      await closeMarked(h);
      expect(await accounting(f)).toEqual({
        quota: { remaining_units: 27 },
        pool: { occupied: 1, held_units: 3 },
      });
      await preserveBaseline(before, f);
    });

    it.each(["expired", "revoked"] as const)(
      "retains exact legacy cleanup/revoke/reconcile after %s eligibility",
      async (reason) => {
        const f = await fixture(),
          before = await snapshot(),
          { h } = await ready(f);
        expect(await h.api.markCapacity()).not.toBeNull();
        const o = owned(h),
          original = await retained(h);
        if (reason === "expired") await advance(f, h.a.expiresAt + 1);
        else
          expect(
            await h.t.parents.revokeParent({ ownerId: f.ownerId, authSessionId: f.authSessionId }),
          ).toMatchObject({ revoked: true });
        h.authenticate.mockImplementation(async () => {
          throw new Error("Fictional Auth unavailable after eligibility loss");
        });
        const authCalls = h.authenticate.mock.calls.length;
        const legacyRevoke = await asRole(
          "service_role",
          "SELECT public.bfa_p5_voice_revoke_session($1::uuid,$2::uuid) AS value;",
          [f.ownerId, f.authSessionId],
        );
        expect(legacyRevoke.value).toMatchObject({
          ownerId: f.ownerId,
          sessionId: f.authSessionId,
          revoked: true,
        });
        expect(
          (
            await asRole(
              "service_role",
              "SELECT public.bfa_p5_voice_close($1::uuid,$2::jsonb) AS value;",
              [o.cleanupId, JSON.stringify(o.claim)],
            )
          ).value,
        ).toMatchObject({ claim: o.claim, state: "closed" });
        await closeMarked(h);
        expect(h.authenticate.mock.calls.length).toBe(authCalls);
        const operationId = h.api.markerSnapshot()!.operationId;
        const observation = {
          evidenceId: randomUUID(),
          operationId,
          kind: "unknown",
          sessionId: null,
        };
        const reconcile = (value: typeof observation) =>
          asRole(
            "service_role",
            "SELECT public.bfa_p5_capacity_reconcile($1::uuid,$2::jsonb,$3::jsonb) AS value;",
            [o.cleanupId, JSON.stringify(o.claim), JSON.stringify(value)],
          );
        expect((await reconcile(observation)).value).toMatchObject({
          claim: o.claim,
          state: "uncertain",
        });
        expect(await accounting(f)).toEqual({
          quota: { remaining_units: 27 },
          pool: { occupied: 1, held_units: 3 },
        });
        const afterUncertain = await retained(h);
        expect(afterUncertain.issuance).toEqual(original.issuance);
        expect(afterUncertain.binding).toEqual(original.binding);
        expect(afterUncertain.proofs).toEqual(original.proofs);
        expect(afterUncertain.allocation).toMatchObject({
          closed: true,
          slot_held: true,
          operation_id: operationId,
        });
        const finality = { ...observation, evidenceId: randomUUID(), kind: "not-created" };
        // Fictional trusted whole-operation finality: no provider fact is asserted.
        expect((await reconcile(finality)).value).toMatchObject({
          claim: o.claim,
          state: "terminal-recorded",
        });
        expect((await reconcile(finality)).value).toMatchObject({
          claim: o.claim,
          state: "duplicate-evidence",
        });
        expect(await accounting(f)).toEqual({
          quota: { remaining_units: 27 },
          pool: { occupied: 0, held_units: 3 },
        });
        expect((await retained(h)).allocation).toMatchObject({
          slot_held: false,
          terminal: "not-created",
          operation_id: operationId,
          units: 3,
        });
        await passed();
        await preserveBaseline(before, f);
      },
    );

    it("preserves exact close-before-register cancellation under candidate privileges", async () => {
      const f = await fixture(),
        a = (await issue(f)).result,
        approval = await approve(f, a),
        t = transport();
      const entered = deferred(),
        release = deferred();
      t.hooks.before = async (name) => {
        if (name === "bfa_p5_v2_register_cleanup") {
          entered.resolve();
          await release.promise;
        }
      };
      const h = admission(f, a, approval, t),
        pending = h.api.admit(h.request);
      await entered.promise;
      const original = owned(h);
      try {
        expect(await h.api.close()).toBe(true);
      } finally {
        release.resolve();
      }
      expect(await pending).toBe(false);
      expect(h.api.snapshot()).toMatchObject({ state: "closed", ownership: original });
      expect(h.t.calls.some((call) => call.name === "bfa_p5_capacity_close")).toBe(true);
      expect(
        h.t.calls.filter((call) =>
          [
            "bfa_p5_v2_register_proof",
            "bfa_p5_v2_capacity_claim",
            "bfa_p5_v2_capacity_mark",
          ].includes(call.name),
        ),
      ).toHaveLength(0);
      expect(
        await one(
          "SELECT closed_ms,session_id,authority_fingerprint FROM bfa_p5_voice.cleanup_owners WHERE cleanup_id=$1;",
          [original.cleanupId],
        ),
      ).toMatchObject({ closed_ms: f.now, session_id: null, authority_fingerprint: null });
      expect(await accounting(f)).toEqual({
        quota: { remaining_units: 30 },
        pool: { occupied: 0, held_units: 0 },
      });
      await passed();
    });
  });
});
