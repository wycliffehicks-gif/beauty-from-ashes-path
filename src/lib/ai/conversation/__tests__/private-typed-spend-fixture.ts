// Test-only disposable SQL setup. Fictional identities and funding, never Auth.
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export interface PrivateSpendDatabase {
  exec(sql: string): Promise<unknown>;
  query(sql: string, parameters?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  close(): Promise<void>;
  dumpDataDir(compression: string): Promise<unknown>;
  readonly closed: boolean;
}
export interface PrivateSpendApproval {
  approvalId: string;
  ownerId: string;
  authSessionId: string;
  threadId: string;
  threadRevision: number;
  requestId: string;
  manifestSha256: string;
  payloadSha256: string;
  provider: string;
  model: string;
  tier: string;
  maxMicros: number;
  approvalExpiresAt: string;
  authVerifiedAt: string;
  authExpiresAt: string;
}
export const privateSpendDigest = (value: string = randomUUID()) =>
  createHash("sha256").update(value).digest("hex");

export function privateSpendBaseArgs(a: PrivateSpendApproval): Record<string, unknown> {
  return {
    p_approval: a.approvalId,
    p_owner: a.ownerId,
    p_session: a.authSessionId,
    p_thread: a.threadId,
    p_revision: a.threadRevision,
    p_request: a.requestId,
    p_manifest: a.manifestSha256,
    p_payload: a.payloadSha256,
    p_provider: a.provider,
    p_model: a.model,
    p_tier: a.tier,
    p_max_micros: a.maxMicros,
    p_approval_expires_at: a.approvalExpiresAt,
  };
}
export function privateSpendClaimArgs(a: PrivateSpendApproval): Record<string, unknown> {
  return {
    ...privateSpendBaseArgs(a),
    p_auth_verified_at: a.authVerifiedAt,
    p_auth_expires_at: a.authExpiresAt,
  };
}

export async function createPrivateTypedSpendFixture(enginePath: string) {
  if (!path.isAbsolute(enginePath)) throw new Error("Absolute local SQL engine path required");
  const modulePath = await realpath(enginePath);
  const pkg = JSON.parse(await readFile(path.resolve(modulePath, "../../package.json"), "utf8"));
  if (pkg.name !== "@electric-sql/pglite" || pkg.version !== "0.5.12")
    throw new Error("Expected isolated PGlite version");
  const { PGlite } = await import(/* @vite-ignore */ pathToFileURL(modulePath).href);
  const seed: PrivateSpendDatabase = await PGlite.create();
  let db: PrivateSpendDatabase | undefined;
  try {
    await seed.exec("CREATE DATABASE bfa_p5_offline_fixture;");
    const bundle = await seed.dumpDataDir("none");
    await seed.close();
    db = await PGlite.create({ loadDataDir: bundle, database: "bfa_p5_offline_fixture" });
    const database = db!;
    const one = async (sql: string, values: unknown[] = []) =>
      (await database.query(sql, values)).rows[0]!;
    if ((await one("SELECT current_database() AS name;")).name !== "bfa_p5_offline_fixture")
      throw new Error("Disposable fixture database required");
    const install = async (relative: string) =>
      database.exec(await readFile(path.join(process.cwd(), relative), "utf8"));
    await install("scripts/conversation-eval/p5-sql/bootstrap.sql");
    const migrations = (await readdir("drizzle/migrations"))
      .filter((name) => /^000[0-5]_.*\.sql$/.test(name))
      .sort();
    if (migrations.length !== 6) throw new Error("Original P3b fixture chain required");
    for (const name of migrations) await install(`drizzle/migrations/${name}`);
    await install("docs/pilot/conversation/sql-drafts/private-typed-spend.sql");
    const kinds: Record<string, string> = {
      p_approval: "uuid",
      p_owner: "uuid",
      p_session: "uuid",
      p_thread: "uuid",
      p_revision: "bigint",
      p_request: "uuid",
      p_manifest: "text",
      p_payload: "text",
      p_provider: "text",
      p_model: "text",
      p_tier: "text",
      p_max_micros: "bigint",
      p_approval_expires_at: "timestamptz",
      p_auth_verified_at: "timestamptz",
      p_auth_expires_at: "timestamptz",
      p_response_id: "text",
      p_evidence_sha256: "text",
      p_charged_micros: "bigint",
    };
    async function asRole<T>(
      role: "anon" | "authenticated" | "service_role",
      action: () => Promise<T>,
    ) {
      await database.exec(`BEGIN; SET LOCAL ROLE ${role};`);
      try {
        const value = await action();
        await database.exec("COMMIT;");
        return value;
      } catch (error) {
        await database.exec("ROLLBACK;");
        throw error;
      }
    }
    async function rpc(
      name: string,
      args: Record<string, unknown>,
      role: "anon" | "authenticated" | "service_role" = "service_role",
    ) {
      if (!["bfa_private_text_spend_claim", "bfa_private_text_spend_settle"].includes(name))
        throw new Error("Unknown fixture RPC");
      const entries = Object.entries(args);
      if (!entries.length || entries.some(([key]) => !Object.hasOwn(kinds, key)))
        throw new Error("Unknown fixture argument");
      return asRole(
        role,
        async () =>
          (
            await one(
              `SELECT public.${name}(${entries.map(([key], i) => `${key} => $${i + 1}::${kinds[key]}`).join(",")}) AS result;`,
              entries.map(([, value]) => value),
            )
          ).result,
      );
    }
    async function seedApproval(
      overrides: Partial<PrivateSpendApproval> = {},
    ): Promise<PrivateSpendApproval> {
      const now = Number(
        (await one("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms;")).ms,
      );
      const a: PrivateSpendApproval = {
        approvalId: randomUUID(),
        ownerId: randomUUID(),
        authSessionId: randomUUID(),
        threadId: randomUUID(),
        threadRevision: 0,
        requestId: randomUUID(),
        manifestSha256: privateSpendDigest(),
        payloadSha256: privateSpendDigest(),
        provider: "openai",
        model: "gpt-6-luna",
        tier: "default",
        maxMicros: 9112,
        approvalExpiresAt: new Date(now + 60000).toISOString(),
        authVerifiedAt: new Date(now - 1000).toISOString(),
        authExpiresAt: new Date(now + 60000).toISOString(),
        ...overrides,
      };
      await database.query(
        "INSERT INTO public.bfa_p3b_staging_accounts(user_id,admitted,expires_at) VALUES($1,true,clock_timestamp()+interval '2 minutes') ON CONFLICT(user_id) DO NOTHING;",
        [a.ownerId],
      );
      await database.query(
        "INSERT INTO public.bfa_p3b_threads(id,owner_id,revision) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING;",
        [a.threadId, a.ownerId, a.threadRevision],
      );
      await database.query(
        `INSERT INTO bfa_private_text_spend.approvals(approval_id,owner_id,auth_session_id,thread_id,thread_revision,request_id,manifest_sha256,payload_sha256,provider,model,tier,max_micros,created_at,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,clock_timestamp()-interval '1 minute',$13);`,
        [
          a.approvalId,
          a.ownerId,
          a.authSessionId,
          a.threadId,
          a.threadRevision,
          a.requestId,
          a.manifestSha256,
          a.payloadSha256,
          a.provider,
          a.model,
          a.tier,
          a.maxMicros,
          a.approvalExpiresAt,
        ],
      );
      return a;
    }
    return {
      db: database,
      one,
      asRole,
      rpc,
      seedApproval,
      close: async () => {
        if (!database.closed) await database.close();
        if (!seed.closed) await seed.close();
        if (!database.closed || !seed.closed) throw new Error("Fixture cleanup failed");
      },
    };
  } catch (error) {
    if (db && !db.closed) await db.close();
    if (!seed.closed) await seed.close();
    throw error;
  }
}
