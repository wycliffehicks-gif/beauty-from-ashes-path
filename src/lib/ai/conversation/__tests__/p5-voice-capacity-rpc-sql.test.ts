// Optional actual single-connection PostgreSQL transport integration. All Auth,
// grants, pools and provider observations are fictional administrative fixtures.
// No provider verifier/call, HTTP fault injection or native contention occurs.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createVoiceRpcStore, type VoiceRpcName } from "../service/voice-rpc-store.server";
import {
  createVoiceCapacityRpcPorts,
  type VoiceCapacityRpcName,
  type VoiceCapacityObservation,
} from "../service/voice-capacity-rpc.server";
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
type RpcName = VoiceRpcName | VoiceCapacityRpcName;
type Args = Readonly<Record<string, unknown>>;
const voiceTables = [
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
];
const capacityTables = ["pools", "routes", "allocations", "sessions", "evidence", "conflicts"];
const tables = [
  ...["staging_accounts", "threads", "allowances", "admissions"].map((n) => `public.bfa_p3b_${n}`),
  ...voiceTables.map((n) => `bfa_p5_voice.${n}`),
  ...capacityTables.map((n) => `bfa_p5_capacity.${n}`),
];

sqlSuite("P5 capacity mark and reconciliation transports in isolated PostgreSQL", () => {
  let db: LocalDatabase | undefined;
  let seed: LocalDatabase | undefined;
  const database = () => {
    if (!db) throw new Error("Offline fixture database unavailable");
    return db;
  };
  async function one(sql: string, parameters: unknown[] = []) {
    return (await database().query(sql, parameters)).rows[0]!;
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
    await install("docs/pilot/conversation/sql-drafts/p5-voice-admission.sql");
    await install("docs/pilot/conversation/sql-drafts/p5-voice-capacity.sql");
    await install("docs/pilot/conversation/sql-drafts/p5-voice-session-revoke.sql");
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
    parameters: unknown[] = [],
  ) {
    await database().exec(`BEGIN; SET LOCAL ROLE ${role};`);
    try {
      expect((await one("SELECT current_user AS role;")).role).toBe(role);
      const row = await one(sql, parameters);
      await database().exec("COMMIT;");
      return row;
    } catch (error) {
      await database().exec("ROLLBACK;");
      throw error;
    }
  }
  async function snapshot() {
    const result: Record<string, unknown> = {};
    for (const table of tables)
      result[table] = (
        await one(
          `SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS rows FROM ${table} t;`,
        )
      ).rows;
    return result;
  }
  async function fixture(existingPool?: string) {
    const owner = crypto.randomUUID(),
      thread = crypto.randomUUID(),
      session = crypto.randomUUID();
    const policy = crypto.randomUUID(),
      approval = crypto.randomUUID(),
      attempt = crypto.randomUUID();
    const pool = existingPool ?? crypto.randomUUID(),
      cleanupId = crypto.randomUUID(),
      operationId = crypto.randomUUID();
    const now = Number((await one("SELECT bfa_p5_voice.ms() AS ms;")).ms),
      expiresAt = now + 600_000;
    const authorityFingerprint = ("d".repeat(64) + owner.replaceAll("-", "")).slice(-64);
    await database().query(
      "INSERT INTO public.bfa_p3b_staging_accounts(user_id,admitted,expires_at) VALUES($1,true,to_timestamp($2/1000.0));",
      [owner, expiresAt],
    );
    await database().query(
      "INSERT INTO public.bfa_p3b_threads(id,owner_id,saved_snapshot,saved_at) VALUES($1,$2,to_jsonb('fictional private source must not escape'::text),clock_timestamp());",
      [thread, owner],
    );
    const incarnation = (
      await asRole("service_role", "SELECT public.bfa_p5_voice_register_generation($1,$2) AS id;", [
        owner,
        thread,
      ])
    ).id as string;
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
      (
        await asRole(
          "service_role",
          "SELECT public.bfa_p5_voice_register_issuance($1,$2,$3,0,$4,$5,$6) AS registered;",
          [owner, thread, incarnation, authorityFingerprint, now, expiresAt],
        )
      ).registered,
    ).toBe(true);
    if (!existingPool)
      await database().query(
        "INSERT INTO bfa_p5_capacity.pools(pool_id,active_limit,unit_limit,reservation_units,enabled) VALUES($1,2,20,1,true);",
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
      cleanupId,
      operationId,
      authorityFingerprint,
      claim,
    };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  async function proof(f: Fixture, operation: "claim" | "inspect"): Promise<VoiceOperationProof> {
    const now = Number((await one("SELECT bfa_p5_voice.ms() AS ms;")).ms);
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
      "SELECT (SELECT remaining_units FROM bfa_p5_voice.quotas WHERE owner_id=$1) AS remaining,(SELECT COALESCE(sum(held_units),0)::integer FROM bfa_p5_voice.claims WHERE owner_id=$1) AS original_hold,occupied,held_units AS pool_hold,quarantined FROM bfa_p5_capacity.pools WHERE pool_id=$2;",
      [f.owner, f.pool],
    );
  }
  async function allocation(f: Fixture) {
    return one(
      "SELECT operation_id,session_id,terminal,closed,slot_held FROM bfa_p5_capacity.allocations WHERE claim_id=$1;",
      [f.claim.claimId],
    );
  }
  function transport() {
    const calls: { name: RpcName; args: Args; committed: boolean }[] = [];
    const hooks: { afterCommit?: (name: RpcName, args: Args, data: unknown) => Promise<unknown> } =
      {};
    const client = {
      async rpc(name: RpcName, args: Args) {
        expect([
          "bfa_p5_voice_register_cleanup",
          "bfa_p5_voice_register_proof",
          "bfa_p5_capacity_claim",
          "bfa_p5_voice_inspect",
          "bfa_p5_capacity_close",
          "bfa_p5_capacity_mark",
          "bfa_p5_capacity_reconcile",
        ]).toContain(name);
        const call = { name, args, committed: false };
        calls.push(call);
        const types: Record<string, string> = {
          p_cleanup_id: "uuid",
          p_receipt_id: "uuid",
          p_claim: "jsonb",
          p_proof: "jsonb",
          p_operation_id: "uuid",
          p_expected_version: "bigint",
          p_observation: "jsonb",
        };
        const entries = Object.entries(args);
        const parameters = entries.map(([key, value]) => {
          expect(Object.hasOwn(types, key)).toBe(true);
          return types[key] === "jsonb" ? JSON.stringify(value) : value;
        });
        const named = entries.map(([key], i) => `${key}=>$${i + 1}::${types[key]}`).join(",");
        const row = await asRole(
          "service_role",
          `SELECT public.${name}(${named}) AS value;`,
          parameters,
        );
        call.committed = true;
        return {
          data: hooks.afterCommit ? await hooks.afterCommit(name, args, row.value) : row.value,
          error: null,
          status: 200,
        };
      },
    };
    return {
      calls,
      hooks,
      store: createVoiceRpcStore(client),
      capacity: createVoiceCapacityRpcPorts(client),
    };
  }
  type Transport = ReturnType<typeof transport>;
  async function admit(f: Fixture, t: Transport) {
    await t.store.registerCleanup({ cleanupId: f.cleanupId, claim: f.claim });
    const p = await proof(f, "claim");
    expect(await t.store.registerProof(p)).not.toBeNull();
    expect(await t.store.claim(p.receiptId, f.claim)).toEqual({ claim: f.claim, state: "claimed" });
  }
  async function freshInspect(f: Fixture, t: Transport) {
    const p = await proof(f, "inspect");
    expect(await t.store.registerProof(p)).not.toBeNull();
    return p;
  }
  async function mark(
    f: Fixture,
    t: Transport,
    operationId = f.operationId,
    expectedPoolVersion = 1,
  ) {
    const p = await freshInspect(f, t);
    return t.capacity.mark({
      receiptId: p.receiptId,
      claim: f.claim,
      operationId,
      expectedPoolVersion,
    });
  }
  async function marked(existingPool?: string) {
    const f = await fixture(existingPool),
      t = transport();
    await admit(f, t);
    expect(await mark(f, t)).toEqual({ claim: f.claim, state: "marked" });
    return { f, t };
  }
  function observation(
    f: Fixture,
    kind: VoiceCapacityObservation["kind"],
    sessionId: string | null = kind === "created" || kind === "ended" ? "fictional_session" : null,
  ): VoiceCapacityObservation {
    return {
      evidenceId: crypto.randomUUID(),
      operationId: f.operationId,
      kind,
      sessionId,
    } as VoiceCapacityObservation;
  }
  function reconcile(f: Fixture, t: Transport, value: VoiceCapacityObservation) {
    return t.capacity.reconcile({ cleanupId: f.cleanupId, claim: f.claim, observation: value });
  }
  const retained = {
    remaining: 9,
    original_hold: 1,
    occupied: 1,
    pool_hold: 1,
    quarantined: false,
  };

  it("executes exact named mark and reconciliation mappings as service_role without private content", async () => {
    const f = await fixture(),
      t = transport();
    await admit(f, t);
    const p = await freshInspect(f, t);
    const input = {
      receiptId: p.receiptId,
      claim: f.claim,
      operationId: f.operationId,
      expectedPoolVersion: 1,
    };
    expect(await t.capacity.mark(input)).toEqual({ claim: f.claim, state: "marked" });
    const value = observation(f, "unknown");
    expect(await reconcile(f, t, value)).toEqual({ claim: f.claim, state: "uncertain" });
    expect(t.calls.filter((c) => c.name === "bfa_p5_capacity_mark")).toEqual([
      {
        name: "bfa_p5_capacity_mark",
        args: {
          p_receipt_id: p.receiptId,
          p_claim: f.claim,
          p_operation_id: f.operationId,
          p_expected_version: 1,
        },
        committed: true,
      },
    ]);
    expect(t.calls.at(-1)).toEqual({
      name: "bfa_p5_capacity_reconcile",
      args: { p_cleanup_id: f.cleanupId, p_claim: f.claim, p_observation: value },
      committed: true,
    });
    expect(JSON.stringify(t.calls)).not.toContain("fictional private source");
    expect(await state(f)).toEqual(retained);
  });
  it("reports already-marked only with a fresh proof and never rebinds or debits the operation", async () => {
    const { f, t } = await marked();
    expect(await mark(f, t)).toEqual({ claim: f.claim, state: "already-marked" });
    expect(await mark(f, t, crypto.randomUUID())).toEqual({ claim: f.claim, state: "denied" });
    expect((await allocation(f)).operation_id).toBe(f.operationId);
    expect(await state(f)).toEqual(retained);
  });
  it("cannot reuse an INSPECT proof consumed by base inspection as a marker permit", async () => {
    const f = await fixture(),
      t = transport();
    await admit(f, t);
    const p = await freshInspect(f, t);
    expect(await t.store.inspect(p.receiptId, f.claim)).toEqual({
      claim: f.claim,
      state: "claimed",
    });
    expect(
      await t.capacity.mark({
        receiptId: p.receiptId,
        claim: f.claim,
        operationId: f.operationId,
        expectedPoolVersion: 1,
      }),
    ).toEqual({ claim: f.claim, state: "denied" });
    expect((await allocation(f)).operation_id).toBeNull();
    expect(await state(f)).toEqual(retained);
  });
  it("denies missing and wrong-operation proofs without consuming a wrong-kind receipt", async () => {
    const f = await fixture(),
      t = transport();
    await admit(f, t);
    const p = await proof(f, "claim");
    expect(await t.store.registerProof(p)).not.toBeNull();
    for (const receiptId of [crypto.randomUUID(), p.receiptId])
      expect(
        await t.capacity.mark({
          receiptId,
          claim: f.claim,
          operationId: f.operationId,
          expectedPoolVersion: 1,
        }),
      ).toEqual({ claim: f.claim, state: "denied" });
    expect(
      (await one("SELECT consumed_ms FROM bfa_p5_voice.proofs WHERE receipt_id=$1;", [p.receiptId]))
        .consumed_ms,
    ).toBeNull();
    expect((await allocation(f)).operation_id).toBeNull();
  });
  it("checks current pool version, enabled state and quarantine before marking", async () => {
    for (const variant of ["version", "disabled", "quarantined"]) {
      const f = await fixture(),
        t = transport();
      await admit(f, t);
      if (variant !== "version")
        await database().query(
          `UPDATE bfa_p5_capacity.pools SET ${variant === "disabled" ? "enabled=false" : "quarantined=true"} WHERE pool_id=$1;`,
          [f.pool],
        );
      expect(await mark(f, t, f.operationId, variant === "version" ? 2 : 1)).toEqual({
        claim: f.claim,
        state: variant === "quarantined" ? "quarantined" : "denied",
      });
      expect((await allocation(f)).operation_id).toBeNull();
      expect(await state(f)).toMatchObject({
        remaining: 9,
        original_hold: 1,
        occupied: 1,
        pool_hold: 1,
      });
    }
  });
  it("denies a pending marker after actual Stop, Delete or session revocation and retains cumulative holds", async () => {
    for (const action of ["cancel", "delete", "revoke"]) {
      const f = await fixture(),
        t = transport();
      await admit(f, t);
      const p = await freshInspect(f, t);
      if (action === "revoke")
        await asRole("service_role", "SELECT public.bfa_p5_voice_revoke_session($1,$2);", [
          f.owner,
          f.session,
        ]);
      else
        await asRole("service_role", "SELECT public.bfa_p3b_fence($1,$2,$3);", [
          f.owner,
          f.thread,
          action,
        ]);
      expect(
        await t.capacity.mark({
          receiptId: p.receiptId,
          claim: f.claim,
          operationId: f.operationId,
          expectedPoolVersion: 1,
        }),
      ).toEqual({ claim: f.claim, state: "denied" });
      expect((await allocation(f)).operation_id).toBeNull();
      expect(await state(f)).toEqual({ ...retained, occupied: 0 });
    }
  });
  it("denies a marker with expired proof or clock below retained high-water", async () => {
    for (const variant of ["expiry", "clock"]) {
      const f = await fixture(),
        t = transport();
      await admit(f, t);
      const p = await freshInspect(f, t);
      if (variant === "expiry")
        await database().query(
          "UPDATE bfa_p5_voice.proofs SET verified_ms=0,expires_ms=1 WHERE receipt_id=$1;",
          [p.receiptId],
        );
      else
        await database().query(
          "UPDATE bfa_p5_voice.owner_clocks SET observed_ms=9007199254740991 WHERE owner_id=$1;",
          [f.owner],
        );
      expect(
        await t.capacity.mark({
          receiptId: p.receiptId,
          claim: f.claim,
          operationId: f.operationId,
          expectedPoolVersion: 1,
        }),
      ).toEqual({ claim: f.claim, state: "denied" });
      expect((await allocation(f)).operation_id).toBeNull();
      expect(await state(f)).toMatchObject({ remaining: 9, original_hold: 1, pool_hold: 1 });
    }
  });
  it("does not bind one immutable operation ID to a second owner's claim", async () => {
    const first = await marked(),
      f = await fixture(),
      t = transport();
    await admit(f, t);
    expect(await mark(f, t, first.f.operationId)).toEqual({ claim: f.claim, state: "denied" });
    expect((await allocation(f)).operation_id).toBeNull();
    expect((await allocation(first.f)).operation_id).toBe(first.f.operationId);
    expect(await state(f)).toEqual(retained);
    expect(await state(first.f)).toEqual(retained);
  });
  it("preserves the legitimate closed marker response after close wins before mark", async () => {
    const f = await fixture(),
      t = transport();
    await admit(f, t);
    const p = await freshInspect(f, t);
    expect(await t.store.close(f.cleanupId, f.claim)).toEqual({ claim: f.claim, state: "closed" });
    expect(
      await t.capacity.mark({
        receiptId: p.receiptId,
        claim: f.claim,
        operationId: f.operationId,
        expectedPoolVersion: 1,
      }),
    ).toEqual({ claim: f.claim, state: "closed" });
    expect((await allocation(f)).operation_id).toBeNull();
    expect(await state(f)).toEqual({ ...retained, occupied: 0 });
  });
  it("keeps a marked slot held after close until an operation-wide terminal observation arrives", async () => {
    const { f, t } = await marked();
    expect(await t.store.close(f.cleanupId, f.claim)).toEqual({ claim: f.claim, state: "closed" });
    expect(await state(f)).toEqual(retained);
    expect(await allocation(f)).toMatchObject({
      closed: true,
      slot_held: true,
      operation_id: f.operationId,
    });
    expect(await reconcile(f, t, observation(f, "not-created"))).toEqual({
      claim: f.claim,
      state: "terminal-recorded",
    });
    expect(await state(f)).toEqual({ ...retained, occupied: 0 });
  });
  it("retains a committed marker after lost or malformed acknowledgment without automatic retry", async () => {
    for (const malformed of [false, true]) {
      const f = await fixture(),
        t = transport();
      await admit(f, t);
      t.hooks.afterCommit = async (name, _args, data) => {
        if (name === "bfa_p5_capacity_mark") {
          if (malformed) return { claim: f.claim, state: "claimed" };
          throw new Error("fictional discarded committed marker reply");
        }
        return data;
      };
      await expect(mark(f, t)).rejects.toThrow("voice-capacity-rpc-unavailable");
      expect(t.calls.filter((c) => c.name === "bfa_p5_capacity_mark")).toHaveLength(1);
      expect((await allocation(f)).operation_id).toBe(f.operationId);
      expect(await state(f)).toEqual(retained);
      t.hooks.afterCommit = undefined;
      expect(await mark(f, t)).toEqual({ claim: f.claim, state: "already-marked" });
      expect(await state(f)).toEqual(retained);
    }
  });
  it("records unknown evidence without releasing the marked slot or changing accounting", async () => {
    const { f, t } = await marked();
    expect(await reconcile(f, t, observation(f, "unknown"))).toEqual({
      claim: f.claim,
      state: "uncertain",
    });
    expect(await allocation(f)).toMatchObject({
      terminal: null,
      session_id: null,
      slot_held: true,
      closed: false,
    });
    expect(await state(f)).toEqual(retained);
  });
  it("observes creation then releases exactly one slot on fictional whole-operation end while retaining both holds", async () => {
    const { f, t } = await marked();
    expect(await reconcile(f, t, observation(f, "created", "fixture-session_A:1"))).toEqual({
      claim: f.claim,
      state: "creation-observed",
    });
    expect(await state(f)).toEqual(retained);
    const ended = observation(f, "ended", "fixture-session_A:1");
    expect(await reconcile(f, t, ended)).toEqual({ claim: f.claim, state: "terminal-recorded" });
    expect(await state(f)).toEqual({ ...retained, occupied: 0 });
    expect(await allocation(f)).toEqual({
      operation_id: f.operationId,
      session_id: "fixture-session_A:1",
      terminal: "ended",
      closed: true,
      slot_held: false,
    });
    const before = await snapshot();
    expect(await reconcile(f, t, ended)).toEqual({ claim: f.claim, state: "duplicate-evidence" });
    expect(await snapshot()).toEqual(before);
  });
  it("handles not-created finality and distinct repeated terminal evidence without a second release or refund", async () => {
    const { f, t } = await marked();
    for (let i = 0; i < 2; i++)
      expect(await reconcile(f, t, observation(f, "not-created"))).toEqual({
        claim: f.claim,
        state: "terminal-recorded",
      });
    expect(await state(f)).toEqual({ ...retained, occupied: 0 });
    expect(await allocation(f)).toMatchObject({
      terminal: "not-created",
      session_id: null,
      slot_held: false,
      closed: true,
    });
  });
  it("classifies late unknown and matching created evidence after an end without reopening allocation", async () => {
    const { f, t } = await marked();
    expect(await reconcile(f, t, observation(f, "ended", "fixture-end-first"))).toEqual({
      claim: f.claim,
      state: "terminal-recorded",
    });
    for (const value of [observation(f, "unknown"), observation(f, "created", "fixture-end-first")])
      expect(await reconcile(f, t, value)).toEqual({ claim: f.claim, state: "late-evidence" });
    expect(await state(f)).toEqual({ ...retained, occupied: 0 });
    expect(await allocation(f)).toMatchObject({
      terminal: "ended",
      closed: true,
      slot_held: false,
    });
  });
  it("quarantines a rebound evidence ID without treating its conflicting body as a duplicate", async () => {
    const { f, t } = await marked(),
      first = observation(f, "unknown");
    expect(await reconcile(f, t, first)).toEqual({ claim: f.claim, state: "uncertain" });
    const changed = {
      ...observation(f, "created", "fixture-conflict"),
      evidenceId: first.evidenceId,
    };
    expect(await reconcile(f, t, changed)).toEqual({ claim: f.claim, state: "quarantined" });
    expect(await state(f)).toEqual({ ...retained, quarantined: true });
    expect(
      (
        await one(
          "SELECT count(*)::integer AS count FROM bfa_p5_capacity.conflicts WHERE pool_id=$1;",
          [f.pool],
        )
      ).count,
    ).toBe(1);
    expect(await mark(f, t)).toEqual({ claim: f.claim, state: "quarantined" });
  });
  it("quarantines a provider-session identity rebound across operations in the same pool", async () => {
    const first = await marked(),
      second = await marked(first.f.pool);
    expect(
      await reconcile(first.f, first.t, observation(first.f, "created", "fixture-shared-session")),
    ).toEqual({ claim: first.f.claim, state: "creation-observed" });
    expect(
      await reconcile(
        second.f,
        second.t,
        observation(second.f, "created", "fixture-shared-session"),
      ),
    ).toEqual({ claim: second.f.claim, state: "quarantined" });
    expect(await state(first.f)).toEqual({
      ...retained,
      occupied: 2,
      pool_hold: 2,
      quarantined: true,
    });
    expect(await state(second.f)).toEqual({
      ...retained,
      occupied: 2,
      pool_hold: 2,
      quarantined: true,
    });
  });
  it("quarantines contradictory terminal observations and retains uncertain slots or prior terminal accounting", async () => {
    for (const variant of [
      "created-then-not-created",
      "not-created-then-created",
      "session-change",
    ]) {
      const { f, t } = await marked();
      if (variant === "not-created-then-created")
        expect(await reconcile(f, t, observation(f, "not-created"))).toEqual({
          claim: f.claim,
          state: "terminal-recorded",
        });
      else
        expect(await reconcile(f, t, observation(f, "created", "fixture-first"))).toEqual({
          claim: f.claim,
          state: "creation-observed",
        });
      const bad =
        variant === "created-then-not-created"
          ? observation(f, "not-created")
          : variant === "session-change"
            ? observation(f, "ended", "fixture-different")
            : observation(f, "created", "fixture-first");
      expect(await reconcile(f, t, bad)).toEqual({ claim: f.claim, state: "quarantined" });
      expect(await state(f)).toEqual({
        ...retained,
        occupied: variant === "not-created-then-created" ? 0 : 1,
        quarantined: true,
      });
    }
  });
  it("reconciles retained exact cleanup after deletion, session revocation, expired access and future clock evidence", async () => {
    const { f, t } = await marked();
    await asRole("service_role", "SELECT public.bfa_p3b_fence($1,$2,'delete');", [
      f.owner,
      f.thread,
    ]);
    await asRole("service_role", "SELECT public.bfa_p5_voice_revoke_session($1,$2);", [
      f.owner,
      f.session,
    ]);
    await database().query(
      "UPDATE public.bfa_p3b_staging_accounts SET admitted=false,expires_at=to_timestamp(1) WHERE user_id=$1;",
      [f.owner],
    );
    await database().query(
      "UPDATE bfa_p5_voice.owner_clocks SET observed_ms=9007199254740991 WHERE owner_id=$1;",
      [f.owner],
    );
    expect(await reconcile(f, t, observation(f, "ended", "fixture-final"))).toEqual({
      claim: f.claim,
      state: "terminal-recorded",
    });
    expect(await state(f)).toEqual({ ...retained, occupied: 0 });
    expect(
      (await one("SELECT observed_ms FROM bfa_p5_voice.owner_clocks WHERE owner_id=$1;", [f.owner]))
        .observed_ms,
    ).toBe(Number.MAX_SAFE_INTEGER);
  });
  it("denies wrong cleanup or operation identity without recording evidence or changing any of twenty tables", async () => {
    const { f, t } = await marked();
    for (const wrong of ["cleanup", "operation"]) {
      const before = await snapshot(),
        value = observation(f, "ended", "fixture-wrong");
      expect(
        await t.capacity.reconcile({
          cleanupId: wrong === "cleanup" ? crypto.randomUUID() : f.cleanupId,
          claim: f.claim,
          observation:
            wrong === "operation" ? { ...value, operationId: crypto.randomUUID() } : value,
        }),
      ).toEqual({ claim: f.claim, state: "denied" });
      expect(await snapshot()).toEqual(before);
    }
  });
  it("retains committed terminal reconciliation after lost or malformed replies and permits exact evidence reconciliation only", async () => {
    for (const malformed of [false, true]) {
      const { f, t } = await marked(),
        value = observation(f, "ended", "fixture-committed-terminal");
      t.hooks.afterCommit = async (name, _args, data) => {
        if (name === "bfa_p5_capacity_reconcile") {
          if (malformed) return null;
          throw new Error("fictional discarded committed reconciliation reply");
        }
        return data;
      };
      await expect(reconcile(f, t, value)).rejects.toThrow("voice-capacity-rpc-unavailable");
      expect(t.calls.filter((c) => c.name === "bfa_p5_capacity_reconcile")).toHaveLength(1);
      expect(await state(f)).toEqual({ ...retained, occupied: 0 });
      const before = await snapshot();
      t.hooks.afterCommit = undefined;
      expect(await reconcile(f, t, value)).toEqual({ claim: f.claim, state: "duplicate-evidence" });
      expect(await snapshot()).toEqual(before);
      const calls = t.calls.filter((c) => c.name === "bfa_p5_capacity_reconcile");
      expect(calls).toHaveLength(2);
      expect(calls[0]!.args).toEqual(calls[1]!.args);
    }
  });
  it("keeps both RPCs service-only and all private table and helper privileges unavailable", async () => {
    const { f } = await marked(),
      value = observation(f, "unknown"),
      before = await snapshot();
    for (const role of ["anon", "authenticated"] as const) {
      await expect(
        asRole(role, "SELECT public.bfa_p5_capacity_mark($1,$2::jsonb,$3,1);", [
          crypto.randomUUID(),
          JSON.stringify(f.claim),
          f.operationId,
        ]),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        asRole(role, "SELECT public.bfa_p5_capacity_reconcile($1,$2::jsonb,$3::jsonb);", [
          f.cleanupId,
          JSON.stringify(f.claim),
          JSON.stringify(value),
        ]),
      ).rejects.toMatchObject({ code: "42501" });
    }
    for (const role of ["anon", "authenticated", "service_role"] as const) {
      for (const table of [
        ...voiceTables.map((n) => `bfa_p5_voice.${n}`),
        ...capacityTables.map((n) => `bfa_p5_capacity.${n}`),
      ])
        await expect(asRole(role, `SELECT * FROM ${table};`)).rejects.toMatchObject({
          code: "42501",
        });
      await expect(
        asRole(role, "SELECT bfa_p5_capacity.denied($1::jsonb);", [JSON.stringify(f.claim)]),
      ).rejects.toMatchObject({ code: "42501" });
    }
    const privileges = (
      await database().query(
        "SELECT p.proname,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') AS anon,has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role,EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('bfa_p5_capacity_mark','bfa_p5_capacity_reconcile') ORDER BY p.proname;",
      )
    ).rows;
    expect(privileges).toEqual(
      ["bfa_p5_capacity_mark", "bfa_p5_capacity_reconcile"].map((proname) => ({
        proname,
        prosecdef: true,
        proconfig: ["search_path=pg_catalog, pg_temp"],
        anon: false,
        authenticated: false,
        service_role: true,
        public_execute: false,
      })),
    );
    expect(await snapshot()).toEqual(before);
  });
});
