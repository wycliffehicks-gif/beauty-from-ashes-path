import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createVoiceServerVerifier,
  type VoiceVerificationQuery,
} from "../service/voice-verification.server";
import { ConversationService } from "../service/service";
import { fingerprint, seal, type Envelope } from "../staging/seal.server";

// Independent adversarial fixtures: actual local AES-GCM/HMAC with an ephemeral
// fictional key, injected Auth/database reads, no HTTP/device/provider calls.
const ids = {
  owner: "10000000-0000-4000-8000-000000000001",
  otherOwner: "10000000-0000-4000-8000-000000000002",
  session: "11000000-0000-4000-8000-000000000001",
  otherSession: "11000000-0000-4000-8000-000000000002",
  thread: "20000000-0000-4000-8000-000000000001",
  incarnation: "30000000-0000-4000-8000-000000000001",
  oldIncarnation: "30000000-0000-4000-8000-000000000002",
  attempt: "40000000-0000-4000-8000-000000000001",
  approval: "50000000-0000-4000-8000-000000000001",
};
const NOW = 1_790_000_000_000;
let clock = NOW;

async function harness() {
  const service = new ConversationService({ verifiedOwnerId: ids.owner });
  service.ensureThread(ids.thread, false);
  const envelope: Envelope = {
    owner: ids.owner,
    thread: ids.thread,
    revision: 3,
    expires: NOW + 100_000,
    authority: service.exportAuthority(ids.thread),
  };
  const token = await seal(envelope);
  const request = {
    threadId: ids.thread,
    threadIncarnation: ids.incarnation,
    threadRevision: 3,
    attemptId: ids.attempt,
    activeAuthority: token,
  };
  const identity = { ownerId: ids.owner, sessionId: ids.session, expiresAt: NOW + 100_000 };
  const current = {
    ownerId: ids.owner,
    threadId: ids.thread,
    threadIncarnation: ids.incarnation,
    threadRevision: 3,
    deleted: false,
    allowlist: { ownerId: ids.owner, admitted: true, expiresAt: NOW + 100_000 },
    authority: {
      fingerprint: await fingerprint(token),
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
    now: vi.fn(() => clock),
    authenticate: vi.fn(async (): Promise<unknown> => structuredClone(identity)),
    readCurrent: vi.fn(
      async (_query: VoiceVerificationQuery): Promise<unknown> => structuredClone(current),
    ),
  };
  return {
    request,
    envelope,
    identity,
    current,
    ports,
    verifier: createVoiceServerVerifier(ports),
  };
}

describe("P5 server verification independent adversarial review", () => {
  beforeEach(() => {
    clock = NOW;
    vi.stubEnv("BFA_P3B_STATE_SECRET", crypto.randomUUID());
    vi.spyOn(Date, "now").mockImplementation(() => clock);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("accepts a locally authenticated envelope only with its preexisting exact incarnation registration", async () => {
    const h = await harness();
    const result = await h.verifier.verifyCurrent(h.request);
    expect(result?.binding).toEqual({
      ownerId: ids.owner,
      threadId: ids.thread,
      threadIncarnation: ids.incarnation,
      threadRevision: 3,
      attemptId: ids.attempt,
      approvalId: ids.approval,
      approvalDigest: "a".repeat(64),
      scope: "developer-voice-session",
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result?.binding)).toBe(true);
    expect(Object.keys(result!).sort()).toEqual([
      "allowlistExpiresAt",
      "approvalExpiresAt",
      "authorityExpiresAt",
      "binding",
      "identityExpiresAt",
    ]);
    expect(JSON.stringify(result)).not.toContain(h.request.activeAuthority);
  });

  it("rejects a valid old seal when its thread ID and revision are recreated in another incarnation", async () => {
    const h = await harness();
    h.current.authority.threadIncarnation = ids.oldIncarnation;
    expect(await h.verifier.verifyCurrent(h.request)).toBeNull();
  });

  it("rejects a missing issuance registration without treating current row ownership as a substitute", async () => {
    const h = await harness();
    h.ports.readCurrent.mockResolvedValue({ ...h.current, authority: null });
    expect(await h.verifier.verifyCurrent(h.request)).toBeNull();
  });

  it("rejects registration for different ciphertext even when owner, thread and revision match", async () => {
    const h = await harness();
    const differentlySealed = await seal(h.envelope);
    h.current.authority.fingerprint = await fingerprint(differentlySealed);
    expect(await h.verifier.verifyCurrent(h.request)).toBeNull();
  });

  it("rejects client supplied identity, clock and verification fields before any server reads", async () => {
    const h = await harness();
    for (const extra of [
      { ownerId: ids.owner },
      { verified: true },
      { now: NOW },
      { approvalId: ids.approval },
    ]) {
      expect(await h.verifier.verifyCurrent({ ...h.request, ...extra })).toBeNull();
    }
    expect(h.ports.authenticate).not.toHaveBeenCalled();
    expect(h.ports.readCurrent).not.toHaveBeenCalled();
  });

  it("rejects changed Auth session even for the same owner after asynchronous verification", async () => {
    const h = await harness();
    h.ports.authenticate
      .mockResolvedValueOnce(h.identity)
      .mockResolvedValue({ ...h.identity, sessionId: ids.otherSession });
    expect(await h.verifier.verifyCurrent(h.request)).toBeNull();
  });

  it("rejects a changed Auth owner after the first current-state read", async () => {
    const h = await harness();
    h.ports.readCurrent.mockImplementationOnce(async () => {
      h.ports.authenticate.mockResolvedValue({ ...h.identity, ownerId: ids.otherOwner });
      return structuredClone(h.current);
    });
    expect(await h.verifier.verifyCurrent(h.request)).toBeNull();
  });

  it("does not renew an early Auth deadline with a later longer identity proof", async () => {
    const h = await harness();
    h.ports.authenticate.mockResolvedValueOnce({ ...h.identity, expiresAt: NOW + 10 });
    h.ports.readCurrent.mockImplementationOnce(async () => {
      clock = NOW + 10;
      return structuredClone(h.current);
    });
    expect(await h.verifier.verifyCurrent(h.request)).toBeNull();
  });

  it("rejects a revoked approval discovered by the final current-state read", async () => {
    const h = await harness();
    h.ports.readCurrent
      .mockResolvedValueOnce(h.current)
      .mockResolvedValue({ ...h.current, approval: { ...h.current.approval, revoked: true } });
    expect(await h.verifier.verifyCurrent(h.request)).toBeNull();
  });

  it("rejects a deleted thread discovered after verifying the first envelope", async () => {
    const h = await harness();
    h.ports.readCurrent
      .mockResolvedValueOnce(h.current)
      .mockResolvedValue({ ...h.current, deleted: true });
    expect(await h.verifier.verifyCurrent(h.request)).toBeNull();
  });

  it("rejects an authenticated envelope with a nonnumeric expiration despite a future registration", async () => {
    const h = await harness();
    h.request.activeAuthority = await seal({
      ...h.envelope,
      expires: "not-a-timestamp" as unknown as number,
    });
    h.current.authority.fingerprint = await fingerprint(h.request.activeAuthority);
    expect(await h.verifier.verifyCurrent(h.request)).toBeNull();
  });

  it("rejects a saved snapshot envelope instead of accepting it as active authority", async () => {
    const h = await harness();
    h.request.activeAuthority = await seal({ ...h.envelope, expires: 0 });
    h.current.authority.fingerprint = await fingerprint(h.request.activeAuthority);
    expect(await h.verifier.verifyCurrent(h.request)).toBeNull();
  });

  it("fails closed on server-port exceptions without exposing their private message", async () => {
    const h = await harness();
    h.ports.readCurrent.mockRejectedValue(new Error("FICTIONAL_PRIVATE_CONTENT_NOT_FOR_CLIENT"));
    await expect(h.verifier.verifyCurrent(h.request)).resolves.toBeNull();
  });

  it("retains an earlier shorter allowlist deadline across a later extended snapshot", async () => {
    const h = await harness();
    h.ports.readCurrent
      .mockResolvedValueOnce({
        ...h.current,
        allowlist: { ...h.current.allowlist, expiresAt: NOW + 10 },
      })
      .mockImplementationOnce(async () => {
        clock = NOW + 10;
        return h.current;
      });
    expect(await h.verifier.verifyCurrent(h.request)).toBeNull();
  });

  it.each(["approval", "authority"] as const)(
    "retains an earlier shorter %s deadline across a later extended snapshot",
    async (field) => {
      const h = await harness();
      h.ports.readCurrent
        .mockResolvedValueOnce({
          ...h.current,
          [field]: { ...h.current[field], expiresAt: NOW + 10 },
        })
        .mockImplementationOnce(async () => {
          clock = NOW + 10;
          return h.current;
        });
      expect(await h.verifier.verifyCurrent(h.request)).toBeNull();
    },
  );

  it("copies port-owned records before later waits can mutate their approval identity", async () => {
    const h = await harness();
    h.ports.readCurrent.mockResolvedValue(h.current);
    h.ports.authenticate.mockResolvedValueOnce(h.identity).mockImplementationOnce(async () => {
      h.current.approval.digest = "b".repeat(64);
      return h.identity;
    });
    expect(await h.verifier.verifyCurrent(h.request)).toBeNull();
  });

  it("copies the original request before an asynchronous Auth read can replace its authority", async () => {
    const h = await harness();
    h.ports.authenticate.mockImplementationOnce(async () => {
      h.request.activeAuthority = "untrusted-replacement";
      h.request.threadRevision = 90;
      return h.identity;
    });
    const result = await h.verifier.verifyCurrent(h.request);
    expect(result?.binding.threadRevision).toBe(3);
  });

  it("rejects a backwards trusted clock during verification", async () => {
    const h = await harness();
    h.ports.readCurrent.mockImplementationOnce(async () => {
      clock = NOW - 1;
      return h.current;
    });
    expect(await h.verifier.verifyCurrent(h.request)).toBeNull();
  });

  it("never passes a raw envelope or client incarnation into the store lookup", async () => {
    const h = await harness();
    await h.verifier.verifyCurrent(h.request);
    expect(h.ports.readCurrent).toHaveBeenCalledTimes(2);
    for (const call of h.ports.readCurrent.mock.calls) {
      const query = call[0];
      expect(query).toEqual({
        ownerId: ids.owner,
        threadId: ids.thread,
        attemptId: ids.attempt,
        authorityFingerprint: h.current.authority.fingerprint,
      });
      expect(Object.isFrozen(query)).toBe(true);
    }
  });

  it("requires a separate exact voice approval rather than a text-evaluation grant", async () => {
    const h = await harness();
    h.current.approval.scope = "text-evaluation";
    expect(await h.verifier.verifyCurrent(h.request)).toBeNull();
  });

  it("denies noninteger clock readings before requesting Auth", async () => {
    const h = await harness();
    clock = NOW + 0.5;
    expect(await h.verifier.verifyCurrent(h.request)).toBeNull();
    expect(h.ports.authenticate).not.toHaveBeenCalled();
  });

  it("denies a revoked issuance registration even when a separate approval remains valid", async () => {
    const h = await harness();
    h.current.authority.revoked = true;
    expect(await h.verifier.verifyCurrent(h.request)).toBeNull();
  });
});
