// Independent compatibility check with real local crypto and the actual v2
// transport. Fictional Auth/RPC records do not establish SQL or live acceptance.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationService } from "../service/service";
import {
  createVoiceV2CurrentRpcPorts,
  type VoiceV2CurrentQuery,
  type VoiceV2CurrentReceipt,
} from "../service/voice-v2-current-rpc.server";
import {
  createVoiceServerVerifier,
  type VoiceVerificationQuery,
} from "../service/voice-verification.server";
import { fingerprint, seal } from "../staging/seal.server";

const OWNER = "d1111111-1111-4111-8111-111111111111";
const THREAD = "d2222222-2222-4222-8222-222222222222";
const INCARNATION = "d3333333-3333-4333-8333-333333333333";
const ATTEMPT = "d4444444-4444-4444-8444-444444444444";
const APPROVAL = "d5555555-5555-4555-8555-555555555555";
const SESSION = "d6666666-6666-4666-8666-666666666666";
const START = 1_790_000_000_000;

async function fixture() {
  vi.spyOn(Date, "now").mockReturnValue(START);
  const service = new ConversationService({ verifiedOwnerId: OWNER });
  service.ensureThread(THREAD, false);
  const token = await seal({
    owner: OWNER,
    thread: THREAD,
    revision: 4,
    expires: START + 20_000,
    authority: service.exportAuthority(THREAD),
  });
  const authorityFingerprint = await fingerprint(token);
  const request = {
    threadId: THREAD,
    threadIncarnation: INCARNATION,
    threadRevision: 4,
    attemptId: ATTEMPT,
    activeAuthority: token,
  };
  const query: VoiceV2CurrentQuery = {
    protocol: 2,
    ownerId: OWNER,
    authSessionId: SESSION,
    parentVersion: 3,
    threadId: THREAD,
    attemptId: ATTEMPT,
    authorityFingerprint,
    verifiedAt: START,
    identityExpiresAt: START + 60_000,
  };
  const binding = {
    ownerId: OWNER,
    threadId: THREAD,
    threadIncarnation: INCARNATION,
    threadRevision: 4,
  };
  const receipt: VoiceV2CurrentReceipt = {
    protocol: 2,
    request: query,
    current: {
      ...binding,
      deleted: false,
      allowlist: { ownerId: OWNER, admitted: true, expiresAt: START + 15_000 },
      authority: {
        ...binding,
        fingerprint: authorityFingerprint,
        issuedAt: START - 100,
        expiresAt: START + 20_000,
        revoked: false,
      },
      approval: {
        ...binding,
        id: APPROVAL,
        digest: "b".repeat(64),
        scope: "developer-voice-session",
        attemptId: ATTEMPT,
        expiresAt: START + 10_000,
        revoked: false,
      },
    },
  };
  const calls: { name: string; args: Readonly<Record<string, unknown>> }[] = [];
  const reader = createVoiceV2CurrentRpcPorts({
    async rpc(name, args) {
      calls.push({ name, args: structuredClone(args) });
      return { data: structuredClone(receipt), error: null, status: 200 };
    },
  });
  return { request, query, receipt, calls, reader };
}

describe("v2 current observation independent legacy boundary", () => {
  beforeEach(() => vi.stubEnv("BFA_P3B_STATE_SECRET", crypto.randomUUID()));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each(["complete receipt", "nested current"] as const)(
    "does not let a valid %s silently become legacy verifier evidence",
    async (form) => {
      const f = await fixture();
      const authenticate = vi.fn(async () => ({
        ownerId: OWNER,
        sessionId: SESSION,
        expiresAt: START + 60_000,
      }));
      let observed: VoiceV2CurrentReceipt | null = null;
      const readCurrent = vi.fn(async (legacyQuery: VoiceVerificationQuery) => {
        expect(legacyQuery).toEqual({
          ownerId: OWNER,
          threadId: THREAD,
          attemptId: ATTEMPT,
          authorityFingerprint: f.query.authorityFingerprint,
        });
        // Explicit fictional test conversion only; no application adapter or
        // fallback strips protocol, parent or original-time association.
        observed = await f.reader.readCurrent(f.query);
        expect(observed).toEqual(f.receipt);
        return form === "complete receipt" ? observed : observed?.current;
      });
      const verifier = createVoiceServerVerifier({
        now: () => START,
        authenticate,
        readCurrent,
      });
      expect(await verifier.verifyCurrent(f.request)).toBeNull();
      expect(readCurrent).toHaveBeenCalledTimes(1);
      expect(authenticate).toHaveBeenCalledTimes(1);
      expect(f.calls).toEqual([{ name: "bfa_p5_v2_read_current", args: { p_request: f.query } }]);
      // The legacy verifier rejects both the explicit v2 wrapper and the
      // additional immutable authority issuedAt in its nested current record.
      // No proof, cleanup, admission or provider port exists in this fixture.
      expect(observed).not.toBeNull();
    },
  );
});
