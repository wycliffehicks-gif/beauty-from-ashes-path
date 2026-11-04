// Actual isolated PostgreSQL and inactive v2 marker transport; fictional
// identity/policy/approval metadata only. No Auth, HTTP, provider or device call.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { readFile, readdir, realpath } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createVoiceV2MarkRpcPorts,
  type VoiceV2MarkRequest,
} from "../service/voice-v2-mark-rpc.server";
import { createVoiceV2CapacityRpcPorts } from "../service/voice-v2-capacity-rpc.server";
import {
  createVoiceV2ProofRpcPorts,
  type VoiceV2ProofRegistration,
} from "../service/voice-v2-proof-rpc.server";
import { createVoiceV2CleanupRpcPorts } from "../service/voice-v2-cleanup-rpc.server";
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
type Mutable<T> = { -readonly [K in keyof T]: T[K] extends object ? Mutable<T[K]> : T[K] };
type FixtureProof = Mutable<VoiceV2ProofRegistration>;
type Args = Readonly<Record<string, unknown>>;
type Role = "anon" | "authenticated" | "service_role";
const enginePath = process.env.BFA_PGLITE_MODULE;
const sqlSuite = enginePath ? describe : describe.skip;
const ROOT = process.cwd();
const SOURCE = "2001-02-03T04:05:06.123456Z";
const digest = () => createHash("sha256").update(randomUUID()).digest("hex");
const fingerprint = digest;
const names = [
  "bfa_p5_v2_capacity_mark",
  "bfa_p5_v2_capacity_claim",
  "bfa_p5_v2_voice_inspect",
  "bfa_p5_v2_register_proof",
  "bfa_p5_v2_register_cleanup",
  "bfa_p5_v2_read_cleanup",
  "bfa_p5_v2_observe_parent",
  "bfa_p5_v2_revoke_parent",
  "bfa_p5_v2_register_issuance",
  "bfa_p5_v2_register_generation",
  "bfa_p5_v2_read_current_thread",
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

sqlSuite("P5 proposed v2 capacity marker in isolated PostgreSQL", () => {
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
      "v2-preissue",
    ])
      await install(`docs/pilot/conversation/sql-drafts/p5-voice-${name}.sql`);
    await install("docs/pilot/conversation/sql-drafts/p5-voice-v2-cleanup.sql");
    await install("docs/pilot/conversation/sql-drafts/p5-voice-v2-proof.sql");
    await install("docs/pilot/conversation/sql-drafts/p5-voice-v2-capacity.sql");
    await install("docs/pilot/conversation/sql-drafts/p5-voice-v2-mark.sql");
    realClockDefinition = (
      await one("SELECT pg_get_functiondef('bfa_p5_voice.ms()'::regprocedure) AS definition;")
    ).definition as string;
  }, 60000);
  afterEach(async () => {
    if (db && !db.closed && realClockDefinition) {
      await db.exec(realClockDefinition);
      expect(
        (await one("SELECT pg_get_functiondef('bfa_p5_voice.ms()'::regprocedure) AS definition;"))
          .definition,
      ).toBe(realClockDefinition);
    }
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
    const hooks: { afterCommit?: (name: string, data: unknown) => Promise<unknown> } = {};
    const client = {
      async rpc(name: string, args: Args) {
        const call = { name, args, committed: false };
        calls.push(call);
        const data = await raw(name, args);
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
      mark: createVoiceV2MarkRpcPorts(client),
      capacity: createVoiceV2CapacityRpcPorts(client),
      ports: createVoiceV2CleanupRpcPorts(client),
      proofs: createVoiceV2ProofRpcPorts(client),
      parents: createVoiceV2ParentIssuanceRpcPorts(client),
      preissue: createVoiceV2PreissueRpcPorts(client),
    };
  }
  const proofPorts = () => transport().proofs;
  async function setClock(value: number) {
    expect(Number.isInteger(value)).toBe(true);
    await database().exec(
      `CREATE OR REPLACE FUNCTION bfa_p5_voice.ms() RETURNS bigint LANGUAGE sql VOLATILE SET search_path=pg_catalog,pg_temp AS $$ SELECT ${value}::bigint $$;`,
    );
  }
  async function fixture(existingPool?: string, at = Date.now()) {
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
    const issuance: VoiceV2IssuanceRegistration = {
      ownerId,
      authSessionId,
      parentVersion: 0,
      threadId,
      threadIncarnation: g!.threadIncarnation,
      threadRevision: 0,
      authorityFingerprint: digest(),
      verifiedAt: now,
      authExpiresAt: now + 1800000,
      issuedAt: now,
      expiresAt: now + 60000,
    };
    expect(await t.parents.registerIssuance(issuance)).toMatchObject({
      authorityFingerprint: issuance.authorityFingerprint,
    });
    const q = {
      cleanupId: randomUUID(),
      authSessionId,
      parentVersion: 0,
      authorityFingerprint: issuance.authorityFingerprint,
      verifiedAt: now,
      authExpiresAt: now + 1800000,
      claim: {
        claimId: randomUUID(),
        expiresAt: now + 90000,
        binding: {
          ownerId,
          threadId,
          threadIncarnation: g!.threadIncarnation,
          threadRevision: 0,
          attemptId: randomUUID(),
          approvalId: randomUUID(),
          approvalDigest: digest(),
          scope: "developer-voice-session" as const,
        },
      },
    };
    expect(await t.ports.registerCleanup(q)).toMatchObject({ protocol: 2, cleanupId: q.cleanupId });
    const policyId = randomUUID(),
      binding = q.claim.binding;
    await database().query(
      "INSERT INTO bfa_p5_voice.approvals VALUES($1,$2,$3,$4,$5,$6,$7,'developer-voice-session',$8,false,$9);",
      [
        binding.approvalId,
        binding.approvalDigest,
        ownerId,
        threadId,
        binding.threadIncarnation,
        0,
        binding.attemptId,
        now + 60000,
        policyId,
      ],
    );
    const proof: FixtureProof = {
      protocol: 2,
      receiptId: randomUUID(),
      operation: "claim",
      claim: q.claim,
      cleanupId: q.cleanupId,
      authSessionId,
      parentVersion: 0,
      authorityFingerprint: q.authorityFingerprint,
      identityExpiresAt: now + 60000,
      verifiedAt: now,
      expiresAt: now + 10000,
      effectiveExpiresAt: now + 60000,
    };
    const poolId = existingPool ?? randomUUID();
    await database().query("INSERT INTO bfa_p5_voice.quotas VALUES($1,$2,30,3,true);", [
      ownerId,
      policyId,
    ]);
    if (!existingPool)
      await database().query(
        "INSERT INTO bfa_p5_capacity.pools(pool_id,active_limit,unit_limit,reservation_units,enabled) VALUES($1,5,30,3,true);",
        [poolId],
      );
    await database().query("INSERT INTO bfa_p5_capacity.routes VALUES($1,$2,$3);", [
      ownerId,
      policyId,
      poolId,
    ]);
    return { q, proof, issuance, now, policyId, poolId };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const claimRow = (f: Fixture) =>
    one("SELECT * FROM bfa_p5_voice.claims WHERE claim_id=$1;", [f.proof.claim.claimId]);
  const cleanupRow = (f: Fixture) =>
    one("SELECT * FROM bfa_p5_voice.cleanup_owners WHERE cleanup_id=$1;", [f.q.cleanupId]);
  const allocation = (f: Fixture) =>
    one("SELECT * FROM bfa_p5_capacity.allocations WHERE claim_id=$1;", [f.proof.claim.claimId]);
  const proofRow = (p: VoiceV2ProofRegistration) =>
    one("SELECT * FROM bfa_p5_voice.proofs WHERE receipt_id=$1;", [p.receiptId]);
  const pool = (f: Fixture) =>
    one("SELECT * FROM bfa_p5_capacity.pools WHERE pool_id=$1;", [f.poolId]);
  const quota = (f: Fixture) =>
    one("SELECT * FROM bfa_p5_voice.quotas WHERE owner_id=$1 AND policy_id=$2;", [
      f.proof.claim.binding.ownerId,
      f.policyId,
    ]);
  const ack = (p: VoiceV2ProofRegistration, status: "claimed" | "denied" | "closed") => ({
    protocol: 2,
    proof: p,
    status,
  });
  async function issue(f: Fixture, operation: "claim" | "inspect" = "claim") {
    const p: FixtureProof = structuredClone(f.proof);
    p.receiptId = randomUUID();
    p.operation = operation;
    expect(await proofPorts().registerProof(p)).toEqual(p);
    return p;
  }
  async function admit(f: Fixture) {
    const p = await issue(f);
    expect(await transport().capacity.claim(p)).toEqual(ack(p, "claimed"));
    return p;
  }
  async function close(f: Fixture) {
    return (
      await asRole("service_role", "SELECT public.bfa_p5_capacity_close($1,$2::jsonb) AS value;", [
        f.q.cleanupId,
        JSON.stringify(f.q.claim),
      ])
    ).value;
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
  async function preserved(
    before: Awaited<ReturnType<typeof snapshot>>,
    f: Fixture,
    p: VoiceV2ProofRegistration,
    allowed: string[] = [],
  ) {
    const after = await snapshot(),
      b = p.claim.binding;
    const target: Record<string, (r: Record<string, unknown>) => boolean> = {
      "bfa_p5_voice.owner_clocks": (r) => r.owner_id === b.ownerId,
      "bfa_p5_voice.proofs": (r) => r.receipt_id === p.receiptId,
      "bfa_p5_voice.cleanup_owners": (r) => r.cleanup_id === p.cleanupId,
      "bfa_p5_voice.claims": (r) => r.claim_id === p.claim.claimId,
      "bfa_p5_voice.attempts": (r) => r.owner_id === b.ownerId && r.attempt_id === b.attemptId,
      "bfa_p5_voice.quotas": (r) => r.owner_id === b.ownerId && r.policy_id === f.policyId,
      "bfa_p5_capacity.pools": (r) => r.pool_id === f.poolId,
      "bfa_p5_capacity.allocations": (r) => r.claim_id === p.claim.claimId,
    };
    for (const table of tables) {
      if (allowed.includes(table)) {
        expect(target[table]).toBeTypeOf("function");
        expect(
          after[table]!.filter((r) => !target[table]!(r)),
          table,
        ).toEqual(before[table]!.filter((r) => !target[table]!(r)));
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

  async function insertProof(
    p: VoiceV2ProofRegistration,
    protocol: number | null = 2,
    consumed: number | null = null,
  ) {
    await database().query(
      "INSERT INTO bfa_p5_voice.proofs(receipt_id,operation,cleanup_id,claim_id,owner_id,claim,session_id,session_version,authority_fingerprint,identity_expires_ms,verified_ms,expires_ms,effective_expires_ms,consumed_ms,protocol) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15);",
      [
        p.receiptId,
        p.operation,
        p.cleanupId,
        p.claim.claimId,
        p.claim.binding.ownerId,
        JSON.stringify(p.claim),
        p.authSessionId,
        p.parentVersion,
        p.authorityFingerprint,
        p.identityExpiresAt,
        p.verifiedAt,
        p.expiresAt,
        p.effectiveExpiresAt,
        consumed,
        protocol,
      ],
    );
  }
  async function seedBaseClaim(f: Fixture) {
    const p = f.proof;
    await database().query(
      "INSERT INTO bfa_p5_voice.claims VALUES($1,$2,$3::jsonb,$4,'claimed',$5,3);",
      [
        p.claim.claimId,
        p.claim.binding.ownerId,
        JSON.stringify(p.claim),
        p.effectiveExpiresAt,
        f.policyId,
      ],
    );
    await database().query("INSERT INTO bfa_p5_voice.attempts VALUES($1,$2,$3,false);", [
      p.claim.binding.ownerId,
      p.claim.binding.attemptId,
      p.claim.claimId,
    ]);
    await database().query(
      "UPDATE bfa_p5_voice.quotas SET remaining_units=27 WHERE owner_id=$1 AND policy_id=$2;",
      [p.claim.binding.ownerId, f.policyId],
    );
  }
  async function assertConsumed(p: VoiceV2ProofRegistration, before: Record<string, unknown>) {
    const after = await proofRow(p);
    expect(after.consumed_ms).not.toBeNull();
    expect({ ...after, consumed_ms: null }).toEqual({ ...before, consumed_ms: null });
  }
  async function assertAccounting(f: Fixture, admitted: boolean, occupied = admitted ? 1 : 0) {
    expect(await quota(f)).toMatchObject({
      remaining_units: admitted ? 27 : 30,
      reservation_units: 3,
    });
    expect(await pool(f)).toMatchObject({ occupied, held_units: admitted ? 3 : 0 });
    if (admitted)
      expect(await claimRow(f)).toMatchObject({ held_units: 3, quota_policy_id: f.policyId });
    else expect(await claimRow(f)).toBeUndefined();
  }

  const request = (
    proof: VoiceV2ProofRegistration,
    operationId: string = randomUUID(),
    expectedPoolVersion = 1,
  ): VoiceV2MarkRequest => ({
    protocol: 2,
    proof,
    operationId,
    expectedPoolVersion,
  });
  const markedAck = (
    q: VoiceV2MarkRequest,
    status: "marked" | "already-marked" | "denied" | "quarantined" | "closed",
  ) => ({ protocol: 2, request: q, status });
  const consumeOnly = ["bfa_p5_voice.proofs", "bfa_p5_voice.owner_clocks"];
  const terminalChanges = [
    ...consumeOnly,
    "bfa_p5_voice.cleanup_owners",
    "bfa_p5_voice.claims",
    "bfa_p5_capacity.allocations",
    "bfa_p5_capacity.pools",
  ];
  async function ready() {
    const f = await fixture();
    await admit(f);
    const p = await issue(f, "inspect");
    return { f, p, q: request(p) };
  }

  it("composes real v2 admission and a separate fresh inspect receipt into one immutable marker without another debit", async () => {
    const f = await fixture();
    await seedHolds(f.issuance);
    const admitted = await admit(f),
      p = await issue(f, "inspect"),
      q = request(p);
    expect(p.receiptId).not.toBe(admitted.receiptId);
    const original = await proofRow(p),
      retained = await allocation(f),
      before = await snapshot(),
      t = transport();
    expect(await t.mark.mark(q)).toEqual(markedAck(q, "marked"));
    expect(t.calls).toEqual([
      { name: "bfa_p5_v2_capacity_mark", args: { p_request: q }, committed: true },
    ]);
    await assertConsumed(p, original);
    expect(await allocation(f)).toEqual({ ...retained, operation_id: q.operationId });
    await assertAccounting(f, true);
    await preserved(before, f, p, [...consumeOnly, "bfa_p5_capacity.allocations"]);
  });

  it("accepts a retained reservation at both exact pool limits with no remaining quota", async () => {
    const { f, p, q } = await ready();
    await database().query(
      "UPDATE bfa_p5_voice.quotas SET remaining_units=0 WHERE owner_id=$1 AND policy_id=$2;",
      [p.claim.binding.ownerId, f.policyId],
    );
    await database().query(
      "UPDATE bfa_p5_capacity.pools SET active_limit=1,unit_limit=3 WHERE pool_id=$1;",
      [f.poolId],
    );
    const before = await snapshot();
    expect(await transport().mark.mark(q)).toEqual(markedAck(q, "marked"));
    await preserved(before, f, p, [...consumeOnly, "bfa_p5_capacity.allocations"]);
    expect(await quota(f)).toMatchObject({ remaining_units: 0 });
    expect(await pool(f)).toMatchObject({ occupied: 1, held_units: 3 });
  });

  it("denies consumed receipt replay and treats a distinct same-operation proof as an observation only", async () => {
    const { f, q } = await ready();
    expect(await transport().mark.mark(q)).toEqual(markedAck(q, "marked"));
    const committed = await snapshot();
    expect(await transport().mark.mark(q)).toEqual(markedAck(q, "denied"));
    expect(await snapshot()).toEqual(committed);
    const p2 = await issue(f, "inspect"),
      q2 = request(p2, q.operationId),
      before = await snapshot();
    expect(await transport().mark.mark(q2)).toEqual(markedAck(q2, "already-marked"));
    await preserved(before, f, p2, consumeOnly);
    await assertAccounting(f, true);
    // This is a database observation; no provider operation exists in the fixture.
    const p3 = await issue(f, "inspect"),
      q3 = request(p3),
      after = await snapshot();
    expect(await transport().mark.mark(q3)).toEqual(markedAck(q3, "denied"));
    expect((await allocation(f)).operation_id).toBe(q.operationId);
    await preserved(after, f, p3, consumeOnly);
  });

  it.each(["shared pool", "different pools"])(
    "preserves global operation identity across both sequential owner orderings with %s",
    async (pools) => {
      // Each ordering has different owners and fresh state. These are committed
      // sequential orderings, not native concurrent advisory-lock scheduling.
      for (const reverse of [false, true]) {
        const now = Date.now(),
          a = await fixture(undefined, now),
          b = await fixture(pools === "shared pool" ? a.poolId : undefined, now);
        await admit(a);
        await admit(b);
        const [winner, loser] = reverse ? [b, a] : [a, b];
        const wp = await issue(winner, "inspect"),
          lp = await issue(loser, "inspect"),
          op = randomUUID(),
          wq = request(wp, op),
          lq = request(lp, op);
        expect(await transport().mark.mark(wq)).toEqual(markedAck(wq, "marked"));
        const before = await snapshot(),
          original = await proofRow(lp);
        expect(await transport().mark.mark(lq)).toEqual(markedAck(lq, "denied"));
        await assertConsumed(lp, original);
        expect((await allocation(loser)).operation_id).toBeNull();
        expect((await allocation(winner)).operation_id).toBe(op);
        await preserved(before, loser, lp, consumeOnly);
        expect(await quota(winner)).toMatchObject({ remaining_units: 27 });
        expect(await quota(loser)).toMatchObject({ remaining_units: 27 });
        expect(await pool(a)).toMatchObject({
          occupied: pools === "shared pool" ? 2 : 1,
          held_units: pools === "shared pool" ? 6 : 3,
        });
      }
    },
  );

  it.each(["before admission", "base-only claim"])(
    "cannot create capacity from %s",
    async (state) => {
      const f = await fixture();
      if (state === "base-only claim") await seedBaseClaim(f);
      const p: FixtureProof = { ...f.proof, operation: "inspect" };
      // Administrative proof insertion exercises consumer defense; registration
      // would deny the absent-claim case. There is intentionally no allocation.
      await insertProof(p);
      const q = request(p),
        original = await proofRow(p),
        before = await snapshot();
      expect(await transport().mark.mark(q)).toEqual(markedAck(q, "denied"));
      await assertConsumed(p, original);
      await preserved(before, f, p, consumeOnly);
      expect(await allocation(f)).toBeUndefined();
      expect(await pool(f)).toMatchObject({ occupied: 0, held_units: 0 });
      expect(await quota(f)).toMatchObject({
        remaining_units: state === "base-only claim" ? 27 : 30,
      });
    },
  );

  const changedTuple: [string, (p: FixtureProof) => void][] = [
    [
      "receipt",
      (p) => {
        p.receiptId = randomUUID();
      },
    ],
    [
      "cleanup",
      (p) => {
        p.cleanupId = randomUUID();
      },
    ],
    [
      "Auth session",
      (p) => {
        p.authSessionId = randomUUID();
      },
    ],
    [
      "parent version",
      (p) => {
        p.parentVersion++;
      },
    ],
    [
      "issuance fingerprint",
      (p) => {
        p.authorityFingerprint = digest();
      },
    ],
    [
      "identity expiry",
      (p) => {
        p.identityExpiresAt++;
      },
    ],
    [
      "original verification",
      (p) => {
        p.verifiedAt--;
      },
    ],
    [
      "receipt expiry",
      (p) => {
        p.expiresAt--;
      },
    ],
    [
      "effective expiry",
      (p) => {
        p.effectiveExpiresAt--;
      },
    ],
    [
      "full claim",
      (p) => {
        p.claim.binding.approvalDigest = digest();
      },
    ],
    [
      "owner",
      (p) => {
        p.claim.binding.ownerId = randomUUID();
      },
    ],
  ];
  it.each(changedTuple)(
    "does not consume a stored proof for mismatched %s",
    async (_label, change) => {
      const { p } = await ready(),
        candidate = structuredClone(p);
      change(candidate);
      const q = request(candidate),
        before = await snapshot();
      expect(await transport().mark.mark(q)).toEqual(markedAck(q, "denied"));
      expect(await snapshot()).toEqual(before);
      expect((await proofRow(p)).consumed_ms).toBeNull();
    },
  );

  it("does not adopt a stored legacy proof", async () => {
    const { p, q } = await ready();
    await database().query("UPDATE bfa_p5_voice.proofs SET protocol=NULL WHERE receipt_id=$1;", [
      p.receiptId,
    ]);
    const before = await snapshot();
    expect(await transport().mark.mark(q)).toEqual(markedAck(q, "denied"));
    expect(await snapshot()).toEqual(before);
  });

  it.each([
    "wrong operation",
    "wrong protocol",
    "extra key",
    "nil operation",
    "zero version",
    "unsafe version",
    "string version",
  ])("rejects direct SQL %s before consuming a proof", async (kind) => {
    const { q } = await ready(),
      candidate: Record<string, unknown> = { ...structuredClone(q) };
    if (kind === "wrong operation") (candidate.proof as FixtureProof).operation = "claim";
    if (kind === "wrong protocol") candidate.protocol = 1;
    if (kind === "extra key") candidate.allow = true;
    if (kind === "nil operation") candidate.operationId = "00000000-0000-0000-0000-000000000000";
    if (kind === "zero version") candidate.expectedPoolVersion = 0;
    if (kind === "unsafe version") candidate.expectedPoolVersion = 9007199254740992;
    if (kind === "string version") candidate.expectedPoolVersion = "1";
    const before = await snapshot();
    await expect(raw("bfa_p5_v2_capacity_mark", { p_request: candidate })).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });

  const currentPolicy: [string, (f: Fixture) => Promise<unknown>, "denied" | "quarantined"][] = [
    [
      "retired attempt",
      (f) =>
        database().query(
          "UPDATE bfa_p5_voice.attempts SET retired=true,winner_claim_id=NULL WHERE owner_id=$1 AND attempt_id=$2;",
          [f.proof.claim.binding.ownerId, f.proof.claim.binding.attemptId],
        ),
      "denied",
    ],
    [
      "different attempt winner",
      (f) =>
        database().query(
          "UPDATE bfa_p5_voice.attempts SET winner_claim_id=$1 WHERE owner_id=$2 AND attempt_id=$3;",
          [randomUUID(), f.proof.claim.binding.ownerId, f.proof.claim.binding.attemptId],
        ),
      "denied",
    ],
    [
      "missing allocation",
      (f) =>
        database().query("DELETE FROM bfa_p5_capacity.allocations WHERE claim_id=$1;", [
          f.proof.claim.claimId,
        ]),
      "denied",
    ],
    [
      "closed allocation",
      (f) =>
        database().query("UPDATE bfa_p5_capacity.allocations SET closed=true WHERE claim_id=$1;", [
          f.proof.claim.claimId,
        ]),
      "denied",
    ],
    [
      "released slot",
      (f) =>
        database().query(
          "UPDATE bfa_p5_capacity.allocations SET slot_held=false WHERE claim_id=$1;",
          [f.proof.claim.claimId],
        ),
      "denied",
    ],
    [
      "allocation units mismatch",
      (f) =>
        database().query("UPDATE bfa_p5_capacity.allocations SET units=2 WHERE claim_id=$1;", [
          f.proof.claim.claimId,
        ]),
      "denied",
    ],
    [
      "disabled quota",
      (f) =>
        database().query(
          "UPDATE bfa_p5_voice.quotas SET enabled=false WHERE owner_id=$1 AND policy_id=$2;",
          [f.proof.claim.binding.ownerId, f.policyId],
        ),
      "denied",
    ],
    [
      "missing route",
      (f) =>
        database().query(
          "DELETE FROM bfa_p5_capacity.routes WHERE owner_id=$1 AND quota_policy_id=$2;",
          [f.proof.claim.binding.ownerId, f.policyId],
        ),
      "denied",
    ],
    [
      "route rebound",
      async (f) => {
        const replacement = randomUUID();
        await database().query(
          "INSERT INTO bfa_p5_capacity.pools(pool_id,active_limit,unit_limit,reservation_units,enabled) VALUES($1,5,30,3,true);",
          [replacement],
        );
        return database().query(
          "UPDATE bfa_p5_capacity.routes SET pool_id=$1 WHERE owner_id=$2 AND quota_policy_id=$3;",
          [replacement, f.proof.claim.binding.ownerId, f.policyId],
        );
      },
      "denied",
    ],
    [
      "disabled pool",
      (f) =>
        database().query("UPDATE bfa_p5_capacity.pools SET enabled=false WHERE pool_id=$1;", [
          f.poolId,
        ]),
      "denied",
    ],
    [
      "quarantined pool",
      (f) =>
        database().query("UPDATE bfa_p5_capacity.pools SET quarantined=true WHERE pool_id=$1;", [
          f.poolId,
        ]),
      "quarantined",
    ],
    [
      "changed pool version",
      (f) =>
        database().query("UPDATE bfa_p5_capacity.pools SET version=2 WHERE pool_id=$1;", [
          f.poolId,
        ]),
      "denied",
    ],
    [
      "occupancy above current limit",
      (f) =>
        database().query("UPDATE bfa_p5_capacity.pools SET active_limit=0 WHERE pool_id=$1;", [
          f.poolId,
        ]),
      "denied",
    ],
    [
      "cumulative holds above current limit",
      (f) =>
        database().query("UPDATE bfa_p5_capacity.pools SET unit_limit=2 WHERE pool_id=$1;", [
          f.poolId,
        ]),
      "denied",
    ],
    [
      "pool reservation size changed",
      (f) =>
        database().query("UPDATE bfa_p5_capacity.pools SET reservation_units=2 WHERE pool_id=$1;", [
          f.poolId,
        ]),
      "denied",
    ],
    [
      "quota reservation size changed",
      (f) =>
        database().query(
          "UPDATE bfa_p5_voice.quotas SET reservation_units=2 WHERE owner_id=$1 AND policy_id=$2;",
          [f.proof.claim.binding.ownerId, f.policyId],
        ),
      "denied",
    ],
    [
      "approval rebound to another policy",
      (f) =>
        database().query(
          "UPDATE bfa_p5_voice.approvals SET quota_policy_id=$1 WHERE approval_id=$2;",
          [randomUUID(), f.proof.claim.binding.approvalId],
        ),
      "denied",
    ],
  ];
  it.each(currentPolicy)(
    "burns one exact proof when %s blocks the marker without changing accounting",
    async (_label, change, status) => {
      const { f, p, q } = await ready();
      await change(f);
      const before = await snapshot(),
        original = await proofRow(p);
      expect(await transport().mark.mark(q)).toEqual(markedAck(q, status));
      await assertConsumed(p, original);
      await preserved(before, f, p, consumeOnly);
      const denied = await snapshot();
      expect(await transport().mark.mark(q)).toEqual(markedAck(q, "denied"));
      expect(await snapshot()).toEqual(denied);
    },
  );

  it.each([
    "changed pool version",
    "disabled quota",
    "quarantined pool",
    "approval rebound to another policy",
  ])("rechecks %s before reporting an existing marker", async (label) => {
    const { f, q } = await ready();
    expect(await transport().mark.mark(q)).toEqual(markedAck(q, "marked"));
    const p = await issue(f, "inspect"),
      next = request(p, q.operationId);
    const [, change, status] = currentPolicy.find(([name]) => name === label)!;
    await change(f);
    const before = await snapshot();
    expect(await transport().mark.mark(next)).toEqual(markedAck(next, status));
    expect((await allocation(f)).operation_id).toBe(q.operationId);
    await preserved(before, f, p, consumeOnly);
  });

  it("uses the current expected pool version without rewriting the admission allocation version", async () => {
    const { f, p } = await ready();
    await database().query("UPDATE bfa_p5_capacity.pools SET version=2 WHERE pool_id=$1;", [
      f.poolId,
    ]);
    const q = request(p, randomUUID(), 2),
      before = await snapshot();
    expect(await transport().mark.mark(q)).toEqual(markedAck(q, "marked"));
    expect(await allocation(f)).toMatchObject({ pool_version: 1, operation_id: q.operationId });
    await preserved(before, f, p, [...consumeOnly, "bfa_p5_capacity.allocations"]);
  });

  const currentIdentity: [string, (f: Fixture) => Promise<unknown>][] = [
    [
      "parent revoked",
      (f) =>
        transport().parents.revokeParent({
          ownerId: f.proof.claim.binding.ownerId,
          authSessionId: f.proof.authSessionId,
        }),
    ],
    [
      "legacy fence retained",
      (f) =>
        database().query(
          "INSERT INTO bfa_p5_voice.session_fences(owner_id,session_id,version,revoked,expires_ms) VALUES($1,$2,0,false,$3);",
          [f.proof.claim.binding.ownerId, f.proof.authSessionId, f.now + 60000],
        ),
    ],
    [
      "issuance association absent",
      (f) =>
        database().query(
          "DELETE FROM bfa_p5_voice_v2.issuance_auth_bindings WHERE fingerprint=$1;",
          [f.proof.authorityFingerprint],
        ),
    ],
    [
      "cleanup not protocol two",
      (f) =>
        database().query(
          "UPDATE bfa_p5_voice.cleanup_owners SET protocol=NULL WHERE cleanup_id=$1;",
          [f.proof.cleanupId],
        ),
    ],
    [
      "approval digest mismatch",
      (f) =>
        database().query("UPDATE bfa_p5_voice.approvals SET digest=$1 WHERE approval_id=$2;", [
          digest(),
          f.proof.claim.binding.approvalId,
        ]),
    ],
  ];
  it.each(currentIdentity)(
    "rechecks %s with no fabricated revocation or accounting writes",
    async (_label, change) => {
      const { f, p, q } = await ready();
      await change(f);
      const before = await snapshot(),
        original = await proofRow(p);
      expect(await transport().mark.mark(q)).toEqual(markedAck(q, "denied"));
      await assertConsumed(p, original);
      await preserved(before, f, p, consumeOnly);
      await assertAccounting(f, true);
    },
  );

  it.each(["cancel", "delete", "approval revoked", "issuance revoked", "allowlist withdrawn"])(
    "retains exact terminal %s evidence and releases only an unmarked slot",
    async (kind) => {
      const { f, p, q } = await ready();
      await seedHolds(f.issuance);
      if (kind === "cancel" || kind === "delete")
        await asRole("service_role", "SELECT public.bfa_p3b_fence($1,$2,$3);", [
          p.claim.binding.ownerId,
          p.claim.binding.threadId,
          kind,
        ]);
      if (kind === "approval revoked")
        await database().query(
          "UPDATE bfa_p5_voice.approvals SET revoked=true WHERE approval_id=$1;",
          [p.claim.binding.approvalId],
        );
      if (kind === "issuance revoked")
        await database().query(
          "UPDATE bfa_p5_voice.issuances SET revoked=true WHERE fingerprint=$1;",
          [p.authorityFingerprint],
        );
      if (kind === "allowlist withdrawn")
        await database().query(
          "UPDATE public.bfa_p3b_staging_accounts SET admitted=false WHERE user_id=$1;",
          [p.claim.binding.ownerId],
        );
      const before = await snapshot();
      expect(await transport().mark.mark(q)).toEqual(markedAck(q, "denied"));
      expect(await allocation(f)).toMatchObject({
        closed: true,
        slot_held: false,
        operation_id: null,
      });
      expect(await cleanupRow(f)).toMatchObject({ invalidated_ms: f.now });
      expect(await claimRow(f)).toMatchObject({ state: "invalidated", held_units: 3 });
      await assertAccounting(f, true, 0);
      await preserved(before, f, p, terminalChanges);
    },
  );

  it("retains a shorter current approval ceiling without rewriting the original proof", async () => {
    const { f, p, q } = await ready(),
      original = await proofRow(p);
    await database().query(
      "UPDATE bfa_p5_voice.approvals SET expires_ms=$1 WHERE approval_id=$2;",
      [f.now + 5000, p.claim.binding.approvalId],
    );
    const before = await snapshot();
    expect(await transport().mark.mark(q)).toEqual(markedAck(q, "denied"));
    await assertConsumed(p, original);
    expect(await cleanupRow(f)).toMatchObject({
      effective_expires_ms: f.now + 5000,
      expired_ms: null,
    });
    expect(await claimRow(f)).toMatchObject({
      effective_expires_ms: f.now + 5000,
      state: "claimed",
    });
    await preserved(before, f, p, [
      ...consumeOnly,
      "bfa_p5_voice.cleanup_owners",
      "bfa_p5_voice.claims",
    ]);
    await assertAccounting(f, true);
  });

  it.each(["receipt expiry", "original age", "rollback"])(
    "burns and denies at %s without refreshing the original receipt",
    async (boundary) => {
      const f = await fixture();
      await admit(f);
      if (boundary === "original age") f.proof.expiresAt = f.now + 30000;
      const p = await issue(f, "inspect"),
        q = request(p),
        original = await proofRow(p);
      await setClock(
        boundary === "rollback" ? f.now - 1 : f.now + (boundary === "original age" ? 30000 : 10000),
      );
      const before = await snapshot();
      expect(await transport().mark.mark(q)).toEqual(markedAck(q, "denied"));
      await assertConsumed(p, original);
      await preserved(before, f, p, consumeOnly);
      await setClock(f.now + 1);
      const denied = await snapshot();
      expect(await transport().mark.mark(q)).toEqual(markedAck(q, "denied"));
      expect(await snapshot()).toEqual(denied);
    },
  );

  it.each(["NULL", "-1", "9007199254740992"])(
    "burns exact receipt with the unknown-time zero fence on unsafe initial clock %s",
    async (sample) => {
      const { f, p, q } = await ready();
      await database().exec(
        `CREATE OR REPLACE FUNCTION bfa_p5_voice.ms() RETURNS bigint LANGUAGE sql VOLATILE SET search_path=pg_catalog,pg_temp AS $$ SELECT ${sample}::bigint $$;`,
      );
      const before = await snapshot();
      expect(await transport().mark.mark(q)).toEqual(markedAck(q, "denied"));
      expect((await proofRow(p)).consumed_ms).toBe(0);
      await preserved(before, f, p, ["bfa_p5_voice.proofs"]);
      await setClock(f.now + 1);
      const denied = await snapshot();
      expect(await transport().mark.mark(q)).toEqual(markedAck(q, "denied"));
      expect(await snapshot()).toEqual(denied);
    },
  );

  it.each(["receipt expiry", "original age", "rollback"])(
    "rechecks %s after the final pool/global-operation lock stage",
    async (boundary) => {
      const f = await fixture();
      await admit(f);
      if (boundary === "original age") f.proof.expiresAt = f.now + 30000;
      const p = await issue(f, "inspect"),
        q = request(p),
        original = await proofRow(p),
        before = await snapshot();
      // Controlled sequential clock samples model a wait boundary, not native
      // concurrent sessions, actual lock scheduling, or real Auth passage of time.
      const late =
        boundary === "rollback" ? f.now - 1 : f.now + (boundary === "original age" ? 30000 : 10000);
      await database().exec("CREATE TEMP SEQUENCE bfa_v2_mark_clock MINVALUE 0 START 0;");
      await database().exec(
        `CREATE OR REPLACE FUNCTION bfa_p5_voice.ms() RETURNS bigint LANGUAGE sql VOLATILE SET search_path=pg_catalog,pg_temp AS $$ SELECT CASE WHEN nextval('pg_temp.bfa_v2_mark_clock')<2 THEN ${f.now}::bigint ELSE ${late}::bigint END $$;`,
      );
      try {
        expect(await transport().mark.mark(q)).toEqual(markedAck(q, "denied"));
        expect(
          Number((await one("SELECT last_value FROM pg_temp.bfa_v2_mark_clock;")).last_value),
        ).toBeGreaterThanOrEqual(2);
        await assertConsumed(p, original);
        expect((await allocation(f)).operation_id).toBeNull();
        await preserved(before, f, p, consumeOnly);
      } finally {
        await setClock(f.now);
        await database().exec("DROP SEQUENCE pg_temp.bfa_v2_mark_clock;");
      }
    },
  );

  it("preserves closed status when exact legacy close wins before marking", async () => {
    const { f, p, q } = await ready();
    await close(f);
    const before = await snapshot(),
      original = await proofRow(p);
    expect(await transport().mark.mark(q)).toEqual(markedAck(q, "closed"));
    await assertConsumed(p, original);
    await preserved(before, f, p, ["bfa_p5_voice.proofs"]);
    await assertAccounting(f, true, 0);
    expect((await allocation(f)).operation_id).toBeNull();
  });

  it("retains a real v2 marker's uncertain slot through terminal fencing and old exact close until fictional whole-operation finality", async () => {
    const { f, q } = await ready();
    await seedHolds(f.issuance);
    expect(await transport().mark.mark(q)).toEqual(markedAck(q, "marked"));
    const p = await issue(f, "inspect"),
      next = request(p, q.operationId);
    await database().query("UPDATE bfa_p5_voice.approvals SET revoked=true WHERE approval_id=$1;", [
      p.claim.binding.approvalId,
    ]);
    const before = await snapshot();
    expect(await transport().mark.mark(next)).toEqual(markedAck(next, "denied"));
    await preserved(before, f, p, terminalChanges);
    await close(f);
    expect(await allocation(f)).toMatchObject({
      closed: true,
      slot_held: true,
      operation_id: q.operationId,
    });
    await assertAccounting(f, true);
    const reconcile = async (kind: string) =>
      (
        await asRole(
          "service_role",
          "SELECT public.bfa_p5_capacity_reconcile($1,$2::jsonb,$3::jsonb) AS value;",
          [
            p.cleanupId,
            JSON.stringify(p.claim),
            JSON.stringify({
              evidenceId: randomUUID(),
              operationId: q.operationId,
              kind,
              sessionId: null,
            }),
          ],
        )
      ).value;
    expect(await reconcile("unknown")).toMatchObject({ state: "uncertain" });
    await assertAccounting(f, true);
    expect(await reconcile("not-created")).toMatchObject({ state: "terminal-recorded" });
    expect(await allocation(f)).toMatchObject({
      closed: true,
      slot_held: false,
      terminal: "not-created",
      operation_id: q.operationId,
    });
    await assertAccounting(f, true, 0);
    // Explicit fictional whole-operation observation; no provider evidence.
  });

  it.each(["lost", "malformed"])(
    "keeps the committed marker after a %s reply without retry or replacement identity",
    async (kind) => {
      const { f, p, q } = await ready(),
        t = transport(),
        before = await snapshot();
      t.hooks.afterCommit = async () => {
        if (kind === "lost") throw new Error("Fictional lost response");
        return { protocol: 2, request: { ...q, operationId: randomUUID() }, status: "marked" };
      };
      await expect(t.mark.mark(q)).rejects.toThrow("voice-v2-mark-rpc-unavailable");
      expect(t.calls).toHaveLength(1);
      expect(t.calls[0]!.committed).toBe(true);
      expect((await allocation(f)).operation_id).toBe(q.operationId);
      expect((await proofRow(p)).consumed_ms).not.toBeNull();
      await preserved(before, f, p, [...consumeOnly, "bfa_p5_capacity.allocations"]);
      const committed = await snapshot();
      expect(await transport().mark.mark(q)).toEqual(markedAck(q, "denied"));
      expect(await snapshot()).toEqual(committed);
      // Local after-COMMIT doubles are not actual HTTP fault injection.
    },
  );

  it("rolls back consumption and marker atomically on an unexpected allocation-write exception", async () => {
    const { f, q } = await ready(),
      before = await snapshot(),
      t = transport();
    await database().exec(
      `CREATE FUNCTION pg_temp.fail_v2_mark() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.claim_id='${f.proof.claim.claimId}'::uuid AND NEW.operation_id IS NOT NULL THEN RAISE EXCEPTION 'Fictional marker write failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_v2_mark BEFORE UPDATE ON bfa_p5_capacity.allocations FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_v2_mark();`,
    );
    try {
      await expect(t.mark.mark(q)).rejects.toThrow("voice-v2-mark-rpc-unavailable");
      expect(t.calls).toHaveLength(1);
      expect(t.calls[0]!.committed).toBe(false);
      expect(await snapshot()).toEqual(before);
    } finally {
      await database().exec(
        "DROP TRIGGER fail_v2_mark ON bfa_p5_capacity.allocations; DROP FUNCTION pg_temp.fail_v2_mark();",
      );
    }
  });

  it.each(["anon", "authenticated"] as const)(
    "denies %s direct access without mutation",
    async (role) => {
      const { q } = await ready(),
        before = await snapshot();
      await expect(raw("bfa_p5_v2_capacity_mark", { p_request: q }, role)).rejects.toThrow();
      expect(await snapshot()).toEqual(before);
    },
  );

  it("exposes only the new service-role marker and keeps all private helpers/tables inaccessible", async () => {
    const row = await one(
      "SELECT p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') AS anon,has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role,EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute FROM pg_proc p WHERE p.oid='public.bfa_p5_v2_capacity_mark(jsonb)'::regprocedure;",
    );
    expect(row).toEqual({
      prosecdef: true,
      proconfig: ["search_path=pg_catalog, pg_temp"],
      anon: false,
      authenticated: false,
      service_role: true,
      public_execute: false,
    });
    const helpers = (
      await database().query(
        "SELECT p.proname,has_function_privilege('anon',p.oid,'EXECUTE') AS anon,has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role,EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='bfa_p5_voice_v2';",
      )
    ).rows;
    expect(helpers.some((r) => r.proname === "mark_ack")).toBe(true);
    expect(helpers.some((r) => r.proname === "mark_denied")).toBe(true);
    for (const r of helpers)
      expect(r).toMatchObject({
        anon: false,
        authenticated: false,
        service_role: false,
        public_execute: false,
      });
    for (const table of tables.filter((t) => !t.startsWith("public.")))
      for (const role of ["anon", "authenticated", "service_role"])
        expect(
          (
            await one(
              "SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') AS allowed;",
              [role, table],
            )
          ).allowed,
        ).toBe(false);
  });
});
