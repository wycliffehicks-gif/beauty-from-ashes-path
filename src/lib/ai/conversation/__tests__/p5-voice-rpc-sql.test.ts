// Optional developer-only SQL integration. Supply the separately installed
// pinned engine path; no application dependency or remote database is used.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createVoiceRpcStore,
  type VoiceRpcClient,
  type VoiceRpcName,
} from "../service/voice-rpc-store.server";
import type { VoiceAdmissionClaim } from "../service/voice-admission.server";
import type { VoiceOperationProof } from "../service/voice-store-adapter.server";

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

sqlSuite("P5 RPC mappings executed in isolated single-connection PostgreSQL", () => {
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
    seed = undefined;
    db = await PGlite.create({ loadDataDir: bundle, database: "bfa_p5_offline_fixture" });
    expect((await one("SELECT current_database() AS name;"))!.name).toBe("bfa_p5_offline_fixture");
    const install = async (relative: string) =>
      database().exec(await readFile(path.join(ROOT, relative), "utf8"));
    await install("scripts/conversation-eval/p5-sql/bootstrap.sql");
    const migrations = (await readdir(path.join(ROOT, "drizzle/migrations")))
      .filter((n) => /^000[0-5]_.*\.sql$/.test(n))
      .sort();
    expect(migrations).toHaveLength(6);
    for (const name of migrations) await install(`drizzle/migrations/${name}`);
    await install("docs/pilot/conversation/sql-drafts/p5-voice-admission.sql");
    await install("docs/pilot/conversation/sql-drafts/p5-voice-capacity.sql");
  }, 60_000);
  afterAll(async () => {
    for (const instance of [seed, db]) {
      if (instance && !instance.closed) await instance.close();
      if (instance) expect(instance.closed).toBe(true);
    }
  });

  async function fixture() {
    const owner = crypto.randomUUID(),
      thread = crypto.randomUUID(),
      session = crypto.randomUUID();
    const policy = crypto.randomUUID(),
      approval = crypto.randomUUID(),
      attempt = crypto.randomUUID();
    const pool = crypto.randomUUID(),
      cleanupId = crypto.randomUUID();
    const now = Number((await one("SELECT bfa_p5_voice.ms() AS ms;"))!.ms);
    const expiresAt = now + 600_000,
      fingerprint = "d".repeat(64) + owner.replaceAll("-", "");
    // Hash-shaped, unique fictional authority registration; no seal/Auth assertion.
    const authorityFingerprint = fingerprint.slice(-64);
    await database().query(
      "INSERT INTO public.bfa_p3b_staging_accounts(user_id,admitted,expires_at) VALUES($1,true,to_timestamp($2/1000.0));",
      [owner, expiresAt],
    );
    await database().query("INSERT INTO public.bfa_p3b_threads(id,owner_id) VALUES($1,$2);", [
      thread,
      owner,
    ]);
    const incarnation = (await one("SELECT public.bfa_p5_voice_register_generation($1,$2) AS id;", [
      owner,
      thread,
    ]))!.id as string;
    await database().query("INSERT INTO bfa_p5_voice.session_fences VALUES($1,$2,0,$3,false);", [
      owner,
      session,
      expiresAt,
    ]);
    await database().query("INSERT INTO bfa_p5_voice.quotas VALUES($1,$2,10,1,true);", [
      owner,
      policy,
    ]);
    await database().query(
      "INSERT INTO bfa_p5_voice.approvals VALUES($1,repeat('b',64),$2,$3,$4,0,$5,'developer-voice-session',$6,false,$7);",
      [approval, owner, thread, incarnation, attempt, expiresAt, policy],
    );
    expect(
      (await one(
        "SELECT public.bfa_p5_voice_register_issuance($1,$2,$3,0,$4,$5,$6) AS registered;",
        [owner, thread, incarnation, authorityFingerprint, now, expiresAt],
      ))!.registered,
    ).toBe(true);
    await database().query(
      "INSERT INTO bfa_p5_capacity.pools(pool_id,active_limit,unit_limit,reservation_units,enabled) VALUES($1,1,10,1,true);",
      [pool],
    );
    await database().query("INSERT INTO bfa_p5_capacity.routes VALUES($1,$2,$3);", [
      owner,
      policy,
      pool,
    ]);
    const claim: VoiceAdmissionClaim = {
      claimId: crypto.randomUUID(),
      expiresAt,
      binding: {
        ownerId: owner,
        threadId: thread,
        threadIncarnation: incarnation,
        threadRevision: 0,
        attemptId: attempt,
        approvalId: approval,
        approvalDigest: "b".repeat(64),
        scope: "developer-voice-session",
      },
    };
    return {
      owner,
      thread,
      session,
      policy,
      approval,
      pool,
      claim,
      cleanupId,
      authorityFingerprint,
    };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  async function proof(f: Fixture, operation: "claim" | "inspect"): Promise<VoiceOperationProof> {
    const now = Number((await one("SELECT bfa_p5_voice.ms() AS ms;"))!.ms);
    return {
      cleanupId: f.cleanupId,
      claim: f.claim,
      receiptId: crypto.randomUUID(),
      operation,
      ownerSessionId: f.session,
      sessionVersion: 0,
      authorityFingerprint: f.authorityFingerprint,
      verifiedAt: now,
      expiresAt: now + 20_000,
      effectiveExpiresAt: f.claim.expiresAt,
      identityExpiresAt: f.claim.expiresAt,
    };
  }
  async function state(f: Fixture) {
    return one(
      "SELECT (SELECT remaining_units FROM bfa_p5_voice.quotas WHERE owner_id=$1) AS remaining,(SELECT COALESCE(sum(held_units),0)::integer FROM bfa_p5_voice.claims WHERE owner_id=$1) AS original_hold,occupied,held_units AS pool_hold FROM bfa_p5_capacity.pools WHERE pool_id=$2;",
      [f.owner, f.pool],
    );
  }
  function transport() {
    const calls: { name: VoiceRpcName; args: Readonly<Record<string, unknown>> }[] = [];
    const client: VoiceRpcClient = {
      async rpc(name, args) {
        calls.push({ name, args });
        expect([
          "bfa_p5_voice_register_cleanup",
          "bfa_p5_voice_register_proof",
          "bfa_p5_capacity_claim",
          "bfa_p5_voice_inspect",
          "bfa_p5_capacity_close",
        ]).toContain(name);
        const entries = Object.entries(args);
        const parameters = entries.map(([key, value]) => {
          expect(["p_cleanup_id", "p_receipt_id", "p_claim", "p_proof"]).toContain(key);
          return key === "p_claim" || key === "p_proof" ? JSON.stringify(value) : value;
        });
        const named = entries
          .map(
            ([key], i) =>
              `${key}=>$${i + 1}::${key === "p_claim" || key === "p_proof" ? "jsonb" : "uuid"}`,
          )
          .join(",");
        await database().exec("BEGIN; SET LOCAL ROLE service_role;");
        try {
          expect((await one("SELECT current_user AS role;"))!.role).toBe("service_role");
          const row = await one(`SELECT public.${name}(${named}) AS result;`, parameters);
          await database().exec("COMMIT;");
          return { data: row!.result, error: null, status: 200 };
        } catch (error) {
          await database().exec("ROLLBACK;");
          throw error;
        }
      },
    };
    return { client, calls, store: createVoiceRpcStore(client) };
  }
  async function ready(f: Fixture, store: ReturnType<typeof createVoiceRpcStore>) {
    await store.registerCleanup({ cleanupId: f.cleanupId, claim: f.claim });
    const p = await proof(f, "claim");
    await store.registerProof(p);
    return p;
  }

  it("executes all five named mappings through service_role and retains the single hold", async () => {
    const f = await fixture(),
      t = transport(),
      p = await ready(f, t.store);
    expect(await t.store.claim(p.receiptId, f.claim)).toEqual({ claim: f.claim, state: "claimed" });
    const inspection = await proof(f, "inspect");
    await t.store.registerProof(inspection);
    expect(await t.store.inspect(inspection.receiptId, f.claim)).toEqual({
      claim: f.claim,
      state: "claimed",
    });
    expect(await t.store.close(f.cleanupId, f.claim)).toEqual({ claim: f.claim, state: "closed" });
    expect(await state(f)).toEqual({ remaining: 9, original_hold: 1, occupied: 0, pool_hold: 1 });
    expect(new Set(t.calls.map((c) => c.name)).size).toBe(5);
  });
  it("denies disabled capacity without leaving a base claim or debiting quota", async () => {
    const f = await fixture(),
      t = transport(),
      p = await ready(f, t.store);
    await database().query("UPDATE bfa_p5_capacity.pools SET enabled=false WHERE pool_id=$1;", [
      f.pool,
    ]);
    expect(await t.store.claim(p.receiptId, f.claim)).toEqual({ claim: f.claim, state: "denied" });
    expect(await state(f)).toEqual({ remaining: 10, original_hold: 0, occupied: 0, pool_hold: 0 });
    expect(t.calls.filter((c) => c.name === "bfa_p5_capacity_claim")).toHaveLength(1);
  });
  it("refuses attaching an existing base-only hold rather than debiting a second time", async () => {
    const f = await fixture(),
      t = transport(),
      p = await ready(f, t.store);
    await database().query("SELECT public.bfa_p5_voice_claim($1,$2::jsonb);", [
      p.receiptId,
      JSON.stringify(f.claim),
    ]);
    const again = await proof(f, "claim");
    await t.store.registerProof(again);
    expect(await t.store.claim(again.receiptId, f.claim)).toEqual({
      claim: f.claim,
      state: "denied",
    });
    expect(await state(f)).toEqual({ remaining: 9, original_hold: 1, occupied: 0, pool_hold: 0 });
  });
  it("preserves actual SQL null proof denial without a fallback claim", async () => {
    const f = await fixture(),
      t = transport();
    await t.store.registerCleanup({ cleanupId: f.cleanupId, claim: f.claim });
    const p = await proof(f, "claim");
    await database().query("UPDATE bfa_p5_voice.approvals SET revoked=true WHERE approval_id=$1;", [
      f.approval,
    ]);
    expect(await t.store.registerProof(p)).toBeNull();
    expect(t.calls.map((c) => c.name)).toEqual([
      "bfa_p5_voice_register_cleanup",
      "bfa_p5_voice_register_proof",
    ]);
    expect(await state(f)).toEqual({ remaining: 10, original_hold: 0, occupied: 0, pool_hold: 0 });
  });
  it("retains a committed claim after deliberately discarded reply and closes it after deletion", async () => {
    const f = await fixture(),
      t = transport();
    const store = createVoiceRpcStore({
      async rpc(name, args) {
        const result = await t.client.rpc(name, args);
        if (name === "bfa_p5_capacity_claim")
          throw new Error("Fictional discarded committed reply");
        return result;
      },
    });
    const p = await ready(f, store);
    await expect(store.claim(p.receiptId, f.claim)).rejects.toThrow("voice-rpc-unavailable");
    expect(t.calls.filter((c) => c.name === "bfa_p5_capacity_claim")).toHaveLength(1);
    expect(await state(f)).toEqual({ remaining: 9, original_hold: 1, occupied: 1, pool_hold: 1 });
    await database().query(
      "UPDATE public.bfa_p3b_threads SET deleted_at=clock_timestamp(),revision=revision+1 WHERE id=$1;",
      [f.thread],
    );
    expect(await store.close(f.cleanupId, f.claim)).toEqual({ claim: f.claim, state: "closed" });
    expect(await state(f)).toEqual({ remaining: 9, original_hold: 1, occupied: 0, pool_hold: 1 });
  });
  it("retries an explicitly requested close with its exact identity after discarded committed reply", async () => {
    const f = await fixture(),
      t = transport(),
      p = await ready(f, t.store);
    await t.store.claim(p.receiptId, f.claim);
    let discard = true;
    const store = createVoiceRpcStore({
      async rpc(name, args) {
        const result = await t.client.rpc(name, args);
        if (name === "bfa_p5_capacity_close" && discard) {
          discard = false;
          throw new Error("Fictional discarded close reply");
        }
        return result;
      },
    });
    await expect(store.close(f.cleanupId, f.claim)).rejects.toThrow("voice-rpc-unavailable");
    expect(t.calls.filter((c) => c.name === "bfa_p5_capacity_close")).toHaveLength(1);
    expect(await state(f)).toEqual({ remaining: 9, original_hold: 1, occupied: 0, pool_hold: 1 });
    expect(await store.close(f.cleanupId, f.claim)).toEqual({ claim: f.claim, state: "closed" });
    const closes = t.calls.filter((c) => c.name === "bfa_p5_capacity_close");
    expect(closes).toHaveLength(2);
    expect(closes[0]!.args).toEqual(closes[1]!.args);
    expect(await state(f)).toEqual({ remaining: 9, original_hold: 1, occupied: 0, pool_hold: 1 });
  });
});
