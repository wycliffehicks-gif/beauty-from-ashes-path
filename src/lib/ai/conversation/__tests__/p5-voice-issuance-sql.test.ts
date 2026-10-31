// Optional actual single-connection PostgreSQL + local crypto integration.
// Auth and pre-issuance host reads are fictional fixture infrastructure, not
// production authentication, HTTP fault injection or native contention evidence.
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
type RpcName = VoiceIssuanceRpcName | VoiceReadRpcName;
type Args = Readonly<Record<string, unknown>>;

sqlSuite("P5 trusted issuance against isolated single-connection PostgreSQL", () => {
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
    vi.stubEnv("BFA_P3B_STATE_SECRET", `offline-issuance-fixture-${crypto.randomUUID()}`);
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
    parameters: unknown[],
  ) {
    await database().exec(`BEGIN; SET LOCAL ROLE ${role};`);
    try {
      expect((await one("SELECT current_user AS role;"))!.role).toBe(role);
      const row = await one(sql, parameters);
      await database().exec("COMMIT;");
      return row;
    } catch (error) {
      await database().exec("ROLLBACK;");
      throw error;
    }
  }

  function transport() {
    const calls: { name: RpcName; args: Args; committed: boolean }[] = [];
    const hooks: {
      before?: (name: RpcName, args: Args) => Promise<void>;
      afterCommit?: (name: RpcName, args: Args, data: unknown) => Promise<unknown>;
    } = {};
    const client = {
      async rpc(name: RpcName, args: Args) {
        expect([
          "bfa_p5_voice_register_generation",
          "bfa_p5_voice_register_issuance",
          "bfa_p5_voice_read_session_fence",
          "bfa_p5_voice_read_current",
        ]).toContain(name);
        const call = { name, args, committed: false };
        calls.push(call);
        await hooks.before?.(name, args);
        const types: Record<string, string> = {
          p_owner: "uuid",
          p_thread: "uuid",
          p_incarnation: "uuid",
          p_revision: "bigint",
          p_fingerprint: "text",
          p_issued_ms: "bigint",
          p_expires_ms: "bigint",
          p_owner_id: "uuid",
          p_session_id: "uuid",
          p_thread_id: "uuid",
          p_attempt_id: "uuid",
          p_authority_fingerprint: "text",
        };
        const entries = Object.entries(args);
        const named = entries
          .map(([key], i) => {
            expect(Object.hasOwn(types, key)).toBe(true);
            return `${key}=>$${i + 1}::${types[key]}`;
          })
          .join(",");
        const result = await asRole(
          "service_role",
          `SELECT public.${name}(${named}) AS value;`,
          entries.map(([, value]) => value),
        );
        call.committed = true;
        const data = result!.value;
        return {
          data: hooks.afterCommit ? await hooks.afterCommit(name, args, data) : data,
          error: null,
          status: 200,
        };
      },
    };
    return {
      calls,
      hooks,
      writes: createVoiceIssuanceRpcPorts(client),
      reads: createVoiceReadRpcPorts(client),
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
    await database().query("INSERT INTO public.bfa_p3b_threads(id,owner_id) VALUES($1,$2);", [
      threadId,
      ownerId,
    ]);
    await database().query("INSERT INTO bfa_p5_voice.session_fences VALUES($1,$2,0,$3,false);", [
      ownerId,
      sessionId,
      expiresAt,
    ]);
    const service = new ConversationService({ verifiedOwnerId: ownerId });
    service.ensureThread(threadId, false);
    const sourceCreatedAt = (await one(
      "SELECT created_at::text AS value FROM public.bfa_p3b_threads WHERE id=$1;",
      [threadId],
    ))!.value as string;
    return { ownerId, threadId, sessionId, expiresAt, service, threadRevision: 0, sourceCreatedAt };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  async function records(f: Fixture) {
    return one(
      "SELECT (SELECT count(*)::integer FROM bfa_p5_voice.generations WHERE owner_id=$1) AS generations,(SELECT count(*)::integer FROM bfa_p5_voice.issuances WHERE owner_id=$1) AS issuances,(SELECT count(*)::integer FROM bfa_p5_voice.approvals WHERE owner_id=$1) AS approvals,(SELECT count(*)::integer FROM bfa_p5_voice.quotas WHERE owner_id=$1) AS quotas,(SELECT count(*)::integer FROM bfa_p5_voice.claims WHERE owner_id=$1) AS claims,(SELECT count(*)::integer FROM bfa_p5_voice.session_fences WHERE owner_id=$1) AS fences;",
      [f.ownerId],
    );
  }

  function issuer(f: Fixture, t = transport()) {
    const state = { authAvailable: true };
    // Test-only trusted host projection. It is deliberately not a production
    // read/auth bridge or a newly granted public query endpoint.
    const instance = createVoiceAuthorityIssuer({
      ...t.writes,
      readSessionFence: t.reads.readSessionFence,
      now: () => Date.now(),
      maxAuthorityAgeMs: 60_000,
      async authenticate() {
        return state.authAvailable
          ? { ownerId: f.ownerId, sessionId: f.sessionId, expiresAt: f.expiresAt }
          : null;
      },
      async readCurrentThread(query) {
        const row = await one(
          "SELECT t.owner_id,t.id,t.revision,t.created_at::text AS created,g.incarnation,t.deleted_at IS NOT NULL AS deleted,a.admitted,floor(extract(epoch FROM a.expires_at)*1000)::bigint AS expires FROM public.bfa_p3b_threads t JOIN public.bfa_p3b_staging_accounts a ON a.user_id=t.owner_id LEFT JOIN bfa_p5_voice.generations g ON g.owner_id=t.owner_id AND g.thread_id=t.id WHERE t.owner_id=$1 AND t.id=$2;",
          [query.ownerId, query.threadId],
        );
        if (!row) return null;
        return {
          ownerId: row.owner_id,
          threadId: row.id,
          threadRevision: row.revision,
          sourceCreatedAt: row.created,
          threadIncarnation: row.incarnation,
          deleted: row.deleted,
          allowlist: {
            ownerId: row.owner_id,
            admitted: row.admitted,
            expiresAt: Number(row.expires),
          },
        };
      },
    });
    const issue = () =>
      instance.issue({
        service: f.service,
        threadId: f.threadId,
        threadRevision: f.threadRevision,
        sourceCreatedAt: f.sourceCreatedAt,
      });
    return { ...t, state, issue };
  }
  async function fenceThread(f: Fixture, action: "cancel" | "delete") {
    return asRole("service_role", "SELECT public.bfa_p3b_fence($1,$2,$3) AS revision;", [
      f.ownerId,
      f.threadId,
      action,
    ]);
  }
  async function expectNoCapabilities(f: Fixture, generations: number, issuances: number) {
    expect(await records(f)).toEqual({
      generations,
      issuances,
      approvals: 0,
      quotas: 0,
      claims: 0,
      fences: 1,
    });
  }

  it("releases a newly sealed envelope only after exact service-role registration with matching HMAC and expiry", async () => {
    const f = await fixture(),
      h = issuer(f);
    const result = await h.issue();
    expect(result).not.toBeNull();
    const opened = await unseal(result!.activeAuthority, f.ownerId, f.threadId, 0);
    expect(opened.authority).toEqual(f.service.exportAuthority(f.threadId));
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
    const writes = h.calls.filter((c) => c.name.startsWith("bfa_p5_voice_register_"));
    expect(writes.map((c) => c.name)).toEqual([
      "bfa_p5_voice_register_generation",
      "bfa_p5_voice_register_issuance",
    ]);
    expect(writes.every((c) => c.committed)).toBe(true);
    expect(JSON.stringify(writes)).not.toContain(result!.activeAuthority);
    expect(JSON.stringify(writes)).not.toContain("authority");
    await expectNoCapabilities(f, 1, 1);
  });

  it("reuses the retained generation while deliberate independent issuance creates a distinct exact envelope", async () => {
    const f = await fixture(),
      h = issuer(f);
    const first = await h.issue(),
      second = await h.issue();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second!.threadIncarnation).toBe(first!.threadIncarnation);
    expect(second!.activeAuthority).not.toBe(first!.activeAuthority);
    expect(await fingerprint(second!.activeAuthority)).not.toBe(
      await fingerprint(first!.activeAuthority),
    );
    await expectNoCapabilities(f, 1, 2);
  });

  it("rejects a source revision already invalidated by actual P3b Stop before any registration", async () => {
    const f = await fixture(),
      h = issuer(f);
    await fenceThread(f, "cancel");
    expect(await h.issue()).toBeNull();
    expect(h.calls.some((c) => c.name.startsWith("bfa_p5_voice_register_"))).toBe(false);
    await expectNoCapabilities(f, 0, 0);
  });

  it("rejects deleted threads without generation or issuance backfill", async () => {
    const f = await fixture(),
      h = issuer(f);
    await fenceThread(f, "delete");
    expect(await h.issue()).toBeNull();
    await expectNoCapabilities(f, 0, 0);
  });

  it("rejects expired or revoked actual session fences and leaves them unchanged", async () => {
    for (const change of ["expires_ms=1", "revoked=true"]) {
      const f = await fixture(),
        h = issuer(f);
      await database().query(
        `UPDATE bfa_p5_voice.session_fences SET ${change} WHERE owner_id=$1;`,
        [f.ownerId],
      );
      const before = await one(
        "SELECT to_jsonb(s) AS value FROM bfa_p5_voice.session_fences s WHERE owner_id=$1;",
        [f.ownerId],
      );
      expect(await h.issue()).toBeNull();
      expect(
        await one(
          "SELECT to_jsonb(s) AS value FROM bfa_p5_voice.session_fences s WHERE owner_id=$1;",
          [f.ownerId],
        ),
      ).toEqual(before);
      await expectNoCapabilities(f, 0, 0);
    }
  });

  it("rejects expired and withdrawn staging access before any capability can be issued", async () => {
    for (const change of ["expires_at=to_timestamp(0)", "admitted=false"]) {
      const f = await fixture(),
        h = issuer(f);
      await database().query(
        `UPDATE public.bfa_p3b_staging_accounts SET ${change} WHERE user_id=$1;`,
        [f.ownerId],
      );
      expect(await h.issue()).toBeNull();
      await expectNoCapabilities(f, 0, 0);
    }
  });

  it("retains a committed generation but releases nothing when its reply is deliberately discarded", async () => {
    const f = await fixture(),
      h = issuer(f);
    h.hooks.afterCommit = async (name, _args, data) => {
      if (name === "bfa_p5_voice_register_generation")
        throw new Error("fictional reply lost after commit");
      return data;
    };
    expect(await h.issue()).toBeNull();
    expect(h.calls.filter((c) => c.name === "bfa_p5_voice_register_generation")).toHaveLength(1);
    expect(h.calls.some((c) => c.name === "bfa_p5_voice_register_issuance")).toBe(false);
    await expectNoCapabilities(f, 1, 0);
  });

  it("retains an unused committed issuance with no token release or automatic retry after discarded reply", async () => {
    const f = await fixture(),
      h = issuer(f);
    h.hooks.afterCommit = async (name, _args, data) => {
      if (name === "bfa_p5_voice_register_issuance")
        throw new Error("fictional reply lost after commit");
      return data;
    };
    expect(await h.issue()).toBeNull();
    expect(h.calls.filter((c) => c.name === "bfa_p5_voice_register_issuance")).toHaveLength(1);
    const row = await one(
      "SELECT fingerprint,revoked FROM bfa_p5_voice.issuances WHERE owner_id=$1;",
      [f.ownerId],
    );
    expect(row!.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(row!.revoked).toBe(false);
    await expectNoCapabilities(f, 1, 1);
  });

  it("does not coerce a malformed acknowledgment after actual issuance commit", async () => {
    const f = await fixture(),
      h = issuer(f);
    h.hooks.afterCommit = async (name, _args, data) =>
      name === "bfa_p5_voice_register_issuance" ? "true" : data;
    expect(await h.issue()).toBeNull();
    expect(h.calls.filter((c) => c.name === "bfa_p5_voice_register_issuance")).toHaveLength(1);
    await expectNoCapabilities(f, 1, 1);
  });

  it("honors actual SQL false when Stop occurs immediately before registration", async () => {
    const f = await fixture(),
      h = issuer(f);
    h.hooks.before = async (name) => {
      if (name === "bfa_p5_voice_register_issuance") await fenceThread(f, "cancel");
    };
    expect(await h.issue()).toBeNull();
    expect(h.calls.filter((c) => c.name === "bfa_p5_voice_register_issuance")).toHaveLength(1);
    await expectNoCapabilities(f, 1, 0);
  });

  it("withholds a registered token when deletion is observed after its committed registration", async () => {
    const f = await fixture(),
      h = issuer(f);
    h.hooks.afterCommit = async (name, _args, data) => {
      if (name === "bfa_p5_voice_register_issuance") await fenceThread(f, "delete");
      return data;
    };
    expect(await h.issue()).toBeNull();
    await expectNoCapabilities(f, 1, 1);
  });

  it("withholds a registered token when the current session version changes before release", async () => {
    const f = await fixture(),
      h = issuer(f);
    h.hooks.afterCommit = async (name, _args, data) => {
      if (name === "bfa_p5_voice_register_issuance")
        await database().query(
          "UPDATE bfa_p5_voice.session_fences SET version=version+1 WHERE owner_id=$1;",
          [f.ownerId],
        );
      return data;
    };
    expect(await h.issue()).toBeNull();
    await expectNoCapabilities(f, 1, 1);
  });

  it("withholds a registered token when fictional current Auth fails before release", async () => {
    const f = await fixture(),
      h = issuer(f);
    h.hooks.afterCommit = async (name, _args, data) => {
      if (name === "bfa_p5_voice_register_issuance") h.state.authAvailable = false;
      return data;
    };
    expect(await h.issue()).toBeNull();
    await expectNoCapabilities(f, 1, 1);
  });

  it("preserves unrelated cumulative quota and closed-claim holds during failed token release", async () => {
    const f = await fixture(),
      h = issuer(f),
      policy = crypto.randomUUID(),
      claim = crypto.randomUUID();
    await database().query("INSERT INTO bfa_p5_voice.quotas VALUES($1,$2,9,1,true);", [
      f.ownerId,
      policy,
    ]);
    await database().query(
      "INSERT INTO bfa_p5_voice.claims VALUES($1,$2,'{}'::jsonb,$3,'closed',$4,1);",
      [claim, f.ownerId, f.expiresAt, policy],
    );
    h.hooks.afterCommit = async (name, _args, data) => {
      if (name === "bfa_p5_voice_register_issuance") throw new Error("lost reply");
      return data;
    };
    expect(await h.issue()).toBeNull();
    expect(
      await one("SELECT remaining_units FROM bfa_p5_voice.quotas WHERE owner_id=$1;", [f.ownerId]),
    ).toEqual({ remaining_units: 9 });
    expect(
      await one("SELECT state,held_units FROM bfa_p5_voice.claims WHERE claim_id=$1;", [claim]),
    ).toEqual({ state: "closed", held_units: 1 });
    expect((await records(f))!.issuances).toBe(1);
  });

  it("keeps generation and issuance registration RPCs denied to actual browser roles", async () => {
    const f = await fixture();
    for (const role of ["anon", "authenticated"] as const) {
      await expect(
        asRole(role, "SELECT public.bfa_p5_voice_register_generation($1,$2);", [
          f.ownerId,
          f.threadId,
        ]),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        asRole(role, "SELECT public.bfa_p5_voice_register_issuance($1,$2,$3,0,$4,$5,$6);", [
          f.ownerId,
          f.threadId,
          crypto.randomUUID(),
          "d".repeat(64),
          Date.now(),
          f.expiresAt,
        ]),
      ).rejects.toMatchObject({ code: "42501" });
    }
    await expectNoCapabilities(f, 0, 0);
  });

  it("rejects an already retired registered generation without issuing or replacing its identity", async () => {
    const f = await fixture(),
      h = issuer(f);
    const incarnation = await h.writes.registerGeneration({
      ownerId: f.ownerId,
      threadId: f.threadId,
    });
    await database().query(
      "UPDATE bfa_p5_voice.generations SET retired=true WHERE incarnation=$1;",
      [incarnation],
    );
    expect(await h.issue()).toBeNull();
    expect(
      await one("SELECT incarnation,retired FROM bfa_p5_voice.generations WHERE owner_id=$1;", [
        f.ownerId,
      ]),
    ).toEqual({ incarnation, retired: true });
    await expectNoCapabilities(f, 1, 0);
  });
});
