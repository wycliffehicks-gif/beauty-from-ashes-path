// Optional actual single-connection PostgreSQL + local cryptography integration.
// Auth and trusted service provenance remain fictional fixture preconditions;
// the pre-issuance metadata now comes only through the actual service-role RPC.
// No production Auth, HTTP, provider, device or native contention is exercised.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ConversationService } from "../service/service";
import { fingerprint, unseal } from "../staging/seal.server";
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
type RpcName = VoiceIssuanceRpcName | VoiceReadRpcName | VoicePreissueReadRpcName;
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

sqlSuite("P5 pre-issuance reader in isolated single-connection PostgreSQL", () => {
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
    vi.stubEnv("BFA_P3B_STATE_SECRET", `offline-preissue-fixture-${crypto.randomUUID()}`);
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
    existingPrivileges = await privileges();
    await install("docs/pilot/conversation/sql-drafts/p5-voice-preissue-read.sql");
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
  const current = (f: Fixture) => transport().reads.readCurrentThread(f.query);
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

  it("reads the exact content-free pre-issuance shape with no generation, issuance or approval prerequisite and no writes", async () => {
    const f = await fixture(),
      t = transport(),
      before = await snapshot();
    const result = await t.reads.readCurrentThread(f.query);
    expect(result).toEqual({
      ...f.query,
      threadRevision: 0,
      sourceCreatedAt: SOURCE_CREATED_AT,
      threadIncarnation: null,
      deleted: false,
      allowlist: { ownerId: f.ownerId, admitted: true, expiresAt: f.expiresAt },
    });
    expect(JSON.stringify(result)).not.toContain("fictional private source");
    expect(t.calls).toEqual([
      {
        name: "bfa_p5_voice_read_current_thread",
        args: { p_owner_id: f.ownerId, p_thread_id: f.threadId },
        committed: true,
      },
    ]);
    expect(await snapshot()).toEqual(before);
    expect(await counts(f)).toEqual({
      generations: 0,
      issuances: 0,
      approvals: 0,
      quotas: 0,
      claims: 0,
    });
  });

  it("reports the actual permanent generation without creating issuance or altering any rows", async () => {
    const f = await fixture(),
      t = transport();
    const incarnation = await t.writes.registerGeneration(f.query);
    const before = await snapshot();
    expect(await current(f)).toMatchObject({
      threadIncarnation: incarnation,
      sourceCreatedAt: SOURCE_CREATED_AT,
    });
    expect(await snapshot()).toEqual(before);
    expect(await counts(f)).toEqual({
      generations: 1,
      issuances: 0,
      approvals: 0,
      quotas: 0,
      claims: 0,
    });
  });

  it("denies missing, mixed-owner and missing-allowlist metadata without provisioning", async () => {
    const a = await fixture(),
      b = await fixture(),
      t = transport();
    for (const query of [
      { ownerId: a.ownerId, threadId: b.threadId },
      { ownerId: b.ownerId, threadId: a.threadId },
      { ownerId: a.ownerId, threadId: crypto.randomUUID() },
      { ownerId: crypto.randomUUID(), threadId: a.threadId },
    ]) {
      const before = await snapshot();
      expect(await t.reads.readCurrentThread(query)).toBeNull();
      expect(await snapshot()).toEqual(before);
    }
    await database().query("DELETE FROM public.bfa_p3b_staging_accounts WHERE user_id=$1;", [
      a.ownerId,
    ]);
    const before = await snapshot();
    expect(await current(a)).toBeNull();
    expect(await snapshot()).toEqual(before);
  });

  it("denies withdrawn, expired, non-finite and unsafe staging deadlines without mutation", async () => {
    for (const change of [
      "admitted=false",
      "expires_at=to_timestamp(1)",
      "expires_at='infinity'::timestamptz",
      "expires_at='-infinity'::timestamptz",
      "expires_at='290000-01-01 00:00:00+00'::timestamptz",
    ]) {
      const f = await fixture();
      await database().query(
        `UPDATE public.bfa_p3b_staging_accounts SET ${change} WHERE user_id=$1;`,
        [f.ownerId],
      );
      const before = await snapshot();
      expect(await current(f)).toBeNull();
      expect(await snapshot()).toEqual(before);
    }
  });

  it("conservatively floors a future sub-millisecond allowlist deadline", async () => {
    const f = await fixture();
    await database().query(
      "UPDATE public.bfa_p3b_staging_accounts SET expires_at=expires_at+interval '999 microseconds' WHERE user_id=$1;",
      [f.ownerId],
    );
    const before = await snapshot();
    expect(await current(f)).toMatchObject({ allowlist: { expiresAt: f.expiresAt } });
    expect(await snapshot()).toEqual(before);
  });

  it("preserves all six UTC microseconds across TimeZone and DateStyle changes", async () => {
    const f = await fixture(),
      before = await snapshot();
    try {
      for (const setting of [
        "SET TIME ZONE 'Pacific/Auckland'; SET DateStyle='SQL, DMY';",
        "SET TIME ZONE 'America/New_York'; SET DateStyle='German, DMY';",
        "SET TIME ZONE 'UTC'; SET DateStyle='Postgres, MDY';",
      ]) {
        await database().exec(setting);
        expect(await current(f)).toMatchObject({ sourceCreatedAt: SOURCE_CREATED_AT });
      }
    } finally {
      await database().exec("SET TIME ZONE 'UTC'; SET DateStyle='ISO, MDY';");
    }
    expect(await snapshot()).toEqual(before);
  });

  it("accepts canonical year boundaries and denies non-finite or out-of-format creation timestamps", async () => {
    for (const source of ["0001-01-01T00:00:00.000001Z", "9999-12-31T23:59:59.999999Z"]) {
      const f = await fixture();
      await database().query(
        "UPDATE public.bfa_p3b_threads SET created_at=$2::timestamptz WHERE id=$1;",
        [f.threadId, source],
      );
      expect(await current(f)).toMatchObject({ sourceCreatedAt: source });
    }
    for (const source of [
      "infinity",
      "-infinity",
      "10000-01-01 00:00:00+00",
      "0001-01-01 00:00:00+00 BC",
    ]) {
      const f = await fixture();
      await database().query(
        "UPDATE public.bfa_p3b_threads SET created_at=$2::timestamptz WHERE id=$1;",
        [f.threadId, source],
      );
      const before = await snapshot();
      expect(await current(f)).toBeNull();
      expect(await snapshot()).toEqual(before);
    }
  });

  it("returns the exact safe revision boundary, preserves the negative-revision constraint and denies unsafe revisions", async () => {
    const f = await fixture();
    await database().query(
      "UPDATE public.bfa_p3b_threads SET revision=9007199254740991 WHERE id=$1;",
      [f.threadId],
    );
    expect(await current(f)).toMatchObject({ threadRevision: Number.MAX_SAFE_INTEGER });
    await expect(
      database().query("UPDATE public.bfa_p3b_threads SET revision=-1 WHERE id=$1;", [f.threadId]),
    ).rejects.toMatchObject({ code: "23514" });
    expect(await current(f)).toMatchObject({ threadRevision: Number.MAX_SAFE_INTEGER });
    await database().query(
      "UPDATE public.bfa_p3b_threads SET revision=9007199254740992 WHERE id=$1;",
      [f.threadId],
    );
    const before = await snapshot();
    expect(await current(f)).toBeNull();
    expect(await snapshot()).toEqual(before);
  });

  it("denies foreign, retired or creation-mismatched generations instead of treating them as absent", async () => {
    for (const change of [
      "owner_id=gen_random_uuid()",
      "retired=true",
      "source_created_at=source_created_at-interval '1 microsecond'",
      "source_created_at='infinity'::timestamptz",
    ]) {
      const f = await fixture();
      await transport().writes.registerGeneration(f.query);
      await database().query(`UPDATE bfa_p5_voice.generations SET ${change} WHERE thread_id=$1;`, [
        f.threadId,
      ]);
      const before = await snapshot();
      expect(await current(f)).toBeNull();
      expect(await snapshot()).toEqual(before);
    }
  });

  it("honors existing future clock high-water evidence without advancing, erasing or creating clocks", async () => {
    const f = await fixture();
    await database().query("INSERT INTO bfa_p5_voice.owner_clocks VALUES($1,$2);", [
      f.ownerId,
      Date.now() + 60_000,
    ]);
    const before = await snapshot();
    expect(await current(f)).toBeNull();
    expect(await snapshot()).toEqual(before);
    await database().query(
      "UPDATE bfa_p5_voice.owner_clocks SET observed_ms=1 WHERE owner_id=$1;",
      [f.ownerId],
    );
    const validBefore = await snapshot();
    expect(await current(f)).not.toBeNull();
    expect(await snapshot()).toEqual(validBefore);
  });

  it("observes actual P3b Stop and Delete while preserving closed claims and quota holds", async () => {
    for (const action of ["cancel", "delete"] as const) {
      const f = await fixture(),
        policy = crypto.randomUUID(),
        claim = crypto.randomUUID();
      await transport().writes.registerGeneration(f.query);
      await database().query("INSERT INTO bfa_p5_voice.quotas VALUES($1,$2,9,1,true);", [
        f.ownerId,
        policy,
      ]);
      await database().query(
        "INSERT INTO bfa_p5_voice.claims VALUES($1,$2,'{}'::jsonb,$3,'closed',$4,1);",
        [claim, f.ownerId, f.expiresAt, policy],
      );
      expect((await fence(f, action))!.revision).toBe(1);
      const before = await snapshot();
      const result = await current(f);
      if (action === "cancel") expect(result).toMatchObject({ threadRevision: 1, deleted: false });
      else expect(result).toBeNull();
      expect(await snapshot()).toEqual(before);
      expect(
        await one("SELECT state,held_units FROM bfa_p5_voice.claims WHERE claim_id=$1;", [claim]),
      ).toEqual({ state: "closed", held_units: 1 });
      expect(
        await one("SELECT remaining_units FROM bfa_p5_voice.quotas WHERE owner_id=$1;", [
          f.ownerId,
        ]),
      ).toEqual({ remaining_units: 9 });
    }
  });

  it("denies direct SQL null arguments without leaking metadata or writing rows", async () => {
    const f = await fixture(),
      before = await snapshot();
    for (const args of [
      [null, f.threadId],
      [f.ownerId, null],
      [null, null],
    ])
      expect(
        (await asRole(
          "service_role",
          "SELECT public.bfa_p5_voice_read_current_thread($1,$2) AS value;",
          args,
        ))!.value,
      ).toBeNull();
    expect(await snapshot()).toEqual(before);
  });

  it("grants only the service-role RPC and leaves every private table, schema and helper privilege unchanged", async () => {
    const f = await fixture();
    expect(await privileges()).toEqual(existingPrivileges);
    for (const role of ["anon", "authenticated"] as const)
      await expect(
        asRole(role, "SELECT public.bfa_p5_voice_read_current_thread($1,$2);", [
          f.ownerId,
          f.threadId,
        ]),
      ).rejects.toMatchObject({ code: "42501" });
    for (const role of ["anon", "authenticated", "service_role"] as const) {
      for (const table of privateTables)
        await expect(asRole(role, `SELECT * FROM bfa_p5_voice.${table};`)).rejects.toMatchObject({
          code: "42501",
        });
      await expect(
        asRole(role, "SELECT bfa_p5_voice.lock_owner($1);", [f.ownerId]),
      ).rejects.toMatchObject({ code: "42501" });
    }
    expect(
      await one(
        "SELECT p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') AS anon,has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role,EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='bfa_p5_voice_read_current_thread';",
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

  it("composes actual pre-issuance reads, session reads, registration and local crypto for a first issuance without approval", async () => {
    const f = await fixture(),
      h = await issuer(f);
    expect(await counts(f)).toEqual({
      generations: 0,
      issuances: 0,
      approvals: 0,
      quotas: 0,
      claims: 0,
    });
    const result = await h.issue();
    expect(result).not.toBeNull();
    const opened = await unseal(result!.activeAuthority, f.ownerId, f.threadId, 0);
    expect(opened.authority).toEqual(h.service.exportAuthority(f.threadId));
    expect(opened.expires).toBe(result!.expiresAt);
    const digest = await fingerprint(result!.activeAuthority);
    expect(
      await one(
        "SELECT owner_id,thread_id,incarnation,revision,fingerprint,expires_ms,revoked FROM bfa_p5_voice.issuances WHERE fingerprint=$1;",
        [digest],
      ),
    ).toEqual({
      owner_id: f.ownerId,
      thread_id: f.threadId,
      incarnation: result!.threadIncarnation,
      revision: 0,
      fingerprint: digest,
      expires_ms: result!.expiresAt,
      revoked: false,
    });
    expect(
      h.calls
        .filter((call) => call.name.startsWith("bfa_p5_voice_register_"))
        .map((call) => call.name),
    ).toEqual(["bfa_p5_voice_register_generation", "bfa_p5_voice_register_issuance"]);
    expect(
      h.calls.filter((call) => call.name === "bfa_p5_voice_read_current_thread").length,
    ).toBeGreaterThan(3);
    expect(h.calls.every((call) => call.committed)).toBe(true);
    expect(h.calls.some((call) => call.name === "bfa_p5_voice_read_current")).toBe(false);
    expect(JSON.stringify(h.calls)).not.toContain(result!.activeAuthority);
    expect(JSON.stringify(h.calls)).not.toContain("fictional private source");
    expect(await counts(f)).toEqual({
      generations: 1,
      issuances: 1,
      approvals: 0,
      quotas: 0,
      claims: 0,
    });
  });

  it("withholds issuance after real Stop or Delete invalidates the trusted host snapshot", async () => {
    for (const action of ["cancel", "delete"] as const) {
      const f = await fixture(),
        h = await issuer(f);
      await fence(f, action);
      expect(await h.issue()).toBeNull();
      expect(h.calls.some((call) => call.name.startsWith("bfa_p5_voice_register_"))).toBe(false);
      expect(await counts(f)).toEqual({
        generations: 0,
        issuances: 0,
        approvals: 0,
        quotas: 0,
        claims: 0,
      });
    }
  });

  it("withholds before issuance when metadata changes after committed generation registration", async () => {
    for (const change of [
      "UPDATE public.bfa_p3b_threads SET created_at=created_at+interval '1 microsecond' WHERE owner_id=$1;",
      "UPDATE bfa_p5_voice.generations SET retired=true WHERE owner_id=$1;",
      "UPDATE public.bfa_p3b_staging_accounts SET admitted=false WHERE user_id=$1;",
    ]) {
      const f = await fixture(),
        h = await issuer(f);
      h.hooks.afterCommit = async (name, _args, data) => {
        if (name === "bfa_p5_voice_register_generation")
          await database().query(change, [f.ownerId]);
        return data;
      };
      expect(await h.issue()).toBeNull();
      expect(h.calls.some((call) => call.name === "bfa_p5_voice_register_issuance")).toBe(false);
      expect(await counts(f)).toEqual({
        generations: 1,
        issuances: 0,
        approvals: 0,
        quotas: 0,
        claims: 0,
      });
    }
  });

  it("withholds an already registered token after late Stop, Delete, expiry or generation retirement", async () => {
    for (const action of ["cancel", "delete", "expire", "retire"] as const) {
      const f = await fixture(),
        h = await issuer(f);
      h.hooks.afterCommit = async (name, _args, data) => {
        if (name === "bfa_p5_voice_register_issuance") {
          if (action === "cancel" || action === "delete") await fence(f, action);
          else if (action === "expire")
            await database().query(
              "UPDATE public.bfa_p3b_staging_accounts SET expires_at=to_timestamp(1) WHERE user_id=$1;",
              [f.ownerId],
            );
          else
            await database().query(
              "UPDATE bfa_p5_voice.generations SET retired=true WHERE owner_id=$1;",
              [f.ownerId],
            );
        }
        return data;
      };
      expect(await h.issue()).toBeNull();
      expect(h.calls.filter((call) => call.name === "bfa_p5_voice_register_issuance")).toHaveLength(
        1,
      );
      expect(await counts(f)).toEqual({
        generations: 1,
        issuances: 1,
        approvals: 0,
        quotas: 0,
        claims: 0,
      });
    }
  });

  it("rejects rounded or stale trusted source metadata before registration", async () => {
    for (const source of ["2026-10-01T12:34:56.123Z", "2026-10-01T12:34:56.123457Z"]) {
      const f = await fixture(),
        h = await issuer(f);
      h.input.sourceCreatedAt = source;
      expect(await h.issue()).toBeNull();
      expect(h.calls.some((call) => call.name.startsWith("bfa_p5_voice_register_"))).toBe(false);
      expect(await counts(f)).toEqual({
        generations: 0,
        issuances: 0,
        approvals: 0,
        quotas: 0,
        claims: 0,
      });
    }
  });
});
