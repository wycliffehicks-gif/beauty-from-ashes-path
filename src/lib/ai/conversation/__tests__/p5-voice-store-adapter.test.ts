import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createVoiceStoreAdmission,
  type VoiceOperationProof,
  type VoiceStoreAdapterPorts,
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
  const ports: VoiceStoreAdapterPorts = {
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
    bridge: createVoiceStoreAdmission(ports),
  };
}

describe("P5 inactive request-bound durable-store bridge", () => {
  beforeEach(() => vi.stubEnv("BFA_P3B_STATE_SECRET", crypto.randomUUID()));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("has no default proof lifetime and performs no reads on construction", async () => {
    const h = await fixture();
    for (const maxProofAgeMs of [0, -1, NaN, Infinity, 1.5, 30_001]) {
      expect(() => createVoiceStoreAdmission({ ...h.ports, maxProofAgeMs })).toThrow(
        "voice-store-unavailable",
      );
    }
    expect(h.ports.authenticate).not.toHaveBeenCalled();
    expect(h.ports.registerCleanup).not.toHaveBeenCalled();
  });
  it("rejects client proof, claim and owner fields before server work", async () => {
    const h = await fixture();
    for (const extras of [
      { ownerId: OWNER },
      { receiptId: OTHER },
      { cleanupId: OTHER },
      { sessionVersion: 4 },
      { claim: {} },
    ]) {
      expect(await h.bridge.admit({ ...h.request, ...extras })).toBeNull();
    }
    expect(h.ports.authenticate).not.toHaveBeenCalled();
    expect(h.ports.registerCleanup).not.toHaveBeenCalled();
  });
  it("registers exact cleanup before claim proof and keeps operation TTL separate from admission lifetime", async () => {
    const h = await fixture();
    const lease = await h.bridge.admit(h.request);
    expect(lease?.snapshot().state).toBe("active");
    expect(h.events).toEqual(["cleanup", "proof:claim", "claim", "proof:inspect", "inspect"]);
    expect(h.proofs).toHaveLength(2);
    const p = h.proofs[0]!;
    expect(p.ownerSessionId).toBe(SESSION);
    expect(p.sessionVersion).toBe(4);
    expect(p.authorityFingerprint).toBe(h.current.authority.fingerprint);
    expect(p.identityExpiresAt).toBe(START + 25_000);
    expect(p.expiresAt).toBe(START + 100);
    expect(p.effectiveExpiresAt).toBe(START + 10_000);
    expect(p.claim.expiresAt).toBe(START + 10_000);
    expect(p.receiptId).not.toBe(h.proofs[1]!.receiptId);
    expect(Object.isFrozen(p)).toBe(true);
    expect(Object.isFrozen(p.claim.binding)).toBe(true);
    expect(JSON.stringify(h.proofs)).not.toContain(h.request.activeAuthority);
    expect(JSON.stringify(lease?.snapshot())).not.toContain(p.receiptId);
    await lease?.close();
  });
  it("requires a current exact protected session fence", async () => {
    const h = await fixture();
    for (const value of [
      null,
      { ...h.fence, ownerId: OTHER },
      { ...h.fence, sessionId: OTHER },
      { ...h.fence, version: -1 },
      { ...h.fence, revoked: true },
      { ...h.fence, expiresAt: START },
      { ...h.fence, verified: true },
    ]) {
      vi.mocked(h.ports.readSessionFence).mockResolvedValueOnce(value);
      expect(await h.bridge.admit(h.request)).toBeNull();
    }
    expect(h.ports.registerCleanup).not.toHaveBeenCalled();
  });
  it("denies session-fence expiry after its read wait before reading current records", async () => {
    const h = await fixture();
    vi.mocked(h.ports.readSessionFence).mockImplementationOnce(async () => {
      h.clock.now = START + 25_000;
      return h.fence;
    });
    expect(await h.bridge.admit(h.request)).toBeNull();
    expect(h.ports.readCurrent).not.toHaveBeenCalled();
  });
  it("pins session and fence version across lease revalidation", async () => {
    const h = await fixture();
    const lease = await h.bridge.admit(h.request);
    const proofCount = h.proofs.length;
    h.fence.version++;
    expect(await lease?.revalidate()).toBe(false);
    expect(h.proofs).toHaveLength(proofCount);
    expect(lease?.snapshot().state).toBe("invalid");
    await lease?.close();
  });
  it("never reuses another session of the same owner for a retained claim", async () => {
    const h = await fixture();
    const lease = await h.bridge.admit(h.request);
    h.identity.sessionId = OTHER;
    h.fence.sessionId = OTHER;
    expect(await lease?.revalidate()).toBe(false);
    expect(h.ports.claim).toHaveBeenCalledTimes(1);
    await lease?.close();
  });
  it("keeps exact cleanup ownership after a lost cleanup registration reply without claiming", async () => {
    const h = await fixture();
    vi.mocked(h.ports.registerCleanup).mockRejectedValueOnce(
      new Error("fictional lost registration"),
    );
    const lease = await h.bridge.admit(h.request);
    expect(lease?.snapshot().state).toBe("invalid");
    expect(h.ports.registerProof).not.toHaveBeenCalled();
    expect(h.ports.claim).not.toHaveBeenCalled();
    const owned = vi.mocked(h.ports.registerCleanup).mock.calls[0]![0];
    await lease?.close();
    expect(h.ports.close).toHaveBeenCalledWith(owned.cleanupId, owned.claim);
    expect(lease?.snapshot().state).toBe("closed");
  });
  it("rejects extra-field or changed cleanup acknowledgments before proof registration", async () => {
    const h = await fixture();
    for (const alter of [
      (r: unknown) => ({ ...(r as object), approved: true }),
      (r: unknown) => ({ ...(r as object), cleanupId: OTHER }),
    ]) {
      vi.mocked(h.ports.registerCleanup).mockImplementationOnce(async (r) => alter(r));
      const lease = await h.bridge.admit(h.request);
      expect(lease?.snapshot().state).toBe("invalid");
      await lease?.close();
    }
    expect(h.ports.registerProof).not.toHaveBeenCalled();
    expect(h.ports.claim).not.toHaveBeenCalled();
  });
  it("retains cleanup after lost proof registration without automatic retry or claim", async () => {
    const h = await fixture();
    vi.mocked(h.ports.registerProof).mockRejectedValueOnce(
      new Error("fictional receipt committed then reply lost"),
    );
    const lease = await h.bridge.admit(h.request);
    expect(lease?.snapshot().state).toBe("invalid");
    expect(h.ports.registerProof).toHaveBeenCalledTimes(1);
    expect(h.ports.claim).not.toHaveBeenCalled();
    await lease?.close();
  });
  it("rejects changed operation, receipt, claim, deadlines and extra fields in proof acknowledgments", async () => {
    const h = await fixture();
    const changes = [
      { operation: "inspect" },
      { receiptId: OTHER },
      { expiresAt: START + 99 },
      { effectiveExpiresAt: START + 9999 },
      { approved: true },
    ];
    for (const change of changes) {
      vi.mocked(h.ports.registerProof).mockImplementationOnce(async (p) => ({
        ...proofAck(p),
        ...change,
      }));
      const lease = await h.bridge.admit(h.request);
      expect(lease?.snapshot().state).toBe("invalid");
      await lease?.close();
    }
    vi.mocked(h.ports.registerProof).mockImplementationOnce(async (p) => ({
      ...proofAck(p),
      claim: { ...p.claim, claimId: OTHER },
    }));
    const lease = await h.bridge.admit(h.request);
    expect(lease?.snapshot().state).toBe("invalid");
    await lease?.close();
    expect(h.ports.claim).not.toHaveBeenCalled();
  });
  it("rechecks Auth after proof registration before invoking claim", async () => {
    const h = await fixture();
    vi.mocked(h.ports.registerProof).mockImplementationOnce(async (p) => {
      vi.mocked(h.ports.authenticate).mockResolvedValue(null);
      return proofAck(p);
    });
    const lease = await h.bridge.admit(h.request);
    expect(lease?.snapshot().state).toBe("invalid");
    expect(h.ports.claim).not.toHaveBeenCalled();
    await lease?.close();
  });
  it("does not use a receipt after authority shortens during registration", async () => {
    const h = await fixture();
    vi.mocked(h.ports.registerProof).mockImplementationOnce(async (p) => {
      h.current.approval.expiresAt = START + 500;
      return proofAck(p);
    });
    const lease = await h.bridge.admit(h.request);
    expect(lease?.snapshot().state).toBe("invalid");
    expect(h.ports.registerProof).toHaveBeenCalledTimes(1);
    expect(h.ports.claim).not.toHaveBeenCalled();
    await lease?.close();
  });
  it("does not claim when a proof registration wait reaches exact receipt expiry", async () => {
    const h = await fixture();
    vi.mocked(h.ports.registerProof).mockImplementationOnce(async (p) => {
      h.clock.now = p.expiresAt;
      return proofAck(p);
    });
    const lease = await h.bridge.admit(h.request);
    expect(lease?.snapshot().state).toBe("invalid");
    expect(h.ports.claim).not.toHaveBeenCalled();
    await lease?.close();
  });
  it("retains ambiguous claim cleanup after the mutation reply arrives too late", async () => {
    const h = await fixture();
    vi.mocked(h.ports.claim).mockImplementationOnce(async (_receipt, claim) => {
      h.clock.now = h.proofs[0]!.expiresAt;
      return { claim, state: "claimed" };
    });
    const lease = await h.bridge.admit(h.request);
    expect(lease?.snapshot().state).toBe("invalid");
    expect(h.ports.claim).toHaveBeenCalledTimes(1);
    expect(h.ports.inspect).not.toHaveBeenCalled();
    await lease?.close();
  });
  it("cannot turn a replay winner acknowledgment into cleanup ownership of that winner", async () => {
    const h = await fixture();
    vi.mocked(h.ports.claim).mockImplementationOnce(async (_receipt, claim) => ({
      claim: { ...claim, claimId: OTHER },
      state: "replayed",
    }));
    const lease = await h.bridge.admit(h.request);
    expect(lease?.snapshot().state).toBe("invalid");
    await lease?.close();
    expect(vi.mocked(h.ports.close).mock.calls[0]![1].claimId).toBe(
      lease?.snapshot().claim.claimId,
    );
    expect(vi.mocked(h.ports.close).mock.calls[0]![1].claimId).not.toBe(OTHER);
  });
  it("terminal close prevents a pending inspect receipt from issuing its store operation", async () => {
    const h = await fixture();
    const lease = await h.bridge.admit(h.request);
    const pending = deferred<unknown>();
    let registered: VoiceOperationProof | undefined;
    vi.mocked(h.ports.registerProof).mockImplementationOnce(async (p) => {
      registered = p;
      return pending.promise;
    });
    const inspection = lease!.revalidate();
    await vi.waitFor(() => expect(registered).toBeDefined());
    await lease!.close();
    pending.resolve(proofAck(registered!));
    expect(await inspection).toBe(false);
    expect(h.ports.inspect).toHaveBeenCalledTimes(1);
    expect(lease?.snapshot().state).toBe("closed");
  });
  it("late inspection success cannot revive a terminally closed lease", async () => {
    const h = await fixture();
    const lease = await h.bridge.admit(h.request);
    const pending = deferred<unknown>();
    vi.mocked(h.ports.inspect).mockReturnValueOnce(pending.promise);
    const checking = lease!.revalidate();
    await vi.waitFor(() => expect(h.ports.inspect).toHaveBeenCalledTimes(2));
    await lease!.close();
    pending.resolve({ claim: lease!.snapshot().claim, state: "claimed" });
    expect(await checking).toBe(false);
    expect(lease?.snapshot().state).toBe("closed");
  });
  it("close remains exact after Auth revocation, clock failure and lost closure reply; retry acquires nothing", async () => {
    const h = await fixture();
    const lease = await h.bridge.admit(h.request);
    const authCalls = vi.mocked(h.ports.authenticate).mock.calls.length;
    const proofCalls = vi.mocked(h.ports.registerProof).mock.calls.length;
    vi.mocked(h.ports.authenticate).mockRejectedValue(new Error("revoked"));
    vi.mocked(h.ports.now).mockImplementation(() => {
      throw new Error("clock unavailable");
    });
    vi.mocked(h.ports.close).mockRejectedValueOnce(new Error("lost close acknowledgment"));
    await expect(lease!.close()).rejects.toThrow("voice-admission-close-unconfirmed");
    expect(lease?.snapshot().state).toBe("close-unconfirmed");
    await lease!.close();
    expect(lease?.snapshot().state).toBe("closed");
    expect(h.ports.authenticate).toHaveBeenCalledTimes(authCalls);
    expect(h.ports.registerProof).toHaveBeenCalledTimes(proofCalls);
    expect(h.ports.claim).toHaveBeenCalledTimes(1);
    expect(h.ports.registerCleanup).toHaveBeenCalledTimes(1);
    expect(vi.mocked(h.ports.close).mock.calls[0]).toEqual(vi.mocked(h.ports.close).mock.calls[1]);
  });
  it("does not renew the earliest lease deadline with later longer proof observations", async () => {
    const h = await fixture();
    h.current.approval.expiresAt = START + 300;
    const lease = await h.bridge.admit(h.request);
    h.current.approval.expiresAt = START + 10000;
    h.clock.now = START + 150;
    expect(await lease?.revalidate()).toBe(true);
    const p = h.proofs.at(-1)!;
    expect(p.effectiveExpiresAt).toBe(START + 300);
    expect(p.expiresAt).toBe(START + 250);
    h.clock.now = START + 300;
    expect(await lease?.revalidate()).toBe(false);
    await lease?.close();
  });
});
