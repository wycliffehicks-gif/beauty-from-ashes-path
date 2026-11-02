// Independent composition of actual adapters, initializer and issuer/local
// crypto. Auth and protected persistence are explicitly modeled; these checks
// are not SQL, remote Auth, HTTP faults, native concurrency or provider evidence.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationService } from "../service/service";
import { createVoiceAuthorityIssuer } from "../service/voice-issuance.server";
import { createVoiceReadRpcPorts } from "../service/voice-read-rpc.server";
import { createVoiceSessionInitializer } from "../service/voice-session-initializer.server";
import { createVoiceSessionProvisionRpcPorts } from "../service/voice-session-provision-rpc.server";
import { createVoiceSessionRevokeRpcPorts } from "../service/voice-session-revoke-rpc.server";
import { unseal } from "../staging/seal.server";

const OWNER = "f1111111-1111-4111-8111-111111111111";
const SESSION = "f2222222-2222-4222-8222-222222222222";
const OTHER = "f3333333-3333-4333-8333-333333333333";
const THREAD = "f4444444-4444-4444-8444-444444444444";
const INCARNATION = "f5555555-5555-4555-8555-555555555555";
const CREATED = "2026-11-01T12:00:00.000Z";
const START = 1_793_500_000_000;
type Args = Readonly<Record<string, unknown>>;
type Fence = {
  ownerId: string;
  sessionId: string;
  version: number;
  expiresAt: number;
  revoked: boolean;
};
const success = (data: unknown) => ({ data, error: null, status: 200 });
const key = (owner: string, session: string) => `${owner}:${session}`;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture() {
  const clock = { now: START };
  vi.spyOn(Date, "now").mockImplementation(() => clock.now);
  const rows = new Map<string, Fence>();
  const auth = { ownerId: OWNER, sessionId: SESSION, expiresAt: START + 50_000 };
  const hooks: {
    authenticate?: () => Promise<unknown>;
    read?: (row: Fence | null) => Promise<unknown>;
    provisionReply?: (row: Fence | null) => Promise<unknown>;
    onWrite?: () => void;
    onRead?: () => void;
  } = {};
  const now = vi.fn(() => clock.now);
  const authenticate = vi.fn(async () =>
    hooks.authenticate ? hooks.authenticate() : structuredClone(auth),
  );
  const provisionRpc = vi.fn(async (_name: string, args: Args) => {
    hooks.onWrite?.();
    const ownerId = args.p_owner_id as string;
    const sessionId = args.p_session_id as string;
    const expiresAt = args.p_expires_ms as number;
    // Only a persistence model for orchestration. The separate SQL suite owns
    // actual time/lock/role/constraint evidence and never imports this model.
    let row = rows.get(key(ownerId, sessionId));
    if (!row) {
      row = { ownerId, sessionId, expiresAt, version: 0, revoked: false };
      rows.set(key(ownerId, sessionId), row);
    }
    const receipt =
      !row.revoked && row.expiresAt === expiresAt && clock.now < expiresAt
        ? structuredClone(row)
        : null;
    return success(hooks.provisionReply ? await hooks.provisionReply(receipt) : receipt);
  });
  const readRpc = vi.fn(async (name: string, args: Args) => {
    hooks.onRead?.();
    if (name !== "bfa_p5_voice_read_session_fence") throw new Error("Unexpected model read");
    const row = rows.get(key(args.p_owner_id as string, args.p_session_id as string));
    const current = row && !row.revoked && clock.now < row.expiresAt ? structuredClone(row) : null;
    return success(hooks.read ? await hooks.read(current) : current);
  });
  const revocations = createVoiceSessionRevokeRpcPorts({
    async rpc(_name, args) {
      const ownerId = args.p_owner_id as string;
      const sessionId = args.p_session_id as string;
      let row = rows.get(key(ownerId, sessionId));
      if (!row) {
        row = { ownerId, sessionId, expiresAt: 1, version: 0, revoked: true };
        rows.set(key(ownerId, sessionId), row);
      } else if (!row.revoked) {
        row.version = Math.min(Number.MAX_SAFE_INTEGER, row.version + 1);
        row.revoked = true;
      }
      return success(structuredClone(row));
    },
  });
  const reads = createVoiceReadRpcPorts({ rpc: readRpc });
  const initializer = createVoiceSessionInitializer({
    ...reads,
    ...createVoiceSessionProvisionRpcPorts({ rpc: provisionRpc }),
    now,
    authenticate,
    maxFenceAgeMs: 20_000,
  });
  const service = new ConversationService({ verifiedOwnerId: OWNER });
  service.ensureThread(THREAD, false);
  let registered = false;
  const registerIssuance = vi.fn(async (_record: unknown) => true);
  const issuer = createVoiceAuthorityIssuer({
    ...reads,
    authenticate,
    now,
    maxAuthorityAgeMs: 60_000,
    async readCurrentThread() {
      return {
        ownerId: OWNER,
        threadId: THREAD,
        threadRevision: 4,
        sourceCreatedAt: CREATED,
        threadIncarnation: registered ? INCARNATION : null,
        deleted: false,
        allowlist: { ownerId: OWNER, admitted: true, expiresAt: START + 60_000 },
      };
    },
    async registerGeneration() {
      registered = true;
      return INCARNATION;
    },
    registerIssuance,
  });
  return {
    clock,
    rows,
    auth,
    hooks,
    now,
    authenticate,
    provisionRpc,
    readRpc,
    revocations,
    initializer,
    service,
    issuer,
    registerIssuance,
    issueInput: { service, threadId: THREAD, threadRevision: 4, sourceCreatedAt: CREATED },
  };
}

describe("P5 trusted session initializer independent review", () => {
  beforeEach(() => vi.stubEnv("BFA_P3B_STATE_SECRET", crypto.randomUUID()));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("fences a second caller before Auth returns and derives the one immutable request before writing", async () => {
    const f = fixture();
    const entered = deferred<void>();
    const identity = deferred<unknown>();
    let first = true;
    f.hooks.authenticate = async () => {
      if (!first) return structuredClone(f.auth);
      first = false;
      entered.resolve();
      return identity.promise;
    };
    f.hooks.onWrite = () => {
      const snapshot = f.initializer.snapshot();
      expect(snapshot.request).toEqual({
        ownerId: OWNER,
        sessionId: SESSION,
        verifiedAt: START,
        expiresAt: START + 20_000,
      });
      expect(snapshot.writeAttempted).toBe(true);
      expect(Object.isFrozen(snapshot.request)).toBe(true);
    };
    const pending = f.initializer.initialize();
    await entered.promise;
    expect(await f.initializer.initialize()).toBeNull();
    expect(f.initializer.snapshot().request).toBeNull();
    expect(f.provisionRpc).not.toHaveBeenCalled();
    identity.resolve(structuredClone(f.auth));
    expect((await pending)?.state).toBe("observed");
    expect(f.provisionRpc).toHaveBeenCalledTimes(1);
    expect(await f.initializer.initialize()).toBeNull();
    const issued = await f.issuer.issue(f.issueInput);
    expect(issued?.expiresAt).toBe(START + 20_000);
    const opened = await unseal(issued!.activeAuthority, OWNER, THREAD, 4);
    expect(opened.authority).toEqual(f.service.exportAuthority(THREAD));
  });

  it("acknowledges an existing fence without shifting its expiry or resetting its version", async () => {
    const f = fixture();
    const original = {
      ownerId: OWNER,
      sessionId: SESSION,
      version: 9,
      expiresAt: START + 12_000,
      revoked: false,
    };
    f.rows.set(key(OWNER, SESSION), structuredClone(original));
    f.clock.now += 2_000;
    const observed = await f.initializer.initialize();
    expect(observed?.fence).toEqual(original);
    expect(f.initializer.snapshot().expectedVersion).toBe(9);
    expect(f.initializer.snapshot().request?.verifiedAt).toBe(START + 2_000);
    expect(f.provisionRpc.mock.calls[0][1].p_expires_ms).toBe(original.expiresAt);
    expect(f.rows.get(key(OWNER, SESSION))).toEqual(original);
  });

  it("does not infer absence from a null protected read or bypass a retained revocation tombstone", async () => {
    const f = fixture();
    await f.revocations.revokeSession({ ownerId: OWNER, sessionId: SESSION });
    const tombstone = structuredClone(f.rows.get(key(OWNER, SESSION)));
    expect(await f.initializer.initialize()).toBeNull();
    expect(f.provisionRpc).toHaveBeenCalledTimes(1);
    expect(f.initializer.snapshot().writeAttempted).toBe(true);
    expect(f.rows.get(key(OWNER, SESSION))).toEqual(tombstone);
    expect(await f.initializer.initialize()).toBeNull();
    expect(f.provisionRpc).toHaveBeenCalledTimes(1);
  });

  it("retains one committed request after cancellation without revoking or reissuing it automatically", async () => {
    const f = fixture();
    const entered = deferred<void>();
    const reply = deferred<unknown>();
    let committed: Fence | null = null;
    f.hooks.provisionReply = async (receipt) => {
      committed = receipt;
      entered.resolve();
      return reply.promise;
    };
    const pending = f.initializer.initialize();
    await entered.promise;
    const request = f.initializer.snapshot().request;
    f.initializer.cancel();
    expect(f.initializer.snapshot().state).toBe("cancelled");
    reply.resolve(committed);
    expect(await pending).toBeNull();
    expect(f.initializer.snapshot().request).toBe(request);
    expect(f.rows.get(key(OWNER, SESSION))?.revoked).toBe(false);
    expect(await f.initializer.initialize()).toBeNull();
    expect(f.provisionRpc).toHaveBeenCalledTimes(1);
  });

  it("withholds a committed active receipt when fresh Auth shortens beneath its immutable expiry", async () => {
    const f = fixture();
    f.hooks.provisionReply = async (receipt) => {
      f.auth.expiresAt = START + 10_000;
      return receipt;
    };
    expect(await f.initializer.initialize()).toBeNull();
    expect(f.initializer.snapshot().acknowledgment?.expiresAt).toBe(START + 20_000);
    expect(f.rows.get(key(OWNER, SESSION))?.expiresAt).toBe(START + 20_000);
    expect(f.initializer.snapshot().request?.expiresAt).toBe(START + 20_000);
    expect(f.provisionRpc).toHaveBeenCalledTimes(1);
  });

  it("rejects a changed protected version after an exact provisioning acknowledgment", async () => {
    const f = fixture();
    f.hooks.provisionReply = async (receipt) => {
      f.rows.get(key(OWNER, SESSION))!.version += 1;
      return receipt;
    };
    expect(await f.initializer.initialize()).toBeNull();
    expect(f.initializer.snapshot().acknowledgment?.version).toBe(0);
    expect(f.initializer.snapshot().expectedVersion).toBe(0);
    expect(f.rows.get(key(OWNER, SESSION))?.version).toBe(1);
    expect(f.provisionRpc).toHaveBeenCalledTimes(1);
  });

  it("retains the exact request after a lost committed reply and leaves deliberate revocation independent of Auth", async () => {
    const f = fixture();
    f.hooks.provisionReply = async () => {
      throw new Error("Modeled committed reply loss");
    };
    expect(await f.initializer.initialize()).toBeNull();
    const retained = f.initializer.snapshot();
    expect(retained.writeAttempted).toBe(true);
    expect(retained.acknowledgment).toBeNull();
    expect(retained.request?.sessionId).toBe(SESSION);
    expect(f.rows.get(key(OWNER, SESSION))?.revoked).toBe(false);
    f.hooks.authenticate = async () => null;
    f.rows.set(key(OWNER, OTHER), {
      ownerId: OWNER,
      sessionId: OTHER,
      version: 3,
      expiresAt: START + 10_000,
      revoked: false,
    });
    await f.revocations.revokeSession({
      ownerId: retained.request!.ownerId,
      sessionId: retained.request!.sessionId,
    });
    expect(f.rows.get(key(OWNER, SESSION))?.revoked).toBe(true);
    expect(f.rows.get(key(OWNER, OTHER))?.revoked).toBe(false);
    expect(await f.initializer.initialize()).toBeNull();
    expect(f.provisionRpc).toHaveBeenCalledTimes(1);
  });

  it("never starts a protected read or provisioning write after cancellation at any observed clock-read microtask boundary", async () => {
    const baseline = fixture();
    expect(await baseline.initializer.initialize()).not.toBeNull();
    const boundaries = baseline.now.mock.calls.length;
    expect(boundaries).toBeGreaterThan(0);
    for (let boundary = 1; boundary <= boundaries; boundary += 1) {
      const f = fixture();
      let calls = 0;
      let cancelled = false;
      f.now.mockImplementation(() => {
        calls += 1;
        if (calls === boundary)
          queueMicrotask(() => {
            cancelled = true;
            f.initializer.cancel();
          });
        return f.clock.now;
      });
      f.hooks.onWrite = () => expect(cancelled).toBe(false);
      f.hooks.onRead = () => expect(cancelled).toBe(false);
      await f.initializer.initialize();
      expect(await f.initializer.initialize()).toBeNull();
      expect(f.provisionRpc.mock.calls.length).toBeLessThanOrEqual(1);
      expect(f.initializer.snapshot().state).toBe("cancelled");
    }
  });
});
