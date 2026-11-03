// Actual isolated PostgreSQL and inactive v2 capacity transport; fictional
// identity/policy/approval metadata only. No Auth, HTTP, provider or device call.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { readFile, readdir, realpath } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
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

sqlSuite("P5 proposed v2 atomic capacity admission in isolated PostgreSQL", () => {
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
          ["p_claim", "p_proof"].includes(key) ? JSON.stringify(value) : value,
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

  it("atomically claims capacity with one shared attempt, quota debit and allocation while preserving unrelated same-owner holds", async () => {
    const f = await fixture();
    await seedHolds(f.issuance);
    const p = await issue(f),
      original = await proofRow(p),
      before = await snapshot(),
      t = transport();
    expect(await t.capacity.claim(p)).toEqual(ack(p, "claimed"));
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0]).toMatchObject({ name: "bfa_p5_v2_capacity_claim", committed: true });
    await assertConsumed(p, original);
    await assertAccounting(f, true);
    expect(await claimRow(f)).toMatchObject({
      claim: p.claim,
      state: "claimed",
      effective_expires_ms: p.effectiveExpiresAt,
    });
    expect(await allocation(f)).toMatchObject({
      owner_id: p.claim.binding.ownerId,
      attempt_id: p.claim.binding.attemptId,
      claim: p.claim,
      cleanup_id: p.cleanupId,
      pool_id: f.poolId,
      pool_version: 1,
      units: 3,
      slot_held: true,
      closed: false,
      operation_id: null,
      session_id: null,
      terminal: null,
    });
    expect(
      await one("SELECT * FROM bfa_p5_voice.attempts WHERE owner_id=$1 AND attempt_id=$2;", [
        p.claim.binding.ownerId,
        p.claim.binding.attemptId,
      ]),
    ).toMatchObject({ winner_claim_id: p.claim.claimId, retired: false });
    await preserved(before, f, p, [
      "bfa_p5_voice.owner_clocks",
      "bfa_p5_voice.proofs",
      "bfa_p5_voice.attempts",
      "bfa_p5_voice.claims",
      "bfa_p5_voice.quotas",
      "bfa_p5_capacity.allocations",
      "bfa_p5_capacity.pools",
    ]);
  });
  it("denies exact receipt replay without another mutation, debit or allocation", async () => {
    const f = await fixture(),
      p = await admit(f),
      before = await snapshot();
    expect(await transport().capacity.claim(p)).toEqual(ack(p, "denied"));
    expect(await snapshot()).toEqual(before);
    await assertAccounting(f, true);
  });
  it.each(["claim", "inspect"] as const)(
    "accepts a deliberate distinct %s proof for an existing allocation with no second charge",
    async (operation) => {
      const f = await fixture();
      await admit(f);
      // A retained reservation does not need enough remaining quota to buy it again.
      await database().query(
        "UPDATE bfa_p5_voice.quotas SET remaining_units=0 WHERE owner_id=$1 AND policy_id=$2;",
        [f.proof.claim.binding.ownerId, f.policyId],
      );
      await database().query(
        "UPDATE bfa_p5_capacity.pools SET active_limit=1,unit_limit=3 WHERE pool_id=$1;",
        [f.poolId],
      );
      const p = await issue(f, operation),
        original = await proofRow(p),
        before = await snapshot();
      expect(await transport().capacity[operation](p)).toEqual(ack(p, "claimed"));
      await assertConsumed(p, original);
      expect(await quota(f)).toMatchObject({ remaining_units: 0 });
      expect(await pool(f)).toMatchObject({ occupied: 1, held_units: 3 });
      await preserved(before, f, p, ["bfa_p5_voice.owner_clocks", "bfa_p5_voice.proofs"]);
    },
  );
  it("cannot use inspect to create a claim, winner, quota debit or capacity", async () => {
    const f = await fixture(),
      p = { ...f.proof, operation: "inspect" as const };
    // Registrar normally refuses this. Administrative seeding tests consumer defense.
    await insertProof(p);
    const original = await proofRow(p),
      before = await snapshot();
    expect(await transport().capacity.inspect(p)).toEqual(ack(p, "denied"));
    await assertConsumed(p, original);
    await assertAccounting(f, false);
    await preserved(before, f, p, ["bfa_p5_voice.owner_clocks", "bfa_p5_voice.proofs"]);
  });
  it.each(["claim", "inspect"] as const)(
    "denies %s for a base-only claim without lazy attachment or another debit",
    async (operation) => {
      const f = await fixture();
      await seedBaseClaim(f);
      const p = await issue(f, operation),
        before = await snapshot(),
        original = await proofRow(p);
      expect(await transport().capacity[operation](p)).toEqual(ack(p, "denied"));
      await assertConsumed(p, original);
      expect(await allocation(f)).toBeUndefined();
      expect(await quota(f)).toMatchObject({ remaining_units: 27 });
      expect(await pool(f)).toMatchObject({ occupied: 0, held_units: 0 });
      await preserved(before, f, p, ["bfa_p5_voice.owner_clocks", "bfa_p5_voice.proofs"]);
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
      "fingerprint",
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
      "verification",
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
      "claim expiry",
      (p) => {
        p.claim.expiresAt++;
      },
    ],
    [
      "claim ID",
      (p) => {
        p.claim.claimId = randomUUID();
      },
    ],
    [
      "owner",
      (p) => {
        p.claim.binding.ownerId = randomUUID();
      },
    ],
    [
      "attempt",
      (p) => {
        p.claim.binding.attemptId = randomUUID();
      },
    ],
    [
      "approval digest",
      (p) => {
        p.claim.binding.approvalDigest = digest();
      },
    ],
  ];
  it.each(changedTuple)(
    "denies a mismatched %s without consuming the stored receipt or touching any protected row",
    async (_label, change) => {
      const f = await fixture(),
        p = await issue(f),
        request = structuredClone(p);
      change(request);
      const before = await snapshot();
      expect(await transport().capacity.claim(request)).toEqual(ack(request, "denied"));
      expect(await snapshot()).toEqual(before);
      expect((await proofRow(p)).consumed_ms).toBeNull();
    },
  );
  it("does not adopt a legacy-protocol stored proof", async () => {
    const f = await fixture(),
      p = await issue(f);
    await database().query("UPDATE bfa_p5_voice.proofs SET protocol=NULL WHERE receipt_id=$1;", [
      p.receiptId,
    ]);
    const before = await snapshot();
    expect(await transport().capacity.claim(p)).toEqual(ack(p, "denied"));
    expect(await snapshot()).toEqual(before);
  });
  it.each(["wrong operation", "wrong protocol", "extra field", "nil receipt"])(
    "rejects direct SQL %s before any consumption or accounting",
    async (kind) => {
      const f = await fixture(),
        p = await issue(f),
        request: Record<string, unknown> = structuredClone(p);
      if (kind === "wrong operation") request.operation = "inspect";
      if (kind === "wrong protocol") request.protocol = 1;
      if (kind === "extra field") request.consumedAt = f.now;
      if (kind === "nil receipt") request.receiptId = "00000000-0000-0000-0000-000000000000";
      const before = await snapshot();
      await expect(raw("bfa_p5_v2_capacity_claim", { p_proof: request })).rejects.toThrow();
      expect(await snapshot()).toEqual(before);
    },
  );
  const unavailableCapacity: [string, (f: Fixture) => Promise<unknown>][] = [
    [
      "quota disabled",
      (f) =>
        database().query(
          "UPDATE bfa_p5_voice.quotas SET enabled=false WHERE owner_id=$1 AND policy_id=$2;",
          [f.proof.claim.binding.ownerId, f.policyId],
        ),
    ],
    [
      "quota insufficient",
      (f) =>
        database().query(
          "UPDATE bfa_p5_voice.quotas SET remaining_units=2 WHERE owner_id=$1 AND policy_id=$2;",
          [f.proof.claim.binding.ownerId, f.policyId],
        ),
    ],
    [
      "route missing",
      (f) =>
        database().query(
          "DELETE FROM bfa_p5_capacity.routes WHERE owner_id=$1 AND quota_policy_id=$2;",
          [f.proof.claim.binding.ownerId, f.policyId],
        ),
    ],
    [
      "pool disabled",
      (f) =>
        database().query("UPDATE bfa_p5_capacity.pools SET enabled=false WHERE pool_id=$1;", [
          f.poolId,
        ]),
    ],
    [
      "pool quarantined",
      (f) =>
        database().query("UPDATE bfa_p5_capacity.pools SET quarantined=true WHERE pool_id=$1;", [
          f.poolId,
        ]),
    ],
    [
      "unit definitions differ",
      (f) =>
        database().query("UPDATE bfa_p5_capacity.pools SET reservation_units=2 WHERE pool_id=$1;", [
          f.poolId,
        ]),
    ],
    [
      "no active slot",
      (f) =>
        database().query("UPDATE bfa_p5_capacity.pools SET active_limit=0 WHERE pool_id=$1;", [
          f.poolId,
        ]),
    ],
    [
      "unit budget exhausted",
      (f) =>
        database().query("UPDATE bfa_p5_capacity.pools SET unit_limit=2 WHERE pool_id=$1;", [
          f.poolId,
        ]),
    ],
  ];
  it.each(unavailableCapacity)(
    "burns an exact receipt once when %s denies atomic admission",
    async (_label, change) => {
      const f = await fixture(),
        p = await issue(f);
      await change(f);
      const original = await proofRow(p),
        before = await snapshot();
      expect(await transport().capacity.claim(p)).toEqual(ack(p, "denied"));
      await assertConsumed(p, original);
      expect(await claimRow(f)).toBeUndefined();
      expect(await allocation(f)).toBeUndefined();
      expect(
        await one("SELECT * FROM bfa_p5_voice.attempts WHERE owner_id=$1 AND attempt_id=$2;", [
          p.claim.binding.ownerId,
          p.claim.binding.attemptId,
        ]),
      ).toBeUndefined();
      await preserved(before, f, p, ["bfa_p5_voice.owner_clocks", "bfa_p5_voice.proofs"]);
      const denied = await snapshot();
      expect(await transport().capacity.claim(p)).toEqual(ack(p, "denied"));
      expect(await snapshot()).toEqual(denied);
    },
  );
  it.each(["first owner", "second owner"])(
    "retains exactly one shared last-slot winner when %s claims first",
    async (order) => {
      const now = Date.now(),
        a = await fixture(undefined, now),
        b = await fixture(a.poolId, now);
      await database().query("UPDATE bfa_p5_capacity.pools SET active_limit=1 WHERE pool_id=$1;", [
        a.poolId,
      ]);
      const pa = await issue(a),
        pb = await issue(b),
        [winner, loser, wp, lp] = order === "first owner" ? [a, b, pa, pb] : [b, a, pb, pa];
      expect(await transport().capacity.claim(wp)).toEqual(ack(wp, "claimed"));
      const winClaim = await claimRow(winner),
        winAlloc = await allocation(winner);
      expect(await transport().capacity.claim(lp)).toEqual(ack(lp, "denied"));
      expect(await claimRow(winner)).toEqual(winClaim);
      expect(await allocation(winner)).toEqual(winAlloc);
      expect(await claimRow(loser)).toBeUndefined();
      expect(await allocation(loser)).toBeUndefined();
      expect(await quota(winner)).toMatchObject({ remaining_units: 27 });
      expect(await quota(loser)).toMatchObject({ remaining_units: 30 });
      expect(await pool(a)).toMatchObject({ occupied: 1, held_units: 3 });
      expect((await proofRow(lp)).consumed_ms).not.toBeNull();
      // Sequential committed orderings are not native multi-connection lock evidence.
    },
  );
  it.each(["claim", "inspect"] as const)(
    "preserves closed status and single-use evidence when close wins before %s",
    async (operation) => {
      const f = await fixture();
      if (operation === "inspect") await admit(f);
      const p = await issue(f, operation);
      await close(f);
      const before = await snapshot(),
        original = await proofRow(p);
      expect(await transport().capacity[operation](p)).toEqual(ack(p, "closed"));
      await assertConsumed(p, original);
      await preserved(before, f, p, ["bfa_p5_voice.proofs"]);
      if (operation === "inspect") await assertAccounting(f, true, 0);
      else await assertAccounting(f, false);
    },
  );
  it.each(["claim", "inspect"] as const)(
    "denies %s after parent revocation without fabricating cleanup revocation or releasing uncertain holds",
    async (operation) => {
      const f = await fixture();
      if (operation === "inspect") await admit(f);
      const p = await issue(f, operation);
      await transport().parents.revokeParent({
        ownerId: p.claim.binding.ownerId,
        authSessionId: p.authSessionId,
      });
      const before = await snapshot(),
        original = await proofRow(p);
      expect(await transport().capacity[operation](p)).toEqual(ack(p, "denied"));
      await assertConsumed(p, original);
      await preserved(before, f, p, ["bfa_p5_voice.proofs", "bfa_p5_voice.owner_clocks"]);
      await assertAccounting(f, operation === "inspect");
    },
  );
  it.each(["cancel", "delete"] as const)(
    "retains terminal %s fencing and retires only an unmarked slot without refunding holds",
    async (action) => {
      const f = await fixture();
      await admit(f);
      const p = await issue(f, "inspect");
      await asRole("service_role", "SELECT public.bfa_p3b_fence($1,$2,$3);", [
        p.claim.binding.ownerId,
        p.claim.binding.threadId,
        action,
      ]);
      const before = await snapshot();
      expect(await transport().capacity.inspect(p)).toEqual(ack(p, "denied"));
      expect(await cleanupRow(f)).toMatchObject({ invalidated_ms: f.now });
      expect(await claimRow(f)).toMatchObject({ state: "invalidated", held_units: 3 });
      expect(await allocation(f)).toMatchObject({
        closed: true,
        slot_held: false,
        operation_id: null,
      });
      await assertAccounting(f, true, 0);
      await preserved(before, f, p, [
        "bfa_p5_voice.proofs",
        "bfa_p5_voice.owner_clocks",
        "bfa_p5_voice.cleanup_owners",
        "bfa_p5_voice.claims",
        "bfa_p5_capacity.allocations",
        "bfa_p5_capacity.pools",
      ]);
    },
  );
  it("retains a shorter current deadline without rewriting the original proof or refunding usage", async () => {
    const f = await fixture();
    await admit(f);
    const p = await issue(f, "inspect"),
      original = await proofRow(p);
    await database().query(
      "UPDATE bfa_p5_voice.approvals SET expires_ms=$1 WHERE approval_id=$2;",
      [f.now + 5000, p.claim.binding.approvalId],
    );
    const before = await snapshot();
    expect(await transport().capacity.inspect(p)).toEqual(ack(p, "denied"));
    await assertConsumed(p, original);
    expect(await cleanupRow(f)).toMatchObject({
      effective_expires_ms: f.now + 5000,
      expired_ms: null,
    });
    expect(await claimRow(f)).toMatchObject({
      effective_expires_ms: f.now + 5000,
      state: "claimed",
    });
    await assertAccounting(f, true);
    await preserved(before, f, p, [
      "bfa_p5_voice.proofs",
      "bfa_p5_voice.owner_clocks",
      "bfa_p5_voice.cleanup_owners",
      "bfa_p5_voice.claims",
    ]);
  });
  it.each(["receipt expiry", "original age", "rollback"])(
    "burns but denies on %s and cannot recover the same receipt",
    async (boundary) => {
      const f = await fixture();
      if (boundary === "original age") f.proof.expiresAt = f.now + 30000;
      const p = await issue(f),
        original = await proofRow(p);
      await setClock(
        boundary === "rollback"
          ? f.now - 1
          : boundary === "original age"
            ? f.now + 30000
            : f.now + 10000,
      );
      const before = await snapshot();
      expect(await transport().capacity.claim(p)).toEqual(ack(p, "denied"));
      await assertConsumed(p, original);
      await assertAccounting(f, false);
      await preserved(before, f, p, ["bfa_p5_voice.proofs", "bfa_p5_voice.owner_clocks"]);
      await setClock(f.now + 1);
      const denied = await snapshot();
      expect(await transport().capacity.claim(p)).toEqual(ack(p, "denied"));
      expect(await snapshot()).toEqual(denied);
    },
  );
  it.each(["NULL", "-1", "9007199254740992"])(
    "records unknown consumption time zero for unsafe initial clock %s, then refuses recovery replay",
    async (sample) => {
      const f = await fixture(),
        p = await issue(f),
        original = await proofRow(p);
      await database().exec(
        `CREATE OR REPLACE FUNCTION bfa_p5_voice.ms() RETURNS bigint LANGUAGE sql VOLATILE SET search_path=pg_catalog,pg_temp AS $$ SELECT ${sample}::bigint $$;`,
      );
      const before = await snapshot();
      expect(await transport().capacity.claim(p)).toEqual(ack(p, "denied"));
      await assertConsumed(p, original);
      expect((await proofRow(p)).consumed_ms).toBe(0);
      await preserved(before, f, p, ["bfa_p5_voice.proofs"]);
      await setClock(f.now + 1);
      const after = await snapshot();
      expect(await transport().capacity.claim(p)).toEqual(ack(p, "denied"));
      expect(await snapshot()).toEqual(after);
    },
  );
  it.each(["claim", "inspect"] as const)(
    "rechecks original proof time after the shared pool stage before acknowledging %s",
    async (operation) => {
      const f = await fixture();
      if (operation === "inspect") await admit(f);
      const p = await issue(f, operation),
        original = await proofRow(p),
        before = await snapshot();
      // A deterministic SQL clock transition at the final check models aging
      // across a wait. It does not exercise native concurrent lock scheduling.
      await database().exec("CREATE TEMP SEQUENCE bfa_v2_capacity_clock MINVALUE 0 START 0;");
      await database().exec(
        `CREATE OR REPLACE FUNCTION bfa_p5_voice.ms() RETURNS bigint LANGUAGE sql VOLATILE SET search_path=pg_catalog,pg_temp AS $$ SELECT CASE WHEN nextval('pg_temp.bfa_v2_capacity_clock')<2 THEN ${f.now}::bigint ELSE ${f.now + 10000}::bigint END $$;`,
      );
      try {
        expect(await transport().capacity[operation](p)).toEqual(ack(p, "denied"));
        expect(
          Number((await one("SELECT last_value FROM pg_temp.bfa_v2_capacity_clock;")).last_value),
        ).toBeGreaterThanOrEqual(2);
        await assertConsumed(p, original);
        await assertAccounting(f, operation === "inspect");
        await preserved(before, f, p, ["bfa_p5_voice.proofs", "bfa_p5_voice.owner_clocks"]);
      } finally {
        await setClock(f.now + 10000);
        await database().exec("DROP SEQUENCE pg_temp.bfa_v2_capacity_clock;");
      }
    },
  );
  const currentReservationDenials: [string, (f: Fixture) => Promise<unknown>][] = [
    [
      "attempt retired",
      (f) =>
        database().query(
          "UPDATE bfa_p5_voice.attempts SET retired=true,winner_claim_id=NULL WHERE owner_id=$1 AND attempt_id=$2;",
          [f.proof.claim.binding.ownerId, f.proof.claim.binding.attemptId],
        ),
    ],
    [
      "attempt winner changed",
      (f) =>
        database().query(
          "UPDATE bfa_p5_voice.attempts SET winner_claim_id=$1 WHERE owner_id=$2 AND attempt_id=$3;",
          [randomUUID(), f.proof.claim.binding.ownerId, f.proof.claim.binding.attemptId],
        ),
    ],
    [
      "attempt absent",
      (f) =>
        database().query("DELETE FROM bfa_p5_voice.attempts WHERE owner_id=$1 AND attempt_id=$2;", [
          f.proof.claim.binding.ownerId,
          f.proof.claim.binding.attemptId,
        ]),
    ],

    [
      "route rebound to another shared pool",
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
    ],
    [
      "allocation absent",
      (f) =>
        database().query("DELETE FROM bfa_p5_capacity.allocations WHERE claim_id=$1;", [
          f.proof.claim.claimId,
        ]),
    ],
    [
      "allocation closed",
      (f) =>
        database().query("UPDATE bfa_p5_capacity.allocations SET closed=true WHERE claim_id=$1;", [
          f.proof.claim.claimId,
        ]),
    ],
    [
      "allocation units mismatch",
      (f) =>
        database().query("UPDATE bfa_p5_capacity.allocations SET units=2 WHERE claim_id=$1;", [
          f.proof.claim.claimId,
        ]),
    ],
    [
      "quota disabled",
      (f) =>
        database().query(
          "UPDATE bfa_p5_voice.quotas SET enabled=false WHERE owner_id=$1 AND policy_id=$2;",
          [f.proof.claim.binding.ownerId, f.policyId],
        ),
    ],
    [
      "route absent",
      (f) =>
        database().query(
          "DELETE FROM bfa_p5_capacity.routes WHERE owner_id=$1 AND quota_policy_id=$2;",
          [f.proof.claim.binding.ownerId, f.policyId],
        ),
    ],
    [
      "pool disabled",
      (f) =>
        database().query("UPDATE bfa_p5_capacity.pools SET enabled=false WHERE pool_id=$1;", [
          f.poolId,
        ]),
    ],
    [
      "pool quarantined",
      (f) =>
        database().query("UPDATE bfa_p5_capacity.pools SET quarantined=true WHERE pool_id=$1;", [
          f.poolId,
        ]),
    ],
    [
      "pool limit below retained occupancy",
      (f) =>
        database().query("UPDATE bfa_p5_capacity.pools SET active_limit=0 WHERE pool_id=$1;", [
          f.poolId,
        ]),
    ],
    [
      "pool limit below cumulative hold",
      (f) =>
        database().query("UPDATE bfa_p5_capacity.pools SET unit_limit=2 WHERE pool_id=$1;", [
          f.poolId,
        ]),
    ],
    [
      "reservation size changed",
      (f) =>
        database().query(
          "UPDATE bfa_p5_voice.quotas SET reservation_units=2 WHERE owner_id=$1 AND policy_id=$2;",
          [f.proof.claim.binding.ownerId, f.policyId],
        ),
    ],
    [
      "approval rebound to another policy",
      (f) =>
        database().query(
          "UPDATE bfa_p5_voice.approvals SET quota_policy_id=$1 WHERE approval_id=$2;",
          [randomUUID(), f.proof.claim.binding.approvalId],
        ),
    ],
  ];
  it.each(currentReservationDenials)(
    "does not use existing-claim inspect to bypass %s",
    async (_label, change) => {
      const f = await fixture();
      await admit(f);
      const p = await issue(f, "inspect");
      await change(f);
      const before = await snapshot(),
        original = await proofRow(p);
      expect(await transport().capacity.inspect(p)).toEqual(ack(p, "denied"));
      await assertConsumed(p, original);
      await preserved(before, f, p, ["bfa_p5_voice.proofs", "bfa_p5_voice.owner_clocks"]);
    },
  );
  it("does not retire an allocation bound to another cleanup when exact current cleanup is terminal", async () => {
    const f = await fixture();
    await admit(f);
    await seedHolds(f.issuance);
    const p = await issue(f, "inspect"),
      other = await one(
        "SELECT cleanup_id FROM bfa_p5_voice.cleanup_owners WHERE owner_id=$1 AND cleanup_id<>$2 LIMIT 1;",
        [p.claim.binding.ownerId, p.cleanupId],
      );
    // Administrative corruption fixture: use a distinct cleanup with no allocation
    // reference because cleanup_id has an intentional unique allocation key.
    const otherId = randomUUID();
    await database().query(
      "INSERT INTO bfa_p5_voice.cleanup_owners(cleanup_id,claim_id,owner_id,claim,effective_expires_ms) SELECT $1,$2,owner_id,claim,effective_expires_ms FROM bfa_p5_voice.cleanup_owners WHERE cleanup_id=$3;",
      [otherId, randomUUID(), other.cleanup_id],
    );
    await database().query(
      "UPDATE bfa_p5_capacity.allocations SET cleanup_id=$1 WHERE claim_id=$2;",
      [otherId, p.claim.claimId],
    );
    await database().query(
      "UPDATE bfa_p5_voice.cleanup_owners SET invalidated_ms=$1 WHERE cleanup_id=$2;",
      [f.now, p.cleanupId],
    );
    const before = await snapshot();
    expect(await transport().capacity.inspect(p)).toEqual(ack(p, "denied"));
    expect(await allocation(f)).toMatchObject({
      cleanup_id: otherId,
      slot_held: true,
      closed: false,
    });
    await assertAccounting(f, true);
    await preserved(before, f, p, ["bfa_p5_voice.proofs", "bfa_p5_voice.owner_clocks"]);
  });
  it("retains an administratively marked uncertain slot after terminal fencing and exact legacy close until fictional operation-wide finality", async () => {
    const f = await fixture();
    await admit(f);
    const operationId = randomUUID(),
      p = await issue(f, "inspect");
    // The v2 marker is not implemented. This explicit administrator-only fixture
    // is retained evidence for existing close/reconcile, not marker acceptance.
    await database().query(
      "UPDATE bfa_p5_capacity.allocations SET operation_id=$1 WHERE claim_id=$2;",
      [operationId, p.claim.claimId],
    );
    await database().query("UPDATE bfa_p5_voice.approvals SET revoked=true WHERE approval_id=$1;", [
      p.claim.binding.approvalId,
    ]);
    expect(await transport().capacity.inspect(p)).toEqual(ack(p, "denied"));
    await close(f);
    expect(await allocation(f)).toMatchObject({
      closed: true,
      slot_held: true,
      operation_id: operationId,
    });
    await assertAccounting(f, true);
    const observation = { evidenceId: randomUUID(), operationId, kind: "unknown", sessionId: null };
    const reconcile = async (value: typeof observation) =>
      (
        await asRole(
          "service_role",
          "SELECT public.bfa_p5_capacity_reconcile($1,$2::jsonb,$3::jsonb) AS value;",
          [p.cleanupId, JSON.stringify(p.claim), JSON.stringify(value)],
        )
      ).value;
    expect(await reconcile(observation)).toMatchObject({ state: "uncertain" });
    await assertAccounting(f, true);
    expect(
      await reconcile({ ...observation, evidenceId: randomUUID(), kind: "not-created" }),
    ).toMatchObject({ state: "terminal-recorded" });
    expect(await allocation(f)).toMatchObject({
      closed: true,
      slot_held: false,
      terminal: "not-created",
    });
    await assertAccounting(f, true, 0);
  });
  it.each(["lost", "malformed"])(
    "retains committed admission and proof consumption after a %s acknowledgment without retry",
    async (kind) => {
      const f = await fixture(),
        p = await issue(f),
        t = transport();
      t.hooks.afterCommit = async () => {
        if (kind === "lost") throw new Error("Fictional lost response");
        return { protocol: 2, proof: { ...p, verifiedAt: p.verifiedAt + 1 }, status: "claimed" };
      };
      await expect(t.capacity.claim(p)).rejects.toThrow("voice-v2-capacity-rpc-unavailable");
      expect(t.calls).toHaveLength(1);
      expect(t.calls[0]!.committed).toBe(true);
      expect((await proofRow(p)).consumed_ms).not.toBeNull();
      await assertAccounting(f, true);
      const before = await snapshot();
      expect(await transport().capacity.claim(p)).toEqual(ack(p, "denied"));
      expect(await snapshot()).toEqual(before);
      // Local post-commit response doubles do not simulate actual HTTP faults.
    },
  );
  it.each(["anon", "authenticated"] as const)(
    "keeps both new endpoints unavailable to %s",
    async (role) => {
      const f = await fixture(),
        p = await issue(f),
        before = await snapshot();
      for (const name of ["bfa_p5_v2_capacity_claim", "bfa_p5_v2_voice_inspect"])
        await expect(raw(name, { p_proof: p }, role)).rejects.toThrow();
      expect(await snapshot()).toEqual(before);
    },
  );
  it("keeps private helpers and all shared tables inaccessible, with exact service-only public functions", async () => {
    const rows = (
      await database().query(
        "SELECT p.proname,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') AS anon,has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role,EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('bfa_p5_v2_capacity_claim','bfa_p5_v2_voice_inspect') ORDER BY p.proname;",
      )
    ).rows;
    expect(rows).toHaveLength(2);
    for (const r of rows)
      expect(r).toMatchObject({
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
    expect(helpers.length).toBeGreaterThan(0);
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
  it("preserves consumption high-water when a later initial eligibility sample rolls back above the older registration clock", async () => {
    const f = await fixture(),
      p = await issue(f),
      original = await proofRow(p),
      before = await snapshot();
    await database().exec("CREATE TEMP SEQUENCE bfa_v2_capacity_clock MINVALUE 0 START 0;");
    await database().exec(
      `CREATE OR REPLACE FUNCTION bfa_p5_voice.ms() RETURNS bigint LANGUAGE sql VOLATILE SET search_path=pg_catalog,pg_temp AS $$ SELECT CASE WHEN nextval('pg_temp.bfa_v2_capacity_clock')=0 THEN ${f.now + 5}::bigint ELSE ${f.now + 3}::bigint END $$;`,
    );
    try {
      expect(await transport().capacity.claim(p)).toEqual(ack(p, "denied"));
      expect((await one("SELECT last_value FROM pg_temp.bfa_v2_capacity_clock;")).last_value).toBe(
        1,
      );
      await assertConsumed(p, original);
      expect((await proofRow(p)).consumed_ms).toBe(f.now + 5);
      expect(
        await one("SELECT * FROM bfa_p5_voice.owner_clocks WHERE owner_id=$1;", [
          p.claim.binding.ownerId,
        ]),
      ).toMatchObject({ observed_ms: f.now + 5 });
      await assertAccounting(f, false);
      await preserved(before, f, p, ["bfa_p5_voice.proofs", "bfa_p5_voice.owner_clocks"]);
    } finally {
      await setClock(f.now + 10);
      await database().exec("DROP SEQUENCE pg_temp.bfa_v2_capacity_clock;");
    }
  });
  it("cannot hide an initial rollback with a later recovered sample because it denies before resampling", async () => {
    const f = await fixture(),
      p = await issue(f),
      original = await proofRow(p),
      before = await snapshot();
    await database().exec("CREATE TEMP SEQUENCE bfa_v2_capacity_clock MINVALUE 0 START 0;");
    await database().exec(
      `CREATE OR REPLACE FUNCTION bfa_p5_voice.ms() RETURNS bigint LANGUAGE sql VOLATILE SET search_path=pg_catalog,pg_temp AS $$ SELECT CASE WHEN nextval('pg_temp.bfa_v2_capacity_clock')=0 THEN ${f.now - 1}::bigint ELSE ${f.now + 1}::bigint END $$;`,
    );
    try {
      expect(await transport().capacity.claim(p)).toEqual(ack(p, "denied"));
      expect((await one("SELECT last_value FROM pg_temp.bfa_v2_capacity_clock;")).last_value).toBe(
        0,
      );
      await assertConsumed(p, original);
      expect((await proofRow(p)).consumed_ms).toBe(f.now - 1);
      await assertAccounting(f, false);
      await preserved(before, f, p, ["bfa_p5_voice.proofs"]);
    } finally {
      await setClock(f.now + 10);
      await database().exec("DROP SEQUENCE pg_temp.bfa_v2_capacity_clock;");
    }
  });
  it("retains exact expired cleanup/claim fences and releases only an unmarked slot, preserving cumulative holds", async () => {
    const f = await fixture();
    await admit(f);
    const p = await issue(f, "inspect"),
      original = await proofRow(p);
    await setClock(f.now + 60000);
    const before = await snapshot();
    expect(await transport().capacity.inspect(p)).toEqual(ack(p, "denied"));
    await assertConsumed(p, original);
    expect(await cleanupRow(f)).toMatchObject({ expired_ms: f.now + 60000 });
    expect(await claimRow(f)).toMatchObject({ state: "expired", held_units: 3 });
    expect(await allocation(f)).toMatchObject({ closed: true, slot_held: false });
    await assertAccounting(f, true, 0);
    await preserved(before, f, p, [
      "bfa_p5_voice.proofs",
      "bfa_p5_voice.owner_clocks",
      "bfa_p5_voice.cleanup_owners",
      "bfa_p5_voice.claims",
      "bfa_p5_capacity.allocations",
      "bfa_p5_capacity.pools",
    ]);
  });
  it("rolls back proof consumption and every atomic admission write if an injected allocation statement fails", async () => {
    const f = await fixture(),
      p = await issue(f),
      before = await snapshot(),
      t = transport();
    // Explicit fixture-only SQL exception, distinct from a committed semantic denial.
    // This establishes local transaction atomicity, not a guarantee about network errors.
    await database().exec(
      "CREATE FUNCTION public.bfa_v2_capacity_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fictional fixture allocation failure'; END $$; CREATE TRIGGER bfa_v2_capacity_test_fail BEFORE INSERT ON bfa_p5_capacity.allocations FOR EACH ROW EXECUTE FUNCTION public.bfa_v2_capacity_test_fail();",
    );
    try {
      await expect(t.capacity.claim(p)).rejects.toThrow("voice-v2-capacity-rpc-unavailable");
      expect(t.calls).toHaveLength(1);
      expect(t.calls[0]!.committed).toBe(false);
      expect(await snapshot()).toEqual(before);
      expect((await proofRow(p)).consumed_ms).toBeNull();
      await assertAccounting(f, false);
    } finally {
      await database().exec(
        "DROP TRIGGER bfa_v2_capacity_test_fail ON bfa_p5_capacity.allocations; DROP FUNCTION public.bfa_v2_capacity_test_fail();",
      );
    }
  });
});
