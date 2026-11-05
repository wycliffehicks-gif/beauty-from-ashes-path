// Actual local P3b AES-GCM/HMAC, inactive admission-owned v2 marker and protected v2 SQL.
// Auth/policy/approval and timing/response faults are fictional local fixtures.
// No deployed Auth, HTTP, provider/device, native scheduling or runtime wiring.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile, readdir, realpath } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ConversationService } from "../service/service";
import { seal, fingerprint as tokenFingerprint } from "../staging/seal.server";
import { createVoiceV2CapacityAdmission } from "../service/voice-v2-admission.server";
import {
  createVoiceV2MarkRpcPorts,
  type VoiceV2MarkRequest,
} from "../service/voice-v2-mark-rpc.server";
import { createVoiceV2CleanupRpcPorts } from "../service/voice-v2-cleanup-rpc.server";
import {
  createVoiceV2ProofRpcPorts,
  type VoiceV2ProofRegistration,
} from "../service/voice-v2-proof-rpc.server";
import { createVoiceV2CapacityRpcPorts } from "../service/voice-v2-capacity-rpc.server";
import { createVoiceRpcStore } from "../service/voice-rpc-store.server";
import {
  createVoiceV2CurrentRpcPorts,
  type VoiceV2CurrentQuery,
} from "../service/voice-v2-current-rpc.server";
import {
  createVoiceV2ParentIssuanceRpcPorts,
  type VoiceV2IssuanceRegistration,
} from "../service/voice-v2-parent-issuance-rpc.server";
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
const fingerprint = digest;
const names = [
  "bfa_p5_v2_read_current",
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

sqlSuite("P5 inactive admission-owned v2 capacity marker in isolated PostgreSQL", () => {
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
    vi.stubEnv("BFA_P3B_STATE_SECRET", `offline-v2-admission-marker-${randomUUID()}`);
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
    const clock = { now: at };
    vi.spyOn(Date, "now").mockImplementation(() => clock.now);
    const now = at,
      ownerId = randomUUID(),
      threadId = randomUUID(),
      authSessionId = randomUUID();
    await setClock(now);
    await database().query(
      "INSERT INTO public.bfa_p3b_staging_accounts(user_id,admitted,expires_at) VALUES($1,true,to_timestamp($2/1000.0));",
      [ownerId, now + 7200000],
    );
    await database().query(
      "INSERT INTO public.bfa_p3b_threads(id,owner_id,created_at,saved_snapshot,saved_at) VALUES($1,$2,$3::timestamptz,to_jsonb('fictional private source must not escape'::text),clock_timestamp());",
      [threadId, ownerId, SOURCE],
    );
    const t = transport();
    expect(
      await t.parents.observeParent({
        ownerId,
        authSessionId,
        verifiedAt: now,
        authExpiresAt: now + 1800000,
      }),
    ).toMatchObject({ parentVersion: 0, revoked: false });
    const g = await t.preissue.registerGeneration({
      ownerId,
      authSessionId,
      parentVersion: 0,
      threadId,
      threadRevision: 0,
      sourceCreatedAt: SOURCE,
      verifiedAt: now,
      authExpiresAt: now + 1800000,
    });
    expect(g).not.toBeNull();
    const service = new ConversationService({ verifiedOwnerId: ownerId });
    service.ensureThread(threadId, false);
    const activeAuthority = await seal({
      owner: ownerId,
      thread: threadId,
      revision: 0,
      expires: now + 60000,
      authority: service.exportAuthority(threadId),
    });
    const issuance: VoiceV2IssuanceRegistration = {
      ownerId,
      authSessionId,
      parentVersion: 0,
      threadId,
      threadIncarnation: g!.threadIncarnation,
      threadRevision: 0,
      authorityFingerprint: await tokenFingerprint(activeAuthority),
      verifiedAt: now,
      authExpiresAt: now + 1800000,
      issuedAt: now,
      expiresAt: now + 60000,
    };
    expect(await t.parents.registerIssuance(issuance)).toMatchObject({
      authorityFingerprint: issuance.authorityFingerprint,
    });
    const attemptId = randomUUID(),
      approvalId = randomUUID(),
      approvalDigest = digest(),
      policyId = randomUUID();
    await database().query(
      "INSERT INTO bfa_p5_voice.approvals VALUES($1,$2,$3,$4,$5,0,$6,'developer-voice-session',$7,false,$8);",
      [
        approvalId,
        approvalDigest,
        ownerId,
        threadId,
        g!.threadIncarnation,
        attemptId,
        now + 60000,
        policyId,
      ],
    );
    const poolId = randomUUID();
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
    const q: VoiceV2CurrentQuery = {
      protocol: 2,
      ownerId,
      authSessionId,
      parentVersion: 0,
      threadId,
      attemptId,
      authorityFingerprint: issuance.authorityFingerprint,
      verifiedAt: now,
      identityExpiresAt: now + 1800000,
    };
    return {
      q,
      issuance,
      now,
      approvalId,
      approvalDigest,
      policyId,
      poolId,
      clock,
      service,
      identity: { ownerId, sessionId: authSessionId, expiresAt: now + 1800000 },
      request: {
        threadId,
        threadIncarnation: g!.threadIncarnation,
        threadRevision: 0,
        attemptId,
        activeAuthority,
      },
    };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
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
        if (table === "bfa_p5_voice.owner_clocks" && row.owner_id === f.q.ownerId) continue;
        if (
          table === "bfa_p5_voice.quotas" &&
          row.owner_id === f.q.ownerId &&
          row.policy_id === f.policyId
        )
          continue;
        if (table === "bfa_p5_capacity.pools" && row.pool_id === f.poolId) continue;
        expect(after[table], table).toContainEqual(row);
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

  function harness(f: Fixture, t = transport()) {
    const authenticate = vi.fn(async () => structuredClone(f.identity));
    const ports = {
      maxProofAgeMs: 10000,
      expectedPoolVersion: 1,
      mark: t.marker.mark,
      now: () => f.clock.now,
      authenticate,
      readParent: t.parents.readParent,
      readCurrent: t.current.readCurrent,
      registerCleanup: t.cleanup.registerCleanup,
      registerProof: t.proofs.registerProof,
      claim: t.capacity.claim,
      inspect: t.capacity.inspect,
      close: t.close,
    };
    return { f, t, ports, authenticate, api: createVoiceV2CapacityAdmission(ports) };
  }
  type Harness = ReturnType<typeof harness>;
  function ownership(h: Harness) {
    const owned = h.api.snapshot().ownership;
    expect(owned).not.toBeNull();
    return owned!;
  }
  function registeredProofs(h: Harness) {
    return h.t.calls
      .filter((call) => call.name === "bfa_p5_v2_register_proof")
      .map((call) => call.args.p_proof as VoiceV2ProofRegistration);
  }
  async function accounting(f: Fixture) {
    return {
      quota: await one(
        "SELECT remaining_units FROM bfa_p5_voice.quotas WHERE owner_id=$1 AND policy_id=$2;",
        [f.q.ownerId, f.policyId],
      ),
      pool: await one("SELECT occupied,held_units FROM bfa_p5_capacity.pools WHERE pool_id=$1;", [
        f.poolId,
      ]),
    };
  }
  async function lifecycle(h: Harness) {
    const o = ownership(h);
    return {
      cleanup: await one("SELECT * FROM bfa_p5_voice.cleanup_owners WHERE cleanup_id=$1;", [
        o.cleanupId,
      ]),
      claim: await one("SELECT * FROM bfa_p5_voice.claims WHERE claim_id=$1;", [o.claim.claimId]),
      allocation: await one("SELECT * FROM bfa_p5_capacity.allocations WHERE claim_id=$1;", [
        o.claim.claimId,
      ]),
    };
  }
  async function closeOwned(h: Harness, marked: boolean) {
    expect(await h.api.close()).toBe(true);
    expect(h.api.snapshot().state).toBe("closed");
    const rows = await lifecycle(h);
    expect(rows.cleanup.closed_ms).not.toBeNull();
    expect(rows.claim).toMatchObject({ state: "closed", held_units: 3 });
    expect(rows.allocation).toMatchObject({ closed: true, slot_held: marked, units: 3 });
    if (marked) expect(rows.allocation.operation_id).toBe(h.api.markerSnapshot()!.operationId);
    else expect(rows.allocation.operation_id).toBeNull();
    expect(await accounting(h.f)).toEqual({
      quota: { remaining_units: 27 },
      pool: { occupied: marked ? 1 : 0, held_units: 3 },
    });
  }
  function markCalls(h: Harness) {
    return h.t.calls.filter((c) => c.name === "bfa_p5_v2_capacity_mark");
  }
  async function admitted(f = undefined as Fixture | undefined) {
    const h = harness(f ?? (await fixture()));
    expect(await h.api.admit(h.f.request)).toBe(true);
    expect(h.api.markerSnapshot()).toBeNull();
    return h;
  }
  function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((yes) => {
      resolve = yes;
    });
    return { promise, resolve };
  }

  it("routes one separate fresh unused inspect proof directly to actual v2 marker SQL", async () => {
    const f = await fixture();
    await seedHolds(f.issuance);
    const before = await snapshot(),
      h = await admitted(f),
      owned = structuredClone(ownership(h));
    const beforeMark = await accounting(f),
      proofsBefore = registeredProofs(h).map((p) => p.receiptId);
    const observation = await h.api.markCapacity(),
      marker = h.api.markerSnapshot()!;
    expect(observation).toEqual({
      protocol: 2,
      status: "marked",
      operationId: marker.operationId,
      claim: owned.claim,
    });
    expect(marker).toMatchObject({
      protocol: 2,
      ownership: owned,
      expectedPoolVersion: 1,
      state: "observed",
      registrationAttempted: true,
      markAttempted: true,
      acknowledgment: { protocol: 2, status: "marked" },
    });
    expect(marker.request).toEqual({
      protocol: 2,
      operationId: marker.operationId,
      expectedPoolVersion: 1,
      proof: marker.registrationAcknowledgment,
    });
    const proof = marker.request!.proof;
    expect(proof).toMatchObject({
      protocol: 2,
      operation: "inspect",
      ...owned,
      verifiedAt: f.now,
      expiresAt: f.now + 10000,
      effectiveExpiresAt: f.now + 60000,
    });
    expect(proofsBefore).not.toContain(proof.receiptId);
    expect(registeredProofs(h)).toHaveLength(3);
    expect(h.t.calls.filter((c) => c.name === "bfa_p5_v2_voice_inspect")).toHaveLength(1);
    expect(markCalls(h)).toEqual([
      { name: "bfa_p5_v2_capacity_mark", args: { p_request: marker.request }, committed: true },
    ]);
    expect(
      await one("SELECT consumed_ms FROM bfa_p5_voice.proofs WHERE receipt_id=$1;", [
        proof.receiptId,
      ]),
    ).toEqual({ consumed_ms: f.now });
    expect((await lifecycle(h)).allocation).toMatchObject({
      operation_id: marker.operationId,
      slot_held: true,
      closed: false,
      units: 3,
    });
    expect(await accounting(f)).toEqual(beforeMark);
    const encoded = JSON.stringify({ observation, marker, calls: h.t.calls });
    expect(encoded).not.toContain(f.request.activeAuthority);
    expect(encoded).not.toContain("fictional private source");
    expect(Object.isFrozen(marker)).toBe(true);
    expect(Object.isFrozen(marker.request!.proof.claim.binding)).toBe(true);
    const count = h.t.calls.length;
    expect(await h.api.markCapacity()).toBeNull();
    expect(h.t.calls).toHaveLength(count);
    expect(h.api.markerSnapshot()).toEqual(marker);
    await preserveBaseline(before, f);
    await closeOwned(h, true);
    await preserveBaseline(before, f);
  });

  it("uses fresh marker verification after 40 seconds without extending the immutable claim", async () => {
    const h = await admitted(),
      f = h.f,
      claim = structuredClone(ownership(h).claim);
    f.clock.now += 40000;
    await setClock(f.clock.now);
    expect(await h.api.markCapacity()).not.toBeNull();
    expect(h.api.markerSnapshot()!.request!.proof).toMatchObject({
      claim,
      verifiedAt: f.now + 40000,
      expiresAt: f.now + 50000,
      effectiveExpiresAt: f.now + 60000,
    });
    expect(ownership(h).claim).toEqual(claim);
    await closeOwned(h, true);
  });

  it("retains operation identity before its first Auth wait and rejects an overlapping marker", async () => {
    const h = await admitted(),
      entered = deferred(),
      resume = deferred();
    let first = true;
    h.authenticate.mockImplementation(async () => {
      if (first) {
        first = false;
        entered.resolve();
        await resume.promise;
      }
      return structuredClone(h.f.identity);
    });
    const pending = h.api.markCapacity();
    const synchronous = h.api.markerSnapshot()!;
    expect(synchronous).toMatchObject({
      state: "pending",
      ownership: ownership(h),
      expectedPoolVersion: 1,
      markAttempted: false,
      request: null,
    });
    expect(synchronous.operationId).toMatch(/^[0-9a-f-]{36}$/);
    await entered.promise;
    const count = h.t.calls.length;
    expect(await h.api.markCapacity()).toBeNull();
    expect(await h.api.revalidate()).toBe(false);
    expect(h.t.calls).toHaveLength(count);
    resume.resolve();
    expect(await pending).toMatchObject({ operationId: synchronous.operationId, status: "marked" });
    expect(h.api.markerSnapshot()!.operationId).toBe(synchronous.operationId);
    expect(markCalls(h)).toHaveLength(1);
    await closeOwned(h, true);
  });

  const mutations: [string, (h: Harness) => Promise<unknown>][] = [
    [
      "parent revocation",
      (h) =>
        transport().parents.revokeParent({
          ownerId: h.f.q.ownerId,
          authSessionId: h.f.q.authSessionId,
        }),
    ],
    [
      "approval revocation",
      (h) =>
        database().query("UPDATE bfa_p5_voice.approvals SET revoked=true WHERE approval_id=$1;", [
          h.f.approvalId,
        ]),
    ],
    [
      "approval replacement",
      (h) =>
        database().query("UPDATE bfa_p5_voice.approvals SET digest=$1 WHERE approval_id=$2;", [
          digest(),
          h.f.approvalId,
        ]),
    ],
    [
      "thread revision",
      (h) =>
        database().query("UPDATE public.bfa_p3b_threads SET revision=1 WHERE id=$1;", [
          h.f.q.threadId,
        ]),
    ],
    [
      "allowlist withdrawal",
      (h) =>
        database().query(
          "UPDATE public.bfa_p3b_staging_accounts SET admitted=false WHERE user_id=$1;",
          [h.f.q.ownerId],
        ),
    ],
    [
      "Auth session change",
      async (h) => {
        h.f.identity.sessionId = randomUUID();
      },
    ],
  ];
  for (const stage of ["bfa_p5_v2_register_proof", "bfa_p5_v2_capacity_mark"] as const)
    it.each(mutations)(
      `denies %s after ${stage} commits without forgetting marker ownership`,
      async (_name, mutate) => {
        const h = await admitted();
        let changed = false;
        h.t.hooks.afterCommit = async (name, data) => {
          if (name === stage && !changed) {
            changed = true;
            await mutate(h);
          }
          return data;
        };
        expect(await h.api.markCapacity()).toBeNull();
        expect(changed).toBe(true);
        const marker = h.api.markerSnapshot()!;
        expect(marker.state).toBe("unconfirmed");
        expect(marker.ownership).toEqual(ownership(h));
        const marked = stage === "bfa_p5_v2_capacity_mark";
        expect(markCalls(h)).toHaveLength(marked ? 1 : 0);
        if (marked)
          expect(marker.acknowledgment).toMatchObject({
            status: "marked",
            request: marker.request,
          });
        expect(h.t.calls.some((c) => c.name === "bfa_p5_capacity_close")).toBe(false);
        expect(await accounting(h.f)).toEqual({
          quota: { remaining_units: 27 },
          pool: { occupied: 1, held_units: 3 },
        });
        const count = h.t.calls.length;
        expect(await h.api.markCapacity()).toBeNull();
        expect(h.t.calls).toHaveLength(count);
        await closeOwned(h, marked);
      },
    );

  it.each(["version", "disabled", "quarantined", "quota disabled"])(
    "retains actual marker %s denial and consumes only its separate proof",
    async (kind) => {
      const h = await admitted(),
        f = h.f;
      if (kind === "version")
        await database().query(
          "UPDATE bfa_p5_capacity.pools SET version=version+1 WHERE pool_id=$1;",
          [f.poolId],
        );
      if (kind === "disabled")
        await database().query("UPDATE bfa_p5_capacity.pools SET enabled=false WHERE pool_id=$1;", [
          f.poolId,
        ]);
      if (kind === "quarantined")
        await database().query(
          "UPDATE bfa_p5_capacity.pools SET quarantined=true WHERE pool_id=$1;",
          [f.poolId],
        );
      if (kind === "quota disabled")
        await database().query(
          "UPDATE bfa_p5_voice.quotas SET enabled=false WHERE owner_id=$1 AND policy_id=$2;",
          [f.q.ownerId, f.policyId],
        );
      expect(await h.api.markCapacity()).toBeNull();
      const marker = h.api.markerSnapshot()!;
      expect(marker.acknowledgment).toMatchObject({
        protocol: 2,
        request: marker.request,
        status: kind === "quarantined" ? "quarantined" : "denied",
      });
      expect(
        await one("SELECT consumed_ms FROM bfa_p5_voice.proofs WHERE receipt_id=$1;", [
          marker.request!.proof.receiptId,
        ]),
      ).toEqual({ consumed_ms: f.now });
      expect(await accounting(f)).toEqual({
        quota: { remaining_units: 27 },
        pool: { occupied: 1, held_units: 3 },
      });
      await closeOwned(h, false);
    },
  );

  it.each(["lost", "null", "protocol", "operation", "pool version", "proof receipt", "proof time"])(
    "retains uncertain committed marker for a %s reply and never retries",
    async (fault) => {
      const h = await admitted();
      h.t.hooks.afterCommit = async (name, data) => {
        if (name !== "bfa_p5_v2_capacity_mark") return data;
        if (fault === "lost") throw new Error("fictional private transport detail");
        if (fault === "null") return null;
        const body = structuredClone(data) as { protocol: number; request: VoiceV2MarkRequest };
        if (fault === "protocol") return { ...body, protocol: 1 };
        if (fault === "operation")
          return { ...body, request: { ...body.request, operationId: randomUUID() } };
        if (fault === "pool version")
          return { ...body, request: { ...body.request, expectedPoolVersion: 2 } };
        return {
          ...body,
          request: {
            ...body.request,
            proof: {
              ...body.request.proof,
              [fault === "proof receipt" ? "receiptId" : "verifiedAt"]:
                fault === "proof receipt" ? randomUUID() : h.f.now - 1,
            },
          },
        };
      };
      expect(await h.api.markCapacity()).toBeNull();
      const marker = h.api.markerSnapshot()!;
      expect(marker).toMatchObject({
        state: "unconfirmed",
        markAttempted: true,
        acknowledgment: null,
      });
      expect((await lifecycle(h)).allocation.operation_id).toBe(marker.operationId);
      expect(await accounting(h.f)).toEqual({
        quota: { remaining_units: 27 },
        pool: { occupied: 1, held_units: 3 },
      });
      const count = h.t.calls.length;
      expect(await h.api.markCapacity()).toBeNull();
      expect(h.t.calls).toHaveLength(count);
      expect(markCalls(h)).toHaveLength(1);
      await closeOwned(h, true);
    },
  );

  it("keeps an actual already-marked acknowledgment without yielding a new marked observation", async () => {
    const h = await admitted();
    h.t.hooks.before = async (name, args) => {
      if (name === "bfa_p5_v2_capacity_mark") {
        const request = args.p_request as VoiceV2MarkRequest;
        await database().query(
          "UPDATE bfa_p5_capacity.allocations SET operation_id=$1 WHERE claim_id=$2;",
          [request.operationId, request.proof.claim.claimId],
        );
      }
    };
    expect(await h.api.markCapacity()).toBeNull();
    const marker = h.api.markerSnapshot()!;
    expect(marker.acknowledgment).toMatchObject({
      protocol: 2,
      status: "already-marked",
      request: marker.request,
    });
    expect(marker.state).toBe("unconfirmed");
    const count = h.t.calls.length;
    expect(await h.api.markCapacity()).toBeNull();
    expect(h.t.calls).toHaveLength(count);
    await closeOwned(h, true);
  });

  it.each(["registration", "marker"])(
    "keeps original proof deadline when %s reply arrives at exact expiry",
    async (phase) => {
      const h = await admitted(),
        f = h.f;
      const stage =
        phase === "registration" ? "bfa_p5_v2_register_proof" : "bfa_p5_v2_capacity_mark";
      h.t.hooks.afterCommit = async (name, data) => {
        if (name === stage) {
          f.clock.now += 10000;
          await setClock(f.clock.now);
        }
        return data;
      };
      expect(await h.api.markCapacity()).toBeNull();
      const marker = h.api.markerSnapshot()!;
      expect(marker.request!.proof).toMatchObject({ verifiedAt: f.now, expiresAt: f.now + 10000 });
      expect(marker.state).toBe("unconfirmed");
      expect(markCalls(h)).toHaveLength(phase === "marker" ? 1 : 0);
      if (phase === "marker") expect(marker.acknowledgment).toMatchObject({ status: "marked" });
      expect(
        (
          await one("SELECT consumed_ms FROM bfa_p5_voice.proofs WHERE receipt_id=$1;", [
            marker.request!.proof.receiptId,
          ])
        ).consumed_ms,
      ).toBe(phase === "marker" ? f.now : null);
      await closeOwned(h, phase === "marker");
    },
  );

  it("does not consume or replace a registered marker proof after eligibility shortens", async () => {
    const h = await admitted(),
      f = h.f;
    h.t.hooks.afterCommit = async (name, data) => {
      if (name === "bfa_p5_v2_register_proof")
        await database().query(
          "UPDATE bfa_p5_voice.approvals SET expires_ms=$1 WHERE approval_id=$2;",
          [f.now + 5000, f.approvalId],
        );
      return data;
    };
    expect(await h.api.markCapacity()).toBeNull();
    const marker = h.api.markerSnapshot()!;
    expect(marker.request!.proof).toMatchObject({
      effectiveExpiresAt: f.now + 60000,
      expiresAt: f.now + 10000,
    });
    expect(h.api.snapshot().effectiveExpiresAt).toBe(f.now + 5000);
    expect(markCalls(h)).toHaveLength(0);
    expect(registeredProofs(h)).toHaveLength(3);
    expect(
      (
        await one("SELECT consumed_ms FROM bfa_p5_voice.proofs WHERE receipt_id=$1;", [
          marker.request!.proof.receiptId,
        ])
      ).consumed_ms,
    ).toBeNull();
    await closeOwned(h, false);
  });

  it("retains earlier shorter Auth/approval ceilings across fresh marker verification", async () => {
    const h = await admitted(),
      f = h.f;
    f.identity.expiresAt = f.now + 9000;
    await database().query(
      "UPDATE bfa_p5_voice.approvals SET expires_ms=$1 WHERE approval_id=$2;",
      [f.now + 8000, f.approvalId],
    );
    expect(await h.api.revalidate()).toBe(true);
    f.identity.expiresAt = f.now + 1800000;
    await database().query(
      "UPDATE bfa_p5_voice.approvals SET expires_ms=$1 WHERE approval_id=$2;",
      [f.now + 60000, f.approvalId],
    );
    expect(await h.api.markCapacity()).not.toBeNull();
    expect(h.api.markerSnapshot()!.request!.proof).toMatchObject({
      identityExpiresAt: f.now + 9000,
      effectiveExpiresAt: f.now + 8000,
      expiresAt: f.now + 8000,
    });
    expect(ownership(h).claim.expiresAt).toBe(f.now + 60000);
    await closeOwned(h, true);
  });

  it.each(["bfa_p5_v2_register_proof", "bfa_p5_v2_capacity_mark"])(
    "synchronous exact close defeats delayed %s without reactivation",
    async (stage) => {
      const h = await admitted(),
        entered = deferred(),
        resume = deferred();
      let blocked = false;
      h.t.hooks.before = async (name) => {
        if (name === stage && !blocked) {
          blocked = true;
          entered.resolve();
          await resume.promise;
        }
      };
      const marking = h.api.markCapacity();
      await entered.promise;
      const original = h.api.markerSnapshot()!.operationId;
      const closing = h.api.close();
      expect(h.api.snapshot().state).toBe("closing");
      expect(await closing).toBe(true);
      resume.resolve();
      expect(await marking).toBeNull();
      expect(h.api.snapshot().state).toBe("closed");
      expect(h.api.markerSnapshot()!.operationId).toBe(original);
      expect(h.api.markerSnapshot()!.state).toBe("unconfirmed");
      const calls = h.t.calls.length;
      expect(await h.api.markCapacity()).toBeNull();
      expect(h.t.calls).toHaveLength(calls);
      await closeOwned(h, false);
    },
  );

  it("close during committed marker reply preserves marked uncertainty and its occupied slot", async () => {
    const h = await admitted(),
      entered = deferred(),
      resume = deferred();
    h.t.hooks.afterCommit = async (name, data) => {
      if (name === "bfa_p5_v2_capacity_mark") {
        entered.resolve();
        await resume.promise;
      }
      return data;
    };
    const marking = h.api.markCapacity();
    await entered.promise;
    const closing = h.api.close();
    expect(h.api.snapshot().state).toBe("closing");
    expect(await closing).toBe(true);
    resume.resolve();
    expect(await marking).toBeNull();
    expect(h.api.snapshot().state).toBe("closed");
    expect(h.api.markerSnapshot()).toMatchObject({
      state: "unconfirmed",
      acknowledgment: { status: "marked" },
    });
    await closeOwned(h, true);
  });

  it("retains marked operation and exact cleanup after a lost close reply despite Auth/time loss", async () => {
    const h = await admitted();
    expect(await h.api.markCapacity()).not.toBeNull();
    const before = structuredClone(h.api.markerSnapshot());
    let lost = false;
    h.t.hooks.afterCommit = async (name, data) => {
      if (name === "bfa_p5_capacity_close" && !lost) {
        lost = true;
        throw new Error("fictional lost close");
      }
      return data;
    };
    h.f.identity.sessionId = randomUUID();
    h.f.clock.now = NaN;
    expect(await h.api.close()).toBe(false);
    expect(h.api.snapshot().state).toBe("close-unconfirmed");
    expect(h.api.markerSnapshot()).toEqual(before);
    expect(await accounting(h.f)).toEqual({
      quota: { remaining_units: 27 },
      pool: { occupied: 1, held_units: 3 },
    });
    await closeOwned(h, true);
    const closes = h.t.calls.filter((c) => c.name === "bfa_p5_capacity_close");
    expect(closes).toHaveLength(2);
    expect(closes[0]!.args).toEqual(closes[1]!.args);
  });

  it("isolates concurrent owned markers and retains both independently marked holds", async () => {
    const f1 = await fixture(),
      f2 = await fixture(f1.now),
      h1 = await admitted(f1),
      h2 = await admitted(f2);
    const observations = await Promise.all([h1.api.markCapacity(), h2.api.markCapacity()]);
    expect(observations.every(Boolean)).toBe(true);
    const first = h1.api.markerSnapshot()!,
      second = h2.api.markerSnapshot()!;
    expect(first.operationId).not.toBe(second.operationId);
    expect(first.request!.proof.receiptId).not.toBe(second.request!.proof.receiptId);
    for (const h of [h1, h2]) {
      const m = h.api.markerSnapshot()!;
      expect(m.request!.proof).toMatchObject(ownership(h));
      expect((await lifecycle(h)).allocation.operation_id).toBe(m.operationId);
      expect(markCalls(h)).toHaveLength(1);
    }
    await closeOwned(h1, true);
    expect(h2.api.snapshot().state).toBe("active");
    await closeOwned(h2, true);
  });
});
