// Optional isolated PostgreSQL execution. This engine has one connection:
// no native lock-contention, production Auth or provider acceptance is implied.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createVoiceReadRpcPorts,
  type VoiceReadRpcClient,
  type VoiceReadRpcName,
} from "../service/voice-read-rpc.server";

interface LocalDatabase {
  exec(sql: string): Promise<unknown>;
  query(sql: string, parameters?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  close(): Promise<void>;
  dumpDataDir(compression: string): Promise<unknown>;
  readonly closed: boolean;
}
const enginePath = process.env.BFA_PGLITE_MODULE;
const sqlSuite = enginePath ? describe : describe.skip;
const ROOT = process.cwd();
const privateTables = [
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
] as const;
const tables = [
  ...privateTables.map((name) => `bfa_p5_voice.${name}`),
  ...["staging_accounts", "threads", "allowances", "admissions"].map(
    (name) => `public.bfa_p3b_${name}`,
  ),
];

sqlSuite("P5 protected reads in isolated single-connection PostgreSQL", () => {
  let db: LocalDatabase | undefined;
  let seed: LocalDatabase | undefined;
  const database = () => {
    if (!db) throw new Error("Offline fixture database unavailable");
    return db;
  };
  async function one(sql: string, parameters: unknown[] = []) {
    return (await database().query(sql, parameters)).rows[0];
  }
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
    seed = undefined;
    db = await PGlite.create({ loadDataDir: bundle, database: "bfa_p5_offline_fixture" });
    expect((await one("SELECT current_database() AS name;"))!.name).toBe("bfa_p5_offline_fixture");
    expect((await one("SHOW server_version;"))!.server_version).toMatch(/^18\.6/);
    const install = async (relative: string) =>
      database().exec(await readFile(path.join(ROOT, relative), "utf8"));
    await install("scripts/conversation-eval/p5-sql/bootstrap.sql");
    const migrations = (await readdir(path.join(ROOT, "drizzle/migrations")))
      .filter((n) => /^000[0-5]_.*\.sql$/.test(n))
      .sort();
    expect(migrations).toHaveLength(6);
    for (const name of migrations) await install(`drizzle/migrations/${name}`);
    await install("docs/pilot/conversation/sql-drafts/p5-voice-admission.sql");
    await install("docs/pilot/conversation/sql-drafts/p5-voice-reads.sql");
  }, 60_000);
  afterAll(async () => {
    for (const instance of [seed, db]) {
      if (instance && !instance.closed) await instance.close();
      if (instance) expect(instance.closed).toBe(true);
    }
  });

  async function asRole(
    role: "anon" | "authenticated" | "service_role",
    sql: string,
    args: unknown[] = [],
  ) {
    await database().exec(`BEGIN; SET LOCAL ROLE ${role};`);
    try {
      expect((await one("SELECT current_user AS role;"))!.role).toBe(role);
      const row = await one(sql, args);
      await database().exec("COMMIT;");
      return row;
    } catch (error) {
      await database().exec("ROLLBACK;");
      throw error;
    }
  }
  async function snapshot() {
    const result: Record<string, unknown> = {};
    for (const table of tables) {
      result[table] = (await one(
        `SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS rows FROM ${table} t;`,
      ))!.rows;
    }
    return result;
  }
  function transport() {
    const calls: { name: VoiceReadRpcName; args: Readonly<Record<string, unknown>> }[] = [];
    const client: VoiceReadRpcClient = {
      async rpc(name, args) {
        calls.push({ name, args });
        expect(["bfa_p5_voice_read_session_fence", "bfa_p5_voice_read_current"]).toContain(name);
        const entries = Object.entries(args);
        const named = entries
          .map(([key], i) => {
            expect([
              "p_owner_id",
              "p_session_id",
              "p_thread_id",
              "p_attempt_id",
              "p_authority_fingerprint",
            ]).toContain(key);
            return `${key}=>$${i + 1}::${key === "p_authority_fingerprint" ? "text" : "uuid"}`;
          })
          .join(",");
        const row = await asRole(
          "service_role",
          `SELECT public.${name}(${named}) AS result;`,
          entries.map(([, value]) => value),
        );
        return { data: row!.result, error: null, status: 200 };
      },
    };
    return { calls, ports: createVoiceReadRpcPorts(client) };
  }
  async function fixture() {
    const ownerId = crypto.randomUUID(),
      threadId = crypto.randomUUID(),
      sessionId = crypto.randomUUID();
    const approvalId = crypto.randomUUID(),
      attemptId = crypto.randomUUID(),
      policyId = crypto.randomUUID();
    const now = Number((await one("SELECT bfa_p5_voice.ms() AS ms;"))!.ms),
      expiresAt = now + 600_000;
    const authorityFingerprint = ("d".repeat(64) + ownerId.replaceAll("-", "")).slice(-64);
    await database().query(
      "INSERT INTO public.bfa_p3b_staging_accounts(user_id,admitted,expires_at) VALUES($1,true,to_timestamp($2/1000.0));",
      [ownerId, expiresAt],
    );
    await database().query(
      "INSERT INTO public.bfa_p3b_threads(id,owner_id,saved_snapshot,saved_at) VALUES($1,$2,to_jsonb('fictional private body must not escape'::text),clock_timestamp());",
      [threadId, ownerId],
    );
    const incarnation = (await one("SELECT public.bfa_p5_voice_register_generation($1,$2) AS id;", [
      ownerId,
      threadId,
    ]))!.id as string;
    await database().query("INSERT INTO bfa_p5_voice.session_fences VALUES($1,$2,0,$3,false);", [
      ownerId,
      sessionId,
      expiresAt,
    ]);
    await database().query(
      "INSERT INTO bfa_p5_voice.approvals VALUES($1,repeat('b',64),$2,$3,$4,0,$5,'developer-voice-session',$6,false,$7);",
      [approvalId, ownerId, threadId, incarnation, attemptId, expiresAt, policyId],
    );
    expect(
      (await one(
        "SELECT public.bfa_p5_voice_register_issuance($1,$2,$3,0,$4,$5,$6) AS registered;",
        [ownerId, threadId, incarnation, authorityFingerprint, now, expiresAt],
      ))!.registered,
    ).toBe(true);
    const query = { ownerId, threadId, attemptId, authorityFingerprint };
    const owned = { ownerId, threadId, threadIncarnation: incarnation, threadRevision: 0 };
    const expected = {
      ...owned,
      deleted: false,
      allowlist: { ownerId, admitted: true, expiresAt },
      authority: { ...owned, fingerprint: authorityFingerprint, expiresAt, revoked: false },
      approval: {
        ...owned,
        id: approvalId,
        digest: "b".repeat(64),
        scope: "developer-voice-session",
        attemptId,
        expiresAt,
        revoked: false,
      },
    };
    return {
      ...query,
      query,
      sessionId,
      approvalId,
      policyId,
      incarnation,
      now,
      expiresAt,
      expected,
    };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  async function current(f: Fixture) {
    return transport().ports.readCurrent(f.query);
  }
  async function fence(f: Fixture) {
    return transport().ports.readSessionFence({ ownerId: f.ownerId, sessionId: f.sessionId });
  }

  it("returns exact content-free snapshots through both service-role RPC mappings without any table writes", async () => {
    const f = await fixture(),
      t = transport(),
      before = await snapshot();
    expect(await t.ports.readSessionFence({ ownerId: f.ownerId, sessionId: f.sessionId })).toEqual({
      ownerId: f.ownerId,
      sessionId: f.sessionId,
      version: 0,
      expiresAt: f.expiresAt,
      revoked: false,
    });
    expect(await t.ports.readCurrent(f.query)).toEqual(f.expected);
    expect(JSON.stringify(await t.ports.readCurrent(f.query))).not.toContain(
      "fictional private body",
    );
    expect(t.calls.map((c) => c.name)).toEqual([
      "bfa_p5_voice_read_session_fence",
      "bfa_p5_voice_read_current",
      "bfa_p5_voice_read_current",
    ]);
    expect(await snapshot()).toEqual(before);
  });
  it("returns null for absent or mixed-owner session pairs and never provisions a fence", async () => {
    const a = await fixture(),
      b = await fixture(),
      t = transport(),
      before = await snapshot();
    for (const query of [
      { ownerId: a.ownerId, sessionId: b.sessionId },
      { ownerId: b.ownerId, sessionId: a.sessionId },
      { ownerId: crypto.randomUUID(), sessionId: crypto.randomUUID() },
    ]) {
      expect(await t.ports.readSessionFence(query)).toBeNull();
    }
    expect(await snapshot()).toEqual(before);
  });
  it("denies revoked or expired session records without clearing those records", async () => {
    for (const change of ["revoked=true", "expires_ms=1"]) {
      const f = await fixture();
      await database().query(
        `UPDATE bfa_p5_voice.session_fences SET ${change} WHERE owner_id=$1;`,
        [f.ownerId],
      );
      const before = await snapshot();
      expect(await fence(f)).toBeNull();
      expect(await snapshot()).toEqual(before);
    }
  });
  it("reports a changed version and shortened current fence, including the exact safe integer boundary", async () => {
    const f = await fixture(),
      shortened = f.expiresAt - 30_000;
    await database().query(
      "UPDATE bfa_p5_voice.session_fences SET version=9007199254740991,expires_ms=$2 WHERE owner_id=$1;",
      [f.ownerId, shortened],
    );
    expect(await fence(f)).toEqual({
      ownerId: f.ownerId,
      sessionId: f.sessionId,
      version: Number.MAX_SAFE_INTEGER,
      expiresAt: shortened,
      revoked: false,
    });
    await expect(
      database().query(
        "UPDATE bfa_p5_voice.session_fences SET version=9007199254740992 WHERE owner_id=$1;",
        [f.ownerId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("denies wrong owner, thread, attempt and exact fingerprint without lazy registration", async () => {
    const f = await fixture(),
      t = transport(),
      before = await snapshot();
    for (const query of [
      { ...f.query, ownerId: crypto.randomUUID() },
      { ...f.query, threadId: crypto.randomUUID() },
      { ...f.query, attemptId: crypto.randomUUID() },
      { ...f.query, authorityFingerprint: "e".repeat(64) },
    ])
      expect(await t.ports.readCurrent(query)).toBeNull();
    expect(await snapshot()).toEqual(before);
  });
  it("denies missing protected snapshot records without backfilling them", async () => {
    for (const table of [
      "public.bfa_p3b_staging_accounts",
      "bfa_p5_voice.generations",
      "bfa_p5_voice.issuances",
      "bfa_p5_voice.approvals",
    ]) {
      const f = await fixture(),
        column = table.endsWith("staging_accounts") ? "user_id" : "owner_id";
      await database().query(`DELETE FROM ${table} WHERE ${column}=$1;`, [f.ownerId]);
      const before = await snapshot();
      expect(await current(f)).toBeNull();
      expect(await snapshot()).toEqual(before);
    }
  });
  it("denies revoked, expired or non-admitted snapshot records without writing terminal state", async () => {
    const changes = [
      ["public.bfa_p3b_staging_accounts", "admitted=false", "user_id"],
      ["public.bfa_p3b_staging_accounts", "expires_at=to_timestamp(1)", "user_id"],
      ["bfa_p5_voice.generations", "retired=true", "owner_id"],
      ["bfa_p5_voice.issuances", "revoked=true", "owner_id"],
      ["bfa_p5_voice.issuances", "issued_ms=0,expires_ms=1", "owner_id"],
      ["bfa_p5_voice.approvals", "revoked=true", "owner_id"],
      ["bfa_p5_voice.approvals", "expires_ms=1", "owner_id"],
    ];
    for (const [table, change, key] of changes) {
      const f = await fixture();
      await database().query(`UPDATE ${table} SET ${change} WHERE ${key}=$1;`, [f.ownerId]);
      const before = await snapshot();
      expect(await current(f)).toBeNull();
      expect(await snapshot()).toEqual(before);
    }
  });
  it("rejects cross-record generation, owner, thread and revision mismatches", async () => {
    const mutations: [string, string][] = [
      ["bfa_p5_voice.issuances", "owner_id=gen_random_uuid()"],
      ["bfa_p5_voice.issuances", "thread_id=gen_random_uuid()"],
      ["bfa_p5_voice.issuances", "incarnation=gen_random_uuid()"],
      ["bfa_p5_voice.issuances", "revision=1"],
      ["bfa_p5_voice.approvals", "thread_id=gen_random_uuid()"],
      ["bfa_p5_voice.approvals", "incarnation=gen_random_uuid()"],
      ["bfa_p5_voice.approvals", "revision=1"],
      ["bfa_p5_voice.generations", "source_created_at=source_created_at-interval '1 second'"],
    ];
    for (const [table, change] of mutations) {
      const f = await fixture();
      await database().query(`UPDATE ${table} SET ${change} WHERE owner_id=$1;`, [f.ownerId]);
      expect(await current(f)).toBeNull();
    }
  });
  it("observes real P3b Stop and Delete fences while leaving held and terminal records untouched", async () => {
    for (const action of ["cancel", "delete"]) {
      const f = await fixture(),
        cleanupId = crypto.randomUUID();
      const claim = {
        claimId: crypto.randomUUID(),
        expiresAt: f.expiresAt,
        binding: {
          ownerId: f.ownerId,
          threadId: f.threadId,
          threadIncarnation: f.incarnation,
          threadRevision: 0,
          attemptId: f.attemptId,
          approvalId: f.approvalId,
          approvalDigest: "b".repeat(64),
          scope: "developer-voice-session",
        },
      };
      await database().query("SELECT public.bfa_p5_voice_register_cleanup($1,$2::jsonb);", [
        cleanupId,
        JSON.stringify(claim),
      ]);
      await database().query(
        "INSERT INTO bfa_p5_voice.claims VALUES($1,$2,$3::jsonb,$4,'claimed',$5,1);",
        [claim.claimId, f.ownerId, JSON.stringify(claim), f.expiresAt, f.policyId],
      );
      await database().query("SELECT public.bfa_p5_voice_close($1,$2::jsonb);", [
        cleanupId,
        JSON.stringify(claim),
      ]);
      expect(
        (await asRole("service_role", "SELECT public.bfa_p3b_fence($1,$2,$3) AS revision;", [
          f.ownerId,
          f.threadId,
          action,
        ]))!.revision,
      ).toBe(1);
      const before = await snapshot();
      expect(await current(f)).toBeNull();
      expect(await snapshot()).toEqual(before);
      expect(
        await one("SELECT state,held_units FROM bfa_p5_voice.claims WHERE claim_id=$1;", [
          claim.claimId,
        ]),
      ).toEqual({ state: "closed", held_units: 1 });
    }
  });
  it("denies future issuance time and existing backward-clock evidence without changing the high-water mark", async () => {
    const future = await fixture();
    await database().query("UPDATE bfa_p5_voice.issuances SET issued_ms=$2 WHERE owner_id=$1;", [
      future.ownerId,
      future.now + 60_000,
    ]);
    expect(await current(future)).toBeNull();
    const f = await fixture();
    await database().query(
      "UPDATE bfa_p5_voice.owner_clocks SET observed_ms=$2 WHERE owner_id=$1;",
      [f.ownerId, f.now + 60_000],
    );
    const before = await snapshot();
    expect(await fence(f)).toBeNull();
    expect(await current(f)).toBeNull();
    expect(await snapshot()).toEqual(before);
  });
  it("rejects unsafe P3b revision and non-finite or unsafe allowlist timestamps", async () => {
    const revision = await fixture();
    await database().query(
      "UPDATE public.bfa_p3b_threads SET revision=9007199254740992 WHERE id=$1;",
      [revision.threadId],
    );
    expect(await current(revision)).toBeNull();
    for (const expiry of ["infinity", "290000-01-01 00:00:00+00"]) {
      const f = await fixture();
      await database().query(
        "UPDATE public.bfa_p3b_staging_accounts SET expires_at=$2::timestamptz WHERE user_id=$1;",
        [f.ownerId, expiry],
      );
      expect(await current(f)).toBeNull();
    }
  });
  it("preserves the existing single-approval-per-owner-attempt constraint", async () => {
    const f = await fixture();
    await expect(
      database().query(
        "INSERT INTO bfa_p5_voice.approvals SELECT gen_random_uuid(),digest,owner_id,thread_id,incarnation,revision,attempt_id,scope,expires_ms,revoked,quota_policy_id FROM bfa_p5_voice.approvals WHERE approval_id=$1;",
        [f.approvalId],
      ),
    ).rejects.toMatchObject({ code: "23505" });
    expect(await current(f)).toEqual(f.expected);
  });
  it("denies malformed direct SQL arguments without provisioning or throwing private record details", async () => {
    const f = await fixture(),
      before = await snapshot();
    for (const args of [
      [null, f.sessionId],
      [f.ownerId, null],
    ])
      expect(
        (await asRole(
          "service_role",
          "SELECT public.bfa_p5_voice_read_session_fence($1,$2) AS result;",
          args,
        ))!.result,
      ).toBeNull();
    for (const args of [
      [null, f.threadId, f.attemptId, f.authorityFingerprint],
      [f.ownerId, null, f.attemptId, f.authorityFingerprint],
      [f.ownerId, f.threadId, null, f.authorityFingerprint],
      [f.ownerId, f.threadId, f.attemptId, null],
      [f.ownerId, f.threadId, f.attemptId, "D".repeat(64)],
      [f.ownerId, f.threadId, f.attemptId, "bad"],
    ])
      expect(
        (await asRole(
          "service_role",
          "SELECT public.bfa_p5_voice_read_current($1,$2,$3,$4) AS result;",
          args,
        ))!.result,
      ).toBeNull();
    expect(await snapshot()).toEqual(before);
  });
  it("denies both reader RPCs to actual anonymous and authenticated roles", async () => {
    const f = await fixture();
    for (const role of ["anon", "authenticated"] as const) {
      await expect(
        asRole(role, "SELECT public.bfa_p5_voice_read_session_fence($1,$2);", [
          f.ownerId,
          f.sessionId,
        ]),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        asRole(role, "SELECT public.bfa_p5_voice_read_current($1,$2,$3,$4);", [
          f.ownerId,
          f.threadId,
          f.attemptId,
          f.authorityFingerprint,
        ]),
      ).rejects.toMatchObject({ code: "42501" });
    }
  });
  it("keeps direct private tables and helper functions inaccessible to every application role", async () => {
    const f = await fixture();
    for (const role of ["anon", "authenticated", "service_role"] as const) {
      for (const table of privateTables)
        await expect(asRole(role, `SELECT * FROM bfa_p5_voice.${table};`)).rejects.toMatchObject({
          code: "42501",
        });
      await expect(
        asRole(role, "SELECT bfa_p5_voice.lock_owner($1);", [f.ownerId]),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        asRole(role, "UPDATE bfa_p5_voice.session_fences SET revoked=false WHERE owner_id=$1;", [
          f.ownerId,
        ]),
      ).rejects.toMatchObject({ code: "42501" });
    }
  });
  it("retains fixed definer search paths and grants only the service-role reader entry points", async () => {
    const rows = (
      await database().query(
        "SELECT p.proname,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') AS anon,has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role,EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('bfa_p5_voice_read_session_fence','bfa_p5_voice_read_current') ORDER BY p.proname;",
      )
    ).rows;
    expect(rows).toHaveLength(2);
    for (const row of rows)
      expect(row).toMatchObject({
        prosecdef: true,
        proconfig: ["search_path=pg_catalog, pg_temp"],
        anon: false,
        authenticated: false,
        service_role: true,
        public_execute: false,
      });
  });
});
