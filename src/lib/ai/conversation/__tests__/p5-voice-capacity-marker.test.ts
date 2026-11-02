import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createVoiceCapacityStoreAdmission,
  createVoiceStoreAdmission,
  type VoiceOperationProof,
  type VoiceCapacityStoreAdapterPorts,
} from "../service/voice-store-adapter.server";
import { ConversationService } from "../service/service";
import { fingerprint, seal } from "../staging/seal.server";

const OWNER = "11111111-1111-4111-8111-111111111111";
const THREAD = "22222222-2222-4222-8222-222222222222";
const INCARNATION = "33333333-3333-4333-8333-333333333333";
const ATTEMPT = "44444444-4444-4444-8444-444444444444";
const APPROVAL = "55555555-5555-4555-8555-555555555555";
const SESSION = "66666666-6666-4666-8666-666666666666";
const OTHER = "77777777-7777-4777-8777-777777777777";
const START = 1_790_000_000_000;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function proofAck(p: VoiceOperationProof) {
  return {
    receiptId: p.receiptId,
    operation: p.operation,
    claim: p.claim,
    expiresAt: p.expiresAt,
    effectiveExpiresAt: p.effectiveExpiresAt,
  };
}
async function fixture() {
  const clock = { now: START };
  vi.spyOn(Date, "now").mockImplementation(() => clock.now);
  const service = new ConversationService({ verifiedOwnerId: OWNER });
  service.ensureThread(THREAD, false);
  const token = await seal({
    owner: OWNER,
    thread: THREAD,
    revision: 7,
    expires: START + 20_000,
    authority: service.exportAuthority(THREAD),
  });
  const request = {
    threadId: THREAD,
    threadIncarnation: INCARNATION,
    threadRevision: 7,
    attemptId: ATTEMPT,
    activeAuthority: token,
  };
  const identity = { ownerId: OWNER, sessionId: SESSION, expiresAt: START + 30_000 };
  const fence = {
    ownerId: OWNER,
    sessionId: SESSION,
    version: 4,
    expiresAt: START + 25_000,
    revoked: false,
  };
  const binding = {
    ownerId: OWNER,
    threadId: THREAD,
    threadIncarnation: INCARNATION,
    threadRevision: 7,
  };
  const current = {
    ...binding,
    deleted: false,
    allowlist: { ownerId: OWNER, admitted: true, expiresAt: START + 15_000 },
    authority: {
      ...binding,
      fingerprint: await fingerprint(token),
      expiresAt: START + 20_000,
      revoked: false,
    },
    approval: {
      ...binding,
      id: APPROVAL,
      digest: "a".repeat(64),
      scope: "developer-voice-session",
      attemptId: ATTEMPT,
      expiresAt: START + 10_000,
      revoked: false,
    },
  };
  const proofs: VoiceOperationProof[] = [];
  const events: string[] = [];
  // Deliberate fictional RPC acknowledgments; not a database, durable receipt
  // registry, concurrency test or provider accounting implementation.
  const ports: VoiceCapacityStoreAdapterPorts = {
    expectedPoolVersion: 3,
    mark: vi.fn(async ({ claim }) => {
      events.push("mark");
      return { claim, state: "marked" };
    }),
    now: vi.fn(() => clock.now),
    maxProofAgeMs: 100,
    authenticate: vi.fn(async () => structuredClone(identity)),
    readSessionFence: vi.fn(async () => structuredClone(fence)),
    readCurrent: vi.fn(async () => structuredClone(current)),
    registerCleanup: vi.fn(async (registration) => {
      events.push("cleanup");
      return structuredClone(registration);
    }),
    registerProof: vi.fn(async (proof) => {
      events.push(`proof:${proof.operation}`);
      proofs.push(proof);
      return proofAck(proof);
    }),
    claim: vi.fn(async (_receipt, claim) => {
      events.push("claim");
      return { claim, state: "claimed" };
    }),
    inspect: vi.fn(async (_receipt, claim) => {
      events.push("inspect");
      return { claim, state: "claimed" };
    }),
    close: vi.fn(async (_cleanup, claim) => {
      events.push("close");
      return { claim, state: "closed" };
    }),
  };
  return {
    clock,
    request,
    identity,
    fence,
    current,
    ports,
    proofs,
    events,
    bridge: createVoiceCapacityStoreAdmission(ports),
  };
}

describe("P5 inactive admission-owned capacity marker", () => {
  beforeEach(() => vi.stubEnv("BFA_P3B_STATE_SECRET", crypto.randomUUID()));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("requires an explicit positive safe pool version and mark port before any Auth work", async () => {
    const h = await fixture();
    for (const expectedPoolVersion of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => createVoiceCapacityStoreAdmission({ ...h.ports, expectedPoolVersion })).toThrow(
        "voice-store-unavailable",
      );
    }
    expect(() =>
      createVoiceCapacityStoreAdmission({
        ...h.ports,
        mark: undefined,
      } as unknown as VoiceCapacityStoreAdapterPorts),
    ).toThrow("voice-store-unavailable");
    expect(h.ports.authenticate).not.toHaveBeenCalled();
  });
  it("leaves the existing admission factory without marker methods", async () => {
    const h = await fixture();
    const lease = await createVoiceStoreAdmission(h.ports).admit(h.request);
    expect(Object.keys(lease!)).toEqual(["snapshot", "revalidate", "close"]);
    expect(h.ports.mark).not.toHaveBeenCalled();
  });
  it("cannot adopt a caller claim, snapshot, operation identity or pool version as admission authority", async () => {
    const h = await fixture();
    for (const extras of [
      { claim: {} },
      { cleanupId: OTHER },
      { operationId: OTHER },
      { expectedPoolVersion: 3 },
      { receiptId: OTHER },
      { state: "active" },
    ])
      expect(await h.bridge.admit({ ...h.request, ...extras })).toBeNull();
    expect(h.ports.authenticate).not.toHaveBeenCalled();
  });
  it("registers a fresh INSPECT proof directly for exactly one mark and exposes only content-free observations", async () => {
    const h = await fixture();
    const lease = (await h.bridge.admit(h.request))!;
    expect(lease.snapshot().state).toBe("active");
    expect(lease.markerSnapshot()).toBeNull();
    const before = h.proofs.slice();
    const observed = await lease.markCapacity();
    const mark = vi.mocked(h.ports.mark).mock.calls[0]![0];
    expect(h.events).toEqual([
      "cleanup",
      "proof:claim",
      "claim",
      "proof:inspect",
      "inspect",
      "proof:inspect",
      "mark",
    ]);
    expect(h.proofs).toHaveLength(3);
    expect(before.some((proof) => proof.receiptId === mark.receiptId)).toBe(false);
    expect(h.proofs[2]!.receiptId).toBe(mark.receiptId);
    expect(h.proofs[2]!.operation).toBe("inspect");
    expect(mark.expectedPoolVersion).toBe(3);
    expect(mark.claim).toBe(h.proofs[2]!.claim);
    expect(observed).toEqual({ state: "marked", operationId: mark.operationId, claim: mark.claim });
    expect(lease.markerSnapshot()).toEqual({
      state: "observed",
      operationId: mark.operationId,
      cleanupId: h.proofs[2]!.cleanupId,
      claim: mark.claim,
      expectedPoolVersion: 3,
      acknowledgment: "marked",
    });
    for (const value of [mark, mark.claim, mark.claim.binding, observed, lease.markerSnapshot()]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    const serialized = JSON.stringify([observed, lease.markerSnapshot()]);
    for (const privateValue of [
      h.request.activeAuthority,
      mark.receiptId,
      h.proofs[2]!.authorityFingerprint,
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
    expect(await lease.markCapacity()).toBeNull();
    expect(h.ports.mark).toHaveBeenCalledTimes(1);
    expect(h.ports.registerProof).toHaveBeenCalledTimes(3);
  });
  it("snapshots trusted version and mark transport at factory construction", async () => {
    const h = await fixture();
    const originalMark = h.ports.mark;
    Object.assign(h.ports, { expectedPoolVersion: 99, mark: vi.fn() });
    const lease = (await h.bridge.admit(h.request))!;
    expect(await lease.markCapacity()).toMatchObject({ state: "marked" });
    expect(originalMark).toHaveBeenCalledWith(expect.objectContaining({ expectedPoolVersion: 3 }));
    expect(h.ports.mark).not.toHaveBeenCalled();
  });
  it("retains the same operation before a deferred proof registration and refuses a second attempt", async () => {
    const h = await fixture();
    const lease = (await h.bridge.admit(h.request))!;
    const registered = deferred<VoiceOperationProof>();
    const release = deferred<void>();
    vi.mocked(h.ports.registerProof).mockImplementationOnce(async (proof) => {
      registered.resolve(proof);
      await release.promise;
      return proofAck(proof);
    });
    const pending = lease.markCapacity();
    const snapshot = lease.markerSnapshot()!;
    expect(snapshot.state).toBe("pending");
    const proof = await registered.promise;
    expect(await lease.markCapacity()).toBeNull();
    expect(h.ports.mark).not.toHaveBeenCalled();
    release.resolve();
    expect(await pending).toMatchObject({ operationId: snapshot.operationId });
    expect(lease.markerSnapshot()!.operationId).toBe(snapshot.operationId);
    expect(vi.mocked(h.ports.mark).mock.calls[0]![0].receiptId).toBe(proof.receiptId);
  });
  it("keeps admission and operation ownership separate for two concurrent admissions", async () => {
    const h = await fixture();
    const [one, two] = await Promise.all([
      h.bridge.admit(h.request),
      h.bridge.admit({ ...h.request, attemptId: ATTEMPT }),
    ]);
    const [a, b] = await Promise.all([one!.markCapacity(), two!.markCapacity()]);
    expect(a!.operationId).not.toBe(b!.operationId);
    expect(a!.claim.claimId).not.toBe(b!.claim.claimId);
    expect(one!.markerSnapshot()!.cleanupId).not.toBe(two!.markerSnapshot()!.cleanupId);
    // These are deliberately permissive transport doubles, not duplicate-attempt SQL acceptance.
  });
  it.each(["denied", "already-marked", "quarantined", "closed"] as const)(
    "retains exact %s observation without local success or replay",
    async (state) => {
      const h = await fixture();
      const lease = (await h.bridge.admit(h.request))!;
      vi.mocked(h.ports.mark).mockImplementationOnce(async ({ claim }) => ({ claim, state }));
      expect(await lease.markCapacity()).toBeNull();
      const retained = lease.markerSnapshot();
      expect(retained).toMatchObject({ state: "unconfirmed", acknowledgment: state });
      expect(await lease.markCapacity()).toBeNull();
      expect(lease.markerSnapshot()).toBe(retained);
      expect(h.ports.mark).toHaveBeenCalledTimes(1);
    },
  );
  it.each(["lost", "null", "wrong-claim", "extra", "wrong-domain"])(
    "retains identity after %s mark reply without inferring rollback",
    async (kind) => {
      const h = await fixture();
      const lease = (await h.bridge.admit(h.request))!;
      vi.mocked(h.ports.mark).mockImplementationOnce(async ({ claim }) => {
        if (kind === "lost") throw new Error("fictional sensitive transport failure");
        if (kind === "null") return null;
        if (kind === "wrong-claim") return { claim: { ...claim, claimId: OTHER }, state: "marked" };
        if (kind === "extra") return { claim, state: "marked", operationId: OTHER };
        return { claim, state: "claimed" };
      });
      expect(await lease.markCapacity()).toBeNull();
      const retained = lease.markerSnapshot()!;
      expect(retained).toMatchObject({ state: "unconfirmed", acknowledgment: null });
      expect(await lease.markCapacity()).toBeNull();
      await lease.close();
      expect(h.ports.close).toHaveBeenCalledWith(retained.cleanupId, retained.claim);
      expect(lease.markerSnapshot()).toBe(retained);
      expect(h.ports.mark).toHaveBeenCalledTimes(1);
    },
  );
  it("rejects response accessors and inherited claim data without evaluating getters", async () => {
    const h = await fixture();
    const getter = vi.fn(() => "marked");
    vi.mocked(h.ports.mark).mockImplementationOnce(async ({ claim }) =>
      Object.defineProperty({ claim }, "state", { enumerable: true, get: getter }),
    );
    const lease = (await h.bridge.admit(h.request))!;
    expect(await lease.markCapacity()).toBeNull();
    expect(getter).not.toHaveBeenCalled();
    const other = (await h.bridge.admit(h.request))!;
    vi.mocked(h.ports.mark).mockImplementationOnce(async ({ claim }) => ({
      claim: Object.create(claim),
      state: "marked",
    }));
    expect(await other.markCapacity()).toBeNull();
  });
  it("does not mark a claim whose admission reply was lost", async () => {
    const h = await fixture();
    vi.mocked(h.ports.claim).mockRejectedValueOnce(new Error("lost"));
    const lease = (await h.bridge.admit(h.request))!;
    expect(lease.snapshot().state).toBe("invalid");
    const proofs = h.proofs.length;
    expect(await lease.markCapacity()).toBeNull();
    expect(h.proofs).toHaveLength(proofs);
    expect(h.ports.mark).not.toHaveBeenCalled();
    expect(lease.markerSnapshot()).toMatchObject({ state: "unconfirmed" });
  });
  it("retains the allocated operation after a failed fresh Auth check and never retries after recovery", async () => {
    const h = await fixture();
    const lease = (await h.bridge.admit(h.request))!;
    vi.mocked(h.ports.authenticate).mockResolvedValueOnce(null);
    expect(await lease.markCapacity()).toBeNull();
    const retained = lease.markerSnapshot()!;
    expect(retained.operationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await lease.markCapacity()).toBeNull();
    expect(lease.markerSnapshot()).toBe(retained);
    expect(h.ports.mark).not.toHaveBeenCalled();
  });
  it("denies a shorter effective ceiling learned while proof registration waits", async () => {
    const h = await fixture();
    const lease = (await h.bridge.admit(h.request))!;
    vi.mocked(h.ports.registerProof).mockImplementationOnce(async (proof) => {
      h.current.approval.expiresAt -= 1;
      return proofAck(proof);
    });
    expect(await lease.markCapacity()).toBeNull();
    expect(h.ports.mark).not.toHaveBeenCalled();
  });
  it.each(["expired", "clock-backward", "lost-proof", "wrong-proof"])(
    "withholds mark after %s registration outcome",
    async (kind) => {
      const h = await fixture();
      const lease = (await h.bridge.admit(h.request))!;
      vi.mocked(h.ports.registerProof).mockImplementationOnce(async (proof) => {
        if (kind === "expired") h.clock.now = proof.expiresAt;
        if (kind === "clock-backward") h.clock.now--;
        if (kind === "lost-proof") throw new Error("lost proof reply");
        return { ...proofAck(proof), ...(kind === "wrong-proof" ? { receiptId: OTHER } : {}) };
      });
      expect(await lease.markCapacity()).toBeNull();
      expect(h.ports.mark).not.toHaveBeenCalled();
      expect(lease.markerSnapshot()).toMatchObject({ state: "unconfirmed", acknowledgment: null });
      await lease.close();
      expect(h.ports.close).toHaveBeenCalledTimes(1);
    },
  );
  it("retains an exact marked reply arriving at proof expiry without reporting local success", async () => {
    const h = await fixture();
    const lease = (await h.bridge.admit(h.request))!;
    vi.mocked(h.ports.mark).mockImplementationOnce(async ({ claim }) => {
      h.clock.now += 100;
      return { claim, state: "marked" };
    });
    expect(await lease.markCapacity()).toBeNull();
    expect(lease.markerSnapshot()).toMatchObject({
      state: "unconfirmed",
      acknowledgment: "marked",
    });
    expect(await lease.markCapacity()).toBeNull();
    expect(h.ports.mark).toHaveBeenCalledTimes(1);
  });
  it("retains observed marker evidence across unauthenticated failed and successful exact cleanup", async () => {
    const h = await fixture();
    const lease = (await h.bridge.admit(h.request))!;
    expect(await lease.markCapacity()).toMatchObject({ state: "marked" });
    const retained = lease.markerSnapshot()!;
    vi.mocked(h.ports.authenticate).mockRejectedValue(new Error("no Auth"));
    vi.mocked(h.ports.now).mockImplementation(() => {
      throw new Error("no clock");
    });
    vi.mocked(h.ports.close).mockRejectedValueOnce(new Error("lost close"));
    await expect(lease.close()).rejects.toThrow("voice-admission-close-unconfirmed");
    expect(lease.markerSnapshot()).toBe(retained);
    await lease.close();
    expect(lease.snapshot().state).toBe("closed");
    expect(lease.markerSnapshot()).toBe(retained);
    expect(vi.mocked(h.ports.close).mock.calls).toEqual([
      [retained.cleanupId, retained.claim],
      [retained.cleanupId, retained.claim],
    ]);
    expect(await lease.markCapacity()).toBeNull();
  });
});
