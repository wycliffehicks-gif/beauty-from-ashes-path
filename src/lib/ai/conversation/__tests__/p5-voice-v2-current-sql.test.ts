// Actual isolated PostgreSQL and inactive v2 current reader; fictional
// identity/policy/approval metadata only. No Auth, HTTP, provider or device call.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { readFile, readdir, realpath } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
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

sqlSuite("P5 proposed v2 post-issuance current reader in isolated PostgreSQL", () => {
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
    await install("docs/pilot/conversation/sql-drafts/p5-voice-v2-current.sql");
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
      current: createVoiceV2CurrentRpcPorts(client),
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
    return { q, issuance, now, approvalId, approvalDigest, policyId };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  function expected(f: Fixture, q = f.q) {
    const owned = {
      ownerId: q.ownerId,
      threadId: q.threadId,
      threadIncarnation: f.issuance.threadIncarnation,
      threadRevision: 0,
    };
    return {
      protocol: 2,
      request: q,
      current: {
        ...owned,
        deleted: false,
        allowlist: { ownerId: q.ownerId, admitted: true, expiresAt: f.now + 7200000 },
        authority: {
          ...owned,
          fingerprint: q.authorityFingerprint,
          issuedAt: f.issuance.issuedAt,
          expiresAt: f.issuance.expiresAt,
          revoked: false,
        },
        approval: {
          ...owned,
          id: f.approvalId,
          digest: f.approvalDigest,
          scope: "developer-voice-session",
          attemptId: q.attemptId,
          expiresAt: f.now + 60000,
          revoked: false,
        },
      },
    };
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
  async function preserved(before: Awaited<ReturnType<typeof snapshot>>, ownerId?: string) {
    const after = await snapshot();
    for (const table of tables) {
      if (ownerId && table === "bfa_p5_voice.owner_clocks")
        expect(
          after[table]!.filter((r) => r.owner_id !== ownerId),
          table,
        ).toEqual(before[table]!.filter((r) => r.owner_id !== ownerId));
      else expect(after[table], table).toEqual(before[table]);
    }
  }
  const read = (q: VoiceV2CurrentQuery) => transport().current.readCurrent(q);
  const clockRow = (q: VoiceV2CurrentQuery) =>
    one("SELECT observed_ms FROM bfa_p5_voice.owner_clocks WHERE owner_id=$1;", [q.ownerId]);
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

  it("reads the actual v2 chain before any cleanup, proof, attempt, claim or capacity exists", async () => {
    const f = await fixture();
    await seedHolds(f.issuance);
    const before = await snapshot(),
      t = transport();
    await setClock(f.now + 1);
    const result = await t.current.readCurrent(f.q);
    expect(result).toEqual(expected(f));
    expect(t.calls).toEqual([
      { name: "bfa_p5_v2_read_current", args: { p_request: f.q }, committed: true },
    ]);
    expect(JSON.stringify(result)).not.toContain("fictional private source");
    expect(await clockRow(f.q)).toEqual({ observed_ms: f.now + 1 });
    await preserved(before, f.q.ownerId);
    for (const table of ["cleanup_owners", "proofs", "claims", "attempts"])
      expect(
        (
          await one(`SELECT count(*)::integer AS n FROM bfa_p5_voice.${table} WHERE owner_id=$1;`, [
            f.q.ownerId,
          ])
        ).n,
      ).toBe(table === "cleanup_owners" || table === "claims" ? 1 : 0);
    // The one legacy held cleanup/claim seeded above is unrelated; no new one.
  });

  it("observes an older still-valid issuance with fresh Auth without renewing either original lifetime", async () => {
    const f = await fixture(),
      q = { ...f.q, verifiedAt: f.now + 40000, identityExpiresAt: f.now + 45000 };
    await setClock(q.verifiedAt);
    const before = await snapshot();
    const result = await read(q);
    expect(result).toEqual(expected(f, q));
    expect(result!.current.authority.expiresAt).toBeGreaterThan(q.identityExpiresAt);
    await preserved(before, q.ownerId);
    expect(
      await one("SELECT issued_ms,expires_ms FROM bfa_p5_voice.issuances WHERE fingerprint=$1;", [
        q.authorityFingerprint,
      ]),
    ).toEqual({ issued_ms: f.now, expires_ms: f.now + 60000 });
  });

  it("allows issuance after original Auth verification when both are still current", async () => {
    const f = await fixture();
    await database().query("UPDATE bfa_p5_voice.issuances SET issued_ms=$1 WHERE fingerprint=$2;", [
      f.now + 5,
      f.q.authorityFingerprint,
    ]);
    await setClock(f.now + 10);
    const before = await snapshot(),
      want = expected(f);
    want.current.authority.issuedAt = f.now + 5;
    expect(await read(f.q)).toEqual(want);
    await preserved(before, f.q.ownerId);
  });

  it("reports a shorter current approval and Auth ceiling without rewriting immutable issuance", async () => {
    const f = await fixture(),
      q = { ...f.q, identityExpiresAt: f.now + 1000 };
    await database().query(
      "UPDATE bfa_p5_voice.approvals SET expires_ms=$1 WHERE approval_id=$2;",
      [f.now + 500, f.approvalId],
    );
    const before = await snapshot(),
      want = expected(f, q);
    want.current.approval.expiresAt = f.now + 500;
    expect(await read(q)).toEqual(want);
    await preserved(before);
  });

  it.each(["owner", "Auth session", "parent version", "thread", "attempt", "fingerprint"])(
    "denies foreign or absent request %s without adopting an identity",
    async (field) => {
      const f = await fixture(),
        q = { ...f.q };
      if (field === "owner") q.ownerId = randomUUID();
      if (field === "Auth session") q.authSessionId = randomUUID();
      if (field === "parent version") q.parentVersion++;
      if (field === "thread") q.threadId = randomUUID();
      if (field === "attempt") q.attemptId = randomUUID();
      if (field === "fingerprint") q.authorityFingerprint = digest();
      const before = await snapshot();
      expect(await read(q)).toBeNull();
      await preserved(before);
    },
  );

  it("denies another existing clear Auth parent for the original immutable issuance", async () => {
    const f = await fixture(),
      authSessionId = randomUUID();
    expect(
      await transport().parents.observeParent({
        ownerId: f.q.ownerId,
        authSessionId,
        verifiedAt: f.now,
        authExpiresAt: f.q.identityExpiresAt,
      }),
    ).not.toBeNull();
    const q = { ...f.q, authSessionId },
      before = await snapshot();
    expect(await read(q)).toBeNull();
    await preserved(before);
  });

  it("denies a revoked parent without changing issuance, approvals or unrelated held usage", async () => {
    const f = await fixture();
    await seedHolds(f.issuance);
    await transport().parents.revokeParent({
      ownerId: f.q.ownerId,
      authSessionId: f.q.authSessionId,
    });
    const before = await snapshot();
    expect(await read(f.q)).toBeNull();
    await preserved(before);
  });

  it.each(["active", "expired", "revoked"])(
    "rejects every retained %s legacy fence",
    async (kind) => {
      const f = await fixture();
      await database().query("INSERT INTO bfa_p5_voice.session_fences VALUES($1,$2,0,$3,$4);", [
        f.q.ownerId,
        f.q.authSessionId,
        kind === "expired" ? f.now - 1 : f.now + 60000,
        kind === "revoked",
      ]);
      const before = await snapshot();
      expect(await read(f.q)).toBeNull();
      await preserved(before);
    },
  );

  const changes: [string, (f: Fixture) => Promise<unknown>][] = [
    [
      "missing allowlist",
      (f) =>
        database().query("DELETE FROM public.bfa_p3b_staging_accounts WHERE user_id=$1;", [
          f.q.ownerId,
        ]),
    ],
    [
      "withdrawn allowlist",
      (f) =>
        database().query(
          "UPDATE public.bfa_p3b_staging_accounts SET admitted=false WHERE user_id=$1;",
          [f.q.ownerId],
        ),
    ],
    [
      "expired allowlist",
      (f) =>
        database().query(
          "UPDATE public.bfa_p3b_staging_accounts SET expires_at=to_timestamp($1/1000.0) WHERE user_id=$2;",
          [f.now, f.q.ownerId],
        ),
    ],
    [
      "deleted thread",
      (f) =>
        database().query(
          "UPDATE public.bfa_p3b_threads SET deleted_at=clock_timestamp(),saved_snapshot=NULL,saved_at=NULL WHERE id=$1;",
          [f.q.threadId],
        ),
    ],
    [
      "foreign thread",
      (f) =>
        database().query("UPDATE public.bfa_p3b_threads SET owner_id=$1 WHERE id=$2;", [
          randomUUID(),
          f.q.threadId,
        ]),
    ],
    [
      "changed thread revision",
      (f) =>
        database().query("UPDATE public.bfa_p3b_threads SET revision=1 WHERE id=$1;", [
          f.q.threadId,
        ]),
    ],
    [
      "recreated source timestamp",
      (f) =>
        database().query(
          "UPDATE public.bfa_p3b_threads SET created_at=created_at+interval '1 microsecond' WHERE id=$1;",
          [f.q.threadId],
        ),
    ],
    [
      "nonfinite source timestamp",
      (f) =>
        database().query(
          "UPDATE public.bfa_p3b_threads SET created_at='infinity'::timestamptz WHERE id=$1;",
          [f.q.threadId],
        ),
    ],
    [
      "missing generation",
      (f) =>
        database().query("DELETE FROM bfa_p5_voice.generations WHERE thread_id=$1;", [
          f.q.threadId,
        ]),
    ],
    [
      "retired generation",
      (f) =>
        database().query("UPDATE bfa_p5_voice.generations SET retired=true WHERE thread_id=$1;", [
          f.q.threadId,
        ]),
    ],
    [
      "foreign generation",
      (f) =>
        database().query("UPDATE bfa_p5_voice.generations SET owner_id=$1 WHERE thread_id=$2;", [
          randomUUID(),
          f.q.threadId,
        ]),
    ],
    [
      "changed incarnation",
      (f) =>
        database().query("UPDATE bfa_p5_voice.generations SET incarnation=$1 WHERE thread_id=$2;", [
          randomUUID(),
          f.q.threadId,
        ]),
    ],
    [
      "legacy unbound issuance",
      (f) =>
        database().query(
          "DELETE FROM bfa_p5_voice_v2.issuance_auth_bindings WHERE fingerprint=$1;",
          [f.q.authorityFingerprint],
        ),
    ],
    [
      "foreign issuance",
      (f) =>
        database().query("UPDATE bfa_p5_voice.issuances SET owner_id=$1 WHERE fingerprint=$2;", [
          randomUUID(),
          f.q.authorityFingerprint,
        ]),
    ],
    [
      "issuance on another thread",
      (f) =>
        database().query("UPDATE bfa_p5_voice.issuances SET thread_id=$1 WHERE fingerprint=$2;", [
          randomUUID(),
          f.q.authorityFingerprint,
        ]),
    ],
    [
      "revoked issuance",
      (f) =>
        database().query("UPDATE bfa_p5_voice.issuances SET revoked=true WHERE fingerprint=$1;", [
          f.q.authorityFingerprint,
        ]),
    ],
    [
      "future issuance",
      (f) =>
        database().query("UPDATE bfa_p5_voice.issuances SET issued_ms=$1 WHERE fingerprint=$2;", [
          f.now + 1,
          f.q.authorityFingerprint,
        ]),
    ],
    [
      "expired issuance",
      (f) =>
        database().query(
          "UPDATE bfa_p5_voice.issuances SET issued_ms=$1,expires_ms=$2 WHERE fingerprint=$3;",
          [f.now - 1000, f.now, f.q.authorityFingerprint],
        ),
    ],
    [
      "old binding parent version",
      (f) =>
        database().query(
          "UPDATE bfa_p5_voice_v2.issuance_auth_bindings SET parent_version=1 WHERE fingerprint=$1;",
          [f.q.authorityFingerprint],
        ),
    ],
    [
      "missing approval",
      (f) =>
        database().query("DELETE FROM bfa_p5_voice.approvals WHERE approval_id=$1;", [
          f.approvalId,
        ]),
    ],
    [
      "revoked approval",
      (f) =>
        database().query("UPDATE bfa_p5_voice.approvals SET revoked=true WHERE approval_id=$1;", [
          f.approvalId,
        ]),
    ],
    [
      "expired approval",
      (f) =>
        database().query("UPDATE bfa_p5_voice.approvals SET expires_ms=$1 WHERE approval_id=$2;", [
          f.now,
          f.approvalId,
        ]),
    ],
    [
      "approval for another owner",
      (f) =>
        database().query("UPDATE bfa_p5_voice.approvals SET owner_id=$1 WHERE approval_id=$2;", [
          randomUUID(),
          f.approvalId,
        ]),
    ],
    [
      "approval for another thread",
      (f) =>
        database().query("UPDATE bfa_p5_voice.approvals SET thread_id=$1 WHERE approval_id=$2;", [
          randomUUID(),
          f.approvalId,
        ]),
    ],
    [
      "approval for another incarnation",
      (f) =>
        database().query("UPDATE bfa_p5_voice.approvals SET incarnation=$1 WHERE approval_id=$2;", [
          randomUUID(),
          f.approvalId,
        ]),
    ],
    [
      "approval for another revision",
      (f) =>
        database().query("UPDATE bfa_p5_voice.approvals SET revision=1 WHERE approval_id=$1;", [
          f.approvalId,
        ]),
    ],
    [
      "approval for another attempt",
      (f) =>
        database().query("UPDATE bfa_p5_voice.approvals SET attempt_id=$1 WHERE approval_id=$2;", [
          randomUUID(),
          f.approvalId,
        ]),
    ],
    [
      "nil approval identity",
      (f) =>
        database().query(
          "UPDATE bfa_p5_voice.approvals SET approval_id='00000000-0000-0000-0000-000000000000'::uuid WHERE approval_id=$1;",
          [f.approvalId],
        ),
    ],
  ];
  it.each(changes)(
    "denies %s without lifecycle, proof or accounting mutations",
    async (_name, change) => {
      const f = await fixture();
      await change(f);
      const before = await snapshot();
      expect(await read(f.q)).toBeNull();
      await preserved(before);
    },
  );

  it.each(["-infinity", "infinity", "0001-01-01T00:00:00Z", "290000-01-01T00:00:00Z"])(
    "denies non-wire allowlist deadline %s",
    async (expiry) => {
      const f = await fixture();
      await database().query(
        "UPDATE public.bfa_p3b_staging_accounts SET expires_at=$1::timestamptz WHERE user_id=$2;",
        [expiry, f.q.ownerId],
      );
      const before = await snapshot();
      expect(await read(f.q)).toBeNull();
      await preserved(before);
    },
  );

  it("floors fractional allowlist expiry conservatively at the exact boundary", async () => {
    const f = await fixture();
    await database().query(
      "UPDATE public.bfa_p3b_staging_accounts SET expires_at=to_timestamp($1/1000.0)+interval '900 microseconds' WHERE user_id=$2;",
      [f.now + 1, f.q.ownerId],
    );
    const before = await snapshot(),
      want = expected(f);
    want.current.allowlist.expiresAt = f.now + 1;
    expect(await read(f.q)).toEqual(want);
    await preserved(before);
    await setClock(f.now + 1);
    expect(await read(f.q)).toBeNull();
    await preserved(before, f.q.ownerId);
  });

  it.each([
    "wrong protocol",
    "extra key",
    "nil identity",
    "unsafe parent",
    "string time",
    "bad fingerprint",
    "empty lifetime",
  ])("rejects malformed direct SQL %s before mutations", async (kind) => {
    const f = await fixture(),
      q: Record<string, unknown> = { ...f.q };
    if (kind === "wrong protocol") q.protocol = 1;
    if (kind === "extra key") q.authorized = true;
    if (kind === "nil identity") q.ownerId = "00000000-0000-0000-0000-000000000000";
    if (kind === "unsafe parent") q.parentVersion = 9007199254740992;
    if (kind === "string time") q.verifiedAt = String(f.now);
    if (kind === "bad fingerprint") q.authorityFingerprint = "not-a-digest";
    if (kind === "empty lifetime") q.identityExpiresAt = f.now;
    const before = await snapshot();
    await expect(raw("bfa_p5_v2_read_current", { p_request: q })).rejects.toThrow();
    await preserved(before);
  });

  it.each(
    ["NULL", "-1", "9007199254740992"].flatMap((sample) =>
      [false, true].map((absent) => ({ sample, absent })),
    ),
  )(
    "denies unsafe current clock $sample with absent clock $absent without manufacturing time or revocation",
    async ({ sample, absent }) => {
      const f = await fixture();
      if (absent)
        await database().query("DELETE FROM bfa_p5_voice.owner_clocks WHERE owner_id=$1;", [
          f.q.ownerId,
        ]);
      await database().exec(
        `CREATE OR REPLACE FUNCTION bfa_p5_voice.ms() RETURNS bigint LANGUAGE sql VOLATILE SET search_path=pg_catalog,pg_temp AS $$ SELECT ${sample}::bigint $$;`,
      );
      const before = await snapshot();
      expect(await read(f.q)).toBeNull();
      await preserved(before);
    },
  );

  it("enforces original verification age and future-time denial without reattesting the request", async () => {
    const f = await fixture();
    const before = await snapshot();
    expect(await read({ ...f.q, verifiedAt: f.now - 30000 })).toBeNull();
    expect(await read({ ...f.q, verifiedAt: f.now + 1 })).toBeNull();
    await preserved(before);
    const q = { ...f.q, verifiedAt: f.now - 29999 };
    expect(await read(q)).toEqual(expected(f, q));
    await preserved(before);
  });

  it.each([
    "original age",
    "Auth expiry",
    "issuance expiry",
    "approval expiry",
    "allowlist expiry",
  ])("rechecks %s at the final database-time observation and retains high-water", async (kind) => {
    const f = await fixture();
    const late = f.now + (kind === "original age" ? 30000 : 1000);
    const q = { ...f.q, identityExpiresAt: kind === "Auth expiry" ? late : f.q.identityExpiresAt };
    if (kind === "issuance expiry")
      await database().query(
        "UPDATE bfa_p5_voice.issuances SET expires_ms=$1 WHERE fingerprint=$2;",
        [late, q.authorityFingerprint],
      );
    if (kind === "approval expiry")
      await database().query(
        "UPDATE bfa_p5_voice.approvals SET expires_ms=$1 WHERE approval_id=$2;",
        [late, f.approvalId],
      );
    if (kind === "allowlist expiry")
      await database().query(
        "UPDATE public.bfa_p3b_staging_accounts SET expires_at=to_timestamp($1/1000.0) WHERE user_id=$2;",
        [late, q.ownerId],
      );
    // Delayed final sample is controlled locally, not a native blocking/race test.
    await setClock(late);
    const before = await snapshot();
    expect(await read(q)).toBeNull();
    expect(await clockRow(q)).toEqual({ observed_ms: late });
    await preserved(before, q.ownerId);
    await setClock(late - 1);
    const retained = await snapshot();
    expect(await read({ ...q, verifiedAt: late - 1 })).toBeNull();
    await preserved(retained);
  });

  it("creates only a missing safe owner clock and preserves every lifecycle/accounting row", async () => {
    const f = await fixture();
    await database().query("DELETE FROM bfa_p5_voice.owner_clocks WHERE owner_id=$1;", [
      f.q.ownerId,
    ]);
    const before = await snapshot();
    expect(await read(f.q)).toEqual(expected(f));
    expect(await clockRow(f.q)).toEqual({ observed_ms: f.now });
    await preserved(before, f.q.ownerId);
  });

  it.each(["lost", "malformed"])(
    "retains committed clock evidence after a %s reply without retry or new identity",
    async (kind) => {
      const f = await fixture(),
        t = transport();
      await setClock(f.now + 5);
      const before = await snapshot();
      t.hooks.afterCommit = async (_name, data) => {
        if (kind === "lost") throw new Error("Fictional lost read reply");
        return {
          ...(data as Record<string, unknown>),
          request: { ...f.q, attemptId: randomUUID() },
        };
      };
      await expect(t.current.readCurrent(f.q)).rejects.toThrow("voice-v2-current-rpc-unavailable");
      expect(t.calls).toHaveLength(1);
      expect(t.calls[0]!.committed).toBe(true);
      expect(await clockRow(f.q)).toEqual({ observed_ms: f.now + 5 });
      await preserved(before, f.q.ownerId);
      await setClock(f.now + 4);
      const retained = await snapshot();
      expect(await read(f.q)).toBeNull();
      await preserved(retained);
    },
  );

  it("treats a reply delayed past parent revocation only as a historical observation", async () => {
    const f = await fixture(),
      t = transport();
    t.hooks.afterCommit = async (_name, data) => {
      await transport().parents.revokeParent({
        ownerId: f.q.ownerId,
        authSessionId: f.q.authSessionId,
      });
      return data;
    };
    expect(await t.current.readCurrent(f.q)).toEqual(expected(f));
    expect(t.calls).toHaveLength(1);
    const revoked = await snapshot();
    expect(await read(f.q)).toBeNull();
    await preserved(revoked);
    // The transport has no Auth/time oracle; future verifier must recheck after waits.
  });

  it("rolls back an unexpected clock-write exception without revoking or reserving anything", async () => {
    const f = await fixture(),
      t = transport();
    await setClock(f.now + 1);
    const before = await snapshot();
    await database().exec(
      `CREATE FUNCTION pg_temp.fail_v2_current_clock() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.owner_id='${f.q.ownerId}'::uuid THEN RAISE EXCEPTION 'Fictional clock write failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_v2_current_clock BEFORE INSERT OR UPDATE ON bfa_p5_voice.owner_clocks FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_v2_current_clock();`,
    );
    try {
      await expect(t.current.readCurrent(f.q)).rejects.toThrow("voice-v2-current-rpc-unavailable");
      expect(t.calls).toHaveLength(1);
      expect(t.calls[0]!.committed).toBe(false);
      await preserved(before);
    } finally {
      await database().exec(
        "DROP TRIGGER fail_v2_current_clock ON bfa_p5_voice.owner_clocks; DROP FUNCTION pg_temp.fail_v2_current_clock();",
      );
    }
  });

  it.each(["anon", "authenticated"] as const)("denies %s direct reader access", async (role) => {
    const f = await fixture(),
      before = await snapshot();
    await expect(raw("bfa_p5_v2_read_current", { p_request: f.q }, role)).rejects.toThrow();
    await preserved(before);
  });

  it("grants only service-role execution with fixed search path and no table privileges", async () => {
    const row = await one(
      "SELECT p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') AS anon,has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role,EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute FROM pg_proc p WHERE p.oid='public.bfa_p5_v2_read_current(jsonb)'::regprocedure;",
    );
    expect(row).toEqual({
      prosecdef: true,
      proconfig: ["search_path=pg_catalog, pg_temp"],
      anon: false,
      authenticated: false,
      service_role: true,
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
