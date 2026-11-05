// Independent owned-admission review. Real local crypto/verifier, fictional
// request-bound Auth and protected RPC records; no native/HTTP/provider claims.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationService } from "../service/service";
import {
  createVoiceV2Admission,
  type VoiceV2AdmissionPorts,
} from "../service/voice-v2-admission.server";
import type { VoiceV2CleanupRegistration } from "../service/voice-v2-cleanup-rpc.server";
import type { VoiceV2ProofRegistration } from "../service/voice-v2-proof-rpc.server";
import { fingerprint, seal } from "../staging/seal.server";

const OWNER = "b1111111-1111-4111-8111-111111111111";
const SESSION = "b2222222-2222-4222-8222-222222222222";
const THREAD = "b3333333-3333-4333-8333-333333333333";
const INCARNATION = "b4444444-4444-4444-8444-444444444444";
const ATTEMPT_A = "b5555555-5555-4555-8555-555555555555";
const ATTEMPT_B = "b6666666-6666-4666-8666-666666666666";
const APPROVAL_A = "b7777777-7777-4777-8777-777777777777";
const APPROVAL_B = "b8888888-8888-4888-8888-888888888888";
const START = 1_790_000_000_000;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function cleanupAck(query: VoiceV2CleanupRegistration) {
  return {
    protocol: 2 as const,
    cleanupId: query.cleanupId,
    claim: query.claim,
    authSessionId: query.authSessionId,
    parentVersion: query.parentVersion,
    authorityFingerprint: query.authorityFingerprint,
    effectiveExpiresAt: Math.min(query.claim.expiresAt, query.authExpiresAt),
    closedAt: null,
    expiredAt: null,
    invalidatedAt: null,
  };
}
function capacityAck(proof: VoiceV2ProofRegistration) {
  return { protocol: 2 as const, proof, status: "claimed" as const };
}

async function fixture() {
  const clock = { now: START };
  const controls = { authAvailable: true };
  vi.spyOn(Date, "now").mockImplementation(() => clock.now);
  const service = new ConversationService({ verifiedOwnerId: OWNER });
  service.ensureThread(THREAD, false);
  const activeAuthority = await seal({
    owner: OWNER,
    thread: THREAD,
    revision: 4,
    expires: START + 120_000,
    authority: service.exportAuthority(THREAD),
  });
  const authorityFingerprint = await fingerprint(activeAuthority);
  const request = (attemptId = ATTEMPT_A) => ({
    threadId: THREAD,
    threadIncarnation: INCARNATION,
    threadRevision: 4,
    attemptId,
    activeAuthority,
  });
  const thread = {
    ownerId: OWNER,
    threadId: THREAD,
    threadIncarnation: INCARNATION,
    threadRevision: 4,
  };
  const ports: VoiceV2AdmissionPorts = {
    maxProofAgeMs: 5_000,
    now: vi.fn(() => clock.now),
    authenticate: vi.fn(async () =>
      controls.authAvailable
        ? { ownerId: OWNER, sessionId: SESSION, expiresAt: START + 180_000 }
        : null,
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
    registerCleanup: vi.fn(async (query) => cleanupAck(query)),
    registerProof: vi.fn(async (proof) => structuredClone(proof)),
    claim: vi.fn(async (proof) => capacityAck(proof)),
    inspect: vi.fn(async (proof) => capacityAck(proof)),
    close: vi.fn(async (_cleanupId, claim) => ({ claim, state: "closed" })),
  };
  return { clock, controls, request, ports, activeAuthority };
}

describe("v2 owned admission independent boundary review", () => {
  beforeEach(() => vi.stubEnv("BFA_P3B_STATE_SECRET", crypto.randomUUID()));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("owns exact cleanup before its wait and prevents late registration from reopening a closed handle", async () => {
    const f = await fixture();
    const reached = deferred<void>();
    const release = deferred<void>();
    vi.mocked(f.ports.registerCleanup).mockImplementation(async (query) => {
      reached.resolve();
      await release.promise;
      return cleanupAck(query);
    });
    const handle = createVoiceV2Admission(f.ports);
    const admission = handle.admit(f.request());
    await reached.promise;
    const pending = handle.snapshot();
    expect(pending.ownership).not.toBeNull();
    expect(pending.cleanupWriteAttempted).toBe(true);
    expect(pending.ownership?.claim.expiresAt).toBe(START + 90_000);
    const closing = handle.close();
    expect(handle.snapshot().state).toBe("closing");
    expect(await closing).toBe(true);
    release.resolve();
    expect(await admission).toBe(false);
    expect(handle.snapshot().state).toBe("closed");
    expect(handle.snapshot().ownership).toEqual(pending.ownership);
    expect(f.ports.close).toHaveBeenCalledExactlyOnceWith(
      pending.ownership!.cleanupId,
      pending.ownership!.claim,
    );
    expect(f.ports.registerProof).not.toHaveBeenCalled();
    expect(f.ports.claim).not.toHaveBeenCalled();
    expect(f.ports.inspect).not.toHaveBeenCalled();
    expect(await handle.admit(f.request(ATTEMPT_B))).toBe(false);
    expect(f.ports.registerCleanup).toHaveBeenCalledTimes(1);
  });

  it("retains a late exact proof registration acknowledgment without consuming after close", async () => {
    const f = await fixture();
    const reached = deferred<void>();
    const release = deferred<void>();
    vi.mocked(f.ports.registerProof).mockImplementation(async (proof) => {
      reached.resolve();
      await release.promise;
      return structuredClone(proof);
    });
    const handle = createVoiceV2Admission(f.ports);
    const admission = handle.admit(f.request());
    await reached.promise;
    const original = handle.snapshot().operations[0].request;
    expect(await handle.close()).toBe(true);
    release.resolve();
    expect(await admission).toBe(false);
    const final = handle.snapshot();
    expect(final.state).toBe("closed");
    expect(final.operations).toHaveLength(1);
    expect(final.operations[0].request).toEqual(original);
    expect(final.operations[0].registrationAcknowledgment).toEqual(original);
    expect(final.operations[0].consumptionAttempted).toBe(false);
    expect(f.ports.claim).not.toHaveBeenCalled();
    expect(f.ports.inspect).not.toHaveBeenCalled();
  });

  it("retains late committed claim evidence and permits exact cleanup after Auth and clock loss", async () => {
    const f = await fixture();
    const reached = deferred<void>();
    const release = deferred<void>();
    vi.mocked(f.ports.claim).mockImplementation(async (proof) => {
      reached.resolve();
      await release.promise;
      return capacityAck(proof);
    });
    const handle = createVoiceV2Admission(f.ports);
    const admission = handle.admit(f.request());
    await reached.promise;
    const pending = handle.snapshot();
    f.clock.now = START + 5_000;
    release.resolve();
    expect(await admission).toBe(false);
    expect(handle.snapshot().state).toBe("invalid");
    expect(handle.snapshot().operations[0].acknowledgment).toEqual(
      capacityAck(pending.operations[0].request),
    );
    expect(f.ports.close).not.toHaveBeenCalled();
    expect(f.ports.inspect).not.toHaveBeenCalled();
    f.controls.authAvailable = false;
    f.clock.now = Number.NaN;
    const authCount = vi.mocked(f.ports.authenticate).mock.calls.length;
    const clockCount = vi.mocked(f.ports.now).mock.calls.length;
    expect(await handle.close()).toBe(true);
    expect(f.ports.authenticate).toHaveBeenCalledTimes(authCount);
    expect(f.ports.now).toHaveBeenCalledTimes(clockCount);
    expect(f.ports.close).toHaveBeenCalledExactlyOnceWith(
      pending.ownership!.cleanupId,
      pending.ownership!.claim,
    );
    expect(handle.snapshot().state).toBe("closed");
  });

  it("does not create a second proof for overlapping revalidation or resurrect after a pending inspect is closed", async () => {
    const f = await fixture();
    const reached = deferred<void>();
    const release = deferred<void>();
    let inspectCalls = 0;
    vi.mocked(f.ports.inspect).mockImplementation(async (proof) => {
      inspectCalls++;
      if (inspectCalls === 2) {
        reached.resolve();
        await release.promise;
      }
      return capacityAck(proof);
    });
    const handle = createVoiceV2Admission(f.ports);
    expect(await handle.admit(f.request())).toBe(true);
    expect(handle.snapshot().operations.map((op) => op.request.operation)).toEqual([
      "claim",
      "inspect",
    ]);
    const pending = handle.revalidate();
    await reached.promise;
    expect(await handle.revalidate()).toBe(false);
    expect(f.ports.registerProof).toHaveBeenCalledTimes(3);
    expect(await handle.close()).toBe(true);
    release.resolve();
    expect(await pending).toBe(false);
    expect(handle.snapshot().state).toBe("closed");
    expect(handle.snapshot().operations).toHaveLength(3);
    expect(f.ports.inspect).toHaveBeenCalledTimes(2);
    expect(new Set(handle.snapshot().operations.map((op) => op.request.receiptId)).size).toBe(3);
  });

  it("keeps two concurrently owned handles separate when one closes before registration returns", async () => {
    const f = await fixture();
    const reached = deferred<void>();
    const release = deferred<void>();
    vi.mocked(f.ports.registerCleanup).mockImplementation(async (query) => {
      if (query.claim.binding.attemptId === ATTEMPT_A) {
        reached.resolve();
        await release.promise;
      }
      return cleanupAck(query);
    });
    const a = createVoiceV2Admission(f.ports);
    const b = createVoiceV2Admission(f.ports);
    const pendingA = a.admit(f.request(ATTEMPT_A));
    await reached.promise;
    expect(await b.admit(f.request(ATTEMPT_B))).toBe(true);
    expect(a.snapshot().ownership!.cleanupId).not.toBe(b.snapshot().ownership!.cleanupId);
    expect(a.snapshot().ownership!.claim.claimId).not.toBe(b.snapshot().ownership!.claim.claimId);
    expect(await a.close()).toBe(true);
    release.resolve();
    expect(await pendingA).toBe(false);
    expect(await b.revalidate()).toBe(true);
    expect(a.snapshot().state).toBe("closed");
    expect(b.snapshot().state).toBe("active");
    expect(f.ports.close).toHaveBeenCalledExactlyOnceWith(
      a.snapshot().ownership!.cleanupId,
      a.snapshot().ownership!.claim,
    );
    expect(JSON.stringify([a.snapshot(), b.snapshot()])).not.toContain(f.activeAuthority);
  });

  it("does not refresh original proof time when the post-registration verifier starts later", async () => {
    const f = await fixture();
    const originalCurrent = f.ports.readCurrent;
    let proofRegistered = false;
    vi.mocked(f.ports.registerProof).mockImplementation(async (proof) => {
      proofRegistered = true;
      f.clock.now = START + 999;
      return structuredClone(proof);
    });
    f.ports.readCurrent = vi.fn(async (query) => {
      if (proofRegistered) f.clock.now = START + 1_000;
      return originalCurrent(query);
    });
    const handle = createVoiceV2Admission({ ...f.ports, maxProofAgeMs: 1_000 });
    expect(await handle.admit(f.request())).toBe(false);
    const snapshot = handle.snapshot();
    expect(snapshot.ownership?.claim.expiresAt).toBe(START + 90_000);
    expect(snapshot.operations).toHaveLength(1);
    expect(snapshot.operations[0].request).toMatchObject({
      verifiedAt: START,
      expiresAt: START + 1_000,
    });
    expect(snapshot.operations[0].consumptionAttempted).toBe(false);
    expect(f.ports.claim).not.toHaveBeenCalled();
    expect(f.ports.registerProof).toHaveBeenCalledTimes(1);
    expect(f.ports.close).not.toHaveBeenCalled();
  });
});
