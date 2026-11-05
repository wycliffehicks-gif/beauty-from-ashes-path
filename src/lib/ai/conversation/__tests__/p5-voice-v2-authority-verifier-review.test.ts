// Independent local boundary review. Real seal/HMAC and strict v2 transport;
// request-bound Auth and protected records are explicit fictional doubles.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationService } from "../service/service";
import { createVoiceAdmissionChecks } from "../service/voice-admission.server";
import { createVoiceV2AuthorityVerifier } from "../service/voice-v2-authority-verifier.server";
import {
  createVoiceV2CurrentRpcPorts,
  type VoiceV2CurrentQuery,
  type VoiceV2CurrentReceipt,
} from "../service/voice-v2-current-rpc.server";
import { fingerprint, seal } from "../staging/seal.server";

const OWNER = "a1111111-1111-4111-8111-111111111111";
const SESSION = "a2222222-2222-4222-8222-222222222222";
const THREAD = "a3333333-3333-4333-8333-333333333333";
const INCARNATION = "a4444444-4444-4444-8444-444444444444";
const ATTEMPT_A = "a5555555-5555-4555-8555-555555555555";
const ATTEMPT_B = "a6666666-6666-4666-8666-666666666666";
const APPROVAL_A = "a7777777-7777-4777-8777-777777777777";
const APPROVAL_B = "a8888888-8888-4888-8888-888888888888";
const START = 1_790_000_000_000;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function fixture() {
  vi.spyOn(Date, "now").mockReturnValue(START);
  const service = new ConversationService({ verifiedOwnerId: OWNER });
  service.ensureThread(THREAD, false);
  const activeAuthority = await seal({
    owner: OWNER,
    thread: THREAD,
    revision: 4,
    expires: START + 60_000,
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
  const identity = { ownerId: OWNER, sessionId: SESSION, expiresAt: START + 90_000 };
  const parent = {
    protocol: 2 as const,
    ownerId: OWNER,
    authSessionId: SESSION,
    parentVersion: 3,
    revoked: false,
  };
  function receipt(query: VoiceV2CurrentQuery, allowlistExpiry = START + 50_000) {
    const thread = {
      ownerId: OWNER,
      threadId: THREAD,
      threadIncarnation: INCARNATION,
      threadRevision: 4,
    };
    const result: VoiceV2CurrentReceipt = {
      protocol: 2,
      request: { ...query },
      current: {
        ...thread,
        deleted: false,
        allowlist: { ownerId: OWNER, admitted: true, expiresAt: allowlistExpiry },
        authority: {
          ...thread,
          fingerprint: authorityFingerprint,
          issuedAt: START - 1_000,
          expiresAt: START + 60_000,
          revoked: false,
        },
        approval: {
          ...thread,
          id: query.attemptId === ATTEMPT_A ? APPROVAL_A : APPROVAL_B,
          digest: (query.attemptId === ATTEMPT_A ? "a" : "b").repeat(64),
          scope: "developer-voice-session",
          attemptId: query.attemptId,
          expiresAt: START + 45_000,
          revoked: false,
        },
      },
    };
    return result;
  }
  return { request, identity, parent, receipt, activeAuthority, authorityFingerprint };
}

describe("v2 verifier independent boundary review", () => {
  beforeEach(() => vi.stubEnv("BFA_P3B_STATE_SECRET", crypto.randomUUID()));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("isolates overlapping calls, original starts, approvals and minimum ceilings", async () => {
    const f = await fixture();
    let now = START;
    const reached = deferred<void>();
    const release = deferred<void>();
    const queries: VoiceV2CurrentQuery[] = [];
    let paused = false;
    const transport = createVoiceV2CurrentRpcPorts({
      async rpc(_name, args) {
        const query = args.p_request as VoiceV2CurrentQuery;
        queries.push(query);
        if (query.attemptId === ATTEMPT_A && !paused) {
          paused = true;
          reached.resolve();
          await release.promise;
        }
        return {
          data: f.receipt(query, START + (query.attemptId === ATTEMPT_A ? 10_000 : 5_000)),
          error: null,
        };
      },
    });
    const verifier = createVoiceV2AuthorityVerifier({
      now: () => now,
      authenticate: async () => f.identity,
      readParent: async () => f.parent,
      readCurrent: transport.readCurrent,
    });
    const pendingA = verifier.verifyCurrent(f.request(ATTEMPT_A));
    await reached.promise;
    now = START + 1_000;
    const resultB = await verifier.verifyCurrent(f.request(ATTEMPT_B));
    release.resolve();
    const resultA = await pendingA;
    expect(resultA).toMatchObject({
      protocol: 2,
      verifiedAt: START,
      effectiveExpiresAt: START + 10_000,
      binding: { attemptId: ATTEMPT_A, approvalId: APPROVAL_A, approvalDigest: "a".repeat(64) },
    });
    expect(resultB).toMatchObject({
      protocol: 2,
      verifiedAt: START + 1_000,
      effectiveExpiresAt: START + 5_000,
      binding: { attemptId: ATTEMPT_B, approvalId: APPROVAL_B, approvalDigest: "b".repeat(64) },
    });
    for (const [attempt, originalStart] of [
      [ATTEMPT_A, START],
      [ATTEMPT_B, START + 1_000],
    ] as const) {
      const observations = queries.filter((q) => q.attemptId === attempt);
      expect(observations.length).toBeGreaterThanOrEqual(2);
      expect(observations.every((q) => q.verifiedAt === originalStart)).toBe(true);
    }
    expect(Object.isFrozen(resultA)).toBe(true);
    expect(Object.isFrozen(resultA?.binding)).toBe(true);
    expect(JSON.stringify([resultA, resultB])).not.toContain(f.activeAuthority);
  });

  it("keeps one call's clock failure local rather than poisoning a fresh call", async () => {
    const f = await fixture();
    let now = START + 1_000;
    let sabotage = true;
    const verifier = createVoiceV2AuthorityVerifier({
      now: () => now,
      authenticate: async () => f.identity,
      readParent: async () => {
        if (sabotage) now = START;
        return f.parent;
      },
      readCurrent: async (query) => f.receipt(query),
    });
    expect(await verifier.verifyCurrent(f.request())).toBeNull();
    sabotage = false;
    const result = await verifier.verifyCurrent(f.request(ATTEMPT_B));
    expect(result).toMatchObject({ protocol: 2, verifiedAt: START });
  });

  it("cannot silently feed protocol-2 evidence into the unchanged admission bridge", async () => {
    const f = await fixture();
    const verifier = createVoiceV2AuthorityVerifier({
      now: () => START,
      authenticate: async () => f.identity,
      readParent: async () => f.parent,
      readCurrent: async (query) => f.receipt(query),
    });
    const evidence = await verifier.verifyCurrent(f.request());
    expect(evidence?.protocol).toBe(2);
    const claimAdmission = vi.fn();
    const inspectAdmission = vi.fn();
    const closeAdmission = vi.fn();
    const bridge = createVoiceAdmissionChecks({
      now: () => START,
      verifyCurrent: async () => evidence,
      claimAdmission,
      inspectAdmission,
      closeAdmission,
    });
    expect(await bridge.admit(f.request())).toBeNull();
    expect(claimAdmission).not.toHaveBeenCalled();
    expect(inspectAdmission).not.toHaveBeenCalled();
    expect(closeAdmission).not.toHaveBeenCalled();
  });

  it("captures mandatory port methods once and never follows later replacements", async () => {
    const f = await fixture();
    const replacement = vi.fn(async () => {
      throw new Error("replacement must never run");
    });
    const ports = {
      now: () => START,
      authenticate: async () => f.identity,
      readParent: async () => f.parent,
      readCurrent: async (query: VoiceV2CurrentQuery) => f.receipt(query),
    };
    const verifier = createVoiceV2AuthorityVerifier(ports);
    ports.authenticate = replacement;
    ports.readParent = replacement;
    ports.readCurrent = replacement;
    expect(await verifier.verifyCurrent(f.request())).toMatchObject({ protocol: 2 });
    expect(replacement).not.toHaveBeenCalled();
  });

  it("rejects a getter-bearing caller request without touching its value", async () => {
    const f = await fixture();
    let touched = false;
    const authenticate = vi.fn(async () => f.identity);
    const verifier = createVoiceV2AuthorityVerifier({
      now: () => START,
      authenticate,
      readParent: async () => f.parent,
      readCurrent: async (query) => f.receipt(query),
    });
    const request = { ...f.request() };
    Object.defineProperty(request, "activeAuthority", {
      enumerable: true,
      get() {
        touched = true;
        return f.activeAuthority;
      },
    });
    expect(await verifier.verifyCurrent(request)).toBeNull();
    expect(touched).toBe(false);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it.each(["parent revocation", "approval replacement"] as const)(
    "rechecks protected current association after %s during the final Auth wait",
    async (change) => {
      const f = await fixture();
      let authCalls = 0;
      let changed = false;
      const verifier = createVoiceV2AuthorityVerifier({
        now: () => START,
        authenticate: async () => {
          authCalls++;
          if (authCalls === 4) changed = true;
          return f.identity;
        },
        readParent: async () =>
          changed && change === "parent revocation" ? { ...f.parent, revoked: true } : f.parent,
        readCurrent: async (query) => {
          const receipt = f.receipt(query);
          return changed && change === "approval replacement"
            ? {
                ...receipt,
                current: {
                  ...receipt.current,
                  approval: { ...receipt.current.approval, digest: "c".repeat(64) },
                },
              }
            : receipt;
        },
      });
      expect(await verifier.verifyCurrent(f.request())).toBeNull();
      expect(changed).toBe(true);
    },
  );
});
