// Actual isolated PostgreSQL and inactive v2 cleanup transport; fictional
// identity/policy/approval metadata only. No Auth, HTTP, provider or device call.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { readFile, readdir, realpath } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
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
const readArgs = (q: VoiceV2CleanupReadQuery) => ({
  p_cleanup_id: q.cleanupId,
  p_claim: q.claim,
  p_auth_session_id: q.authSessionId,
  p_parent_version: q.parentVersion,
  p_fingerprint: q.authorityFingerprint,
});
const registerArgs = (q: VoiceV2CleanupRegistration) => ({
  ...readArgs(q),
  p_verified_ms: q.verifiedAt,
  p_auth_expires_ms: q.authExpiresAt,
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

sqlSuite("P5 proposed v2 cleanup in isolated PostgreSQL", () => {
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
    for (const kind of ["unbound", "bound", "closed"]) {
      const ownerId = randomUUID(),
        claimId = randomUUID();
      const claim = {
        claimId,
        expiresAt: Date.now() + 60000,
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
        "INSERT INTO bfa_p5_voice.cleanup_owners(cleanup_id,claim_id,owner_id,claim,effective_expires_ms,closed_ms,session_id,session_version,authority_fingerprint) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9);",
        [
          randomUUID(),
          claimId,
          ownerId,
          JSON.stringify(claim),
          claim.expiresAt,
          kind === "closed" ? Date.now() : null,
          kind === "bound" ? randomUUID() : null,
          kind === "bound" ? 3 : null,
          kind === "bound" ? digest() : null,
        ],
      );
    }
    preexistingLegacyRows = (
      await database().query(
        "SELECT to_jsonb(k) AS value FROM bfa_p5_voice.cleanup_owners k ORDER BY cleanup_id;",
      )
    ).rows;
    expect(preexistingLegacyRows).toHaveLength(3);
    await install("docs/pilot/conversation/sql-drafts/p5-voice-v2-cleanup.sql");
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
        entries.map(([key, value]) => (key === "p_claim" ? JSON.stringify(value) : value)),
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
      parents: createVoiceV2ParentIssuanceRpcPorts(client),
      preissue: createVoiceV2PreissueRpcPorts(client),
    };
  }
  const ports = () => transport().ports;
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
    return { q, issuance, now };
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

  it("preserves preexisting bound, unbound and closed legacy rows across the additive column", async () => {
    for (const { value } of preexistingLegacyRows) {
      const previous = value as Record<string, unknown>;
      const current = (
        await one(
          "SELECT to_jsonb(k) AS value FROM bfa_p5_voice.cleanup_owners k WHERE cleanup_id=$1;",
          [previous.cleanup_id],
        )
      ).value;
      expect(current).toEqual({ ...previous, protocol: null });
    }
  });

  it.each(["unsupported protocol", "unbound v2", "nil v2 session"])(
    "enforces persisted provenance constraint against %s",
    async (kind) => {
      const { q } = await fixture();
      await legacyRegister(q);
      const before = await snapshot();
      if (kind === "unsupported protocol")
        await expect(
          database().query(
            "UPDATE bfa_p5_voice.cleanup_owners SET protocol=3 WHERE cleanup_id=$1;",
            [q.cleanupId],
          ),
        ).rejects.toThrow();
      if (kind === "unbound v2")
        await expect(
          database().query(
            "UPDATE bfa_p5_voice.cleanup_owners SET protocol=2 WHERE cleanup_id=$1;",
            [q.cleanupId],
          ),
        ).rejects.toThrow();
      if (kind === "nil v2 session")
        await expect(
          database().query(
            "UPDATE bfa_p5_voice.cleanup_owners SET protocol=2,session_id=$2,session_version=0,authority_fingerprint=$3 WHERE cleanup_id=$1;",
            [q.cleanupId, NIL, q.authorityFingerprint],
          ),
        ).rejects.toThrow();
      expect(await snapshot()).toEqual(before);
    },
  );

  it("registers exact protocol provenance and bounded association without admission or accounting changes", async () => {
    const { q, issuance } = await fixture();
    await seedHolds(issuance);
    const before = await snapshot();
    const t = transport();
    const result = await t.ports.registerCleanup(q);
    expect(result).toEqual({
      protocol: 2,
      ...readQuery(q),
      effectiveExpiresAt: issuance.expiresAt,
      closedAt: null,
      expiredAt: null,
      invalidatedAt: null,
    });
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0].committed).toBe(true);
    expect(await row(q)).toMatchObject({
      protocol: 2,
      session_id: q.authSessionId,
      session_version: 0,
      authority_fingerprint: q.authorityFingerprint,
    });
    await unchangedExcept(
      before,
      ["bfa_p5_voice.cleanup_owners", "bfa_p5_voice.owner_clocks"],
      issuance.ownerId,
    );
    const after = await snapshot();
    expect(await t.ports.readCleanup(readQuery(q))).toEqual(result);
    expect(await snapshot()).toEqual(after);
    expect(JSON.stringify(result)).not.toContain("fictional private source");
    expect(Object.isFrozen(result!.claim.binding)).toBe(true);
  });

  it("acknowledges exact replay without renewing expiry or replacing identity", async () => {
    const { q, issuance, now } = await fixture();
    await seedHolds(issuance);
    const first = await ports().registerCleanup(q);
    const prior = await row(q);
    await setClock(now + 1);
    expect(
      await ports().registerCleanup({ ...q, verifiedAt: now + 1, authExpiresAt: now + 3600000 }),
    ).toEqual(first);
    const after = await row(q);
    for (const key of [
      "cleanup_id",
      "claim_id",
      "claim",
      "session_id",
      "session_version",
      "authority_fingerprint",
      "protocol",
      "effective_expires_ms",
    ])
      expect(after[key]).toEqual(prior[key]);
  });

  it.each(["claim", "Auth", "allowlist"])(
    "bounds initial cleanup lifetime by %s and never lengthens a retained shorter ceiling",
    async (source) => {
      const { q, issuance, now } = await fixture();
      const short = now + 10000;
      if (source === "claim") q.claim = { ...q.claim, expiresAt: short };
      if (source === "Auth") q.authExpiresAt = short;
      if (source === "allowlist")
        await database().query(
          "UPDATE public.bfa_p3b_staging_accounts SET expires_at=to_timestamp($2/1000.0) WHERE user_id=$1;",
          [issuance.ownerId, short],
        );
      expect(await ports().registerCleanup(q)).toMatchObject({ effectiveExpiresAt: short });
      if (source === "Auth") q.authExpiresAt = now + 1800000;
      if (source === "allowlist")
        await database().query(
          "UPDATE public.bfa_p3b_staging_accounts SET expires_at=to_timestamp($2/1000.0) WHERE user_id=$1;",
          [issuance.ownerId, now + 7200000],
        );
      expect(await ports().registerCleanup(q)).toMatchObject({ effectiveExpiresAt: short });
    },
  );

  it("shrinks an existing exact association without changing unrelated retained holds", async () => {
    const { q, issuance, now } = await fixture();
    await seedHolds(issuance);
    expect(await ports().registerCleanup(q)).not.toBeNull();
    const before = await snapshot();
    expect(await ports().registerCleanup({ ...q, authExpiresAt: now + 9000 })).toMatchObject({
      effectiveExpiresAt: now + 9000,
    });
    expect(await ports().registerCleanup(q)).toMatchObject({ effectiveExpiresAt: now + 9000 });
    await unchangedExcept(
      before,
      ["bfa_p5_voice.cleanup_owners", "bfa_p5_voice.owner_clocks"],
      issuance.ownerId,
    );
  });

  it.each(["legacy unbound", "legacy bound", "closed", "expired", "invalidated"])(
    "denies adoption/reopening of %s cleanup evidence",
    async (kind) => {
      const { q, issuance, now } = await fixture();
      await seedHolds(issuance);
      if (kind.startsWith("legacy")) {
        await legacyRegister(q);
        if (kind === "legacy bound")
          await database().query(
            "UPDATE bfa_p5_voice.cleanup_owners SET session_id=$2,session_version=0,authority_fingerprint=$3 WHERE cleanup_id=$1;",
            [q.cleanupId, q.authSessionId, q.authorityFingerprint],
          );
      } else {
        expect(await ports().registerCleanup(q)).not.toBeNull();
        const column = {
          closed: "closed_ms",
          expired: "expired_ms",
          invalidated: "invalidated_ms",
        }[kind as "closed" | "expired" | "invalidated"];
        await database().query(
          `UPDATE bfa_p5_voice.cleanup_owners SET ${column}=$2 WHERE cleanup_id=$1;`,
          [q.cleanupId, now],
        );
      }
      const before = await snapshot();
      expect(await ports().registerCleanup(q)).toBeNull();
      await unchangedExcept(before, ["bfa_p5_voice.owner_clocks"], issuance.ownerId);
      const persisted = await ports().readCleanup(readQuery(q));
      if (kind.startsWith("legacy")) expect(persisted).toBeNull();
      else expect(persisted).not.toBeNull();
    },
  );

  it("preserves close-before-register as terminal legacy provenance with no late adoption", async () => {
    const { q, issuance } = await fixture();
    await seedHolds(issuance);
    expect(await close(q)).toMatchObject({ state: "closed", claim: q.claim });
    const before = await snapshot();
    expect(await ports().registerCleanup(q)).toBeNull();
    expect(await ports().readCleanup(readQuery(q))).toBeNull();
    expect(await row(q)).toMatchObject({
      protocol: null,
      session_id: null,
      authority_fingerprint: null,
    });
    await unchangedExcept(before, ["bfa_p5_voice.owner_clocks"], issuance.ownerId);
    await close(q);
    await unchangedExcept(before, ["bfa_p5_voice.owner_clocks"], issuance.ownerId);
  });

  it("preserves exact cleanup after registration, expiry, parent revocation and loss of staging access", async () => {
    const { q, issuance, now } = await fixture();
    await seedHolds(issuance);
    expect(await ports().registerCleanup(q)).not.toBeNull();
    await transport().parents.revokeParent({
      ownerId: issuance.ownerId,
      authSessionId: q.authSessionId,
    });
    await database().query("DELETE FROM public.bfa_p3b_staging_accounts WHERE user_id=$1;", [
      issuance.ownerId,
    ]);
    await setClock(now + 120000);
    const before = await snapshot();
    expect(await close(q)).toMatchObject({ state: "closed" });
    const evidence = await ports().readCleanup(readQuery(q));
    expect(evidence).toMatchObject({
      protocol: 2,
      closedAt: now + 120000,
      effectiveExpiresAt: issuance.expiresAt,
    });
    expect(await ports().registerCleanup({ ...q, verifiedAt: now + 120000 })).toBeNull();
    await unchangedExcept(
      before,
      ["bfa_p5_voice.cleanup_owners", "bfa_p5_voice.attempts", "bfa_p5_voice.owner_clocks"],
      issuance.ownerId,
    );
    const after = await snapshot();
    await close(q);
    expect(await snapshot()).toEqual(after);
  });

  it.each(["cleanup", "claim", "parent", "session", "fingerprint", "claim binding"])(
    "denies exact-registration identity mismatch: %s",
    async (field) => {
      const { q, issuance } = await fixture();
      expect(await ports().registerCleanup(q)).not.toBeNull();
      const before = await snapshot();
      const bad = structuredClone(q);
      if (field === "cleanup") bad.cleanupId = randomUUID();
      if (field === "claim") bad.claim.claimId = randomUUID();
      if (field === "parent") bad.parentVersion++;
      if (field === "session") bad.authSessionId = randomUUID();
      if (field === "fingerprint") bad.authorityFingerprint = digest();
      if (field === "claim binding") bad.claim.binding.approvalDigest = digest();
      expect(await ports().registerCleanup(bad)).toBeNull();
      expect(await ports().readCleanup(readQuery(bad))).toBeNull();
      await unchangedExcept(before, ["bfa_p5_voice.owner_clocks"], issuance.ownerId);
    },
  );

  it.each([
    "legacy",
    "revoked parent",
    "revision",
    "deleted",
    "retired",
    "source",
    "issuance",
    "binding",
    "allowlist",
  ])(
    "denies registration under changed current %s state without erasing records",
    async (change) => {
      const { q, issuance, now } = await fixture();
      await seedHolds(issuance);
      if (change === "legacy")
        await database().query(
          "INSERT INTO bfa_p5_voice.session_fences VALUES($1,$2,0,$3,false);",
          [issuance.ownerId, q.authSessionId, now + 60000],
        );
      if (change === "revoked parent")
        await transport().parents.revokeParent({
          ownerId: issuance.ownerId,
          authSessionId: q.authSessionId,
        });
      if (change === "revision")
        await database().query("UPDATE public.bfa_p3b_threads SET revision=1 WHERE id=$1;", [
          issuance.threadId,
        ]);
      if (change === "deleted")
        await asRole("service_role", "SELECT public.bfa_p3b_fence($1,$2,'delete') AS revision;", [
          issuance.ownerId,
          issuance.threadId,
        ]);
      if (change === "retired")
        await database().query(
          "UPDATE bfa_p5_voice.generations SET retired=true WHERE incarnation=$1;",
          [issuance.threadIncarnation],
        );
      if (change === "source")
        await database().query(
          "UPDATE public.bfa_p3b_threads SET created_at=created_at+interval '1 microsecond' WHERE id=$1;",
          [issuance.threadId],
        );
      if (change === "issuance")
        await database().query(
          "UPDATE bfa_p5_voice.issuances SET revoked=true WHERE fingerprint=$1;",
          [q.authorityFingerprint],
        );
      if (change === "binding")
        await database().query(
          "DELETE FROM bfa_p5_voice_v2.issuance_auth_bindings WHERE fingerprint=$1;",
          [q.authorityFingerprint],
        );
      if (change === "allowlist")
        await database().query(
          "UPDATE public.bfa_p3b_staging_accounts SET admitted=false WHERE user_id=$1;",
          [issuance.ownerId],
        );
      const before = await snapshot();
      expect(await ports().registerCleanup(q)).toBeNull();
      expect(await row(q)).toBeUndefined();
      await unchangedExcept(before, ["bfa_p5_voice.owner_clocks"], issuance.ownerId);
    },
  );

  it.each(["expired authority", "30000ms age", "future verification", "rollback"])(
    "denies %s while retaining all accounting",
    async (kind) => {
      const { q, issuance, now } = await fixture();
      await seedHolds(issuance);
      if (kind === "expired authority") {
        await setClock(issuance.expiresAt);
        q.verifiedAt = issuance.expiresAt;
      }
      if (kind === "30000ms age") await setClock(now + 30000);
      if (kind === "future verification") q.verifiedAt = now + 1;
      if (kind === "rollback") await setClock(now - 1);
      const before = await snapshot();
      expect(await ports().registerCleanup(q)).toBeNull();
      await unchangedExcept(before, ["bfa_p5_voice.owner_clocks"], issuance.ownerId);
    },
  );

  it.each(["Auth", "allowlist"])(
    "retains a stale shorter %s deadline as negative evidence without reviving it later",
    async (source) => {
      const { q, issuance, now } = await fixture();
      await seedHolds(issuance);
      expect(await ports().registerCleanup(q)).not.toBeNull();
      await setClock(now + 30000);
      if (source === "Auth") q.authExpiresAt = now + 10000;
      else
        await database().query(
          "UPDATE public.bfa_p3b_staging_accounts SET expires_at=to_timestamp($2/1000.0) WHERE user_id=$1;",
          [issuance.ownerId, now + 10000],
        );
      const before = await snapshot();
      expect(await ports().registerCleanup(q)).toBeNull();
      expect(await ports().readCleanup(readQuery(q))).toMatchObject({
        effectiveExpiresAt: now + 10000,
      });
      await unchangedExcept(
        before,
        ["bfa_p5_voice.cleanup_owners", "bfa_p5_voice.owner_clocks"],
        issuance.ownerId,
      );
      q.authExpiresAt = now + 1800000;
      q.verifiedAt = now + 30000;
      await database().query(
        "UPDATE public.bfa_p3b_staging_accounts SET expires_at=to_timestamp($2/1000.0) WHERE user_id=$1;",
        [issuance.ownerId, now + 7200000],
      );
      const retained = await snapshot();
      expect(await ports().registerCleanup(q)).toBeNull();
      expect(await ports().readCleanup(readQuery(q))).toMatchObject({
        effectiveExpiresAt: now + 10000,
      });
      await unchangedExcept(retained, ["bfa_p5_voice.owner_clocks"], issuance.ownerId);
    },
  );

  it.each(["future", "rollback"])(
    "does not retain a shorter ceiling from %s time",
    async (kind) => {
      const { q, issuance, now } = await fixture();
      expect(await ports().registerCleanup(q)).not.toBeNull();
      const previous = await row(q);
      q.authExpiresAt = now + 10000;
      if (kind === "future") q.verifiedAt = now + 1;
      else await setClock(now - 1);
      const before = await snapshot();
      expect(await ports().registerCleanup(q)).toBeNull();
      expect(await row(q)).toEqual(previous);
      await unchangedExcept(before, ["bfa_p5_voice.owner_clocks"], issuance.ownerId);
    },
  );

  it.each(["claim", "retired attempt", "won attempt", "proof cleanup", "proof claim"])(
    "denies registration or shortening after any retained downstream %s",
    async (kind) => {
      const { q, issuance, now } = await fixture();
      await seedHolds(issuance);
      expect(await ports().registerCleanup(q)).not.toBeNull();
      if (kind === "claim")
        await database().query(
          "INSERT INTO bfa_p5_voice.claims VALUES($1,$2,$3::jsonb,$4,'claimed',$5,3);",
          [
            q.claim.claimId,
            issuance.ownerId,
            JSON.stringify(q.claim),
            issuance.expiresAt,
            randomUUID(),
          ],
        );
      if (kind === "retired attempt")
        await database().query("INSERT INTO bfa_p5_voice.attempts VALUES($1,$2,NULL,true);", [
          issuance.ownerId,
          q.claim.binding.attemptId,
        ]);
      if (kind === "won attempt")
        await database().query("INSERT INTO bfa_p5_voice.attempts VALUES($1,$2,$3,false);", [
          issuance.ownerId,
          q.claim.binding.attemptId,
          randomUUID(),
        ]);
      if (kind.startsWith("proof"))
        await database().query(
          "INSERT INTO bfa_p5_voice.proofs(receipt_id,operation,cleanup_id,claim_id,owner_id,claim,session_id,session_version,authority_fingerprint,identity_expires_ms,verified_ms,expires_ms,effective_expires_ms) VALUES($1,'claim',$2,$3,$4,$5::jsonb,$6,0,$7,$8,$9,$10,$8);",
          [
            randomUUID(),
            kind === "proof cleanup" ? q.cleanupId : randomUUID(),
            kind === "proof claim" ? q.claim.claimId : randomUUID(),
            issuance.ownerId,
            JSON.stringify(q.claim),
            q.authSessionId,
            q.authorityFingerprint,
            issuance.expiresAt,
            now,
            now + 10000,
          ],
        );
      const before = await snapshot(),
        previous = await row(q);
      expect(await ports().registerCleanup({ ...q, authExpiresAt: now + 5000 })).toBeNull();
      expect(await row(q)).toEqual(previous);
      expect(await snapshot()).toEqual(before);
    },
  );

  it("reads exact persisted evidence without clock mutation after expiry and parent revocation", async () => {
    const { q, issuance, now } = await fixture();
    const first = await ports().registerCleanup(q);
    await transport().parents.revokeParent({
      ownerId: issuance.ownerId,
      authSessionId: q.authSessionId,
    });
    await setClock(now + 120000);
    const before = await snapshot();
    expect(await ports().readCleanup(readQuery(q))).toEqual(first);
    expect(await snapshot()).toEqual(before);
    await setClock(-1);
    expect(await ports().readCleanup(readQuery(q))).toEqual(first);
    expect(await snapshot()).toEqual(before);
  });

  it.each(["lost", "malformed"])(
    "retains committed cleanup after %s acknowledgment without retrying",
    async (reply) => {
      const { q, issuance } = await fixture();
      await seedHolds(issuance);
      const before = await snapshot();
      const t = transport();
      t.hooks.afterCommit = async () => {
        if (reply === "lost") throw new Error("fictional response loss");
        return { protocol: 1 };
      };
      await expect(t.ports.registerCleanup(q)).rejects.toThrow("voice-v2-cleanup-rpc-unavailable");
      expect(t.calls).toHaveLength(1);
      expect(t.calls[0]).toMatchObject({ name: "bfa_p5_v2_register_cleanup", committed: true });
      expect(await ports().readCleanup(readQuery(q))).toMatchObject({
        protocol: 2,
        cleanupId: q.cleanupId,
      });
      await unchangedExcept(
        before,
        ["bfa_p5_voice.cleanup_owners", "bfa_p5_voice.owner_clocks"],
        issuance.ownerId,
      );
    },
  );

  it.each(["anon", "authenticated"] as const)(
    "denies both RPCs to %s without any data changes",
    async (role) => {
      const { q } = await fixture();
      const before = await snapshot();
      await expect(raw("bfa_p5_v2_register_cleanup", registerArgs(q), role)).rejects.toThrow();
      await expect(raw("bfa_p5_v2_read_cleanup", readArgs(q), role)).rejects.toThrow();
      expect(await snapshot()).toEqual(before);
    },
  );

  it("keeps private cleanup table access denied even to service_role", async () => {
    const before = await snapshot();
    for (const role of ["anon", "authenticated", "service_role"] as const) {
      expect(
        (
          await one(
            "SELECT has_function_privilege($1,'bfa_p5_voice_v2.cleanup_observation(bfa_p5_voice.cleanup_owners)','EXECUTE') AS allowed;",
            [role],
          )
        ).allowed,
      ).toBe(false);
      await expect(
        asRole(role, "SELECT count(*) AS count FROM bfa_p5_voice.cleanup_owners;"),
      ).rejects.toThrow();
      await expect(
        asRole(role, "UPDATE bfa_p5_voice.cleanup_owners SET protocol=2 RETURNING cleanup_id;"),
      ).rejects.toThrow();
    }
    expect(await snapshot()).toEqual(before);
  });

  it.each(["cleanup", "session", "claim", "owner", "thread", "incarnation", "attempt", "approval"])(
    "rejects nil %s identity at the SQL boundary",
    async (field) => {
      const { q, issuance } = await fixture();
      const bad = structuredClone(q);
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
      expect(await raw("bfa_p5_v2_register_cleanup", registerArgs(bad))).toBeNull();
      expect(await raw("bfa_p5_v2_read_cleanup", readArgs(bad))).toBeNull();
      await unchangedExcept(before, ["bfa_p5_voice.owner_clocks"], issuance.ownerId);
    },
  );

  it("retains full legacy register/proof/claim/inspect/close behavior after additive schema", async () => {
    const { q, issuance, now } = await fixture();
    const policy = randomUUID();
    await database().query("INSERT INTO bfa_p5_voice.session_fences VALUES($1,$2,0,$3,false);", [
      issuance.ownerId,
      q.authSessionId,
      now + 60000,
    ]);
    await database().query("INSERT INTO bfa_p5_voice.quotas VALUES($1,$2,7,3,true);", [
      issuance.ownerId,
      policy,
    ]);
    const b = q.claim.binding;
    await database().query(
      "INSERT INTO bfa_p5_voice.approvals VALUES($1,$2,$3,$4,$5,$6,$7,'developer-voice-session',$8,false,$9);",
      [
        b.approvalId,
        b.approvalDigest,
        b.ownerId,
        b.threadId,
        b.threadIncarnation,
        b.threadRevision,
        b.attemptId,
        now + 60000,
        policy,
      ],
    );
    expect(await legacyRegister(q)).toEqual({ cleanupId: q.cleanupId, claim: q.claim });
    const proof = (operation: "claim" | "inspect") => ({
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
    });
    for (const operation of ["claim", "inspect"] as const) {
      const p = proof(operation);
      expect(
        (
          await asRole(
            "service_role",
            "SELECT public.bfa_p5_voice_register_proof($1::jsonb) AS value;",
            [JSON.stringify(p)],
          )
        ).value,
      ).toMatchObject({ receiptId: p.receiptId, operation });
      expect(
        (
          await asRole(
            "service_role",
            `SELECT public.bfa_p5_voice_${operation}($1,$2::jsonb) AS value;`,
            [p.receiptId, JSON.stringify(q.claim)],
          )
        ).value,
      ).toMatchObject({ state: "claimed" });
    }
    expect(await row(q)).toMatchObject({ protocol: null, session_id: q.authSessionId });
    expect(await ports().readCleanup(readQuery(q))).toBeNull();
    expect(await ports().registerCleanup(q)).toBeNull();
    await close(q);
    expect(
      await one("SELECT held_units,state FROM bfa_p5_voice.claims WHERE claim_id=$1;", [
        q.claim.claimId,
      ]),
    ).toEqual({ held_units: 3, state: "closed" });
    expect(
      (
        await one(
          "SELECT remaining_units FROM bfa_p5_voice.quotas WHERE owner_id=$1 AND policy_id=$2;",
          [issuance.ownerId, policy],
        )
      ).remaining_units,
    ).toBe(4);
  });
});
