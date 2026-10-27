import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createVoiceServerVerifier,
  type VoiceVerificationPorts,
} from "../service/voice-verification.server";
import { createVoiceAdmissionChecks } from "../service/voice-admission.server";
import { ConversationService } from "../service/service";
import { fingerprint, seal, type Envelope } from "../staging/seal.server";

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
async function fixture() {
  const clock = { now: START };
  vi.spyOn(Date, "now").mockImplementation(() => clock.now);
  const service = new ConversationService({ verifiedOwnerId: OWNER });
  service.ensureThread(THREAD, false);
  const envelope: Envelope = {
    owner: OWNER,
    thread: THREAD,
    revision: 7,
    expires: START + 6_000,
    authority: service.exportAuthority(THREAD),
  };
  const token = await seal(envelope);
  const request = {
    threadId: THREAD,
    threadIncarnation: INCARNATION,
    threadRevision: 7,
    attemptId: ATTEMPT,
    activeAuthority: token,
  };
  const identity = { ownerId: OWNER, sessionId: SESSION, expiresAt: START + 8_000 };
  const owned = {
    ownerId: OWNER,
    threadId: THREAD,
    threadIncarnation: INCARNATION,
    threadRevision: 7,
  };
  const current = {
    ...owned,
    deleted: false,
    allowlist: { ownerId: OWNER, admitted: true, expiresAt: START + 7_000 },
    authority: {
      ...owned,
      fingerprint: await fingerprint(token),
      expiresAt: START + 6_000,
      revoked: false,
    },
    approval: {
      ...owned,
      id: APPROVAL,
      digest: "a".repeat(64),
      scope: "developer-voice-session",
      attemptId: ATTEMPT,
      expiresAt: START + 5_000,
      revoked: false,
    },
  };
  // These records simulate already verified server reads. They do not implement
  // Auth, an issuance registry, a durable ledger or transaction concurrency.
  const ports: VoiceVerificationPorts = {
    now: vi.fn(() => clock.now),
    authenticate: vi.fn(async () => structuredClone(identity)),
    readCurrent: vi.fn(async () => structuredClone(current)),
  };
  return {
    clock,
    service,
    envelope,
    request,
    identity,
    current,
    ports,
    verifier: createVoiceServerVerifier(ports),
  };
}

describe("P5 inactive concrete server verification adapter", () => {
  beforeEach(() => vi.stubEnv("BFA_P3B_STATE_SECRET", crypto.randomUUID()));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("constructs without reads and returns only immutable content-free evidence", async () => {
    const h = await fixture();
    expect(h.ports.authenticate).not.toHaveBeenCalled();
    expect(h.ports.readCurrent).not.toHaveBeenCalled();
    const evidence = await h.verifier.verifyCurrent(h.request);
    expect(evidence).toEqual({
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
      identityExpiresAt: START + 8_000,
      allowlistExpiresAt: START + 7_000,
      authorityExpiresAt: START + 6_000,
      approvalExpiresAt: START + 5_000,
    });
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(Object.isFrozen(evidence?.binding)).toBe(true);
    expect(h.ports.authenticate).toHaveBeenCalledTimes(3);
    expect(h.ports.readCurrent).toHaveBeenCalledTimes(2);
    expect(h.ports.readCurrent).toHaveBeenCalledWith({
      ownerId: OWNER,
      threadId: THREAD,
      attemptId: ATTEMPT,
      authorityFingerprint: h.current.authority.fingerprint,
    });
    expect(JSON.stringify(evidence)).not.toContain(h.request.activeAuthority);
    expect(JSON.stringify(vi.mocked(h.ports.readCurrent).mock.calls)).not.toContain(
      h.request.activeAuthority,
    );
  });

  it("denies missing or malformed verified identity before reading sealed authority or records", async () => {
    const h = await fixture();
    for (const identity of [
      null,
      {},
      { ...h.identity, ownerId: "owner" },
      { ...h.identity, expiresAt: NaN },
      { ...h.identity, sessionId: null },
      { ...h.identity, verified: true },
      { ...h.identity, expiresAt: START },
    ]) {
      vi.mocked(h.ports.authenticate).mockResolvedValueOnce(identity);
      expect(await h.verifier.verifyCurrent(h.request)).toBeNull();
    }
    expect(h.ports.readCurrent).not.toHaveBeenCalled();
  });

  it("authenticates ciphertext rather than accepting a structurally valid plain envelope", async () => {
    const h = await fixture();
    const [iv, data] = h.request.activeAuthority.split(".");
    if (!iv || !data) throw new Error("fixture");
    const corrupt = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    corrupt[0] = (corrupt[0] ?? 0) ^ 1;
    const tampered = `${iv}.${btoa(Array.from(corrupt, (c) => String.fromCharCode(c)).join(""))}`;
    for (const token of [
      JSON.stringify(h.envelope),
      tampered,
      h.request.activeAuthority + ".extra",
    ]) {
      expect(await h.verifier.verifyCurrent({ ...h.request, activeAuthority: token })).toBeNull();
    }
    expect(h.ports.readCurrent).not.toHaveBeenCalled();
  });

  it("rejects a valid seal for a different owner, thread or revision before current-record reads", async () => {
    const h = await fixture();
    for (const change of [{ owner: OTHER }, { thread: OTHER }, { revision: 6 }]) {
      const token = await seal({ ...h.envelope, ...change });
      expect(await h.verifier.verifyCurrent({ ...h.request, activeAuthority: token })).toBeNull();
    }
    expect(h.ports.readCurrent).not.toHaveBeenCalled();
  });

  for (const key of ["ownerId", "threadId", "threadIncarnation", "threadRevision"] as const) {
    it(`binds ${key} independently in the current row, issuance record and voice approval`, async () => {
      const h = await fixture();
      const different = key === "threadRevision" ? 8 : OTHER;
      for (const record of [
        { ...h.current, [key]: different },
        { ...h.current, authority: { ...h.current.authority, [key]: different } },
        { ...h.current, approval: { ...h.current.approval, [key]: different } },
      ]) {
        vi.mocked(h.ports.readCurrent).mockResolvedValueOnce(record);
        expect(await h.verifier.verifyCurrent(h.request)).toBeNull();
      }
    });
  }

  it("requires current allowlist admission for the verified owner", async () => {
    const h = await fixture();
    for (const allowlist of [
      null,
      { ...h.current.allowlist, ownerId: OTHER },
      { ...h.current.allowlist, admitted: false },
      { ...h.current.allowlist, expiresAt: START },
      { ...h.current.allowlist, extra: true },
    ]) {
      vi.mocked(h.ports.readCurrent).mockResolvedValueOnce({ ...h.current, allowlist });
      expect(await h.verifier.verifyCurrent(h.request)).toBeNull();
    }
  });

  it("requires a separate exact live-voice scope, attempt and valid approval digest", async () => {
    const h = await fixture();
    for (const change of [
      { scope: "text-evaluation" },
      { scope: "developer-voice-session-extra" },
      { attemptId: OTHER },
      { digest: "a".repeat(63) },
      { id: "approved" },
      { revoked: true },
      { expiresAt: START },
    ]) {
      vi.mocked(h.ports.readCurrent).mockResolvedValueOnce({
        ...h.current,
        approval: { ...h.current.approval, ...change },
      });
      expect(await h.verifier.verifyCurrent(h.request)).toBeNull();
    }
  });

  it("never allows an issuance registration to extend the authenticated envelope's expiry", async () => {
    const h = await fixture();
    h.current.authority.expiresAt = h.envelope.expires + 1;
    expect(await h.verifier.verifyCurrent(h.request)).toBeNull();
  });

  it("retains earlier shorter allowlist, registered-authority and approval deadlines", async () => {
    const h = await fixture();
    vi.mocked(h.ports.readCurrent).mockResolvedValueOnce({
      ...h.current,
      allowlist: { ...h.current.allowlist, expiresAt: START + 100 },
      authority: { ...h.current.authority, expiresAt: START + 200 },
      approval: { ...h.current.approval, expiresAt: START + 300 },
    });
    const result = await h.verifier.verifyCurrent(h.request);
    expect(result?.allowlistExpiresAt).toBe(START + 100);
    expect(result?.authorityExpiresAt).toBe(START + 200);
    expect(result?.approvalExpiresAt).toBe(START + 300);
  });

  it("denies expiry at the end of a deferred record read despite a later long-lived snapshot", async () => {
    const h = await fixture();
    const pending = deferred<unknown>();
    vi.mocked(h.ports.readCurrent)
      .mockResolvedValueOnce({
        ...h.current,
        approval: { ...h.current.approval, expiresAt: START + 10 },
      })
      .mockReturnValueOnce(pending.promise);
    const result = h.verifier.verifyCurrent(h.request);
    await vi.waitFor(() => expect(h.ports.readCurrent).toHaveBeenCalledTimes(2));
    h.clock.now = START + 10;
    pending.resolve(structuredClone(h.current));
    expect(await result).toBeNull();
  });

  it("checks expiry after the final Auth wait", async () => {
    const h = await fixture();
    vi.mocked(h.ports.authenticate)
      .mockResolvedValueOnce(h.identity)
      .mockResolvedValueOnce(h.identity)
      .mockImplementationOnce(async () => {
        h.clock.now = START + 5_000;
        return h.identity;
      });
    expect(await h.verifier.verifyCurrent(h.request)).toBeNull();
  });

  it("rejects a changed exact approval identity or digest between record reads", async () => {
    const h = await fixture();
    for (const change of [{ id: OTHER }, { digest: "b".repeat(64) }]) {
      vi.mocked(h.ports.readCurrent)
        .mockResolvedValueOnce(h.current)
        .mockResolvedValueOnce({ ...h.current, approval: { ...h.current.approval, ...change } });
      expect(await h.verifier.verifyCurrent(h.request)).toBeNull();
    }
  });

  it("denies invalid or backwards clocks rather than recovering expired authority", async () => {
    const h = await fixture();
    for (const value of [NaN, Infinity, -1, START + 0.5]) {
      h.clock.now = value;
      expect(await h.verifier.verifyCurrent(h.request)).toBeNull();
    }
    h.clock.now = START;
    vi.mocked(h.ports.readCurrent).mockImplementationOnce(async () => {
      h.clock.now = START - 1;
      return h.current;
    });
    expect(await h.verifier.verifyCurrent(h.request)).toBeNull();
  });

  it("denies unavailable crypto credentials without accessing a production secret or accepting a fallback", async () => {
    const h = await fixture();
    vi.stubEnv("BFA_P3B_STATE_SECRET", "");
    expect(await h.verifier.verifyCurrent(h.request)).toBeNull();
    expect(h.ports.readCurrent).not.toHaveBeenCalled();
  });

  it("feeds the admission controller only after verification and denies unregistered legacy seals", async () => {
    const h = await fixture();
    const claimAdmission = vi.fn(async (claim) => ({ claim, state: "claimed" }));
    const checks = createVoiceAdmissionChecks({
      now: () => h.clock.now,
      verifyCurrent: h.verifier.verifyCurrent,
      claimAdmission,
      inspectAdmission: async (claim) => ({ claim, state: "claimed" }),
      closeAdmission: async (claim) => ({ claim, state: "closed" }),
    });
    const lease = await checks.admit(h.request);
    expect(lease?.snapshot().state).toBe("active");
    expect(lease?.snapshot().claim.expiresAt).toBe(START + 5_000);
    await lease?.close();
    vi.mocked(h.ports.readCurrent).mockResolvedValue({ ...h.current, authority: null });
    expect(await checks.admit(h.request)).toBeNull();
    expect(claimAdmission).toHaveBeenCalledTimes(1);
  });
});
