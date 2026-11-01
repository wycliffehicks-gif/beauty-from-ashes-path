// Optional actual single-connection PostgreSQL + local cryptography integration.
// Auth and trusted service provenance remain fictional fixture preconditions;
// exact session revocation and metadata reads use actual service-role RPCs.
// No production Auth, HTTP, provider, device or native contention is exercised.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ConversationService } from "../service/service";
import { fingerprint } from "../staging/seal.server";
import { createVoiceAuthorityIssuer } from "../service/voice-issuance.server";
import { createVoiceReadRpcPorts, type VoiceReadRpcName } from "../service/voice-read-rpc.server";
import {
  createVoiceIssuanceRpcPorts,
  type VoiceIssuanceRpcName,
} from "../service/voice-issuance-rpc.server";
import {
  createVoicePreissueReadRpcPorts,
  type VoicePreissueReadRpcName,
} from "../service/voice-preissue-read-rpc.server";

import {
  createVoiceSessionRevokeRpcPorts,
  type VoiceSessionRevokeRpcName,
} from "../service/voice-session-revoke-rpc.server";
import type { VoiceAdmissionClaim } from "../service/voice-admission.server";
import type { VoiceOperationProof } from "../service/voice-store-adapter.server";

interface LocalDatabase {
  exec(sql: string): Promise<unknown>;
  query(sql: string, parameters?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  close(): Promise<void>;
  dumpDataDir(compression: string): Promise<unknown>;
  readonly closed: boolean;
}
interface CurrentThread {
  ownerId: string;
  threadId: string;
  threadRevision: number;
  sourceCreatedAt: string;
  threadIncarnation: string | null;
  deleted: false;
  allowlist: { ownerId: string; admitted: true; expiresAt: number };
}
const enginePath = process.env.BFA_PGLITE_MODULE;
const sqlSuite = enginePath ? describe : describe.skip;
const ROOT = process.cwd();
const SOURCE_CREATED_AT = "2026-10-01T12:34:56.123456Z";
type RpcName =
  | VoiceIssuanceRpcName
  | VoiceReadRpcName
  | VoicePreissueReadRpcName
  | VoiceSessionRevokeRpcName;
type Args = Readonly<Record<string, unknown>>;
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

sqlSuite("P5 terminal session revocation in isolated single-connection PostgreSQL", () => {
  let db: LocalDatabase | undefined;
  let seed: LocalDatabase | undefined;
  let existingPrivileges: unknown;
  const database = () => {
    if (!db) throw new Error("Offline fixture database unavailable");
    return db;
  };
  async function one(sql: string, args: unknown[] = []) {
    return (await database().query(sql, args)).rows[0];
  }
  async function privileges() {
    return (await one(`SELECT jsonb_build_object(
      'schema',(SELECT nspacl::text FROM pg_namespace WHERE nspname='bfa_p5_voice'),
      'tables',(SELECT jsonb_agg(jsonb_build_array(c.relname,c.relacl::text) ORDER BY c.relname)
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bfa_p5_voice' AND c.relkind='r'),
      'helpers',(SELECT jsonb_agg(jsonb_build_array(p.proname,p.proacl::text) ORDER BY p.proname)
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='bfa_p5_voice')
    ) AS value;`))!.value;
  }
  beforeAll(async () => {
    vi.stubEnv("BFA_P3B_STATE_SECRET", `offline-revocation-fixture-${crypto.randomUUID()}`);
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
      .filter((name) => /^000[0-5]_.*\.sql$/.test(name))
      .sort();
    expect(migrations).toHaveLength(6);
    for (const name of migrations) await install(`drizzle/migrations/${name}`);
    await install("docs/pilot/conversation/sql-drafts/p5-voice-admission.sql");
    await install("docs/pilot/conversation/sql-drafts/p5-voice-reads.sql");
    await install("docs/pilot/conversation/sql-drafts/p5-voice-preissue-read.sql");
    existingPrivileges = await privileges();
    await install("docs/pilot/conversation/sql-drafts/p5-voice-session-revoke.sql");
  }, 60_000);
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

  async function asRole(
    role: "anon" | "authenticated" | "service_role",
    sql: string,
    args: unknown[] = [],
  ) {
    await database().exec(`BEGIN; SET LOCAL ROLE ${role};`);
    try {
      expect((await one("SELECT current_user AS role;"))!.role).toBe(role);
      const result = await one(sql, args);
      await database().exec("COMMIT;");
      return result;
    } catch (error) {
      await database().exec("ROLLBACK;");
      throw error;
    }
  }
  async function snapshot() {
    const result: Record<string, unknown> = {};
    for (const table of tables)
      result[table] = (await one(
        `SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS rows FROM ${table} t;`,
      ))!.rows;
    return result;
  }
  function transport() {
    const calls: { name: RpcName; args: Args; committed: boolean }[] = [];
    const hooks: {
      afterCommit?: (name: RpcName, args: Args, data: unknown) => Promise<unknown>;
    } = {};
    const client = {
      async rpc(name: RpcName, args: Args) {
        expect([
          "bfa_p5_voice_revoke_session",
          "bfa_p5_voice_read_current_thread",
          "bfa_p5_voice_read_session_fence",
          "bfa_p5_voice_read_current",
          "bfa_p5_voice_register_generation",
          "bfa_p5_voice_register_issuance",
        ]).toContain(name);
        const call = { name, args, committed: false };
        calls.push(call);
        const types: Record<string, string> = {
          p_owner_id: "uuid",
          p_thread_id: "uuid",
          p_session_id: "uuid",
          p_attempt_id: "uuid",
          p_authority_fingerprint: "text",
          p_owner: "uuid",
          p_thread: "uuid",
          p_incarnation: "uuid",
          p_revision: "bigint",
          p_fingerprint: "text",
          p_issued_ms: "bigint",
          p_expires_ms: "bigint",
        };
        const entries = Object.entries(args);
        const named = entries
          .map(([key], index) => {
            expect(Object.hasOwn(types, key)).toBe(true);
            return `${key}=>$${index + 1}::${types[key]}`;
          })
          .join(",");
        const row = await asRole(
          "service_role",
          `SELECT public.${name}(${named}) AS value;`,
          entries.map(([, value]) => value),
        );
        call.committed = true;
        return {
          data: hooks.afterCommit ? await hooks.afterCommit(name, args, row!.value) : row!.value,
          error: null,
          status: 200,
        };
      },
    };
    return {
      calls,
      hooks,
      revoke: createVoiceSessionRevokeRpcPorts(client),
      reads: createVoicePreissueReadRpcPorts(client),
      sessions: createVoiceReadRpcPorts(client),
      writes: createVoiceIssuanceRpcPorts(client),
    };
  }
  async function fixture() {
    const ownerId = crypto.randomUUID(),
      threadId = crypto.randomUUID(),
      sessionId = crypto.randomUUID();
    const expiresAt = Date.now() + 600_000;
    await database().query(
      "INSERT INTO public.bfa_p3b_staging_accounts(user_id,admitted,expires_at) VALUES($1,true,to_timestamp($2/1000.0));",
      [ownerId, expiresAt],
    );
    await database().query(
      "INSERT INTO public.bfa_p3b_threads(id,owner_id,created_at,saved_snapshot,saved_at) VALUES($1,$2,$3::timestamptz,to_jsonb('fictional private source must not escape'::text),clock_timestamp());",
      [threadId, ownerId, SOURCE_CREATED_AT],
    );
    await database().query("INSERT INTO bfa_p5_voice.session_fences VALUES($1,$2,0,$3,false);", [
      ownerId,
      sessionId,
      expiresAt,
    ]);
    return { ownerId, threadId, sessionId, expiresAt, query: { ownerId, threadId } };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const sessionQuery = (f: { ownerId: string; sessionId: string }) => ({
    ownerId: f.ownerId,
    sessionId: f.sessionId,
  });
  const readSession = (f: { ownerId: string; sessionId: string }) =>
    transport().sessions.readSessionFence(sessionQuery(f));
  const revoke = (f: { ownerId: string; sessionId: string }) =>
    transport().revoke.revokeSession(sessionQuery(f));
  async function counts(f: Fixture) {
    return one(
      "SELECT (SELECT count(*)::integer FROM bfa_p5_voice.generations WHERE owner_id=$1) AS generations,(SELECT count(*)::integer FROM bfa_p5_voice.issuances WHERE owner_id=$1) AS issuances,(SELECT count(*)::integer FROM bfa_p5_voice.approvals WHERE owner_id=$1) AS approvals,(SELECT count(*)::integer FROM bfa_p5_voice.quotas WHERE owner_id=$1) AS quotas,(SELECT count(*)::integer FROM bfa_p5_voice.claims WHERE owner_id=$1) AS claims;",
      [f.ownerId],
    );
  }
  async function issuer(f: Fixture) {
    const t = transport();
    // Trusted host consistency metadata is captured through the real adapter
    // before binding this synthetic service. This does not authenticate the
    // caller or prove production restore/service provenance.
    const initial = (await t.reads.readCurrentThread(f.query)) as CurrentThread | null;
    expect(initial).not.toBeNull();
    const service = new ConversationService({ verifiedOwnerId: f.ownerId });
    service.ensureThread(f.threadId, false);
    const instance = createVoiceAuthorityIssuer({
      ...t.writes,
      ...t.reads,
      readSessionFence: t.sessions.readSessionFence,
      now: () => Date.now(),
      maxAuthorityAgeMs: 60_000,
      async authenticate() {
        return { ownerId: f.ownerId, sessionId: f.sessionId, expiresAt: f.expiresAt };
      },
    });
    const input = {
      service,
      threadId: f.threadId,
      threadRevision: initial!.threadRevision,
      sourceCreatedAt: initial!.sourceCreatedAt,
    };
    return { ...t, service, input, issue: () => instance.issue(input) };
  }
  async function fence(f: Fixture, action: "cancel" | "delete") {
    return asRole("service_role", "SELECT public.bfa_p3b_fence($1,$2,$3) AS revision;", [
      f.ownerId,
      f.threadId,
      action,
    ]);
  }

  async function sessionRow(f: { ownerId: string; sessionId: string }) {
    return one(
      "SELECT owner_id,session_id,version,expires_ms,revoked,xmin::text AS xmin,ctid::text AS ctid FROM bfa_p5_voice.session_fences WHERE owner_id=$1 AND session_id=$2;",
      [f.ownerId, f.sessionId],
    );
  }
  async function assertOnlySessionChanged(
    before: Record<string, unknown>,
    f: { ownerId: string; sessionId: string },
  ) {
    const after = await snapshot();
    for (const table of tables) {
      if (table !== "bfa_p5_voice.session_fences") expect(after[table]).toEqual(before[table]);
      else {
        const other = (value: unknown) =>
          (value as Record<string, unknown>[]).filter(
            (row) => row.owner_id !== f.ownerId || row.session_id !== f.sessionId,
          );
        expect(other(after[table])).toEqual(other(before[table]));
      }
    }
  }
  async function sqlValue(sql: string, args: unknown[] = []) {
    return (await asRole("service_role", sql, args))!.value;
  }
  async function admissionFixture() {
    const f = await fixture(),
      h = await issuer(f),
      issued = await h.issue();
    expect(issued).not.toBeNull();
    const policy = crypto.randomUUID(),
      approval = crypto.randomUUID(),
      attempt = crypto.randomUUID(),
      cleanupId = crypto.randomUUID();
    // Explicit fictional administrator provisioning; no production grant or Auth writer.
    await database().query("INSERT INTO bfa_p5_voice.quotas VALUES($1,$2,10,1,true);", [
      f.ownerId,
      policy,
    ]);
    await database().query(
      "INSERT INTO bfa_p5_voice.approvals VALUES($1,repeat('b',64),$2,$3,$4,0,$5,'developer-voice-session',$6,false,$7);",
      [
        approval,
        f.ownerId,
        f.threadId,
        issued!.threadIncarnation,
        attempt,
        issued!.expiresAt,
        policy,
      ],
    );
    const claim: VoiceAdmissionClaim = {
      claimId: crypto.randomUUID(),
      expiresAt: issued!.expiresAt,
      binding: {
        ownerId: f.ownerId,
        threadId: f.threadId,
        threadIncarnation: issued!.threadIncarnation,
        threadRevision: 0,
        attemptId: attempt,
        approvalId: approval,
        approvalDigest: "b".repeat(64),
        scope: "developer-voice-session",
      },
    };
    const authorityFingerprint = await fingerprint(issued!.activeAuthority);
    expect(
      await sqlValue("SELECT public.bfa_p5_voice_register_cleanup($1,$2::jsonb) AS value;", [
        cleanupId,
        JSON.stringify(claim),
      ]),
    ).toEqual({ cleanupId, claim });
    return { ...f, claim, cleanupId, authorityFingerprint, policy };
  }
  type AdmissionFixture = Awaited<ReturnType<typeof admissionFixture>>;
  async function proof(
    f: AdmissionFixture,
    operation: "claim" | "inspect",
  ): Promise<VoiceOperationProof> {
    const now = Number((await one("SELECT bfa_p5_voice.ms() AS ms;"))!.ms);
    return {
      cleanupId: f.cleanupId,
      claim: f.claim,
      receiptId: crypto.randomUUID(),
      operation,
      ownerSessionId: f.sessionId,
      sessionVersion: 0,
      authorityFingerprint: f.authorityFingerprint,
      verifiedAt: now,
      expiresAt: Math.min(now + 20_000, f.claim.expiresAt),
      effectiveExpiresAt: f.claim.expiresAt,
      identityExpiresAt: f.expiresAt,
    };
  }
  const registerProof = (p: VoiceOperationProof) =>
    sqlValue("SELECT public.bfa_p5_voice_register_proof($1::jsonb) AS value;", [JSON.stringify(p)]);
  const consumeProof = (f: AdmissionFixture, p: VoiceOperationProof) =>
    sqlValue(`SELECT public.bfa_p5_voice_${p.operation}($1,$2::jsonb) AS value;`, [
      p.receiptId,
      JSON.stringify(f.claim),
    ]);
  async function holdState(f: AdmissionFixture) {
    return one(
      "SELECT (SELECT remaining_units FROM bfa_p5_voice.quotas WHERE owner_id=$1 AND policy_id=$2) AS remaining,(SELECT COALESCE(sum(held_units),0)::integer FROM bfa_p5_voice.claims WHERE owner_id=$1) AS held;",
      [f.ownerId, f.policy],
    );
  }
  async function ownerSnapshot(ownerId: string) {
    const result: Record<string, unknown> = {};
    for (const table of privateTables)
      result[table] = (await one(
        `SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS rows FROM bfa_p5_voice.${table} t WHERE owner_id=$1;`,
        [ownerId],
      ))!.rows;
    return result;
  }

  it("creates only an exact revoked tombstone for an absent owner/session with no enabling prerequisite", async () => {
    const f = { ownerId: crypto.randomUUID(), sessionId: crypto.randomUUID() },
      t = transport(),
      before = await snapshot();
    expect(await t.revoke.revokeSession(f)).toEqual({
      ...f,
      version: 0,
      expiresAt: 1,
      revoked: true,
    });
    expect(t.calls).toEqual([
      {
        name: "bfa_p5_voice_revoke_session",
        args: { p_owner_id: f.ownerId, p_session_id: f.sessionId },
        committed: true,
      },
    ]);
    expect(await readSession(f)).toBeNull();
    await assertOnlySessionChanged(before, f);
  });
  it("retains an absent-session tombstone unchanged on repeated deliberate revocation", async () => {
    const f = { ownerId: crypto.randomUUID(), sessionId: crypto.randomUUID() };
    const first = await revoke(f),
      row = await sessionRow(f),
      before = await snapshot();
    expect(await revoke(f)).toEqual(first);
    expect(await sessionRow(f)).toEqual(row);
    expect(await snapshot()).toEqual(before);
  });
  it("increments an active fence once and preserves its exact deadline and all unrelated rows", async () => {
    const f = await fixture(),
      before = await snapshot();
    expect(await readSession(f)).toMatchObject({ version: 0, revoked: false });
    expect(await revoke(f)).toEqual({
      ...sessionQuery(f),
      version: 1,
      expiresAt: f.expiresAt,
      revoked: true,
    });
    expect(await readSession(f)).toBeNull();
    await assertOnlySessionChanged(before, f);
  });
  it("does not issue an UPDATE or advance the version of an already revoked existing row", async () => {
    const f = await fixture();
    await database().query(
      "UPDATE bfa_p5_voice.session_fences SET revoked=true,version=17 WHERE owner_id=$1;",
      [f.ownerId],
    );
    const before = await snapshot(),
      row = await sessionRow(f);
    expect(await revoke(f)).toEqual({
      ...sessionQuery(f),
      version: 17,
      expiresAt: f.expiresAt,
      revoked: true,
    });
    expect(await sessionRow(f)).toEqual(row);
    expect(await snapshot()).toEqual(before);
  });
  it("revokes at the maximum safe version without overflow or relying on a version increment", async () => {
    const f = await fixture();
    await database().query(
      "UPDATE bfa_p5_voice.session_fences SET version=9007199254740991 WHERE owner_id=$1;",
      [f.ownerId],
    );
    expect(await readSession(f)).toMatchObject({
      version: Number.MAX_SAFE_INTEGER,
      revoked: false,
    });
    expect(await revoke(f)).toEqual({
      ...sessionQuery(f),
      version: Number.MAX_SAFE_INTEGER,
      expiresAt: f.expiresAt,
      revoked: true,
    });
    expect(await readSession(f)).toBeNull();
    const row = await sessionRow(f);
    await revoke(f);
    expect(await sessionRow(f)).toEqual(row);
  });
  it("advances the penultimate safe version to the terminal maximum without wrapping on replay", async () => {
    const f = await fixture();
    await database().query(
      "UPDATE bfa_p5_voice.session_fences SET version=9007199254740990 WHERE owner_id=$1;",
      [f.ownerId],
    );
    expect(await revoke(f)).toMatchObject({ version: Number.MAX_SAFE_INTEGER, revoked: true });
    expect(await revoke(f)).toMatchObject({ version: Number.MAX_SAFE_INTEGER, revoked: true });
  });
  it("preserves expired and maximum-safe deadlines without renewal or requiring current eligibility", async () => {
    for (const expiry of [1, Date.now() - 1, Number.MAX_SAFE_INTEGER]) {
      const f = await fixture();
      await database().query(
        "UPDATE bfa_p5_voice.session_fences SET expires_ms=$2 WHERE owner_id=$1;",
        [f.ownerId, expiry],
      );
      const before = await snapshot();
      expect(await revoke(f)).toEqual({
        ...sessionQuery(f),
        version: 1,
        expiresAt: expiry,
        revoked: true,
      });
      expect(await readSession(f)).toBeNull();
      await assertOnlySessionChanged(before, f);
    }
  });
  it("revokes after actual thread deletion and staging withdrawal without reading private content", async () => {
    const f = await fixture();
    await fence(f, "delete");
    await database().query(
      "UPDATE public.bfa_p3b_staging_accounts SET admitted=false,expires_at=to_timestamp(1) WHERE user_id=$1;",
      [f.ownerId],
    );
    const before = await snapshot(),
      t = transport();
    const result = await t.revoke.revokeSession(sessionQuery(f));
    expect(result).toMatchObject({ revoked: true, version: 1 });
    expect(JSON.stringify(result)).not.toContain("fictional private source");
    expect(t.calls.map((call) => call.name)).toEqual(["bfa_p5_voice_revoke_session"]);
    await assertOnlySessionChanged(before, f);
  });
  it("revokes despite a future clock high-water and never mutates or creates clock evidence", async () => {
    for (const absent of [true, false]) {
      const f = await fixture();
      if (!absent)
        await database().query(
          "INSERT INTO bfa_p5_voice.owner_clocks VALUES($1,9007199254740991);",
          [f.ownerId],
        );
      const before = await snapshot();
      expect(await revoke(f)).toMatchObject({ revoked: true, version: 1 });
      await assertOnlySessionChanged(before, f);
    }
  });
  it("isolates the exact owner/session pair from another session and the same UUID under another owner", async () => {
    const f = await fixture(),
      otherSession = crypto.randomUUID(),
      otherOwner = crypto.randomUUID();
    await database().query(
      "INSERT INTO bfa_p5_voice.session_fences VALUES($1,$2,5,$3,false),($4,$5,6,$3,false);",
      [f.ownerId, otherSession, f.expiresAt, otherOwner, f.sessionId],
    );
    const before = await snapshot();
    await revoke(f);
    await assertOnlySessionChanged(before, f);
    expect(await readSession({ ownerId: f.ownerId, sessionId: otherSession })).toMatchObject({
      version: 5,
      revoked: false,
    });
    expect(await readSession({ ownerId: otherOwner, sessionId: f.sessionId })).toMatchObject({
      version: 6,
      revoked: false,
    });
  });
  it("rejects null SQL identities before persistence with a generic error", async () => {
    const before = await snapshot();
    for (const args of [
      [null, crypto.randomUUID()],
      [crypto.randomUUID(), null],
      [null, null],
    ])
      await expect(
        asRole("service_role", "SELECT public.bfa_p5_voice_revoke_session($1,$2) AS value;", args),
      ).rejects.toMatchObject({ code: "P0001", message: "Unavailable" });
    expect(await snapshot()).toEqual(before);
  });
  it("retains a primary-key tombstone against a duplicate insert without claiming a future enabling writer exists", async () => {
    const f = { ownerId: crypto.randomUUID(), sessionId: crypto.randomUUID() };
    await revoke(f);
    const before = await snapshot();
    await expect(
      database().query("INSERT INTO bfa_p5_voice.session_fences VALUES($1,$2,0,$3,false);", [
        f.ownerId,
        f.sessionId,
        Date.now() + 600_000,
      ]),
    ).rejects.toMatchObject({ code: "23505" });
    expect(await snapshot()).toEqual(before);
    expect(await readSession(f)).toBeNull();
  });
  it("grants only the service RPC and preserves direct private table, schema and helper restrictions", async () => {
    const f = await fixture();
    expect(await privileges()).toEqual(existingPrivileges);
    for (const role of ["anon", "authenticated"] as const)
      await expect(
        asRole(role, "SELECT public.bfa_p5_voice_revoke_session($1,$2);", [f.ownerId, f.sessionId]),
      ).rejects.toMatchObject({ code: "42501" });
    for (const role of ["anon", "authenticated", "service_role"] as const) {
      for (const table of privateTables)
        await expect(asRole(role, `SELECT * FROM bfa_p5_voice.${table};`)).rejects.toMatchObject({
          code: "42501",
        });
      for (const sql of [
        "UPDATE bfa_p5_voice.session_fences SET revoked=false;",
        "DELETE FROM bfa_p5_voice.session_fences;",
        "SELECT bfa_p5_voice.lock_owner($1);",
      ])
        await expect(
          asRole(role, sql, sql.includes("$1") ? [f.ownerId] : []),
        ).rejects.toMatchObject({ code: "42501" });
    }
    expect(
      await one(
        "SELECT p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') AS anon,has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role,EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='bfa_p5_voice_revoke_session';",
      ),
    ).toEqual({
      prosecdef: true,
      proconfig: ["search_path=pg_catalog, pg_temp"],
      anon: false,
      authenticated: false,
      service_role: true,
      public_execute: false,
    });
  });
  it("retains committed revocation after a discarded reply and denies both session reads and issuance", async () => {
    const f = await fixture(),
      h = await issuer(f),
      t = transport();
    t.hooks.afterCommit = async () => {
      throw new Error("fictional discarded committed revocation");
    };
    await expect(t.revoke.revokeSession(sessionQuery(f))).rejects.toThrow(
      "voice-session-revoke-rpc-unavailable",
    );
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0]!.committed).toBe(true);
    expect(await readSession(f)).toBeNull();
    expect(await h.issue()).toBeNull();
    expect(await counts(f)).toMatchObject({ generations: 0, issuances: 0 });
    expect(await sessionRow(f)).toMatchObject({ version: 1, revoked: true });
  });
  it("treats malformed committed acknowledgments as unavailable while retaining terminal database state", async () => {
    for (const response of [null, false, { revoked: false }]) {
      const f = await fixture(),
        h = await issuer(f),
        t = transport();
      t.hooks.afterCommit = async () => response;
      await expect(t.revoke.revokeSession(sessionQuery(f))).rejects.toThrow(
        "voice-session-revoke-rpc-unavailable",
      );
      expect(t.calls).toHaveLength(1);
      expect(await readSession(f)).toBeNull();
      expect(await h.issue()).toBeNull();
      expect(await sessionRow(f)).toMatchObject({ version: 1, revoked: true });
    }
  });
  it("allows an explicit exact revocation replay after reply loss without another version advance", async () => {
    const f = await fixture(),
      t = transport();
    t.hooks.afterCommit = async () => {
      throw new Error("fictional discarded reply");
    };
    await expect(t.revoke.revokeSession(sessionQuery(f))).rejects.toThrow(
      "voice-session-revoke-rpc-unavailable",
    );
    const before = await snapshot(),
      row = await sessionRow(f);
    t.hooks.afterCommit = undefined;
    expect(await t.revoke.revokeSession(sessionQuery(f))).toEqual({
      ...sessionQuery(f),
      version: 1,
      expiresAt: f.expiresAt,
      revoked: true,
    });
    expect(t.calls).toHaveLength(2);
    expect(t.calls[0]!.args).toEqual(t.calls[1]!.args);
    expect(await sessionRow(f)).toEqual(row);
    expect(await snapshot()).toEqual(before);
  });
  it("withholds before generation or issuance when revocation commits after the host snapshot", async () => {
    const f = await fixture(),
      h = await issuer(f);
    await revoke(f);
    expect(await h.issue()).toBeNull();
    expect(h.calls.some((call) => call.name.startsWith("bfa_p5_voice_register_"))).toBe(false);
    expect(await counts(f)).toMatchObject({ generations: 0, issuances: 0 });
  });
  it("withholds after generation registration when the exact session is revoked", async () => {
    const f = await fixture(),
      h = await issuer(f);
    h.hooks.afterCommit = async (name, _args, data) => {
      if (name === "bfa_p5_voice_register_generation") await revoke(f);
      return data;
    };
    expect(await h.issue()).toBeNull();
    expect(await counts(f)).toMatchObject({ generations: 1, issuances: 0 });
    expect(await readSession(f)).toBeNull();
  });
  it("withholds an already registered token after revocation while retaining dormant issuance evidence", async () => {
    const f = await fixture(),
      h = await issuer(f);
    h.hooks.afterCommit = async (name, _args, data) => {
      if (name === "bfa_p5_voice_register_issuance") await revoke(f);
      return data;
    };
    expect(await h.issue()).toBeNull();
    expect(await counts(f)).toMatchObject({ generations: 1, issuances: 1 });
    expect(h.calls.filter((call) => call.name === "bfa_p5_voice_register_issuance")).toHaveLength(
      1,
    );
    expect(await readSession(f)).toBeNull();
  });
  it("denies a newly presented stale-session proof after revocation without reserving quota", async () => {
    const f = await admissionFixture(),
      p = await proof(f, "claim");
    await revoke(f);
    expect(await registerProof(p)).toBeNull();
    expect(await holdState(f)).toEqual({ remaining: 10, held: 0 });
    expect(
      (await one("SELECT count(*)::integer AS count FROM bfa_p5_voice.proofs WHERE owner_id=$1;", [
        f.ownerId,
      ]))!.count,
    ).toBe(0);
  });
  it("denies an already registered claim receipt after revocation without a late hold", async () => {
    const f = await admissionFixture(),
      p = await proof(f, "claim");
    expect(await registerProof(p)).not.toBeNull();
    await revoke(f);
    expect(await consumeProof(f, p)).toEqual({ claim: f.claim, state: "denied" });
    expect(await holdState(f)).toEqual({ remaining: 10, held: 0 });
    expect(
      (await one(
        "SELECT consumed_ms IS NOT NULL AS consumed FROM bfa_p5_voice.proofs WHERE receipt_id=$1;",
        [p.receiptId],
      ))!.consumed,
    ).toBe(true);
  });
  it("denies stale inspection, preserves existing and unrelated holds, and allows exact cleanup after revocation", async () => {
    const f = await admissionFixture(),
      unrelated = await admissionFixture();
    for (const target of [f, unrelated]) {
      const p = await proof(target, "claim");
      expect(await registerProof(p)).not.toBeNull();
      expect(await consumeProof(target, p)).toEqual({ claim: target.claim, state: "claimed" });
    }
    const inspection = await proof(f, "inspect");
    expect(await registerProof(inspection)).not.toBeNull();
    const otherBefore = await ownerSnapshot(unrelated.ownerId),
      before = await snapshot();
    await revoke(f);
    await assertOnlySessionChanged(before, f);
    expect(await consumeProof(f, inspection)).toEqual({ claim: f.claim, state: "denied" });
    expect(await holdState(f)).toEqual({ remaining: 9, held: 1 });
    expect(
      await sqlValue("SELECT public.bfa_p5_voice_close($1,$2::jsonb) AS value;", [
        f.cleanupId,
        JSON.stringify(f.claim),
      ]),
    ).toEqual({ claim: f.claim, state: "closed" });
    expect(await holdState(f)).toEqual({ remaining: 9, held: 1 });
    expect(await ownerSnapshot(unrelated.ownerId)).toEqual(otherBefore);
    expect(
      (await one("SELECT state FROM bfa_p5_voice.claims WHERE claim_id=$1;", [f.claim.claimId]))!
        .state,
    ).toBe("closed");
  });
});
