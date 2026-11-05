// Actual local P3b AES-GCM/HMAC, full existing v2 issuer/admission/marker lifecycle and protected SQL.
// Auth/policy/approval and timing/response faults are fictional local fixtures.
// No deployed Auth, HTTP, provider/device, native scheduling or runtime wiring.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile, readdir, realpath } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
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

sqlSuite("P5 full existing v2 lifecycle composition in isolated PostgreSQL", () => {
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
    vi.stubEnv("BFA_P3B_STATE_SECRET", `offline-v2-lifecycle-${randomUUID()}`);
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
  async function assertNoAdmission(h: Admission) {
    expect(h.api.snapshot().ownership).toBeNull();
    expect(
      h.t.calls.every((c) => ["bfa_p5_v2_read_parent", "bfa_p5_v2_read_current"].includes(c.name)),
    ).toBe(true);
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
  it("drives actual service through trusted issuer, admission, marker and exact cleanup without target resealing", async () => {
    const f = await fixture(),
      before = await snapshot(),
      { issued, h } = await ready(f),
      a = issued.result;
    expect(Object.keys(h.request)).toEqual([
      "threadId",
      "threadIncarnation",
      "threadRevision",
      "attemptId",
      "activeAuthority",
    ]);
    expect(h.request.activeAuthority).toBe(a.activeAuthority);
    expect(await tokenFingerprint(a.activeAuthority)).toBe(a.authorityFingerprint);
    expect(issued.i.t.calls.filter((c) => c.name === "bfa_p5_v2_register_issuance")).toHaveLength(
      1,
    );
    expect(issued.i.instance.snapshot()).toMatchObject({
      state: "issued",
      parentWriteAttempted: true,
      generationWriteAttempted: true,
      issuanceWriteAttempted: true,
      issuanceAcknowledgment: {
        protocol: 2,
        authorityFingerprint: a.authorityFingerprint,
        authSessionId: f.authSessionId,
        parentVersion: 0,
        issuedAt: f.now,
        expiresAt: f.now + 60000,
      },
    });
    expect(await h.api.markCapacity()).toMatchObject({
      protocol: 2,
      status: "marked",
      claim: owned(h).claim,
    });
    const records = await retained(h);
    expect(records.issuance).toMatchObject({
      fingerprint: a.authorityFingerprint,
      owner_id: f.ownerId,
      thread_id: f.threadId,
      incarnation: a.threadIncarnation,
      issued_ms: a.issuedAt,
      expires_ms: a.expiresAt,
      revoked: false,
    });
    expect(records.binding).toMatchObject({
      protocol: 2,
      auth_session_id: f.authSessionId,
      parent_version: 0,
      fingerprint: a.authorityFingerprint,
    });
    expect(records.proofs).toHaveLength(3);
    expect(records.proofs.map((p) => p.operation).sort()).toEqual(["claim", "inspect", "inspect"]);
    expect(records.proofs.every((p) => p.consumed_ms === f.now && p.protocol === 2)).toBe(true);
    expect(await accounting(f)).toEqual({
      quota: { remaining_units: 27 },
      pool: { occupied: 1, held_units: 3 },
    });
    const exposed = JSON.stringify({
      issuer: issued.i.instance.snapshot(),
      admission: h.api.snapshot(),
      marker: h.api.markerSnapshot(),
      calls: [...issued.i.t.calls, ...h.t.calls],
    });
    expect(exposed).not.toContain(a.activeAuthority);
    expect(exposed).not.toContain("fictional saved writing");
    expect([...issued.i.t.calls, ...h.t.calls].every((c) => c.name.startsWith("bfa_p5_v2_"))).toBe(
      true,
    );
    await preserveBaseline(before, f);
    await closeMarked(h);
    await preserveBaseline(before, f);
    expect(await accounting(f)).toEqual({
      quota: { remaining_units: 27 },
      pool: { occupied: 1, held_units: 3 },
    });
  });
  it("issues later authority after original expiry under the same parent and preserves uncertain marked history", async () => {
    const f = await fixture(),
      first = await ready(f);
    first.h.t.hooks.afterCommit = async (name, data) => {
      if (name === "bfa_p5_v2_capacity_mark")
        throw new Error("fictional response lost after marking");
      return data;
    };
    expect(await first.h.api.markCapacity()).toBeNull();
    expect(first.h.api.markerSnapshot()).toMatchObject({
      state: "unconfirmed",
      markAttempted: true,
      acknowledgment: null,
    });
    const original = await retained(first.h),
      parent = await one(
        "SELECT * FROM bfa_p5_voice_v2.auth_parents WHERE owner_id=$1 AND auth_session_id=$2;",
        [f.ownerId, f.authSessionId],
      );
    await advance(f, first.issued.result.expiresAt);
    f.identity.expiresAt = f.clock.now + 1800000;
    const old = admission(f, first.issued.result, first.h.approval);
    expect(await old.api.admit(old.request)).toBe(false);
    await assertNoAdmission(old);
    const second = await ready(f);
    expect(second.issued.result).toMatchObject({
      ownerId: f.ownerId,
      authSessionId: f.authSessionId,
      parentVersion: 0,
      threadIncarnation: first.issued.result.threadIncarnation,
      issuedAt: first.issued.result.expiresAt,
      expiresAt: first.issued.result.expiresAt + 60000,
    });
    expect(second.issued.result.authorityFingerprint).not.toBe(
      first.issued.result.authorityFingerprint,
    );
    expect(second.issued.result.activeAuthority).not.toBe(first.issued.result.activeAuthority);
    expect(second.h.approval.attemptId).not.toBe(first.h.approval.attemptId);
    expect(second.h.approval.approvalId).not.toBe(first.h.approval.approvalId);
    expect(await second.h.api.markCapacity()).not.toBeNull();
    expect(await retained(first.h)).toEqual(original);
    expect(
      await one(
        "SELECT * FROM bfa_p5_voice_v2.auth_parents WHERE owner_id=$1 AND auth_session_id=$2;",
        [f.ownerId, f.authSessionId],
      ),
    ).toEqual(parent);
    expect(await accounting(f)).toEqual({
      quota: { remaining_units: 24 },
      pool: { occupied: 2, held_units: 6 },
    });
    await closeMarked(first.h);
    await closeMarked(second.h);
    expect(await accounting(f)).toEqual({
      quota: { remaining_units: 24 },
      pool: { occupied: 2, held_units: 6 },
    });
  });
  it("cannot reuse a prior marked attempt with a new genuine issuer authority", async () => {
    const f = await fixture(),
      first = await ready(f);
    expect(await first.h.api.markCapacity()).not.toBeNull();
    await closeMarked(first.h);
    const original = await retained(first.h);
    const second = await issue(f),
      attemptReuse = admission(f, second.result, first.h.approval);
    expect(second.result.authorityFingerprint).not.toBe(first.issued.result.authorityFingerprint);
    expect(await attemptReuse.api.admit(attemptReuse.request)).toBe(false);
    expect(owned(attemptReuse).claim.claimId).not.toBe(owned(first.h).claim.claimId);
    expect(await attemptReuse.api.close()).toBe(true);
    expect(await retained(first.h)).toEqual(original);
    expect(await accounting(f)).toEqual({
      quota: { remaining_units: 27 },
      pool: { occupied: 1, held_units: 3 },
    });
  });
  it("retained uncertain marked occupancy blocks later authority without a second debit", async () => {
    const f = await fixture();
    await database().query("UPDATE bfa_p5_capacity.pools SET active_limit=1 WHERE pool_id=$1;", [
      f.poolId,
    ]);
    const first = await ready(f);
    first.h.t.hooks.afterCommit = async (name, data) => {
      if (name === "bfa_p5_v2_capacity_mark") throw new Error("fictional lost marker");
      return data;
    };
    expect(await first.h.api.markCapacity()).toBeNull();
    await closeMarked(first.h);
    const original = await retained(first.h);
    await advance(f, first.issued.result.expiresAt);
    const second = await issue(f),
      approval = await approve(f, second.result),
      h = admission(f, second.result, approval);
    expect(await h.api.admit(h.request)).toBe(false);
    expect(await h.api.close()).toBe(true);
    expect(await retained(first.h)).toEqual(original);
    expect(await accounting(f)).toEqual({
      quota: { remaining_units: 27 },
      pool: { occupied: 1, held_units: 3 },
    });
  });
  it("new genuine authorities never replenish the shared cumulative quota", async () => {
    const f = await fixture();
    await database().query(
      "UPDATE bfa_p5_voice.quotas SET remaining_units=6 WHERE owner_id=$1 AND policy_id=$2;",
      [f.ownerId, f.policyId],
    );
    const first = await ready(f);
    expect(await first.h.api.markCapacity()).not.toBeNull();
    await closeMarked(first.h);
    await advance(f, first.issued.result.expiresAt);
    const second = await ready(f);
    expect(await second.h.api.markCapacity()).not.toBeNull();
    await closeMarked(second.h);
    await advance(f, second.issued.result.expiresAt);
    const third = await issue(f),
      approval = await approve(f, third.result),
      h = admission(f, third.result, approval);
    expect(await h.api.admit(h.request)).toBe(false);
    expect(await h.api.close()).toBe(true);
    expect(await accounting(f)).toEqual({
      quota: { remaining_units: 0 },
      pool: { occupied: 2, held_units: 6 },
    });
    expect(
      (
        await database().query("SELECT * FROM bfa_p5_voice.issuances WHERE owner_id=$1;", [
          f.ownerId,
        ])
      ).rows,
    ).toHaveLength(3);
  });
  it("fresh shorter Auth bounds later authority without changing prior issuance or holds", async () => {
    const f = await fixture(),
      first = await ready(f);
    expect(await first.h.api.markCapacity()).not.toBeNull();
    const prior = await retained(first.h);
    await advance(f, first.issued.result.expiresAt);
    f.identity.expiresAt = f.clock.now + 5000;
    const second = await ready(f);
    expect(second.issued.result.expiresAt).toBe(f.clock.now + 5000);
    expect(owned(second.h).claim.expiresAt).toBe(second.issued.result.expiresAt);
    expect(await second.h.api.markCapacity()).not.toBeNull();
    expect(second.h.api.markerSnapshot()!.request!.proof.expiresAt).toBe(
      second.issued.result.expiresAt,
    );
    expect(await retained(first.h)).toEqual(prior);
    await closeMarked(first.h);
    await closeMarked(second.h);
  });
  it.each(["parent", "legacy active", "legacy expired", "legacy revoked"])(
    "%s fence denies both existing lifecycle and new issuer while preserving exact cleanup",
    async (kind) => {
      const f = await fixture(),
        first = await ready(f);
      expect(await first.h.api.markCapacity()).not.toBeNull();
      if (kind === "parent")
        await transport().parents.revokeParent({
          ownerId: f.ownerId,
          authSessionId: f.authSessionId,
        });
      else
        await database().query("INSERT INTO bfa_p5_voice.session_fences VALUES($1,$2,0,$3,$4);", [
          f.ownerId,
          f.authSessionId,
          kind === "legacy expired" ? f.now - 1 : f.now + 60000,
          kind === "legacy revoked",
        ]);
      const original = await retained(first.h);
      expect(await first.h.api.revalidate()).toBe(false);
      const next = issuer(f);
      expect(await next.instance.issue(next.input)).toBeNull();
      expect(next.t.calls.some((c) => c.name === "bfa_p5_v2_register_issuance")).toBe(false);
      expect(await retained(first.h)).toEqual(original);
      await closeMarked(first.h);
      expect(await accounting(f)).toEqual({
        quota: { remaining_units: 27 },
        pool: { occupied: 1, held_units: 3 },
      });
    },
  );
  it.each(["parent", "approval", "allowlist", "Auth session"])(
    "issuer output grants no admission after intervening %s change",
    async (kind) => {
      const f = await fixture(),
        issued = await issue(f),
        approval = await approve(f, issued.result),
        h = admission(f, issued.result, approval);
      if (kind === "parent")
        await transport().parents.revokeParent({
          ownerId: f.ownerId,
          authSessionId: f.authSessionId,
        });
      if (kind === "approval")
        await database().query(
          "UPDATE bfa_p5_voice.approvals SET revoked=true WHERE approval_id=$1;",
          [approval.approvalId],
        );
      if (kind === "allowlist")
        await database().query(
          "UPDATE public.bfa_p3b_staging_accounts SET admitted=false WHERE user_id=$1;",
          [f.ownerId],
        );
      if (kind === "Auth session") f.identity.sessionId = randomUUID();
      expect(await h.api.admit(h.request)).toBe(false);
      await assertNoAdmission(h);
      expect(await accounting(f)).toEqual({
        quota: { remaining_units: 30 },
        pool: { occupied: 0, held_units: 0 },
      });
    },
  );
  it.each(["parent", "allowlist"])(
    "downstream admission denies %s loss during issuer final Auth wait",
    async (kind) => {
      const f = await fixture(),
        i = issuer(f);
      let count = 0;
      i.authenticate.mockImplementation(async () => {
        if (++count === 12) {
          if (kind === "parent")
            await transport().parents.revokeParent({
              ownerId: f.ownerId,
              authSessionId: f.authSessionId,
            });
          else
            await database().query(
              "UPDATE public.bfa_p3b_staging_accounts SET expires_at=to_timestamp($1/1000.0) WHERE user_id=$2;",
              [f.now, f.ownerId],
            );
        }
        return structuredClone(f.identity);
      });
      const result = await i.instance.issue(i.input);
      expect(count).toBe(12);
      expect(result).not.toBeNull();
      expect(i.instance.snapshot().state).toBe("issued");
      // This is a concrete finite-observation limit, not a provider grant. The
      // unchanged downstream gate must independently reject the now-stale output.
      const before = await snapshot(),
        approval = await approve(f, result!),
        h = admission(f, result!, approval);
      expect(await h.api.admit(h.request)).toBe(false);
      await assertNoAdmission(h);
      await preserveBaseline(before, f);
      expect(await accounting(f)).toEqual({
        quota: { remaining_units: 30 },
        pool: { occupied: 0, held_units: 0 },
      });
    },
  );
  it.each(["lost", "late"])(
    "%s issuer registration response never launches admission or automatically retries",
    async (kind) => {
      const f = await fixture(),
        i = issuer(f);
      i.t.hooks.afterCommit = async (name, data) => {
        if (name === "bfa_p5_v2_register_issuance") {
          if (kind === "lost") throw new Error("fictional loss");
          await advance(f, f.now + 30000);
        }
        return data;
      };
      expect(await i.instance.issue(i.input)).toBeNull();
      const s = i.instance.snapshot();
      expect(s).toMatchObject({ state: "unconfirmed", issuanceWriteAttempted: true });
      expect(s.issuanceRequest).not.toBeNull();
      expect(
        (
          await database().query("SELECT * FROM bfa_p5_voice.issuances WHERE fingerprint=$1;", [
            s.issuanceRequest!.authorityFingerprint,
          ])
        ).rows,
      ).toHaveLength(1);
      const count = i.t.calls.length;
      expect(await i.instance.issue(i.input)).toBeNull();
      expect(i.t.calls).toHaveLength(count);
      expect(await accounting(f)).toEqual({
        quota: { remaining_units: 30 },
        pool: { occupied: 0, held_units: 0 },
      });
      expect(
        (
          await database().query("SELECT * FROM bfa_p5_voice.cleanup_owners WHERE owner_id=$1;", [
            f.ownerId,
          ])
        ).rows,
      ).toHaveLength(0);
    },
  );
  it("cancelled issuer preserves committed evidence and never releases a token to admission", async () => {
    const f = await fixture(),
      i = issuer(f),
      entered = deferred(),
      resume = deferred();
    i.t.hooks.afterCommit = async (name, data) => {
      if (name === "bfa_p5_v2_register_issuance") {
        entered.resolve();
        await resume.promise;
      }
      return data;
    };
    const pending = i.instance.issue(i.input);
    await entered.promise;
    i.instance.cancel();
    resume.resolve();
    expect(await pending).toBeNull();
    expect(i.instance.snapshot()).toMatchObject({
      state: "cancelled",
      issuanceWriteAttempted: true,
    });
    expect(i.instance.snapshot().issuanceAcknowledgment).not.toBeNull();
    expect(await accounting(f)).toEqual({
      quota: { remaining_units: 30 },
      pool: { occupied: 0, held_units: 0 },
    });
  });
  it.each(["bfa_p5_v2_register_cleanup", "bfa_p5_v2_capacity_mark"])(
    "issuer-fed exact close defeats pending %s without reviving the lifecycle",
    async (stage) => {
      const f = await fixture(),
        issued = await issue(f),
        approval = await approve(f, issued.result),
        h = admission(f, issued.result, approval),
        entered = deferred(),
        resume = deferred();
      let blocked = false;
      if (stage === "bfa_p5_v2_capacity_mark") expect(await h.api.admit(h.request)).toBe(true);
      h.t.hooks.before = async (name) => {
        if (name === stage && !blocked) {
          blocked = true;
          entered.resolve();
          await resume.promise;
        }
      };
      const pending =
        stage === "bfa_p5_v2_register_cleanup" ? h.api.admit(h.request) : h.api.markCapacity();
      await entered.promise;
      const original = structuredClone(owned(h));
      const closing = h.api.close();
      expect(h.api.snapshot().state).toBe("closing");
      expect(await closing).toBe(true);
      resume.resolve();
      expect(await pending).toBe(stage === "bfa_p5_v2_register_cleanup" ? false : null);
      expect(h.api.snapshot().state).toBe("closed");
      expect(owned(h)).toEqual(original);
      expect(await accounting(f)).toEqual({
        quota: { remaining_units: stage === "bfa_p5_v2_register_cleanup" ? 30 : 27 },
        pool: { occupied: 0, held_units: stage === "bfa_p5_v2_register_cleanup" ? 0 : 3 },
      });
    },
  );
  it("issuer-fed close after committed delayed marking retains exact operation and occupied hold", async () => {
    const f = await fixture(),
      { h } = await ready(f),
      entered = deferred(),
      resume = deferred();
    h.t.hooks.afterCommit = async (name, data) => {
      if (name === "bfa_p5_v2_capacity_mark") {
        entered.resolve();
        await resume.promise;
      }
      return data;
    };
    const pending = h.api.markCapacity();
    await entered.promise;
    const operation = h.api.markerSnapshot()!.operationId;
    expect(await h.api.close()).toBe(true);
    resume.resolve();
    expect(await pending).toBeNull();
    expect(h.api.markerSnapshot()).toMatchObject({
      operationId: operation,
      state: "unconfirmed",
      acknowledgment: { status: "marked" },
    });
    await closeMarked(h);
    expect(await accounting(f)).toEqual({
      quota: { remaining_units: 27 },
      pool: { occupied: 1, held_units: 3 },
    });
  });
});
