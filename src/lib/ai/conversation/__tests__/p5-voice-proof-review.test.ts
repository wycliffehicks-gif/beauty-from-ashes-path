import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVoiceStoreAdmission } from "../service/voice-store-adapter.server";
import type { VoiceAdmissionClaim } from "../service/voice-admission.server";
import type { VoiceVerificationQuery } from "../service/voice-verification.server";
import { ConversationService } from "../service/service";
import { fingerprint, seal } from "../staging/seal.server";

// Independent bridge tests. Cryptography uses a fictional local key. All
// persistence/Auth ports are doubles; these are not database concurrency tests.
const ids = {
  owner: "10000000-0000-4000-8000-000000000001",
  session: "11000000-0000-4000-8000-000000000001",
  otherSession: "11000000-0000-4000-8000-000000000002",
  thread: "20000000-0000-4000-8000-000000000001",
  incarnation: "30000000-0000-4000-8000-000000000001",
  attempt: "40000000-0000-4000-8000-000000000001",
  otherAttempt: "40000000-0000-4000-8000-000000000002",
  approval: "50000000-0000-4000-8000-000000000001",
};
const NOW = 1_790_000_000_000;
let clock = NOW;
type Cleanup = { cleanupId: string; claim: VoiceAdmissionClaim };
type Proof = {
  receiptId: string;
  operation: "claim" | "inspect";
  claim: VoiceAdmissionClaim;
  cleanupId: string;
  ownerSessionId: string;
  sessionVersion: number;
  authorityFingerprint: string;
  identityExpiresAt: number;
  verifiedAt: number;
  expiresAt: number;
  effectiveExpiresAt: number;
};
function proofAck(proof: Proof) {
  return {
    receiptId: proof.receiptId,
    operation: proof.operation,
    claim: proof.claim,
    expiresAt: proof.expiresAt,
    effectiveExpiresAt: proof.effectiveExpiresAt,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
async function until(check: () => boolean) {
  for (let i = 0; i < 250 && !check(); i++) await new Promise<void>((yes) => setTimeout(yes, 1));
  expect(check()).toBe(true);
}
async function harness() {
  const service = new ConversationService({ verifiedOwnerId: ids.owner });
  service.ensureThread(ids.thread, false);
  const activeAuthority = await seal({
    owner: ids.owner,
    thread: ids.thread,
    revision: 3,
    expires: NOW + 100_000,
    authority: service.exportAuthority(ids.thread),
  });
  const request = {
    threadId: ids.thread,
    threadIncarnation: ids.incarnation,
    threadRevision: 3,
    attemptId: ids.attempt,
    activeAuthority,
  };
  const identity = { ownerId: ids.owner, sessionId: ids.session, expiresAt: NOW + 100_000 };
  const fence = {
    ownerId: ids.owner,
    sessionId: ids.session,
    version: 1,
    expiresAt: NOW + 100_000,
    revoked: false,
  };
  const current = {
    ownerId: ids.owner,
    threadId: ids.thread,
    threadIncarnation: ids.incarnation,
    threadRevision: 3,
    deleted: false,
    allowlist: { ownerId: ids.owner, admitted: true, expiresAt: NOW + 100_000 },
    authority: {
      fingerprint: await fingerprint(activeAuthority),
      ownerId: ids.owner,
      threadId: ids.thread,
      threadIncarnation: ids.incarnation,
      threadRevision: 3,
      expiresAt: NOW + 100_000,
      revoked: false,
    },
    approval: {
      id: ids.approval,
      digest: "a".repeat(64),
      scope: "developer-voice-session",
      ownerId: ids.owner,
      threadId: ids.thread,
      threadIncarnation: ids.incarnation,
      threadRevision: 3,
      attemptId: ids.attempt,
      expiresAt: NOW + 100_000,
      revoked: false,
    },
  };
  const ports = {
    maxProofAgeMs: 1_000,
    now: vi.fn(() => clock),
    authenticate: vi.fn(async (): Promise<unknown> => structuredClone(identity)),
    readSessionFence: vi.fn(
      async (_query: { ownerId: string; sessionId: string }): Promise<unknown> =>
        structuredClone(fence),
    ),
    readCurrent: vi.fn(
      async (query: VoiceVerificationQuery): Promise<unknown> => ({
        ...structuredClone(current),
        approval: { ...structuredClone(current.approval), attemptId: query.attemptId },
      }),
    ),
    registerCleanup: vi.fn(async (cleanup: Cleanup): Promise<unknown> => structuredClone(cleanup)),
    registerProof: vi.fn(
      async (proof: Proof): Promise<unknown> => structuredClone(proofAck(proof)),
    ),
    claim: vi.fn(
      async (_receiptId: string, claim: VoiceAdmissionClaim): Promise<unknown> => ({
        claim,
        state: "claimed",
      }),
    ),
    inspect: vi.fn(
      async (_receiptId: string, claim: VoiceAdmissionClaim): Promise<unknown> => ({
        claim,
        state: "claimed",
      }),
    ),
    close: vi.fn(
      async (_cleanupId: string, claim: VoiceAdmissionClaim): Promise<unknown> => ({
        claim,
        state: "closed",
      }),
    ),
  };
  return { request, identity, fence, current, ports, adapter: createVoiceStoreAdmission(ports) };
}

describe("P5 request-bound voice proof independent review", () => {
  beforeEach(() => {
    clock = NOW;
    vi.stubEnv("BFA_P3B_STATE_SECRET", crypto.randomUUID());
    vi.spyOn(Date, "now").mockImplementation(() => clock);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("keeps short operation receipt expiry separate from the admission lifetime", async () => {
    const h = await harness();
    const lease = await h.adapter.admit(h.request);
    expect(lease?.snapshot().state).toBe("active");
    expect(lease?.snapshot().effectiveExpiresAt).toBe(NOW + 100_000);
    expect(h.ports.registerProof.mock.calls[0][0].expiresAt).toBe(NOW + 1_000);
    clock = NOW + 2_000;
    expect(await lease?.revalidate()).toBe(true);
    expect(h.ports.registerProof.mock.calls.at(-1)?.[0].expiresAt).toBe(NOW + 3_000);
    await lease?.close();
  });

  it("isolates interleaved proof registrations for concurrent requests on one factory", async () => {
    const h = await harness();
    const pendingFirst = deferred<unknown>();
    h.ports.registerProof.mockImplementation(async (proof) => {
      if (proof.operation === "claim" && proof.claim.binding.attemptId === ids.attempt)
        return pendingFirst.promise;
      return proofAck(proof);
    });
    const first = h.adapter.admit(h.request);
    await until(() => h.ports.registerProof.mock.calls.length === 1);
    const firstProof = h.ports.registerProof.mock.calls[0][0];
    const second = await h.adapter.admit({ ...h.request, attemptId: ids.otherAttempt });
    expect(second?.snapshot().state).toBe("active");
    pendingFirst.resolve(proofAck(firstProof));
    const firstLease = await first;
    expect(firstLease?.snapshot().state).toBe("active");
    const cleanupA = h.ports.registerCleanup.mock.calls[0][0];
    const cleanupB = h.ports.registerCleanup.mock.calls[1][0];
    expect(cleanupA.cleanupId).not.toBe(cleanupB.cleanupId);
    expect(cleanupA.claim.claimId).not.toBe(cleanupB.claim.claimId);
    await firstLease?.close();
    expect(h.ports.close.mock.calls[0]).toEqual([cleanupA.cleanupId, cleanupA.claim]);
    expect(second?.snapshot().state).toBe("active");
    await second?.close();
    expect(h.ports.close.mock.calls[1]).toEqual([cleanupB.cleanupId, cleanupB.claim]);
  });

  it("does not dispatch a claim after the proof registration wait reaches exact receipt expiry", async () => {
    const h = await harness();
    h.ports.registerProof.mockImplementationOnce(async (proof) => {
      clock = proof.expiresAt;
      return proofAck(proof);
    });
    const lease = await h.adapter.admit(h.request);
    expect(lease?.snapshot().state).toBe("invalid");
    expect(h.ports.claim).not.toHaveBeenCalled();
    await lease?.close();
    expect(h.ports.close).toHaveBeenCalledTimes(1);
  });

  it("keeps the exact cleanup address when cleanup registration committed but its reply was lost", async () => {
    const h = await harness();
    h.ports.registerCleanup.mockRejectedValueOnce(new Error("FICTIONAL_LOST_REGISTRATION_REPLY"));
    const lease = await h.adapter.admit(h.request);
    expect(lease?.snapshot().state).toBe("invalid");
    expect(h.ports.registerProof).not.toHaveBeenCalled();
    expect(h.ports.claim).not.toHaveBeenCalled();
    const cleanup = h.ports.registerCleanup.mock.calls[0][0];
    h.ports.authenticate.mockRejectedValue(new Error("Auth no longer available"));
    const calls = h.ports.authenticate.mock.calls.length;
    await lease?.close();
    expect(h.ports.authenticate).toHaveBeenCalledTimes(calls);
    expect(h.ports.close.mock.calls[0]).toEqual([cleanup.cleanupId, cleanup.claim]);
  });

  it("does not invoke claim on a lost proof-registration reply or retry it automatically", async () => {
    const h = await harness();
    h.ports.registerProof.mockRejectedValueOnce(new Error("FICTIONAL_LOST_PROOF_REPLY"));
    const lease = await h.adapter.admit(h.request);
    expect(lease?.snapshot().state).toBe("invalid");
    expect(h.ports.claim).not.toHaveBeenCalled();
    expect(h.ports.registerProof).toHaveBeenCalledTimes(1);
    await lease?.close();
    expect(h.ports.registerProof).toHaveBeenCalledTimes(1);
  });

  it("rejects an acknowledgment that swaps a claim proof into an inspect operation", async () => {
    const h = await harness();
    h.ports.registerProof.mockImplementationOnce(async (proof) => ({
      ...proofAck(proof),
      operation: "inspect",
    }));
    const lease = await h.adapter.admit(h.request);
    expect(lease?.snapshot().state).toBe("invalid");
    expect(h.ports.claim).not.toHaveBeenCalled();
    await lease?.close();
  });

  it("pins the original session fence version instead of inheriting a later replacement", async () => {
    const h = await harness();
    const lease = await h.adapter.admit(h.request);
    expect(lease?.snapshot().state).toBe("active");
    h.fence.version += 1;
    const inspections = h.ports.inspect.mock.calls.length;
    expect(await lease?.revalidate()).toBe(false);
    expect(h.ports.inspect).toHaveBeenCalledTimes(inspections);
    await lease?.close();
  });

  it("retains a backwards-clock denial across subsequent lease operations while allowing cleanup", async () => {
    const h = await harness();
    const lease = await h.adapter.admit(h.request);
    expect(lease?.snapshot().state).toBe("active");
    clock = NOW - 1;
    expect(await lease?.revalidate()).toBe(false);
    clock = NOW;
    expect(await lease?.revalidate()).toBe(false);
    await lease?.close();
    expect(lease?.snapshot().state).toBe("closed");
  });

  it("retains the earliest shortened authority deadline across separate verification calls", async () => {
    const h = await harness();
    const lease = await h.adapter.admit(h.request);
    h.current.allowlist.expiresAt = NOW + 10;
    expect(await lease?.revalidate()).toBe(true);
    h.current.allowlist.expiresAt = NOW + 100_000;
    clock = NOW + 10;
    expect(await lease?.revalidate()).toBe(false);
    await lease?.close();
  });

  it("exposes no receipt, cleanup credential, session ID or envelope in its public snapshot", async () => {
    const h = await harness();
    const lease = await h.adapter.admit(h.request);
    const snapshot = JSON.stringify(lease?.snapshot());
    const cleanup = h.ports.registerCleanup.mock.calls[0][0];
    const proof = h.ports.registerProof.mock.calls[0][0];
    for (const secret of [
      cleanup.cleanupId,
      proof.receiptId,
      ids.session,
      h.request.activeAuthority,
    ])
      expect(snapshot).not.toContain(secret);
    expect(Object.isFrozen(proof)).toBe(true);
    expect(Object.isFrozen(proof.claim)).toBe(true);
    expect(Object.isFrozen(proof.claim.binding)).toBe(true);
    await lease?.close();
  });

  it.each([0, -1, 30_001, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid server proof-age configuration %s before any operation",
    async (maxProofAgeMs) => {
      const h = await harness();
      expect(() => createVoiceStoreAdmission({ ...h.ports, maxProofAgeMs })).toThrow(
        "voice-store-unavailable",
      );
      expect(h.ports.authenticate).not.toHaveBeenCalled();
      expect(h.ports.registerCleanup).not.toHaveBeenCalled();
    },
  );

  it("rejects extra fields in a cleanup acknowledgment rather than treating it as verified ownership", async () => {
    const h = await harness();
    h.ports.registerCleanup.mockImplementationOnce(async (registration) => ({
      ...registration,
      verified: true,
    }));
    const lease = await h.adapter.admit(h.request);
    expect(lease?.snapshot().state).toBe("invalid");
    expect(h.ports.registerProof).not.toHaveBeenCalled();
    await lease?.close();
  });

  it("rejects a stale proof acknowledgment from a different request without disturbing its active lease", async () => {
    const h = await harness();
    const first = await h.adapter.admit(h.request);
    const oldProof = h.ports.registerProof.mock.calls[0][0];
    h.ports.registerProof.mockResolvedValueOnce(proofAck(oldProof));
    const claims = h.ports.claim.mock.calls.length;
    const second = await h.adapter.admit({ ...h.request, attemptId: ids.otherAttempt });
    expect(second?.snapshot().state).toBe("invalid");
    expect(h.ports.claim).toHaveBeenCalledTimes(claims);
    await second?.close();
    expect(h.ports.close.mock.calls[0][1].claimId).toBe(second?.snapshot().claim.claimId);
    expect(first?.snapshot().state).toBe("active");
    await first?.close();
  });

  it("keeps exact cleanup ownership when claim commits but arrives after receipt expiry", async () => {
    const h = await harness();
    h.ports.claim.mockImplementationOnce(async (receiptId, claim) => {
      const proof = h.ports.registerProof.mock.calls.find(
        (call) => call[0].receiptId === receiptId,
      )![0];
      clock = proof.expiresAt;
      return { claim, state: "claimed" };
    });
    const lease = await h.adapter.admit(h.request);
    expect(lease?.snapshot().state).toBe("invalid");
    expect(h.ports.claim).toHaveBeenCalledTimes(1);
    const cleanup = h.ports.registerCleanup.mock.calls[0][0];
    await lease?.close();
    expect(h.ports.close.mock.calls[0]).toEqual([cleanup.cleanupId, cleanup.claim]);
    expect(h.ports.claim).toHaveBeenCalledTimes(1);
  });

  it("routes close to the original claim while a late commit fixture observes its tombstone", async () => {
    const h = await harness();
    const tombstones = new Set<string>();
    let delayedClaim: VoiceAdmissionClaim | null = null;
    h.ports.claim.mockImplementationOnce(async (_receiptId, claim) => {
      delayedClaim = claim;
      throw new Error("FICTIONAL_COMMIT_RESPONSE_LOST");
    });
    h.ports.close.mockImplementation(async (_cleanupId, claim) => {
      tombstones.add(claim.claimId);
      return { claim, state: "closed" };
    });
    const lease = await h.adapter.admit(h.request);
    expect(lease?.snapshot().state).toBe("invalid");
    await lease?.close();
    // A deliberately deferred fixture models the required DB fence. This checks
    // bridge identity forwarding; it does not prove transactional tombstones.
    const late = delayedClaim as VoiceAdmissionClaim | null;
    expect(late).not.toBeNull();
    expect(tombstones.has(late!.claimId)).toBe(true);
    expect(late!.claimId).toBe(lease?.snapshot().claim.claimId);
    expect(h.ports.claim).toHaveBeenCalledTimes(1);
  });

  it("lets terminal close defeat a pending inspect proof without issuing another store inspection", async () => {
    const h = await harness();
    const lease = await h.adapter.admit(h.request);
    const registered = deferred<unknown>();
    const proofs = h.ports.registerProof.mock.calls.length;
    const inspections = h.ports.inspect.mock.calls.length;
    h.ports.registerProof.mockReturnValueOnce(registered.promise);
    const validation = lease!.revalidate();
    await until(() => h.ports.registerProof.mock.calls.length === proofs + 1);
    const pending = h.ports.registerProof.mock.calls.at(-1)![0];
    await lease?.close();
    registered.resolve(proofAck(pending));
    expect(await validation).toBe(false);
    expect(lease?.snapshot().state).toBe("closed");
    expect(h.ports.inspect).toHaveBeenCalledTimes(inspections);
  });

  it("retries an unconfirmed close only on explicit retry with the same cleanup identity and no fresh authority", async () => {
    const h = await harness();
    const lease = await h.adapter.admit(h.request);
    h.ports.close.mockRejectedValueOnce(new Error("FICTIONAL_CLOSE_REPLY_LOST"));
    const proofs = h.ports.registerProof.mock.calls.length;
    const auth = h.ports.authenticate.mock.calls.length;
    await expect(lease?.close()).rejects.toThrow("voice-admission-close-unconfirmed");
    expect(lease?.snapshot().state).toBe("close-unconfirmed");
    expect(h.ports.close).toHaveBeenCalledTimes(1);
    h.ports.authenticate.mockRejectedValue(new Error("FICTIONAL_AUTH_REVOKED"));
    clock = Number.NaN;
    await lease?.close();
    expect(lease?.snapshot().state).toBe("closed");
    expect(h.ports.close.mock.calls[1]).toEqual(h.ports.close.mock.calls[0]);
    expect(h.ports.registerProof).toHaveBeenCalledTimes(proofs);
    expect(h.ports.authenticate).toHaveBeenCalledTimes(auth);
  });

  it("rejects a claim acknowledgment whose original deadline was replaced by its receipt deadline", async () => {
    const h = await harness();
    h.ports.claim.mockImplementationOnce(async (receiptId, claim) => {
      const proof = h.ports.registerProof.mock.calls.find(
        (call) => call[0].receiptId === receiptId,
      )![0];
      return { claim: { ...claim, expiresAt: proof.expiresAt }, state: "claimed" };
    });
    const lease = await h.adapter.admit(h.request);
    expect(lease?.snapshot().state).toBe("invalid");
    await lease?.close();
    expect(h.ports.close.mock.calls[0][1].expiresAt).toBe(NOW + 100_000);
  });
});
