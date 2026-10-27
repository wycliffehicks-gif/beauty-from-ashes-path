import { describe, expect, it, vi } from "vitest";
import {
  createVoiceAdmissionChecks,
  parseVoiceAdmissionRequest,
  type VoiceAdmissionCheckPorts,
  type VoiceAdmissionClaim,
  type VoiceAdmissionEvidence,
  type VoiceAdmissionRequest,
} from "../service/voice-admission.server";
import { VoiceLifecycleController } from "../service/voice-lifecycle";

const OWNER = "11111111-1111-4111-8111-111111111111";
const THREAD = "22222222-2222-4222-8222-222222222222";
const INCARNATION = "33333333-3333-4333-8333-333333333333";
const ATTEMPT = "44444444-4444-4444-8444-444444444444";
const APPROVAL = "55555555-5555-4555-8555-555555555555";
const OTHER = "66666666-6666-4666-8666-666666666666";
const ACTIVE_AUTHORITY = "SYNTHETIC_SEALED_ACTIVE_AUTHORITY_NOT_A_REAL_TOKEN";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function fixture() {
  const clock = { now: 1_000 };
  const request: VoiceAdmissionRequest = {
    threadId: THREAD,
    threadIncarnation: INCARNATION,
    threadRevision: 7,
    attemptId: ATTEMPT,
    activeAuthority: ACTIVE_AUTHORITY,
  };
  const evidence: VoiceAdmissionEvidence = {
    binding: {
      ownerId: OWNER,
      threadId: THREAD,
      threadIncarnation: INCARNATION,
      threadRevision: 7,
      attemptId: ATTEMPT,
      approvalId: APPROVAL,
      approvalDigest: "a".repeat(64),
      scope: "developer-voice-session",
    },
    identityExpiresAt: 8_000,
    allowlistExpiresAt: 7_000,
    authorityExpiresAt: 6_000,
    approvalExpiresAt: 5_000,
  };
  // These are explicit acknowledgment fixtures, not a ledger implementation or
  // evidence of durable uniqueness, authenticated users or approved voice use.
  const ports: VoiceAdmissionCheckPorts = {
    now: vi.fn(() => clock.now),
    verifyCurrent: vi.fn(async () => structuredClone(evidence)),
    claimAdmission: vi.fn(async (claim) => ({ claim, state: "claimed" })),
    inspectAdmission: vi.fn(async (claim) => ({ claim, state: "claimed" })),
    closeAdmission: vi.fn(async (claim) => ({ claim, state: "closed" })),
  };
  return { clock, request, evidence, ports, checks: createVoiceAdmissionChecks(ports) };
}
async function until(predicate: () => boolean) {
  await vi.waitFor(() => expect(predicate()).toBe(true), { interval: 1, timeout: 2_000 });
}

describe("P5 inactive server voice admission checks", () => {
  it("constructs without calls and rejects untrusted extra authority fields before verification", async () => {
    const h = fixture();
    expect(h.ports.verifyCurrent).not.toHaveBeenCalled();
    expect(h.ports.claimAdmission).not.toHaveBeenCalled();
    const invalid = [
      null,
      [],
      {},
      { ...h.request, ownerId: OWNER },
      { ...h.request, verified: true },
      { ...h.request, approvalId: APPROVAL },
      { ...h.request, threadRevision: "7" },
      { ...h.request, threadRevision: 1.5 },
      { ...h.request, threadRevision: Number.MAX_SAFE_INTEGER + 1 },
      { ...h.request, attemptId: "arbitrary-client-session" },
      { ...h.request, activeAuthority: "x".repeat(350_001) },
    ];
    for (const raw of invalid) {
      expect(parseVoiceAdmissionRequest(raw)).toBeNull();
      expect(await h.checks.admit(raw)).toBeNull();
    }
    expect(h.ports.verifyCurrent).not.toHaveBeenCalled();
    expect(h.ports.claimAdmission).not.toHaveBeenCalled();
  });

  it("accepts only verified evidence for the exact requested thread, incarnation, revision and attempt", async () => {
    const h = fixture();
    for (const change of [
      { threadId: OTHER },
      { threadIncarnation: OTHER },
      { threadRevision: 8 },
      { attemptId: OTHER },
      { scope: "text-evaluation" },
    ]) {
      vi.mocked(h.ports.verifyCurrent).mockResolvedValueOnce({
        ...h.evidence,
        binding: { ...h.evidence.binding, ...change },
      });
      expect(await h.checks.admit(h.request)).toBeNull();
    }
    vi.mocked(h.ports.verifyCurrent).mockResolvedValueOnce(null);
    expect(await h.checks.admit(h.request)).toBeNull();
    expect(h.ports.claimAdmission).not.toHaveBeenCalled();
  });

  for (const field of [
    "identityExpiresAt",
    "allowlistExpiresAt",
    "authorityExpiresAt",
    "approvalExpiresAt",
  ] as const) {
    it(`does not extend ${field} when choosing the admission deadline`, async () => {
      const h = fixture();
      vi.mocked(h.ports.verifyCurrent).mockResolvedValue({ ...h.evidence, [field]: 2_000 });
      const lease = await h.checks.admit(h.request);
      expect(lease?.snapshot().state).toBe("active");
      expect(lease?.snapshot().claim.expiresAt).toBe(2_000);
      h.clock.now = 2_000;
      expect(await lease?.revalidate()).toBe(false);
      expect(lease?.snapshot().state).toBe("invalid");
      expect(h.ports.claimAdmission).toHaveBeenCalledTimes(1);
    });
  }

  it("rejects invalid clocks and nonfinite/expired server evidence without attempting a claim", async () => {
    const h = fixture();
    for (const now of [NaN, Infinity, -1, 1000.5]) {
      h.clock.now = now;
      expect(await h.checks.admit(h.request)).toBeNull();
    }
    h.clock.now = 1_000;
    for (const expires of [NaN, Infinity, -1, 1000, 2000.5, Number.MAX_SAFE_INTEGER + 1]) {
      vi.mocked(h.ports.verifyCurrent).mockResolvedValueOnce({
        ...h.evidence,
        approvalExpiresAt: expires,
      });
      expect(await h.checks.admit(h.request)).toBeNull();
    }
    expect(h.ports.claimAdmission).not.toHaveBeenCalled();
  });

  it("keeps owner and exact voice approval bound across the claim wait", async () => {
    for (const change of [
      { ownerId: OTHER },
      { approvalId: OTHER },
      { approvalDigest: "b".repeat(64) },
    ]) {
      const h = fixture();
      vi.mocked(h.ports.claimAdmission).mockImplementationOnce(async (claim) => {
        vi.mocked(h.ports.verifyCurrent).mockResolvedValue({
          ...h.evidence,
          binding: { ...h.evidence.binding, ...change },
        });
        return { claim, state: "claimed" };
      });
      const lease = await h.checks.admit(h.request);
      expect(lease?.snapshot().state).toBe("invalid");
      expect(await lease?.revalidate()).toBe(false);
      await lease?.close();
      expect(h.ports.closeAdmission).toHaveBeenCalledWith(lease?.snapshot().claim);
    }
  });

  it("rechecks identity after a delayed durable inspection and never revives a revoked lease", async () => {
    const h = fixture();
    const lease = (await h.checks.admit(h.request))!;
    const waiting = deferred<unknown>();
    vi.mocked(h.ports.inspectAdmission).mockReturnValueOnce(waiting.promise);
    const checking = lease.revalidate();
    await until(() => vi.mocked(h.ports.inspectAdmission).mock.calls.length === 2);
    vi.mocked(h.ports.verifyCurrent).mockResolvedValue(null);
    waiting.resolve({ claim: lease.snapshot().claim, state: "claimed" });
    expect(await checking).toBe(false);
    vi.mocked(h.ports.verifyCurrent).mockResolvedValue(h.evidence);
    expect(await lease.revalidate()).toBe(false);
    expect(h.ports.claimAdmission).toHaveBeenCalledTimes(1);
  });

  it("does not renew a lease when later evidence has a longer lifetime", async () => {
    const h = fixture();
    const lease = (await h.checks.admit(h.request))!;
    const original = lease.snapshot().claim.expiresAt;
    vi.mocked(h.ports.verifyCurrent).mockResolvedValue({
      ...h.evidence,
      identityExpiresAt: 90_000,
      allowlistExpiresAt: 90_000,
      authorityExpiresAt: 90_000,
      approvalExpiresAt: 90_000,
    });
    expect(await lease.revalidate()).toBe(true);
    expect(lease.snapshot().claim.expiresAt).toBe(original);
    h.clock.now = original;
    expect(await lease.revalidate()).toBe(false);
  });

  it("retains exact cleanup ownership for lost, uncertain, malformed and wrong claim acknowledgments", async () => {
    for (const outcome of ["throw", "uncertain", "malformed", "wrong-claim"] as const) {
      const h = fixture();
      vi.mocked(h.ports.claimAdmission).mockImplementationOnce(async (claim) => {
        if (outcome === "throw") throw new Error("SYNTHETIC_PRIVATE_UPSTREAM_DETAIL");
        if (outcome === "uncertain") return { claim, state: "uncertain" };
        if (outcome === "malformed") return { claim, state: "claimed", extra: true };
        return { claim: { ...claim, claimId: OTHER }, state: "claimed" };
      });
      const lease = (await h.checks.admit(h.request))!;
      expect(lease).not.toBeNull();
      expect(lease.snapshot().state).toBe("invalid");
      expect(await lease.revalidate()).toBe(false);
      const claimed = vi.mocked(h.ports.claimAdmission).mock.calls[0][0];
      expect(lease.snapshot().claim).toEqual(claimed);
      expect(JSON.stringify(lease.snapshot())).not.toContain(ACTIVE_AUTHORITY);
      expect(JSON.stringify(claimed)).not.toContain(ACTIVE_AUTHORITY);
      expect(JSON.stringify(lease.snapshot())).not.toContain("PRIVATE_UPSTREAM_DETAIL");
      await lease.close();
      expect(h.ports.closeAdmission).toHaveBeenCalledExactlyOnceWith(claimed);
      expect(h.ports.claimAdmission).toHaveBeenCalledTimes(1);
    }
  });

  it("uses a different cleanup identity for a replay refusal, without closing the original winner", async () => {
    const h = fixture();
    const original = (await h.checks.admit(h.request))!;
    vi.mocked(h.ports.claimAdmission).mockImplementationOnce(async (claim) => ({
      claim,
      state: "replayed",
    }));
    const replay = (await h.checks.admit(h.request))!;
    expect(replay.snapshot().state).toBe("invalid");
    expect(replay.snapshot().claim.claimId).not.toBe(original.snapshot().claim.claimId);
    await replay.close();
    expect(h.ports.closeAdmission).toHaveBeenCalledExactlyOnceWith(replay.snapshot().claim);
    expect(original.snapshot().state).toBe("active");
    // The fixture does not prove durable replay protection; the production
    // transaction must enforce attempt uniqueness and this claimId isolation.
  });

  it("closes terminally before await, coalesces concurrent closes and requires explicit retry after uncertain closure", async () => {
    const h = fixture();
    const lease = (await h.checks.admit(h.request))!;
    const waiting = deferred<unknown>();
    vi.mocked(h.ports.closeAdmission).mockReturnValueOnce(waiting.promise);
    const closing = lease.close();
    expect(lease.snapshot().state).toBe("closing");
    expect(lease.close()).toBe(closing);
    expect(await lease.revalidate()).toBe(false);
    waiting.resolve({ claim: lease.snapshot().claim, state: "uncertain" });
    await expect(closing).rejects.toThrow("voice-admission-close-unconfirmed");
    expect(lease.snapshot().state).toBe("close-unconfirmed");
    expect(h.ports.closeAdmission).toHaveBeenCalledTimes(1);
    expect(await lease.revalidate()).toBe(false);
    await lease.close();
    expect(lease.snapshot().state).toBe("closed");
    expect(h.ports.closeAdmission).toHaveBeenCalledTimes(2);
    await lease.close();
    expect(h.ports.closeAdmission).toHaveBeenCalledTimes(2);
    expect(await lease.revalidate()).toBe(false);
    expect(h.ports.claimAdmission).toHaveBeenCalledTimes(1);
  });

  it("rejects closure acknowledgments for another owner, incarnation, revision or claim", async () => {
    for (const field of ["ownerId", "threadIncarnation", "threadRevision", "claimId"] as const) {
      const h = fixture();
      const lease = (await h.checks.admit(h.request))!;
      vi.mocked(h.ports.closeAdmission).mockImplementationOnce(async (claim) => ({
        claim:
          field === "claimId"
            ? { ...claim, claimId: OTHER }
            : {
                ...claim,
                binding: { ...claim.binding, [field]: field === "threadRevision" ? 8 : OTHER },
              },
        state: "closed",
      }));
      await expect(lease.close()).rejects.toThrow("voice-admission-close-unconfirmed");
      expect(lease.snapshot().state).toBe("close-unconfirmed");
      expect(await lease.revalidate()).toBe(false);
    }
  });

  it("copies and freezes client and server evidence instead of retaining mutable input", async () => {
    const h = fixture();
    const mutableRequest = { ...h.request };
    const mutableEvidence = { ...h.evidence, binding: { ...h.evidence.binding } };
    vi.mocked(h.ports.verifyCurrent).mockResolvedValue(mutableEvidence);
    const waiting = deferred<unknown>();
    vi.mocked(h.ports.claimAdmission).mockReturnValueOnce(waiting.promise);
    const admitting = h.checks.admit(mutableRequest);
    await until(() => vi.mocked(h.ports.claimAdmission).mock.calls.length === 1);
    mutableRequest.activeAuthority = "CHANGED_CLIENT_TOKEN";
    mutableEvidence.binding.ownerId = OTHER;
    const claim = vi.mocked(h.ports.claimAdmission).mock.calls[0][0];
    expect(claim.binding.ownerId).toBe(OWNER);
    expect(Object.isFrozen(claim)).toBe(true);
    expect(Object.isFrozen(claim.binding)).toBe(true);
    vi.mocked(h.ports.verifyCurrent).mockResolvedValue(h.evidence);
    waiting.resolve({ claim, state: "claimed" });
    const lease = (await admitting)!;
    expect(lease.snapshot().state).toBe("active");
    for (const [request] of vi.mocked(h.ports.verifyCurrent).mock.calls) {
      expect(request.activeAuthority).toBe(ACTIVE_AUTHORITY);
      expect(Object.isFrozen(request)).toBe(true);
    }
  });

  for (const denial of ["before-claim", "after-claim"] as const) {
    it(`returns a controller-compatible denial ${denial} without capture or connection`, async () => {
      const h = fixture();
      if (denial === "before-claim") vi.mocked(h.ports.verifyCurrent).mockResolvedValue(null);
      else
        vi.mocked(h.ports.claimAdmission).mockImplementationOnce(async (claim) => {
          vi.mocked(h.ports.verifyCurrent).mockResolvedValue(null);
          return { claim, state: "claimed" };
        });
      const capture = vi.fn(async () => ({ kind: "denied" as const }));
      const connect = vi.fn(async () => {
        throw new Error("must-not-connect");
      });
      const controller = new VoiceLifecycleController({
        admit: async () => {
          const lease = await h.checks.admit(h.request);
          if (!lease) throw new Error("admission-denied");
          return lease;
        },
        acquireCapture: capture,
        connect,
        cancelPending: vi.fn(),
      });
      expect(await controller.start("internal-coordination-id")).toBe(false);
      expect(capture).not.toHaveBeenCalled();
      expect(connect).not.toHaveBeenCalled();
      expect(controller.snapshot().cleanupComplete).toBe(true);
      expect(h.ports.closeAdmission).toHaveBeenCalledTimes(denial === "after-claim" ? 1 : 0);
    });
  }

  it("returns a late admission handle for controller cleanup after Pause while claim is pending", async () => {
    const h = fixture();
    const waiting = deferred<unknown>();
    vi.mocked(h.ports.claimAdmission).mockReturnValueOnce(waiting.promise);
    const capture = vi.fn(async () => ({ kind: "denied" as const }));
    const connect = vi.fn(async () => {
      throw new Error("must-not-connect");
    });
    const controller = new VoiceLifecycleController({
      admit: async () => (await h.checks.admit(h.request))!,
      acquireCapture: capture,
      connect,
      cancelPending: vi.fn(),
    });
    const starting = controller.start("internal-coordination-id");
    await until(() => vi.mocked(h.ports.claimAdmission).mock.calls.length === 1);
    await controller.pause();
    expect(controller.snapshot().cleanupComplete).toBe(false);
    expect(controller.snapshot().privatePracticeAvailable).toBe(false);
    const claim: VoiceAdmissionClaim = vi.mocked(h.ports.claimAdmission).mock.calls[0][0];
    waiting.resolve({ claim, state: "claimed" });
    expect(await starting).toBe(false);
    expect(h.ports.closeAdmission).toHaveBeenCalledExactlyOnceWith(claim);
    expect(controller.snapshot().state).toBe("paused");
    expect(controller.snapshot().cleanupComplete).toBe(true);
    expect(capture).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });
});
