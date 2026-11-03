// Actual isolated PostgreSQL and inactive v2 proof transport; fictional
// identity/policy/approval metadata only. No Auth, HTTP, provider or device call.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { readFile, readdir, realpath } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createVoiceV2ProofRpcPorts,
  type VoiceV2ProofRegistration,
} from "../service/voice-v2-proof-rpc.server";
import {
  createVoiceV2CleanupRpcPorts,
  type VoiceV2CleanupRegistration,
  type VoiceV2CleanupReadQuery,
} from "../service/voice-v2-cleanup-rpc.server";
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
const NIL = "00000000-0000-0000-0000-000000000000";
const SOURCE = "2001-02-03T04:05:06.123456Z";
const digest = () => createHash("sha256").update(randomUUID()).digest("hex");
const fingerprint = digest;
const names = [
  "bfa_p5_v2_register_proof",
  "bfa_p5_v2_register_cleanup",
  "bfa_p5_v2_read_cleanup",
  "bfa_p5_v2_observe_parent",
  "bfa_p5_v2_revoke_parent",
  "bfa_p5_v2_register_issuance",
  "bfa_p5_v2_register_generation",
  "bfa_p5_v2_read_current_thread",
];
const readQuery = (q: VoiceV2CleanupRegistration): VoiceV2CleanupReadQuery => ({
  cleanupId: q.cleanupId,
  claim: q.claim,
  authSessionId: q.authSessionId,
  parentVersion: q.parentVersion,
  authorityFingerprint: q.authorityFingerprint,
});
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

sqlSuite("P5 proposed v2 proof registration in isolated PostgreSQL", () => {
  let db: LocalDatabase | undefined;
  let seed: LocalDatabase | undefined;
  let realClockDefinition: string | undefined;
  let preexistingLegacyRows: Record<string, unknown>[] = [];
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
    for (const kind of ["active", "expired", "consumed"]) {
      const now = Date.now(),
        ownerId = randomUUID(),
        claimId = randomUUID();
      const claim = {
        claimId,
        expiresAt: now + 60000,
        binding: {
          ownerId,
          threadId: randomUUID(),
          threadIncarnation: randomUUID(),
          threadRevision: 0,
          attemptId: randomUUID(),
          approvalId: randomUUID(),
          approvalDigest: digest(),
          scope: "developer-voice-session",
        },
      };
      await database().query(
        "INSERT INTO bfa_p5_voice.proofs(receipt_id,operation,cleanup_id,claim_id,owner_id,claim,session_id,session_version,authority_fingerprint,identity_expires_ms,verified_ms,expires_ms,effective_expires_ms,consumed_ms) VALUES($1,'claim',$2,$3,$4,$5::jsonb,$6,0,$7,$8,$9,$10,$8,$11);",
        [
          randomUUID(),
          randomUUID(),
          claimId,
          ownerId,
          JSON.stringify(claim),
          randomUUID(),
          digest(),
          now + 60000,
          kind === "expired" ? now - 20000 : now,
          kind === "expired" ? now - 10000 : now + 10000,
          kind === "consumed" ? now : null,
        ],
      );
    }
    // Compile and execute the original table-rowtype writer before ALTER too,
    // then call it again after ALTER in the legacy compatibility case below.
    const originalClock = (
      await one("SELECT pg_get_functiondef('bfa_p5_voice.ms()'::regprocedure) AS definition;")
    ).definition as string;
    const original = await fixture();
    await database().query("DELETE FROM bfa_p5_voice.cleanup_owners WHERE cleanup_id=$1;", [
      original.q.cleanupId,
    ]);
    await database().query("INSERT INTO bfa_p5_voice.session_fences VALUES($1,$2,0,$3,false);", [
      original.issuance.ownerId,
      original.proof.authSessionId,
      original.now + 60000,
    ]);
    await legacyRegister(original.q);
    const oldProof = {
      receiptId: randomUUID(),
      operation: "claim",
      claim: original.q.claim,
      cleanupId: original.q.cleanupId,
      ownerSessionId: original.q.authSessionId,
      sessionVersion: 0,
      authorityFingerprint: original.q.authorityFingerprint,
      identityExpiresAt: original.now + 60000,
      verifiedAt: original.now,
      expiresAt: original.now + 10000,
      effectiveExpiresAt: original.now + 60000,
    };
    expect(
      (
        await asRole(
          "service_role",
          "SELECT public.bfa_p5_voice_register_proof($1::jsonb) AS value;",
          [JSON.stringify(oldProof)],
        )
      ).value,
    ).toMatchObject({ receiptId: oldProof.receiptId });
    await database().exec(originalClock);
    preexistingLegacyRows = (
      await database().query(
        "SELECT to_jsonb(p) AS value FROM bfa_p5_voice.proofs p ORDER BY receipt_id;",
      )
    ).rows;
    expect(preexistingLegacyRows).toHaveLength(4);
    await install("docs/pilot/conversation/sql-drafts/p5-voice-v2-proof.sql");
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
      ports: createVoiceV2CleanupRpcPorts(client),
      proofs: createVoiceV2ProofRpcPorts(client),
      parents: createVoiceV2ParentIssuanceRpcPorts(client),
      preissue: createVoiceV2PreissueRpcPorts(client),
    };
  }
  const ports = () => transport().ports;
  const proofPorts = () => transport().proofs;
  async function setClock(value: number) {
    expect(Number.isInteger(value)).toBe(true);
    await database().exec(
      `CREATE OR REPLACE FUNCTION bfa_p5_voice.ms() RETURNS bigint LANGUAGE sql VOLATILE SET search_path=pg_catalog,pg_temp AS $$ SELECT ${value}::bigint $$;`,
    );
  }
  async function fixture() {
    const now = Date.now(),
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
    return { q, proof, issuance, now, policyId };
  }
  const row = (q: VoiceV2CleanupReadQuery) =>
    one(
      "SELECT k.*,xmin::text AS xmin,ctid::text AS ctid FROM bfa_p5_voice.cleanup_owners k WHERE cleanup_id=$1;",
      [q.cleanupId],
    );
  const close = async (q: VoiceV2CleanupReadQuery) =>
    (
      await asRole("service_role", "SELECT public.bfa_p5_voice_close($1,$2::jsonb) AS value;", [
        q.cleanupId,
        JSON.stringify(q.claim),
      ])
    ).value;
  const legacyRegister = async (q: VoiceV2CleanupReadQuery) =>
    (
      await asRole(
        "service_role",
        "SELECT public.bfa_p5_voice_register_cleanup($1,$2::jsonb) AS value;",
        [q.cleanupId, JSON.stringify(q.claim)],
      )
    ).value;
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

  const proofRow = (p: VoiceV2ProofRegistration) =>
    one("SELECT * FROM bfa_p5_voice.proofs WHERE receipt_id=$1;", [p.receiptId]);
  const claimedRow = (p: VoiceV2ProofRegistration) =>
    one("SELECT * FROM bfa_p5_voice.claims WHERE claim_id=$1;", [p.claim.claimId]);
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
  async function seedClaim(p: VoiceV2ProofRegistration, policyId: string) {
    await database().query("INSERT INTO bfa_p5_voice.quotas VALUES($1,$2,7,3,true);", [
      p.claim.binding.ownerId,
      policyId,
    ]);
    await database().query(
      "INSERT INTO bfa_p5_voice.claims VALUES($1,$2,$3::jsonb,$4,'claimed',$5,3);",
      [
        p.claim.claimId,
        p.claim.binding.ownerId,
        JSON.stringify(p.claim),
        p.effectiveExpiresAt,
        policyId,
      ],
    );
    await database().query("INSERT INTO bfa_p5_voice.attempts VALUES($1,$2,$3,false);", [
      p.claim.binding.ownerId,
      p.claim.binding.attemptId,
      p.claim.claimId,
    ]);
  }
  async function preserved(
    before: Awaited<ReturnType<typeof snapshot>>,
    p: VoiceV2ProofRegistration,
    allowed: string[] = [],
  ) {
    const after = await snapshot();
    const target: Record<string, (r: Record<string, unknown>) => boolean> = {
      "bfa_p5_voice.owner_clocks": (r) => r.owner_id === p.claim.binding.ownerId,
      "bfa_p5_voice.proofs": (r) => r.receipt_id === p.receiptId,
      "bfa_p5_voice.cleanup_owners": (r) => r.cleanup_id === p.cleanupId,
      "bfa_p5_voice.claims": (r) => r.claim_id === p.claim.claimId,
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
  const negativeTables = [
    "bfa_p5_voice.owner_clocks",
    "bfa_p5_voice.cleanup_owners",
    "bfa_p5_voice.claims",
  ];

  it("preserves preexisting legacy proof records and consumed evidence across additive protocol column", async () => {
    for (const { value } of preexistingLegacyRows) {
      const prior = value as Record<string, unknown>;
      const current = (
        await one("SELECT to_jsonb(p) AS value FROM bfa_p5_voice.proofs p WHERE receipt_id=$1;", [
          prior.receipt_id,
        ])
      ).value;
      expect(current).toEqual({ ...prior, protocol: null });
    }
  });
  it("stores an exact fresh protocol-2 proof without consuming it, admitting a claim or spending held usage", async () => {
    const { proof, issuance } = await fixture();
    await seedHolds(issuance);
    const before = await snapshot();
    const t = transport();
    expect(await t.proofs.registerProof(proof)).toEqual(proof);
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0]).toMatchObject({ name: "bfa_p5_v2_register_proof", committed: true });
    expect(await proofRow(proof)).toMatchObject({
      receipt_id: proof.receiptId,
      operation: "claim",
      protocol: 2,
      owner_id: proof.claim.binding.ownerId,
      cleanup_id: proof.cleanupId,
      claim_id: proof.claim.claimId,
      claim: proof.claim,
      session_id: proof.authSessionId,
      session_version: proof.parentVersion,
      authority_fingerprint: proof.authorityFingerprint,
      identity_expires_ms: proof.identityExpiresAt,
      verified_ms: proof.verifiedAt,
      expires_ms: proof.expiresAt,
      effective_expires_ms: proof.effectiveExpiresAt,
      consumed_ms: null,
    });
    expect(await claimedRow(proof)).toBeUndefined();
    await preserved(before, proof, ["bfa_p5_voice.owner_clocks", "bfa_p5_voice.proofs"]);
  });
  it.each(["first owner", "second owner"] as const)(
    "preserves a global receipt winner when %s registers first and the other owner collides",
    async (order) => {
      const a = await fixture(),
        b = await fixture();
      await seedHolds(a.issuance);
      await seedHolds(b.issuance);
      const receiptId = randomUUID();
      a.proof.receiptId = receiptId;
      b.proof.receiptId = receiptId;
      const [first, second] = order === "first owner" ? [a, b] : [b, a];
      expect(await proofPorts().registerProof(first.proof)).toEqual(first.proof);
      const winner = await proofRow(first.proof);
      second.proof.expiresAt = second.now + 4000;
      second.proof.effectiveExpiresAt = second.now + 5000;
      second.proof.identityExpiresAt = second.now + 5000;
      const before = await snapshot();
      expect(await proofPorts().registerProof(second.proof)).toBeNull();
      expect(await snapshot()).toEqual(before);
      expect(await proofRow(first.proof)).toEqual(winner);
      expect(await row(second.proof)).toMatchObject({ effective_expires_ms: second.now + 60000 });
    },
  );
  it.each(["exact", "changed operation", "changed deadline", "consumed", "legacy"] as const)(
    "rejects %s reused receipt identity before any negative mutation",
    async (kind) => {
      const { proof, issuance, now } = await fixture();
      await seedHolds(issuance);
      if (kind === "legacy") await insertProof(proof, null);
      else expect(await proofPorts().registerProof(proof)).toEqual(proof);
      if (kind === "consumed")
        await database().query(
          "UPDATE bfa_p5_voice.proofs SET consumed_ms=$2 WHERE receipt_id=$1;",
          [proof.receiptId, now],
        );
      const replay = structuredClone(proof);
      if (kind === "changed operation") replay.operation = "inspect";
      if (kind === "changed deadline") {
        replay.effectiveExpiresAt = now + 5000;
        replay.expiresAt = now + 4000;
        replay.identityExpiresAt = now + 5000;
      }
      const before = await snapshot();
      expect(await proofPorts().registerProof(replay)).toBeNull();
      expect(await snapshot()).toEqual(before);
    },
  );
  it("allows distinct fresh inspect receipts for the same exact claimed winner while keeping prior proof immutable", async () => {
    const { proof, policyId, issuance, now } = await fixture();
    await seedHolds(issuance);
    await seedClaim(proof, policyId);
    const first = { ...proof, operation: "inspect" as const };
    expect(await proofPorts().registerProof(first)).toEqual(first);
    const original = await proofRow(first);
    const second = { ...first, receiptId: randomUUID(), effectiveExpiresAt: now + 30000 };
    const before = await snapshot();
    expect(await proofPorts().registerProof(second)).toEqual(second);
    expect(await proofRow(first)).toEqual(original);
    expect(await row(proof)).toMatchObject({ effective_expires_ms: now + 30000 });
    expect(await claimedRow(proof)).toMatchObject({
      effective_expires_ms: now + 30000,
      state: "claimed",
      held_units: 3,
    });
    await preserved(before, second, [...negativeTables, "bfa_p5_voice.proofs"]);
  });
  it("permits a fresh claim proof for the exact already-claimed winner without double reservation", async () => {
    const { proof, policyId, issuance } = await fixture();
    await seedHolds(issuance);
    await seedClaim(proof, policyId);
    const before = await snapshot();
    expect(await proofPorts().registerProof(proof)).toEqual(proof);
    await preserved(before, proof, ["bfa_p5_voice.owner_clocks", "bfa_p5_voice.proofs"]);
  });
  it.each([
    "inspect absent",
    "claim without attempt",
    "attempt without claim",
    "retired attempt",
    "other winner",
    "closed claim",
    "expired claim",
    "invalidated claim",
    "mismatched claim",
    "foreign claim",
  ] as const)("denies %s without inserting proof or changing retained accounting", async (kind) => {
    const { proof, policyId, issuance } = await fixture();
    await seedHolds(issuance);
    if (kind === "inspect absent") proof.operation = "inspect";
    else {
      await seedClaim(proof, policyId);
      if (kind === "claim without attempt")
        await database().query(
          "DELETE FROM bfa_p5_voice.attempts WHERE owner_id=$1 AND attempt_id=$2;",
          [issuance.ownerId, proof.claim.binding.attemptId],
        );
      if (kind === "attempt without claim")
        await database().query("DELETE FROM bfa_p5_voice.claims WHERE claim_id=$1;", [
          proof.claim.claimId,
        ]);
      if (kind === "retired attempt")
        await database().query(
          "UPDATE bfa_p5_voice.attempts SET retired=true,winner_claim_id=NULL WHERE owner_id=$1 AND attempt_id=$2;",
          [issuance.ownerId, proof.claim.binding.attemptId],
        );
      if (kind === "other winner")
        await database().query(
          "UPDATE bfa_p5_voice.attempts SET winner_claim_id=$3 WHERE owner_id=$1 AND attempt_id=$2;",
          [issuance.ownerId, proof.claim.binding.attemptId, randomUUID()],
        );
      if (["closed claim", "expired claim", "invalidated claim"].includes(kind))
        await database().query("UPDATE bfa_p5_voice.claims SET state=$2 WHERE claim_id=$1;", [
          proof.claim.claimId,
          kind.split(" ")[0],
        ]);
      if (kind === "mismatched claim")
        await database().query(
          "UPDATE bfa_p5_voice.claims SET claim=jsonb_set(claim,'{binding,approvalDigest}',to_jsonb($2::text)) WHERE claim_id=$1;",
          [proof.claim.claimId, digest()],
        );
      if (kind === "foreign claim")
        await database().query("UPDATE bfa_p5_voice.claims SET owner_id=$2 WHERE claim_id=$1;", [
          proof.claim.claimId,
          randomUUID(),
        ]);
    }
    const before = await snapshot();
    expect(await proofPorts().registerProof(proof)).toBeNull();
    expect(await proofRow(proof)).toBeUndefined();
    await preserved(before, proof, ["bfa_p5_voice.owner_clocks"]);
  });
  it.each([
    "legacy unbound",
    "legacy bound",
    "closed",
    "expired",
    "invalidated",
    "wrong session",
    "wrong fingerprint",
    "wrong version",
    "different claim",
  ] as const)("rejects %s cleanup without adoption or revival", async (kind) => {
    const { proof, issuance, now } = await fixture();
    await seedHolds(issuance);
    if (kind === "legacy unbound")
      await database().query(
        "UPDATE bfa_p5_voice.cleanup_owners SET protocol=NULL,session_id=NULL,session_version=NULL,authority_fingerprint=NULL WHERE cleanup_id=$1;",
        [proof.cleanupId],
      );
    if (kind === "legacy bound")
      await database().query(
        "UPDATE bfa_p5_voice.cleanup_owners SET protocol=NULL WHERE cleanup_id=$1;",
        [proof.cleanupId],
      );
    if (kind === "closed") await close(proof);
    if (kind === "expired")
      await database().query(
        "UPDATE bfa_p5_voice.cleanup_owners SET expired_ms=$2 WHERE cleanup_id=$1;",
        [proof.cleanupId, now],
      );
    if (kind === "invalidated")
      await database().query(
        "UPDATE bfa_p5_voice.cleanup_owners SET invalidated_ms=$2 WHERE cleanup_id=$1;",
        [proof.cleanupId, now],
      );
    if (kind === "wrong session") proof.authSessionId = randomUUID();
    if (kind === "wrong fingerprint") proof.authorityFingerprint = digest();
    if (kind === "wrong version") proof.parentVersion++;
    if (kind === "different claim")
      proof.claim = { ...proof.claim, expiresAt: proof.claim.expiresAt - 1 };
    const before = await snapshot();
    expect(await proofPorts().registerProof(proof)).toBeNull();
    expect(await proofRow(proof)).toBeUndefined();
    await preserved(before, proof, ["bfa_p5_voice.owner_clocks"]);
  });
  it.each([
    "missing parent",
    "revoked parent",
    "legacy active",
    "legacy expired",
    "legacy revoked",
    "missing issuance binding",
    "foreign issuance binding",
  ] as const)(
    "denies %s parent association without manufacturing proof authority",
    async (kind) => {
      const { proof, issuance, now } = await fixture();
      await seedHolds(issuance);
      if (kind === "missing parent") proof.authSessionId = randomUUID();
      if (kind === "revoked parent")
        await transport().parents.revokeParent({
          ownerId: issuance.ownerId,
          authSessionId: proof.authSessionId,
        });
      if (kind.startsWith("legacy"))
        await database().query("INSERT INTO bfa_p5_voice.session_fences VALUES($1,$2,0,$3,$4);", [
          issuance.ownerId,
          proof.authSessionId,
          kind === "legacy expired" ? now - 1 : now + 60000,
          kind === "legacy revoked",
        ]);
      if (kind === "missing issuance binding")
        await database().query(
          "DELETE FROM bfa_p5_voice_v2.issuance_auth_bindings WHERE fingerprint=$1;",
          [proof.authorityFingerprint],
        );
      if (kind === "foreign issuance binding") {
        const otherSession = randomUUID();
        expect(
          await transport().parents.observeParent({
            ownerId: issuance.ownerId,
            authSessionId: otherSession,
            verifiedAt: now,
            authExpiresAt: now + 60000,
          }),
        ).not.toBeNull();
        await database().query(
          "UPDATE bfa_p5_voice_v2.issuance_auth_bindings SET auth_session_id=$2 WHERE fingerprint=$1;",
          [proof.authorityFingerprint, otherSession],
        );
      }
      const before = await snapshot();
      expect(await proofPorts().registerProof(proof)).toBeNull();
      await preserved(before, proof, ["bfa_p5_voice.owner_clocks"]);
    },
  );
  it.each([
    "revoked approval",
    "wrong approval digest",
    "wrong approval attempt",
    "missing approval",
    "revoked issuance",
    "revision changed",
    "deleted thread",
    "retired generation",
    "allowlist denied",
  ] as const)("withholds proof after %s while retaining matching held usage", async (kind) => {
    const { proof, issuance, policyId } = await fixture();
    await seedHolds(issuance);
    await seedClaim(proof, policyId);
    if (kind === "revoked approval")
      await database().query(
        "UPDATE bfa_p5_voice.approvals SET revoked=true WHERE approval_id=$1;",
        [proof.claim.binding.approvalId],
      );
    if (kind === "wrong approval digest")
      await database().query("UPDATE bfa_p5_voice.approvals SET digest=$2 WHERE approval_id=$1;", [
        proof.claim.binding.approvalId,
        digest(),
      ]);
    if (kind === "wrong approval attempt")
      await database().query(
        "UPDATE bfa_p5_voice.approvals SET attempt_id=$2 WHERE approval_id=$1;",
        [proof.claim.binding.approvalId, randomUUID()],
      );
    if (kind === "missing approval")
      await database().query("DELETE FROM bfa_p5_voice.approvals WHERE approval_id=$1;", [
        proof.claim.binding.approvalId,
      ]);
    if (kind === "revoked issuance")
      await database().query(
        "UPDATE bfa_p5_voice.issuances SET revoked=true WHERE fingerprint=$1;",
        [proof.authorityFingerprint],
      );
    if (kind === "revision changed")
      await database().query("UPDATE public.bfa_p3b_threads SET revision=revision+1 WHERE id=$1;", [
        issuance.threadId,
      ]);
    if (kind === "deleted thread")
      await asRole("service_role", "SELECT public.bfa_p3b_fence($1,$2,'delete') AS value;", [
        issuance.ownerId,
        issuance.threadId,
      ]);
    if (kind === "retired generation")
      await database().query(
        "UPDATE bfa_p5_voice.generations SET retired=true WHERE incarnation=$1;",
        [issuance.threadIncarnation],
      );
    if (kind === "allowlist denied")
      await database().query(
        "UPDATE public.bfa_p3b_staging_accounts SET admitted=false WHERE user_id=$1;",
        [issuance.ownerId],
      );
    const before = await snapshot();
    expect(await proofPorts().registerProof(proof)).toBeNull();
    expect(await proofRow(proof)).toBeUndefined();
    expect(await claimedRow(proof)).toMatchObject({ held_units: 3 });
    await preserved(before, proof, negativeTables);
  });
  it.each(["Auth", "allowlist", "approval", "issuance", "supplied effective"] as const)(
    "retains a shorter %s deadline on exact cleanup and claim before refusing an overlong proof",
    async (kind) => {
      const { proof, issuance, policyId, now } = await fixture();
      await seedHolds(issuance);
      await seedClaim(proof, policyId);
      const shorter = now + 5000;
      if (kind === "Auth") {
        proof.identityExpiresAt = shorter;
        proof.effectiveExpiresAt = shorter;
        proof.expiresAt = now + 4000;
      }
      if (kind === "supplied effective") {
        proof.effectiveExpiresAt = shorter;
        proof.expiresAt = now + 4000;
      }
      if (kind === "allowlist")
        await database().query(
          "UPDATE public.bfa_p3b_staging_accounts SET expires_at=to_timestamp($2/1000.0) WHERE user_id=$1;",
          [issuance.ownerId, shorter],
        );
      if (kind === "approval")
        await database().query(
          "UPDATE bfa_p5_voice.approvals SET expires_ms=$2 WHERE approval_id=$1;",
          [proof.claim.binding.approvalId, shorter],
        );
      if (kind === "issuance")
        await database().query(
          "UPDATE bfa_p5_voice.issuances SET expires_ms=$2 WHERE fingerprint=$1;",
          [proof.authorityFingerprint, shorter],
        );
      const before = await snapshot();
      const result = await proofPorts().registerProof(proof);
      if (kind === "Auth" || kind === "supplied effective") expect(result).toEqual(proof);
      else expect(result).toBeNull();
      expect(await row(proof)).toMatchObject({ effective_expires_ms: shorter });
      expect(await claimedRow(proof)).toMatchObject({
        effective_expires_ms: shorter,
        held_units: 3,
      });
      await preserved(before, proof, [
        ...negativeTables,
        ...(result ? ["bfa_p5_voice.proofs"] : []),
      ]);
    },
  );
  it.each(["Auth", "allowlist", "approval"] as const)(
    "retains expired shorter %s evidence from a delayed verification and never revives it later",
    async (kind) => {
      const { proof, issuance, policyId, now } = await fixture();
      await seedHolds(issuance);
      await seedClaim(proof, policyId);
      const shorter = now + 20000;
      await setClock(now + 35000);
      if (kind === "Auth") {
        proof.identityExpiresAt = shorter;
        proof.effectiveExpiresAt = shorter;
      }
      if (kind === "allowlist")
        await database().query(
          "UPDATE public.bfa_p3b_staging_accounts SET expires_at=to_timestamp($2/1000.0) WHERE user_id=$1;",
          [issuance.ownerId, shorter],
        );
      if (kind === "approval")
        await database().query(
          "UPDATE bfa_p5_voice.approvals SET expires_ms=$2 WHERE approval_id=$1;",
          [proof.claim.binding.approvalId, shorter],
        );
      const before = await snapshot();
      expect(await proofPorts().registerProof(proof)).toBeNull();
      expect(await proofRow(proof)).toBeUndefined();
      expect(await row(proof)).toMatchObject({ effective_expires_ms: shorter });
      expect(await claimedRow(proof)).toMatchObject({
        effective_expires_ms: shorter,
        held_units: 3,
      });
      await preserved(before, proof, negativeTables);
      if (kind === "allowlist")
        await database().query(
          "UPDATE public.bfa_p3b_staging_accounts SET expires_at=to_timestamp($2/1000.0) WHERE user_id=$1;",
          [issuance.ownerId, now + 60000],
        );
      if (kind === "approval")
        await database().query(
          "UPDATE bfa_p5_voice.approvals SET expires_ms=$2 WHERE approval_id=$1;",
          [proof.claim.binding.approvalId, now + 60000],
        );
      const later = {
        ...proof,
        receiptId: randomUUID(),
        verifiedAt: now + 35000,
        expiresAt: now + 45000,
        identityExpiresAt: now + 60000,
        effectiveExpiresAt: now + 60000,
      };
      const after = await snapshot();
      expect(await proofPorts().registerProof(later)).toBeNull();
      expect(await proofRow(later)).toBeUndefined();
      expect(await row(proof)).toMatchObject({ effective_expires_ms: shorter });
      await preserved(after, later, negativeTables);
    },
  );
  it.each([
    "future verification",
    "clock rollback",
    "unsafe clock",
    "age exactly 30000",
    "expired receipt",
  ] as const)("denies %s without refreshing proof timing", async (kind) => {
    const { proof, issuance, now } = await fixture();
    await seedHolds(issuance);
    if (kind === "future verification") proof.verifiedAt = now + 1;
    if (kind === "clock rollback") await setClock(now - 1);
    if (kind === "unsafe clock") await setClock(Number.MAX_SAFE_INTEGER + 1);
    if (kind === "age exactly 30000") await setClock(now + 30000);
    if (kind === "expired receipt") {
      proof.verifiedAt = now - 20000;
      proof.expiresAt = now - 10000;
    }
    const before = await snapshot();
    expect(await proofPorts().registerProof(proof)).toBeNull();
    expect(await proofRow(proof)).toBeUndefined();
    await preserved(before, proof, ["bfa_p5_voice.owner_clocks"]);
  });
  it.each(["future verification", "clock rollback"] as const)(
    "does not retain supplied shortening under %s",
    async (kind) => {
      const { proof, issuance, now } = await fixture();
      await seedHolds(issuance);
      proof.effectiveExpiresAt = now + 5000;
      proof.expiresAt = now + 4000;
      if (kind === "future verification") proof.verifiedAt = now + 1;
      else await setClock(now - 1);
      const before = await snapshot();
      expect(await proofPorts().registerProof(proof)).toBeNull();
      expect(await row(proof)).toMatchObject({ effective_expires_ms: now + 60000 });
      await preserved(before, proof, ["bfa_p5_voice.owner_clocks"]);
    },
  );
  it.each(["lost", "malformed"] as const)(
    "preserves committed proof after %s reply and makes no automatic retry",
    async (kind) => {
      const { proof, issuance } = await fixture();
      await seedHolds(issuance);
      const t = transport();
      t.hooks.afterCommit = async (name, data) => {
        if (name === "bfa_p5_v2_register_proof") {
          if (kind === "lost") throw new Error("simulated local lost reply");
          return { ...(data as object), protocol: 1 };
        }
        return data;
      };
      const before = await snapshot();
      await expect(t.proofs.registerProof(proof)).rejects.toThrow("voice-v2-proof-rpc-unavailable");
      expect(t.calls).toHaveLength(1);
      expect(t.calls[0]!.committed).toBe(true);
      expect(await proofRow(proof)).toMatchObject({
        protocol: 2,
        consumed_ms: null,
        receipt_id: proof.receiptId,
      });
      await preserved(before, proof, ["bfa_p5_voice.owner_clocks", "bfa_p5_voice.proofs"]);
      const committed = await snapshot();
      expect(await proofPorts().registerProof(proof)).toBeNull();
      expect(await snapshot()).toEqual(committed);
    },
  );
  it("keeps a registered proof immutable when exact close follows and denies a later new proof", async () => {
    const { proof, issuance } = await fixture();
    await seedHolds(issuance);
    expect(await proofPorts().registerProof(proof)).toEqual(proof);
    const original = await proofRow(proof);
    expect(await close(proof)).toMatchObject({ state: "closed" });
    const later = { ...proof, receiptId: randomUUID() };
    const before = await snapshot();
    expect(await proofPorts().registerProof(later)).toBeNull();
    expect(await proofRow(proof)).toEqual(original);
    await preserved(before, later, ["bfa_p5_voice.owner_clocks"]);
  });
  it.each(["anon", "authenticated"] as const)(
    "denies proof registration to %s without changes",
    async (role) => {
      const { proof } = await fixture();
      const before = await snapshot();
      await expect(raw("bfa_p5_v2_register_proof", { p_proof: proof }, role)).rejects.toThrow();
      expect(await snapshot()).toEqual(before);
    },
  );
  it("keeps private proof table and eligibility helper inaccessible to participant and service roles", async () => {
    const before = await snapshot();
    for (const role of ["anon", "authenticated", "service_role"] as const) {
      expect(
        (
          await one(
            "SELECT has_function_privilege($1,'bfa_p5_voice_v2.eligible(bfa_p5_voice.proofs)','EXECUTE') AS allowed;",
            [role],
          )
        ).allowed,
      ).toBe(false);
      await expect(
        asRole(role, "SELECT count(*) AS count FROM bfa_p5_voice.proofs;"),
      ).rejects.toThrow();
      await expect(
        asRole(role, "UPDATE bfa_p5_voice.proofs SET protocol=2 RETURNING receipt_id;"),
      ).rejects.toThrow();
    }
    expect(await snapshot()).toEqual(before);
  });
  it.each([
    "receipt",
    "cleanup",
    "session",
    "claim",
    "owner",
    "thread",
    "incarnation",
    "attempt",
    "approval",
  ] as const)("denies nil %s at the SQL boundary", async (field) => {
    const { proof, issuance } = await fixture();
    const bad = structuredClone(proof);
    if (field === "receipt") bad.receiptId = NIL;
    if (field === "cleanup") bad.cleanupId = NIL;
    if (field === "session") bad.authSessionId = NIL;
    if (field === "claim") bad.claim.claimId = NIL;
    const keys = {
      owner: "ownerId",
      thread: "threadId",
      incarnation: "threadIncarnation",
      attempt: "attemptId",
      approval: "approvalId",
    } as const;
    if (field in keys) bad.claim.binding[keys[field as keyof typeof keys]] = NIL;
    const before = await snapshot();
    expect(await raw("bfa_p5_v2_register_proof", { p_proof: bad })).toBeNull();
    await unchangedExcept(before, ["bfa_p5_voice.owner_clocks"], issuance.ownerId);
  });
  it("rejects unsupported persisted proof protocol while retaining all rows", async () => {
    const { proof } = await fixture();
    expect(await proofPorts().registerProof(proof)).toEqual(proof);
    const before = await snapshot();
    await expect(
      database().query("UPDATE bfa_p5_voice.proofs SET protocol=3 WHERE receipt_id=$1;", [
        proof.receiptId,
      ]),
    ).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });
  it("preserves the old rowtype proof writer and exact legacy claim/inspect/close after additive schema", async () => {
    const { q, proof, issuance, now, policyId } = await fixture();
    await database().query("DELETE FROM bfa_p5_voice.cleanup_owners WHERE cleanup_id=$1;", [
      q.cleanupId,
    ]);
    await database().query("INSERT INTO bfa_p5_voice.session_fences VALUES($1,$2,0,$3,false);", [
      issuance.ownerId,
      q.authSessionId,
      now + 60000,
    ]);
    await database().query("INSERT INTO bfa_p5_voice.quotas VALUES($1,$2,7,3,true);", [
      issuance.ownerId,
      policyId,
    ]);
    expect(await legacyRegister(q)).toEqual({ cleanupId: q.cleanupId, claim: q.claim });
    for (const operation of ["claim", "inspect"] as const) {
      const legacy = {
        receiptId: randomUUID(),
        operation,
        claim: q.claim,
        cleanupId: q.cleanupId,
        ownerSessionId: q.authSessionId,
        sessionVersion: 0,
        authorityFingerprint: q.authorityFingerprint,
        identityExpiresAt: now + 60000,
        verifiedAt: now,
        expiresAt: now + 10000,
        effectiveExpiresAt: now + 60000,
      };
      expect(
        (
          await asRole(
            "service_role",
            "SELECT public.bfa_p5_voice_register_proof($1::jsonb) AS value;",
            [JSON.stringify(legacy)],
          )
        ).value,
      ).toMatchObject({ receiptId: legacy.receiptId, operation });
      expect(
        (
          await one("SELECT protocol FROM bfa_p5_voice.proofs WHERE receipt_id=$1;", [
            legacy.receiptId,
          ])
        ).protocol,
      ).toBeNull();
      expect(
        (
          await asRole(
            "service_role",
            `SELECT public.bfa_p5_voice_${operation}($1,$2::jsonb) AS value;`,
            [legacy.receiptId, JSON.stringify(q.claim)],
          )
        ).value,
      ).toMatchObject({ state: "claimed" });
    }
    expect(await proofPorts().registerProof(proof)).toBeNull();
    expect(await ports().readCleanup(readQuery(q))).toBeNull();
    await close(q);
    expect(await claimedRow(proof)).toMatchObject({ state: "closed", held_units: 3 });
    expect(
      (
        await one(
          "SELECT remaining_units FROM bfa_p5_voice.quotas WHERE owner_id=$1 AND policy_id=$2;",
          [issuance.ownerId, policyId],
        )
      ).remaining_units,
    ).toBe(4);
  });
});
