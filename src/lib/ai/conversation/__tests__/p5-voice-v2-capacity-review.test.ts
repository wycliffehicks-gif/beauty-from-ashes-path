// Independent composition: actual v2 capacity transport and unchanged v1 bridge.
// Local crypto, Auth, proof registration and persistence are fictional. These
// cases establish acknowledgment separation, not SQL admission or provider use.
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
  createVoiceV2CapacityRpcPorts,
  type VoiceV2CapacityRpcName,
} from "../service/voice-v2-capacity-rpc.server";
import type { VoiceV2ProofReceipt } from "../service/voice-v2-proof-rpc.server";

const OWNER = "e1111111-1111-4111-8111-111111111111";
const SESSION = "e2222222-2222-4222-8222-222222222222";
const THREAD = "e3333333-3333-4333-8333-333333333333";
const INCARNATION = "e4444444-4444-4444-8444-444444444444";
const ATTEMPT = "e5555555-5555-4555-8555-555555555555";
const APPROVAL = "e6666666-6666-4666-8666-666666666666";
const START = 1_793_700_000_000;

describe("P5 v2 capacity acknowledgments cannot enter the v1 admission chain", () => {
  beforeEach(() => {
    vi.stubEnv("BFA_P3B_STATE_SECRET", "fictional-v2-capacity-review-key-only");
    vi.spyOn(Date, "now").mockReturnValue(START);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each(["claim", "inspect"] as const)(
    "denies an actual v2 %s success acknowledgment at the old bridge and retains exact cleanup",
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
        async (_name: VoiceV2CapacityRpcName, args: Readonly<Record<string, unknown>>) => ({
          data: { protocol: 2, proof: structuredClone(args.p_proof), status: "claimed" },
          error: null,
          status: 200,
        }),
      );
      const v2 = createVoiceV2CapacityRpcPorts({ rpc });
      const receipts = new Map<string, VoiceV2ProofReceipt>();
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
        // Deliberately modeled legacy registration lets the old bridge reach
        // its admission acknowledgment boundary. No conversion is installed
        // in application source, and this receipt is not real SQL evidence.
        const { ownerSessionId, sessionVersion, ...exact } = proof;
        receipts.set(proof.receiptId, {
          ...exact,
          protocol: 2,
          authSessionId: ownerSessionId,
          parentVersion: sessionVersion,
        });
        return {
          receiptId: proof.receiptId,
          operation: proof.operation,
          claim: proof.claim,
          expiresAt: proof.expiresAt,
          effectiveExpiresAt: proof.effectiveExpiresAt,
        };
      });
      const claim = vi.fn(async (receiptId, ownedClaim) => {
        if (operation === "claim") return v2.claim(receipts.get(receiptId)!);
        // The inspect case needs one fictional old claim so the unchanged
        // bridge invokes its mandatory immediate post-claim inspection.
        return { claim: ownedClaim, state: "claimed" };
      });
      const inspect = vi.fn(async (receiptId) => v2.inspect(receipts.get(receiptId)!));
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
      // Even a matched protocol-2 success is structurally different from the
      // old {claim,state} acknowledgment. The v1 bridge cannot activate a lease
      // by accepting it, including during mandatory post-claim inspection.
      expect(lease?.snapshot().state).toBe("invalid");
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc.mock.calls[0]![0]).toBe(
        operation === "claim" ? "bfa_p5_v2_capacity_claim" : "bfa_p5_v2_voice_inspect",
      );
      const observed = await (operation === "claim" ? claim : inspect).mock.results.at(-1)!.value;
      expect(observed).toMatchObject({ protocol: 2, proof: { operation }, status: "claimed" });
      expect(Object.isFrozen(observed)).toBe(true);
      expect(claim).toHaveBeenCalledTimes(1);
      expect(inspect).toHaveBeenCalledTimes(operation === "inspect" ? 1 : 0);
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
