import { describe, expect, it, vi } from "vitest";
import {
  createVoiceAdmissionChecks,
  parseVoiceAdmissionRequest,
  type VoiceAdmissionClaim,
  type VoiceAdmissionEvidence,
  type VoiceAdmissionRequest,
} from "../service/voice-admission.server";

// Independent orchestration diagnostics. These ports are fictional; they do
// not demonstrate real Auth, a database transaction, quota or provider access.
const ids = {
  owner: "10000000-0000-4000-8000-000000000001",
  otherOwner: "10000000-0000-4000-8000-000000000002",
  thread: "20000000-0000-4000-8000-000000000001",
  incarnation: "30000000-0000-4000-8000-000000000001",
  attempt: "40000000-0000-4000-8000-000000000001",
  approval: "50000000-0000-4000-8000-000000000001",
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
async function until(check: () => boolean) {
  for (let i = 0; i < 80 && !check(); i++) await Promise.resolve();
  expect(check()).toBe(true);
}
function harness() {
  const request = {
    threadId: ids.thread,
    threadIncarnation: ids.incarnation,
    threadRevision: 3,
    attemptId: ids.attempt,
    activeAuthority: "FICTIONAL_OPAQUE_ACTIVE_AUTHORITY_NOT_FOR_LOGS",
  };
  let clock = 10;
  const evidence: VoiceAdmissionEvidence = {
    binding: {
      ownerId: ids.owner,
      threadId: request.threadId,
      threadIncarnation: request.threadIncarnation,
      threadRevision: request.threadRevision,
      attemptId: request.attemptId,
      approvalId: ids.approval,
      approvalDigest: "a".repeat(64),
      scope: "developer-voice-session",
    },
    identityExpiresAt: 1000,
    allowlistExpiresAt: 1000,
    authorityExpiresAt: 1000,
    approvalExpiresAt: 1000,
  };
  const ports = {
    now: vi.fn(() => clock),
    verifyCurrent: vi.fn(
      async (_request: VoiceAdmissionRequest): Promise<unknown> => structuredClone(evidence),
    ),
    claimAdmission: vi.fn(
      async (claim: VoiceAdmissionClaim): Promise<unknown> => ({ claim, state: "claimed" }),
    ),
    inspectAdmission: vi.fn(
      async (claim: VoiceAdmissionClaim): Promise<unknown> => ({ claim, state: "claimed" }),
    ),
    closeAdmission: vi.fn(
      async (claim: VoiceAdmissionClaim): Promise<unknown> => ({ claim, state: "closed" }),
    ),
  };
  return {
    request,
    evidence,
    ports,
    checks: createVoiceAdmissionChecks(ports),
    setClock: (value: number) => {
      clock = value;
    },
  };
}

describe("P5 voice admission independent server-orchestration review", () => {
  it("rejects client authority fields before any server port and copies accepted request data", async () => {
    const h = harness();
    for (const extra of [
      { ownerId: ids.owner },
      { verified: true },
      { approval: true },
      { scope: "developer-voice-session" },
    ])
      expect(await h.checks.admit({ ...h.request, ...extra })).toBeNull();
    expect(h.ports.verifyCurrent).not.toHaveBeenCalled();
    expect(h.ports.claimAdmission).not.toHaveBeenCalled();
    const parsed = parseVoiceAdmissionRequest(h.request)!;
    h.request.threadRevision = 99;
    expect(parsed.threadRevision).toBe(3);
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it("rejects the wrong approval scope or incarnation before attempting a claim", async () => {
    const h = harness();
    for (const binding of [
      { ...h.evidence.binding, scope: "text-evaluation" },
      { ...h.evidence.binding, threadIncarnation: ids.otherOwner },
    ]) {
      h.ports.verifyCurrent.mockResolvedValueOnce({ ...h.evidence, binding });
      expect(await h.checks.admit(h.request)).toBeNull();
    }
    expect(h.ports.claimAdmission).not.toHaveBeenCalled();
  });

  it("retains claim ownership when expiry passes during the claim await", async () => {
    const h = harness();
    const result = deferred<unknown>();
    h.ports.verifyCurrent.mockResolvedValue({ ...h.evidence, authorityExpiresAt: 20 });
    h.ports.claimAdmission.mockReturnValueOnce(result.promise);
    const pending = h.checks.admit(h.request);
    await until(() => h.ports.claimAdmission.mock.calls.length === 1);
    const claim = h.ports.claimAdmission.mock.calls[0][0];
    h.setClock(20);
    result.resolve({ claim, state: "claimed" });
    const lease = (await pending)!;
    expect(lease.snapshot().state).toBe("invalid");
    expect(await lease.revalidate()).toBe(false);
    await lease.close();
    expect(h.ports.closeAdmission).toHaveBeenCalledExactlyOnceWith(claim);
    expect(h.ports.claimAdmission).toHaveBeenCalledOnce();
  });

  it("does not attempt a claim after initial evidence expires at its continuation", async () => {
    const h = harness();
    h.ports.verifyCurrent.mockResolvedValueOnce({ ...h.evidence, authorityExpiresAt: 20 });
    h.ports.now.mockReturnValueOnce(10).mockReturnValue(20);
    expect(await h.checks.admit(h.request)).toBeNull();
    expect(h.ports.claimAdmission).not.toHaveBeenCalled();
  });

  it("fails generically on a clock exception before claim, retaining ownership after a possible claim", async () => {
    const early = harness();
    early.ports.now.mockReturnValueOnce(10).mockImplementation(() => {
      throw new Error("clock unavailable");
    });
    expect(await early.checks.admit(early.request)).toBeNull();
    expect(early.ports.claimAdmission).not.toHaveBeenCalled();
    const late = harness();
    late.ports.claimAdmission.mockImplementationOnce(async (claim) => {
      late.ports.now.mockImplementation(() => {
        throw new Error("clock unavailable");
      });
      return { claim, state: "claimed" };
    });
    const lease = (await late.checks.admit(late.request))!;
    expect(lease.snapshot().state).toBe("invalid");
    await lease.close();
    expect(late.ports.closeAdmission).toHaveBeenCalledExactlyOnceWith(lease.snapshot().claim);
  });

  it("checks a freshly shortened expiry at the final continuation, not only the original claim deadline", async () => {
    const h = harness();
    let clock = 0;
    let verifies = 0;
    h.ports.now.mockImplementation(() => clock++);
    h.ports.verifyCurrent.mockImplementation(async () => ({
      ...h.evidence,
      authorityExpiresAt: ++verifies === 3 ? clock + 1 : 1000,
    }));
    const lease = (await h.checks.admit(h.request))!;
    expect(lease.snapshot().state).toBe("invalid");
    await lease.close();
  });

  it("does not renew a shorter observed authority deadline across an inspection wait", async () => {
    const h = harness();
    const lease = (await h.checks.admit(h.request))!;
    const result = deferred<unknown>();
    h.ports.verifyCurrent.mockResolvedValueOnce({ ...h.evidence, authorityExpiresAt: 20 });
    h.ports.inspectAdmission.mockReturnValueOnce(result.promise);
    const pending = lease.revalidate();
    await until(() => h.ports.inspectAdmission.mock.calls.length === 2);
    h.setClock(20);
    result.resolve({ claim: lease.snapshot().claim, state: "claimed" });
    expect(await pending).toBe(false);
    expect(lease.snapshot().state).toBe("invalid");
    h.setClock(10);
    expect(await lease.revalidate()).toBe(false);
    await lease.close();
  });

  it("keeps a failed ambiguous claim address and retries only its unconfirmed close", async () => {
    const h = harness();
    h.ports.claimAdmission.mockRejectedValueOnce(
      new Error("fictional lost reply after possible commit"),
    );
    const lease = (await h.checks.admit(h.request))!;
    const claim = lease.snapshot().claim;
    expect(lease.snapshot().state).toBe("invalid");
    expect(JSON.stringify(lease.snapshot())).not.toContain(h.request.activeAuthority);
    expect(JSON.stringify(claim)).not.toContain("activeAuthority");
    expect(Object.isFrozen(claim)).toBe(true);
    expect(Object.isFrozen(claim.binding)).toBe(true);
    h.ports.closeAdmission.mockRejectedValueOnce(new Error("fictional close loss"));
    await expect(lease.close()).rejects.toThrow("voice-admission-close-unconfirmed");
    expect(lease.snapshot().state).toBe("close-unconfirmed");
    expect(await lease.revalidate()).toBe(false);
    await lease.close();
    expect(lease.snapshot().state).toBe("closed");
    expect(h.ports.claimAdmission).toHaveBeenCalledOnce();
    expect(h.ports.closeAdmission.mock.calls.map(([value]) => value.claimId)).toEqual([
      claim.claimId,
      claim.claimId,
    ]);
  });

  it("keeps close terminal when an earlier inspection resolves afterward", async () => {
    const h = harness();
    const lease = (await h.checks.admit(h.request))!;
    const result = deferred<unknown>();
    h.ports.inspectAdmission.mockReturnValueOnce(result.promise);
    const checking = lease.revalidate();
    await until(() => h.ports.inspectAdmission.mock.calls.length === 2);
    const closing = lease.close();
    expect(lease.snapshot().state).toBe("closing");
    await closing;
    result.resolve({ claim: lease.snapshot().claim, state: "claimed" });
    expect(await checking).toBe(false);
    expect(lease.snapshot().state).toBe("closed");
    expect(await lease.revalidate()).toBe(false);
    expect(h.ports.claimAdmission).toHaveBeenCalledOnce();
  });

  it("rejects changed owner or approval and never revives the lease after ports recover", async () => {
    for (const change of [{ ownerId: ids.otherOwner }, { approvalDigest: "b".repeat(64) }]) {
      const h = harness();
      const lease = (await h.checks.admit(h.request))!;
      h.ports.verifyCurrent.mockResolvedValueOnce({
        ...h.evidence,
        binding: { ...h.evidence.binding, ...change },
      });
      expect(await lease.revalidate()).toBe(false);
      const calls = h.ports.verifyCurrent.mock.calls.length;
      expect(await lease.revalidate()).toBe(false);
      expect(h.ports.verifyCurrent).toHaveBeenCalledTimes(calls);
      await lease.close();
    }
  });

  it("detaches evidence from port-owned objects before the claim await", async () => {
    const h = harness();
    const mutable = { ...h.evidence, binding: { ...h.evidence.binding } };
    h.ports.verifyCurrent.mockResolvedValue(mutable);
    h.ports.claimAdmission.mockImplementationOnce(async (claim) => {
      mutable.binding.ownerId = ids.otherOwner;
      return { claim, state: "claimed" };
    });
    const lease = (await h.checks.admit(h.request))!;
    expect(h.ports.claimAdmission.mock.calls[0][0].binding.ownerId).toBe(ids.owner);
    expect(lease.snapshot().claim.binding.ownerId).toBe(ids.owner);
    expect(lease.snapshot().state).toBe("invalid");
    await lease.close();
  });

  it("rejects mismatched acknowledgments without closing another claim identity", async () => {
    const h = harness();
    h.ports.claimAdmission.mockImplementationOnce(async (claim) => ({
      claim: { ...claim, claimId: ids.otherOwner },
      state: "claimed",
    }));
    const lease = (await h.checks.admit(h.request))!;
    expect(lease.snapshot().state).toBe("invalid");
    await lease.close();
    expect(h.ports.closeAdmission.mock.calls[0][0].claimId).toBe(
      h.ports.claimAdmission.mock.calls[0][0].claimId,
    );
    expect(h.ports.closeAdmission.mock.calls[0][0].claimId).not.toBe(ids.otherOwner);
  });

  it("fails closed for nonfinite or noninteger clocks and expiry evidence", async () => {
    for (const value of [NaN, Infinity, -1, 1.5]) {
      const h = harness();
      h.setClock(value);
      expect(await h.checks.admit(h.request)).toBeNull();
      expect(h.ports.claimAdmission).not.toHaveBeenCalled();
    }
    for (const value of [NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      const h = harness();
      h.ports.verifyCurrent.mockResolvedValueOnce({ ...h.evidence, allowlistExpiresAt: value });
      expect(await h.checks.admit(h.request)).toBeNull();
      expect(h.ports.claimAdmission).not.toHaveBeenCalled();
    }
  });
});
