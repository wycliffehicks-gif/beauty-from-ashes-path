// Optional actual single-connection PostgreSQL + local crypto integration.
// Auth, session/policy provisioning and trusted host provenance are fictional.
// No provider, remote Auth, HTTP fault injection or native contention is tested.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ConversationService } from "../service/service";
import { fingerprint, seal } from "../staging/seal.server";
import { createVoiceRpcStore, type VoiceRpcName } from "../service/voice-rpc-store.server";
import { createVoiceReadRpcPorts, type VoiceReadRpcName } from "../service/voice-read-rpc.server";
import {
  createVoiceCapacityRpcPorts,
  type VoiceCapacityRpcName,
} from "../service/voice-capacity-rpc.server";
import {
  createVoiceSessionRevokeRpcPorts,
  type VoiceSessionRevokeRpcName,
} from "../service/voice-session-revoke-rpc.server";
import { createVoiceCapacityStoreAdmission } from "../service/voice-store-adapter.server";

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
type RpcName = VoiceRpcName | VoiceCapacityRpcName | VoiceReadRpcName | VoiceSessionRevokeRpcName;
type Args = Readonly<Record<string, unknown>>;
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
];
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

sqlSuite("P5 admission-owned capacity marker in isolated PostgreSQL", () => {
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
    vi.stubEnv("BFA_P3B_STATE_SECRET", `offline-marker-fixture-${crypto.randomUUID()}`);
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
    for (const name of ["admission", "reads", "capacity", "session-revoke"])
      await install(`docs/pilot/conversation/sql-drafts/p5-voice-${name}.sql`);
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
  function transport() {
    const calls: { name: RpcName; args: Args; committed: boolean }[] = [];
    const hooks: {
      beforeCall?: (name: RpcName, args: Args) => Promise<void>;
      afterCommit?: (name: RpcName, args: Args, data: unknown) => Promise<unknown>;
    } = {};
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
          "bfa_p5_voice_read_session_fence",
          "bfa_p5_voice_read_current",
          "bfa_p5_voice_revoke_session",
        ]).toContain(name);
        const call = { name, args, committed: false };
        calls.push(call);
        if (hooks.beforeCall) await hooks.beforeCall(name, args);
        const types: Record<string, string> = {
          p_cleanup_id: "uuid",
          p_receipt_id: "uuid",
          p_claim: "jsonb",
          p_proof: "jsonb",
          p_operation_id: "uuid",
          p_expected_version: "bigint",
          p_observation: "jsonb",
          p_owner_id: "uuid",
          p_thread_id: "uuid",
          p_session_id: "uuid",
          p_attempt_id: "uuid",
          p_authority_fingerprint: "text",
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
      reads: createVoiceReadRpcPorts(client),
      revoker: createVoiceSessionRevokeRpcPorts(client),
    };
  }
  async function fixture() {
    const owner = crypto.randomUUID(),
      thread = crypto.randomUUID(),
      session = crypto.randomUUID();
    const policy = crypto.randomUUID(),
      approval = crypto.randomUUID(),
      attempt = crypto.randomUUID(),
      pool = crypto.randomUUID();
    const issuedAt = Date.now(),
      expiresAt = issuedAt + 300_000;
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
    const service = new ConversationService({ verifiedOwnerId: owner });
    service.ensureThread(thread, false);
    const activeAuthority = await seal({
      owner,
      thread,
      revision: 0,
      expires: expiresAt,
      authority: service.exportAuthority(thread),
    });
    const authorityFingerprint = await fingerprint(activeAuthority);
    expect(
      (
        await asRole(
          "service_role",
          "SELECT public.bfa_p5_voice_register_issuance($1,$2,$3,0,$4,$5,$6) AS registered;",
          [owner, thread, incarnation, authorityFingerprint, issuedAt, expiresAt],
        )
      ).registered,
    ).toBe(true);
    // Administrative inserts below are explicitly fictional setup, not production provisioning.
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
    await database().query(
      "INSERT INTO bfa_p5_capacity.pools(pool_id,active_limit,unit_limit,reservation_units,enabled) VALUES($1,2,20,1,true);",
      [pool],
    );
    await database().query("INSERT INTO bfa_p5_capacity.routes VALUES($1,$2,$3);", [
      owner,
      policy,
      pool,
    ]);
    const t = transport();
    const identity = { value: { ownerId: owner, sessionId: session, expiresAt } as unknown };
    const clock = { offset: 0 };
    const request = {
      threadId: thread,
      threadIncarnation: incarnation,
      threadRevision: 0,
      attemptId: attempt,
      activeAuthority,
    };
    const ports = {
      ...t.store,
      ...t.reads,
      now: () => Date.now() + clock.offset,
      maxProofAgeMs: 20_000,
      authenticate: async () => structuredClone(identity.value),
    };
    return {
      owner,
      thread,
      session,
      pool,
      policy,
      approval,
      expiresAt,
      request,
      ports,
      identity,
      clock,
      t,
    };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  async function state(f: Fixture) {
    return one(
      "SELECT (SELECT remaining_units FROM bfa_p5_voice.quotas WHERE owner_id=$1) AS remaining,(SELECT COALESCE(sum(held_units),0)::integer FROM bfa_p5_voice.claims WHERE owner_id=$1) AS original_hold,occupied,held_units AS pool_hold,quarantined FROM bfa_p5_capacity.pools WHERE pool_id=$2;",
      [f.owner, f.pool],
    );
  }
  async function allocation(f: Fixture) {
    return one(
      "SELECT operation_id,session_id,terminal,closed,slot_held FROM bfa_p5_capacity.allocations WHERE owner_id=$1;",
      [f.owner],
    );
  }
  async function fence(f: Fixture, action: "cancel" | "delete" | "revoke") {
    if (action === "revoke")
      return f.t.revoker.revokeSession({ ownerId: f.owner, sessionId: f.session });
    return asRole("service_role", "SELECT public.bfa_p3b_fence($1,$2,$3) AS revision;", [
      f.owner,
      f.thread,
      action,
    ]);
  }
  const retained = {
    remaining: 9,
    original_hold: 1,
    occupied: 1,
    pool_hold: 1,
    quarantined: false,
  };
  async function admitted(expectedPoolVersion = 1) {
    const f = await fixture();
    const bridge = createVoiceCapacityStoreAdmission({
      ...f.ports,
      mark: f.t.capacity.mark,
      expectedPoolVersion,
    });
    const lease = await bridge.admit(f.request);
    expect(lease?.snapshot().state).toBe("active");
    return { ...f, bridge, lease: lease! };
  }
  const markerCalls = (f: Fixture) => f.t.calls.filter((c) => c.name === "bfa_p5_capacity_mark");

  it("consumes a distinct fresh INSPECT proof directly in the exact marker transaction", async () => {
    const f = await admitted();
    const before = f.t.calls.length;
    expect(f.lease.markerSnapshot()).toBeNull();
    const observed = await f.lease.markCapacity();
    const retainedMarker = f.lease.markerSnapshot()!;
    expect(observed).toEqual({
      state: "marked",
      operationId: retainedMarker.operationId,
      claim: retainedMarker.claim,
    });
    expect(retainedMarker).toMatchObject({
      state: "observed",
      expectedPoolVersion: 1,
      acknowledgment: "marked",
    });
    const afterCalls = f.t.calls.slice(before);
    expect(afterCalls.filter((c) => c.name === "bfa_p5_voice_inspect")).toHaveLength(0);
    expect(afterCalls.filter((c) => c.name === "bfa_p5_voice_register_proof")).toHaveLength(1);
    const proof = afterCalls.find((c) => c.name === "bfa_p5_voice_register_proof")!.args
      .p_proof as Record<string, unknown>;
    expect(proof.operation).toBe("inspect");
    expect(proof.cleanupId).toBe(retainedMarker.cleanupId);
    expect(markerCalls(f)).toEqual([
      {
        name: "bfa_p5_capacity_mark",
        args: {
          p_receipt_id: proof.receiptId,
          p_claim: retainedMarker.claim,
          p_operation_id: retainedMarker.operationId,
          p_expected_version: 1,
        },
        committed: true,
      },
    ]);
    const proofs = (
      await database().query(
        "SELECT receipt_id,operation,consumed_ms FROM bfa_p5_voice.proofs WHERE owner_id=$1 ORDER BY receipt_id;",
        [f.owner],
      )
    ).rows;
    expect(proofs).toHaveLength(3);
    expect(new Set(proofs.map((p) => p.receipt_id)).size).toBe(3);
    expect(proofs.every((p) => p.consumed_ms !== null)).toBe(true);
    expect((await allocation(f)).operation_id).toBe(retainedMarker.operationId);
    expect(await state(f)).toEqual(retained);
    expect(Object.isFrozen(retainedMarker)).toBe(true);
    expect(Object.isFrozen(retainedMarker.claim.binding)).toBe(true);
    expect(JSON.stringify([observed, retainedMarker, f.t.calls])).not.toContain(
      "fictional private source",
    );
    expect(Object.keys(retainedMarker).sort()).toEqual([
      "acknowledgment",
      "claim",
      "cleanupId",
      "expectedPoolVersion",
      "operationId",
      "state",
    ]);
  });
  it("fences concurrent and subsequent attempts before a delayed proof acknowledgment", async () => {
    const f = await admitted(),
      entered = deferred<void>(),
      release = deferred<void>();
    f.t.hooks.afterCommit = async (name, _args, data) => {
      if (name === "bfa_p5_voice_register_proof") {
        entered.resolve();
        await release.promise;
      }
      return data;
    };
    const first = f.lease.markCapacity();
    const immutableOperation = f.lease.markerSnapshot()!.operationId;
    await entered.promise;
    expect(f.lease.markerSnapshot()!.state).toBe("pending");
    const atWait = await snapshot();
    expect(await f.lease.markCapacity()).toBeNull();
    expect(await snapshot()).toEqual(atWait);
    release.resolve();
    expect((await first)?.operationId).toBe(immutableOperation);
    const after = await snapshot();
    expect(await f.lease.markCapacity()).toBeNull();
    expect(await snapshot()).toEqual(after);
    expect(f.lease.markerSnapshot()!.operationId).toBe(immutableOperation);
    expect(markerCalls(f)).toHaveLength(1);
  });
  it("retains committed markers after lost or malformed replies and deliberately reconciles exact retained evidence", async () => {
    for (const malformed of [false, true]) {
      const f = await admitted();
      f.t.hooks.afterCommit = async (name, _args, data) => {
        if (name === "bfa_p5_capacity_mark") {
          if (malformed) return { claim: f.lease.snapshot().claim, state: "claimed" };
          throw new Error("fictional discarded committed reply");
        }
        return data;
      };
      expect(await f.lease.markCapacity()).toBeNull();
      const record = f.lease.markerSnapshot()!;
      expect(record).toMatchObject({ state: "unconfirmed", acknowledgment: null });
      expect((await allocation(f)).operation_id).toBe(record.operationId);
      expect(await state(f)).toEqual(retained);
      expect(await f.lease.markCapacity()).toBeNull();
      expect(markerCalls(f)).toHaveLength(1);
      f.t.hooks.afterCommit = undefined;
      f.identity.value = null;
      await fence(f, "delete");
      await f.lease.close();
      expect(await state(f)).toEqual(retained);
      const observation = {
        evidenceId: crypto.randomUUID(),
        operationId: record.operationId,
        kind: "not-created" as const,
        sessionId: null,
      };
      // Fictional normalized whole-operation finality, not authenticated provider evidence.
      expect(
        await f.t.capacity.reconcile({
          cleanupId: record.cleanupId,
          claim: record.claim,
          observation,
        }),
      ).toEqual({ claim: record.claim, state: "terminal-recorded" });
      expect(await state(f)).toEqual({ ...retained, occupied: 0 });
      expect(f.lease.markerSnapshot()!.operationId).toBe(record.operationId);
    }
  });
  it("lets local close win during proof acknowledgment without submitting a marker", async () => {
    const f = await admitted(),
      entered = deferred<void>(),
      release = deferred<void>();
    f.t.hooks.afterCommit = async (name, _args, data) => {
      if (name === "bfa_p5_voice_register_proof") {
        entered.resolve();
        await release.promise;
      }
      return data;
    };
    const attempt = f.lease.markCapacity();
    await entered.promise;
    const operationId = f.lease.markerSnapshot()!.operationId;
    await f.lease.close();
    release.resolve();
    expect(await attempt).toBeNull();
    expect(markerCalls(f)).toHaveLength(0);
    expect((await allocation(f)).operation_id).toBeNull();
    expect(await state(f)).toEqual({ ...retained, occupied: 0 });
    expect(f.lease.markerSnapshot()!.operationId).toBe(operationId);
  });
  it("withholds a late committed marker acknowledgment after local close without refunding its slot", async () => {
    const f = await admitted(),
      entered = deferred<void>(),
      release = deferred<void>();
    f.t.hooks.afterCommit = async (name, _args, data) => {
      if (name === "bfa_p5_capacity_mark") {
        entered.resolve();
        await release.promise;
      }
      return data;
    };
    const attempt = f.lease.markCapacity();
    await entered.promise;
    await f.lease.close();
    release.resolve();
    expect(await attempt).toBeNull();
    expect(f.lease.snapshot().state).toBe("closed");
    expect(f.lease.markerSnapshot()!.state).toBe("unconfirmed");
    expect(await allocation(f)).toMatchObject({
      operation_id: f.lease.markerSnapshot()!.operationId,
      closed: true,
      slot_held: true,
    });
    expect(await state(f)).toEqual(retained);
  });
  it("rechecks actual Stop, Delete and revocation after proof registration before marker submission", async () => {
    for (const action of ["cancel", "delete", "revoke"] as const) {
      const f = await admitted();
      f.t.hooks.afterCommit = async (name, _args, data) => {
        if (name === "bfa_p5_voice_register_proof") await fence(f, action);
        return data;
      };
      expect(await f.lease.markCapacity()).toBeNull();
      expect(markerCalls(f)).toHaveLength(0);
      expect((await allocation(f)).operation_id).toBeNull();
      await f.lease.close();
      expect(await state(f)).toEqual({ ...retained, occupied: 0 });
    }
  });
  it("lets SQL deny actual Stop, Delete and revocation occurring at marker invocation", async () => {
    for (const action of ["cancel", "delete", "revoke"] as const) {
      const f = await admitted();
      f.t.hooks.beforeCall = async (name) => {
        if (name === "bfa_p5_capacity_mark") await fence(f, action);
      };
      expect(await f.lease.markCapacity()).toBeNull();
      expect(markerCalls(f)).toHaveLength(1);
      expect(f.lease.markerSnapshot()!).toMatchObject({
        state: "unconfirmed",
        acknowledgment: "denied",
      });
      expect((await allocation(f)).operation_id).toBeNull();
      expect(await state(f)).toEqual({ ...retained, occupied: 0 });
    }
  });
  it("withholds committed marker observations when actual Stop, Delete or revocation wins before final reads", async () => {
    for (const action of ["cancel", "delete", "revoke"] as const) {
      const f = await admitted();
      f.t.hooks.afterCommit = async (name, _args, data) => {
        if (name === "bfa_p5_capacity_mark") await fence(f, action);
        return data;
      };
      expect(await f.lease.markCapacity()).toBeNull();
      expect(f.lease.markerSnapshot()!).toMatchObject({
        state: "unconfirmed",
        acknowledgment: "marked",
      });
      expect((await allocation(f)).operation_id).toBe(f.lease.markerSnapshot()!.operationId);
      await f.lease.close();
      expect(await state(f)).toEqual(retained);
    }
  });
  it("withholds success after final fictional Auth changes while preserving committed marker evidence", async () => {
    const f = await admitted();
    f.t.hooks.afterCommit = async (name, _args, data) => {
      if (name === "bfa_p5_capacity_mark") f.identity.value = null;
      return data;
    };
    expect(await f.lease.markCapacity()).toBeNull();
    expect(f.lease.markerSnapshot()!).toMatchObject({
      state: "unconfirmed",
      acknowledgment: "marked",
    });
    expect((await allocation(f)).operation_id).toBe(f.lease.markerSnapshot()!.operationId);
    expect(await state(f)).toEqual(retained);
  });
  it("does not renew proof eligibility when current approval shortens after proof registration", async () => {
    const f = await admitted();
    f.t.hooks.afterCommit = async (name, _args, data) => {
      if (name === "bfa_p5_voice_register_proof")
        await database().query(
          "UPDATE bfa_p5_voice.approvals SET expires_ms=$1 WHERE approval_id=$2;",
          [f.expiresAt - 100_000, f.approval],
        );
      return data;
    };
    expect(await f.lease.markCapacity()).toBeNull();
    expect(markerCalls(f)).toHaveLength(0);
    expect((await allocation(f)).operation_id).toBeNull();
    expect(await f.lease.markCapacity()).toBeNull();
  });
  it("withholds a committed marker when approval shortens below its proof ceiling after acknowledgment", async () => {
    const f = await admitted();
    f.t.hooks.afterCommit = async (name, _args, data) => {
      if (name === "bfa_p5_capacity_mark")
        await database().query(
          "UPDATE bfa_p5_voice.approvals SET expires_ms=$1 WHERE approval_id=$2;",
          [f.expiresAt - 100_000, f.approval],
        );
      return data;
    };
    expect(await f.lease.markCapacity()).toBeNull();
    expect(f.lease.markerSnapshot()!).toMatchObject({
      state: "unconfirmed",
      acknowledgment: "marked",
    });
    expect((await allocation(f)).operation_id).toBe(f.lease.markerSnapshot()!.operationId);
    expect(await state(f)).toEqual(retained);
  });
  it("passes only the trusted configured pool version and retains a denied operation without replacement", async () => {
    const f = await admitted(2);
    expect(await f.lease.markCapacity()).toBeNull();
    const record = f.lease.markerSnapshot()!;
    expect(record).toMatchObject({
      state: "unconfirmed",
      expectedPoolVersion: 2,
      acknowledgment: "denied",
    });
    expect(markerCalls(f)[0]!.args.p_expected_version).toBe(2);
    expect((await allocation(f)).operation_id).toBeNull();
    const before = await snapshot();
    expect(await f.lease.markCapacity()).toBeNull();
    expect(await snapshot()).toEqual(before);
    expect(f.lease.markerSnapshot()!.operationId).toBe(record.operationId);
  });
  it("treats an actual already-marked response as unconfirmed without a second local success", async () => {
    const f = await admitted();
    f.t.hooks.beforeCall = async (name, args) => {
      if (name !== "bfa_p5_capacity_mark") return;
      f.t.hooks.beforeCall = undefined;
      const proofCall = [...f.t.calls]
        .reverse()
        .find((c) => c.name === "bfa_p5_voice_register_proof")!;
      const extra = { ...(proofCall.args.p_proof as object), receiptId: crypto.randomUUID() };
      // A separate fictional trusted actor marks this exact operation first.
      // This is ordered SQL behavior, not cross-process contention evidence.
      await asRole(
        "service_role",
        "SELECT public.bfa_p5_voice_register_proof($1::jsonb) AS value;",
        [JSON.stringify(extra)],
      );
      expect(
        await f.t.capacity.mark({
          receiptId: extra.receiptId,
          claim: f.lease.markerSnapshot()!.claim,
          operationId: args.p_operation_id as string,
          expectedPoolVersion: 1,
        }),
      ).toMatchObject({ state: "marked" });
    };
    expect(await f.lease.markCapacity()).toBeNull();
    expect(f.lease.markerSnapshot()!).toMatchObject({
      state: "unconfirmed",
      acknowledgment: "already-marked",
    });
    expect(await f.lease.markCapacity()).toBeNull();
    expect(markerCalls(f)).toHaveLength(2); // One coordinator invocation + one explicit fixture actor.
    expect(await state(f)).toEqual(retained);
  });
  it("preserves actual closed acknowledgment when a trusted cleanup wins before SQL mark", async () => {
    const f = await admitted();
    f.t.hooks.beforeCall = async (name) => {
      if (name === "bfa_p5_capacity_mark") {
        const record = f.lease.markerSnapshot()!;
        await f.t.store.close(record.cleanupId, record.claim);
      }
    };
    expect(await f.lease.markCapacity()).toBeNull();
    expect(f.lease.markerSnapshot()!).toMatchObject({
      state: "unconfirmed",
      acknowledgment: "closed",
    });
    expect((await allocation(f)).operation_id).toBeNull();
    expect(await state(f)).toEqual({ ...retained, occupied: 0 });
  });
  it("denies a fresh registered proof that expires in SQL before consumption", async () => {
    const f = await admitted();
    f.t.hooks.beforeCall = async (name, args) => {
      if (name === "bfa_p5_capacity_mark")
        await database().query(
          "UPDATE bfa_p5_voice.proofs SET verified_ms=0,expires_ms=1 WHERE receipt_id=$1;",
          [args.p_receipt_id],
        );
    };
    expect(await f.lease.markCapacity()).toBeNull();
    expect(f.lease.markerSnapshot()!).toMatchObject({
      state: "unconfirmed",
      acknowledgment: "denied",
    });
    expect((await allocation(f)).operation_id).toBeNull();
    expect(await state(f)).toMatchObject({ remaining: 9, original_hold: 1, pool_hold: 1 });
  });
  it("rejects a late acknowledgment after local proof expiry but retains the committed operation", async () => {
    const f = await admitted();
    f.t.hooks.afterCommit = async (name, _args, data) => {
      if (name === "bfa_p5_capacity_mark") f.clock.offset = 20_001;
      return data;
    };
    expect(await f.lease.markCapacity()).toBeNull();
    expect(f.lease.markerSnapshot()!.state).toBe("unconfirmed");
    expect((await allocation(f)).operation_id).toBe(f.lease.markerSnapshot()!.operationId);
    expect(await state(f)).toEqual(retained);
  });
  it("cannot revive an invalidated lease using restored fictional Auth", async () => {
    const f = await admitted(),
      originalIdentity = f.identity.value;
    f.identity.value = null;
    expect(await f.lease.revalidate()).toBe(false);
    f.identity.value = originalIdentity;
    const before = await snapshot();
    expect(await f.lease.markCapacity()).toBeNull();
    expect(markerCalls(f)).toHaveLength(0);
    expect(await snapshot()).toEqual(before);
  });
  it("retains all records on anonymous or authenticated marker RPC denial", async () => {
    const f = await admitted();
    expect(await f.lease.markCapacity()).not.toBeNull();
    const args = markerCalls(f)[0]!.args;
    const before = await snapshot();
    for (const role of ["anon", "authenticated"] as const)
      await expect(
        asRole(role, "SELECT public.bfa_p5_capacity_mark($1,$2::jsonb,$3,$4);", [
          args.p_receipt_id,
          JSON.stringify(args.p_claim),
          args.p_operation_id,
          args.p_expected_version,
        ]),
      ).rejects.toThrow(/permission denied/);
    expect(await snapshot()).toEqual(before);
  });
});
