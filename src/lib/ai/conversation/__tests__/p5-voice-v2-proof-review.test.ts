// Independent composition: actual v2 proof transport and unchanged v1 bridge.
// Local crypto, Auth, clock and persistence are explicitly fictional; no SQL,
// provider or complete v2 admission/consumption behavior is established here.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationService } from "../service/service";
import { fingerprint, seal } from "../staging/seal.server";
import {
  createVoiceStoreAdmission,
  type VoiceCleanupRegistration,
  type VoiceOperationProof,
  type VoiceStoreAdapterPorts,
} from "../service/voice-store-adapter.server";
import {
  createVoiceV2ProofRpcPorts,
  type VoiceV2ProofRpcName,
} from "../service/voice-v2-proof-rpc.server";

const OWNER = "e1111111-1111-4111-8111-111111111111";
const SESSION = "e2222222-2222-4222-8222-222222222222";
const THREAD = "e3333333-3333-4333-8333-333333333333";
const INCARNATION = "e4444444-4444-4444-8444-444444444444";
const ATTEMPT = "e5555555-5555-4555-8555-555555555555";
const APPROVAL = "e6666666-6666-4666-8666-666666666666";
const START = 1_793_700_000_000;

describe("P5 v2 proof acknowledgments cannot enter the v1 admission chain", () => {
  beforeEach(() => {
    vi.stubEnv("BFA_P3B_STATE_SECRET", "fictional-v2-proof-review-key-only");
    vi.spyOn(Date, "now").mockReturnValue(START);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each(["claim", "inspect"] as const)(
    "denies an actual v2 %s receipt before old consumption and retains exact cleanup",
    async (operation) => {
      const service = new ConversationService({ verifiedOwnerId: OWNER });
      service.ensureThread(THREAD, false);
      const activeAuthority = await seal({
        owner: OWNER,
        thread: THREAD,
        revision: 3,
        expires: START + 20_000,
        authority: service.exportAuthority(THREAD),
      });
      const authorityFingerprint = await fingerprint(activeAuthority);
      const rpc = vi.fn(
        async (_name: VoiceV2ProofRpcName, args: Readonly<Record<string, unknown>>) => ({
          data: structuredClone(args.p_proof),
          error: null,
          status: 200,
        }),
      );
      const v2 = createVoiceV2ProofRpcPorts({ rpc });
      const binding = {
        ownerId: OWNER,
        threadId: THREAD,
        threadIncarnation: INCARNATION,
        threadRevision: 3,
      };
      const registerCleanup = vi.fn(async (owned: VoiceCleanupRegistration) =>
        structuredClone(owned),
      );
      const registerProof = vi.fn(async (proof: VoiceOperationProof) => {
        if (proof.operation !== operation) {
          // Only the inspect scenario uses this deliberately modeled initial
          // v1 claim. Its immediate post-claim inspection then receives v2.
          // Neither step is a v2 admission or real persistent admission.
          return {
            receiptId: proof.receiptId,
            operation: proof.operation,
            claim: proof.claim,
            expiresAt: proof.expiresAt,
            effectiveExpiresAt: proof.effectiveExpiresAt,
          };
        }
        const { ownerSessionId, sessionVersion, ...exact } = proof;
        return v2.registerProof({
          ...exact,
          protocol: 2,
          authSessionId: ownerSessionId,
          parentVersion: sessionVersion,
        });
      });
      const claim = vi.fn(async (_receiptId, ownedClaim) => ({
        claim: ownedClaim,
        state: "claimed",
      }));
      const inspect = vi.fn(async () => null);
      const close = vi.fn(async (_cleanupId, ownedClaim) => ({
        claim: ownedClaim,
        state: "closed",
      }));
      const ports: VoiceStoreAdapterPorts = {
        now: () => START,
        maxProofAgeMs: 100,
        authenticate: async () => ({
          ownerId: OWNER,
          sessionId: SESSION,
          expiresAt: START + 30_000,
        }),
        readSessionFence: async () => ({
          ownerId: OWNER,
          sessionId: SESSION,
          version: 4,
          expiresAt: START + 25_000,
          revoked: false,
        }),
        readCurrent: async () => ({
          ...binding,
          deleted: false,
          allowlist: { ownerId: OWNER, admitted: true, expiresAt: START + 15_000 },
          authority: {
            ...binding,
            fingerprint: authorityFingerprint,
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
        }),
        registerCleanup,
        registerProof,
        claim,
        inspect,
        close,
      };
      const lease = await createVoiceStoreAdmission(ports).admit({
        threadId: THREAD,
        threadIncarnation: INCARNATION,
        threadRevision: 3,
        attemptId: ATTEMPT,
        activeAuthority,
      });
      // The unchanged bridge immediately inspects after a successful claim;
      // in that scenario the v2 receipt must defeat its post-claim check.
      expect(lease?.snapshot().state).toBe("invalid");
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc.mock.calls[0]![0]).toBe("bfa_p5_v2_register_proof");
      const observed = await registerProof.mock.results.at(-1)!.value;
      expect(observed).toMatchObject({ protocol: 2, operation });
      expect(Object.isFrozen(observed)).toBe(true);
      expect(claim).toHaveBeenCalledTimes(operation === "claim" ? 0 : 1);
      expect(inspect).not.toHaveBeenCalled();
      expect(registerCleanup).toHaveBeenCalledTimes(1);
      const owned = registerCleanup.mock.calls[0]![0];
      await lease?.close();
      expect(close).toHaveBeenCalledExactlyOnceWith(owned.cleanupId, owned.claim);
      expect(lease?.snapshot().state).toBe("closed");
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(registerProof).toHaveBeenCalledTimes(operation === "claim" ? 1 : 2);
    },
  );
});
