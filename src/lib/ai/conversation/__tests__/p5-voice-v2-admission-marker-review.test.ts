// Independent marker review: preserved real crypto/verifier and strict marker
// transport, with explicit fictional Auth/records and local async ordering.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationService } from "../service/service";
import {
  createVoiceV2Admission,
  createVoiceV2CapacityAdmission,
  type VoiceV2CapacityAdmissionPorts,
} from "../service/voice-v2-admission.server";
import {
  createVoiceV2MarkRpcPorts,
  type VoiceV2MarkAck,
  type VoiceV2MarkRequest,
} from "../service/voice-v2-mark-rpc.server";
import { fingerprint, seal } from "../staging/seal.server";

const OWNER = "c1111111-1111-4111-8111-111111111111";
const SESSION = "c2222222-2222-4222-8222-222222222222";
const THREAD = "c3333333-3333-4333-8333-333333333333";
const INCARNATION = "c4444444-4444-4444-8444-444444444444";
const ATTEMPT_A = "c5555555-5555-4555-8555-555555555555";
const ATTEMPT_B = "c6666666-6666-4666-8666-666666666666";
const APPROVAL_A = "c7777777-7777-4777-8777-777777777777";
const APPROVAL_B = "c8888888-8888-4888-8888-888888888888";
const START = 1_790_000_000_000;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function fixture() {
  const clock = { now: START };
  const controls = { auth: true };
  const hooks: { mark?: (request: VoiceV2MarkRequest) => Promise<VoiceV2MarkAck> } = {};
  vi.spyOn(Date, "now").mockImplementation(() => clock.now);
  const service = new ConversationService({ verifiedOwnerId: OWNER });
  service.ensureThread(THREAD, false);
  const token = await seal({
    owner: OWNER,
    thread: THREAD,
    revision: 4,
    expires: START + 120_000,
    authority: service.exportAuthority(THREAD),
  });
  const authorityFingerprint = await fingerprint(token);
  const thread = {
    ownerId: OWNER,
    threadId: THREAD,
    threadIncarnation: INCARNATION,
    threadRevision: 4,
  };
  const marks: VoiceV2MarkRequest[] = [];
  const transport = createVoiceV2MarkRpcPorts({
    async rpc(_name, args) {
      const request = args.p_request as VoiceV2MarkRequest;
      marks.push(request);
      const data = hooks.mark
        ? await hooks.mark(request)
        : { protocol: 2 as const, request, status: "marked" as const };
      return { data, error: null, status: 200 };
    },
  });
  const ports: VoiceV2CapacityAdmissionPorts = {
    expectedPoolVersion: 7,
    maxProofAgeMs: 5_000,
    now: vi.fn(() => clock.now),
    authenticate: vi.fn(async () =>
      controls.auth ? { ownerId: OWNER, sessionId: SESSION, expiresAt: START + 180_000 } : null,
    ),
    readParent: vi.fn(async () => ({
      protocol: 2,
      ownerId: OWNER,
      authSessionId: SESSION,
      parentVersion: 3,
      revoked: false,
    })),
    readCurrent: vi.fn(async (query) => ({
      protocol: 2,
      request: query,
      current: {
        ...thread,
        deleted: false,
        allowlist: { ownerId: OWNER, admitted: true, expiresAt: START + 90_000 },
        authority: {
          ...thread,
          fingerprint: authorityFingerprint,
          issuedAt: START - 1_000,
          expiresAt: START + 120_000,
          revoked: false,
        },
        approval: {
          ...thread,
          id: query.attemptId === ATTEMPT_A ? APPROVAL_A : APPROVAL_B,
          digest: (query.attemptId === ATTEMPT_A ? "a" : "b").repeat(64),
          scope: "developer-voice-session",
          attemptId: query.attemptId,
          expiresAt: START + 100_000,
          revoked: false,
        },
      },
    })),
    registerCleanup: vi.fn(async (query) => ({
      protocol: 2,
      cleanupId: query.cleanupId,
      claim: query.claim,
      authSessionId: query.authSessionId,
      parentVersion: query.parentVersion,
      authorityFingerprint: query.authorityFingerprint,
      effectiveExpiresAt: Math.min(query.claim.expiresAt, query.authExpiresAt),
      closedAt: null,
      expiredAt: null,
      invalidatedAt: null,
    })),
    registerProof: vi.fn(async (proof) => structuredClone(proof)),
    claim: vi.fn(async (proof) => ({ protocol: 2, proof, status: "claimed" })),
    inspect: vi.fn(async (proof) => ({ protocol: 2, proof, status: "claimed" })),
    close: vi.fn(async (_cleanupId, claim) => ({ claim, state: "closed" })),
    mark: vi.fn(transport.mark),
  };
  const request = (attemptId = ATTEMPT_A) => ({
    threadId: THREAD,
    threadIncarnation: INCARNATION,
    threadRevision: 4,
    attemptId,
    activeAuthority: token,
  });
  return { clock, controls, ports, request, hooks, marks, token };
}

describe("admission-owned v2 marker independent boundaries", () => {
  beforeEach(() => vi.stubEnv("BFA_P3B_STATE_SECRET", crypto.randomUUID()));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("retains identity before its first wait and sends a dedicated inspect proof directly to one mark", async () => {
    const f = await fixture();
    const entered = deferred<void>(),
      release = deferred<void>();
    let hold = false;
    const originalAuth = f.ports.authenticate;
    f.ports.authenticate = vi.fn(async () => {
      if (hold) {
        hold = false;
        entered.resolve();
        await release.promise;
      }
      return originalAuth();
    });
    const handle = createVoiceV2CapacityAdmission(f.ports);
    expect(await handle.admit(f.request())).toBe(true);
    hold = true;
    const pending = handle.markCapacity();
    await entered.promise;
    const marker = handle.markerSnapshot();
    expect(marker).toMatchObject({
      protocol: 2,
      ownership: handle.snapshot().ownership,
      expectedPoolVersion: 7,
      state: "pending",
      request: null,
      registrationAttempted: false,
      markAttempted: false,
    });
    expect(marker!.operationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await handle.markCapacity()).toBeNull();
    expect(await handle.revalidate()).toBe(false);
    release.resolve();
    const observation = await pending;
    expect(observation).toMatchObject({
      protocol: 2,
      status: "marked",
      operationId: marker!.operationId,
      claim: marker!.ownership.claim,
    });
    const proof = vi.mocked(f.ports.registerProof).mock.calls[2][0];
    expect(proof.operation).toBe("inspect");
    expect(f.ports.inspect).toHaveBeenCalledTimes(1);
    expect(f.ports.claim).toHaveBeenCalledTimes(1);
    expect(f.marks).toEqual([
      { protocol: 2, operationId: marker!.operationId, expectedPoolVersion: 7, proof },
    ]);
    expect(handle.snapshot().operations).toHaveLength(2);
    expect(handle.markerSnapshot()).toMatchObject({
      state: "observed",
      request: f.marks[0],
      acknowledgment: { status: "marked" },
    });
    expect(await handle.markCapacity()).toBeNull();
    expect(f.ports.registerProof).toHaveBeenCalledTimes(3);
    expect(f.ports.mark).toHaveBeenCalledTimes(1);
    expect(JSON.stringify([handle.snapshot(), handle.markerSnapshot(), observation])).not.toContain(
      f.token,
    );
  });

  it("closes during marker proof registration and retains the late acknowledgment without marking", async () => {
    const f = await fixture();
    const entered = deferred<void>(),
      release = deferred<void>();
    let calls = 0;
    vi.mocked(f.ports.registerProof).mockImplementation(async (proof) => {
      calls++;
      if (calls === 3) {
        entered.resolve();
        await release.promise;
      }
      return structuredClone(proof);
    });
    const handle = createVoiceV2CapacityAdmission(f.ports);
    expect(await handle.admit(f.request())).toBe(true);
    const marking = handle.markCapacity();
    await entered.promise;
    const original = handle.markerSnapshot()!;
    expect(await handle.close()).toBe(true);
    release.resolve();
    expect(await marking).toBeNull();
    expect(handle.snapshot().state).toBe("closed");
    expect(handle.markerSnapshot()).toMatchObject({
      operationId: original.operationId,
      request: original.request,
      state: "unconfirmed",
      registrationAcknowledgment: original.request!.proof,
      markAttempted: false,
    });
    expect(f.ports.mark).not.toHaveBeenCalled();
    expect(await handle.markCapacity()).toBeNull();
    expect(f.ports.registerProof).toHaveBeenCalledTimes(3);
  });

  it("retains a committed mark reply after synchronous close without returning a positive observation", async () => {
    const f = await fixture();
    const entered = deferred<void>(),
      release = deferred<void>();
    f.hooks.mark = async (request) => {
      entered.resolve();
      await release.promise;
      return { protocol: 2, request, status: "marked" };
    };
    const handle = createVoiceV2CapacityAdmission(f.ports);
    expect(await handle.admit(f.request())).toBe(true);
    const marking = handle.markCapacity();
    await entered.promise;
    const request = handle.markerSnapshot()!.request!;
    const closing = handle.close();
    expect(handle.snapshot().state).toBe("closing");
    expect(await closing).toBe(true);
    release.resolve();
    expect(await marking).toBeNull();
    expect(handle.snapshot().state).toBe("closed");
    expect(handle.markerSnapshot()).toMatchObject({
      state: "unconfirmed",
      request,
      markAttempted: true,
      acknowledgment: { protocol: 2, request, status: "marked" },
    });
    expect(await handle.markCapacity()).toBeNull();
    expect(f.ports.mark).toHaveBeenCalledTimes(1);
    expect(f.ports.close).toHaveBeenCalledTimes(1);
  });

  it("retains late mark evidence at its original proof expiry and keeps exact cleanup usable after Auth/clock loss", async () => {
    const f = await fixture();
    f.hooks.mark = async (request) => {
      f.clock.now = request.proof.expiresAt;
      return { protocol: 2, request, status: "marked" };
    };
    const handle = createVoiceV2CapacityAdmission(f.ports);
    expect(await handle.admit(f.request())).toBe(true);
    f.clock.now = START + 40_000;
    expect(await handle.markCapacity()).toBeNull();
    const marker = handle.markerSnapshot()!;
    expect(marker.request!.proof).toMatchObject({
      verifiedAt: START + 40_000,
      expiresAt: START + 45_000,
      effectiveExpiresAt: START + 90_000,
      claim: { expiresAt: START + 90_000 },
    });
    expect(marker.acknowledgment).toMatchObject({ status: "marked", request: marker.request });
    expect(handle.snapshot().state).toBe("invalid");
    expect(f.ports.close).not.toHaveBeenCalled();
    f.controls.auth = false;
    f.clock.now = Number.NaN;
    const authCalls = vi.mocked(f.ports.authenticate).mock.calls.length;
    expect(await handle.close()).toBe(true);
    expect(f.ports.authenticate).toHaveBeenCalledTimes(authCalls);
    expect(f.ports.close).toHaveBeenCalledExactlyOnceWith(
      marker.ownership.cleanupId,
      marker.ownership.claim,
    );
    expect(await handle.markCapacity()).toBeNull();
    expect(f.ports.mark).toHaveBeenCalledTimes(1);
  });

  it("isolates two marker handles when one closes while the other's distinct mark succeeds", async () => {
    const f = await fixture();
    const entered = deferred<void>(),
      release = deferred<void>();
    f.hooks.mark = async (request) => {
      if (request.proof.claim.binding.attemptId === ATTEMPT_A) {
        entered.resolve();
        await release.promise;
      }
      return { protocol: 2, request, status: "marked" };
    };
    const a = createVoiceV2CapacityAdmission(f.ports),
      b = createVoiceV2CapacityAdmission(f.ports);
    expect(await a.admit(f.request(ATTEMPT_A))).toBe(true);
    expect(await b.admit(f.request(ATTEMPT_B))).toBe(true);
    const pending = a.markCapacity();
    await entered.promise;
    const bResult = await b.markCapacity();
    expect(bResult).toMatchObject({ status: "marked", claim: b.snapshot().ownership!.claim });
    expect(await a.close()).toBe(true);
    release.resolve();
    expect(await pending).toBeNull();
    expect(a.markerSnapshot()!.operationId).not.toBe(b.markerSnapshot()!.operationId);
    expect(a.markerSnapshot()!.request!.proof.receiptId).not.toBe(
      b.markerSnapshot()!.request!.proof.receiptId,
    );
    expect(a.snapshot().state).toBe("closed");
    expect(b.snapshot().state).toBe("active");
    expect(f.ports.close).toHaveBeenCalledExactlyOnceWith(
      a.snapshot().ownership!.cleanupId,
      a.snapshot().ownership!.claim,
    );
    expect(f.marks).toHaveLength(2);
  });

  it("keeps the base factory free of marker ports and marker methods", async () => {
    const f = await fixture();
    const markGetter = vi.fn(() => {
      throw new Error("must not inspect marker configuration");
    });
    const basePorts = { ...f.ports };
    Object.defineProperty(basePorts, "mark", { enumerable: true, get: markGetter });
    Object.defineProperty(basePorts, "expectedPoolVersion", { enumerable: true, get: markGetter });
    const base = createVoiceV2Admission(basePorts);
    expect(Object.keys(base).sort()).toEqual(["admit", "close", "revalidate", "snapshot"]);
    expect(await base.admit(f.request())).toBe(true);
    expect(markGetter).not.toHaveBeenCalled();
    expect(f.ports.mark).not.toHaveBeenCalled();
  });
});
