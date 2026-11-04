// Independent composition: actual v2 mark transport and unchanged v1 marker.
// Auth, proof registration and persistence are fictional. This test adapter is
// deliberately local: no v1-to-v2 conversion or runtime wiring is installed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationService } from "../service/service";
import { fingerprint, seal } from "../staging/seal.server";
import {
  createVoiceCapacityStoreAdmission,
  type VoiceCleanupRegistration,
  type VoiceOperationProof,
  type VoiceCapacityStoreAdapterPorts,
} from "../service/voice-store-adapter.server";
import {
  createVoiceV2MarkRpcPorts,
  type VoiceV2MarkRpcName,
  type VoiceV2MarkRequest,
} from "../service/voice-v2-mark-rpc.server";
import type { VoiceV2ProofReceipt } from "../service/voice-v2-proof-rpc.server";
import type { VoiceCapacityMarkRequest } from "../service/voice-capacity-rpc.server";

const OWNER = "f1111111-1111-4111-8111-111111111111";
const SESSION = "f2222222-2222-4222-8222-222222222222";
const THREAD = "f3333333-3333-4333-8333-333333333333";
const INCARNATION = "f4444444-4444-4444-8444-444444444444";
const ATTEMPT = "f5555555-5555-4555-8555-555555555555";
const APPROVAL = "f6666666-6666-4666-8666-666666666666";
const START = 1_793_700_000_000;

describe("P5 v2 mark acknowledgments cannot enter the unchanged v1 marker", () => {
  beforeEach(() => {
    vi.stubEnv("BFA_P3B_STATE_SECRET", "fictional-v2-mark-review-key-only");
    vi.spyOn(Date, "now").mockReturnValue(START);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each(["marked", "already-marked"] as const)(
    "rejects an actual v2 %s acknowledgment, retains the operation and closes exact ownership once",
    async (status) => {
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
        async (_name: VoiceV2MarkRpcName, args: Readonly<Record<string, unknown>>) => ({
          data: { protocol: 2, request: structuredClone(args.p_request), status },
          error: null,
          status: 200,
        }),
      );
      const v2 = createVoiceV2MarkRpcPorts({ rpc });
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
        // Fictional old registration allows the real old bridge to reach its
        // marker boundary. It does not establish a stored protocol-2 proof.
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
      const claim: VoiceCapacityStoreAdapterPorts["claim"] = vi.fn(async (_receipt, owned) => ({
        claim: owned,
        state: "claimed",
      }));
      const inspect: VoiceCapacityStoreAdapterPorts["inspect"] = vi.fn(async (_receipt, owned) => ({
        claim: owned,
        state: "claimed",
      }));
      const close = vi.fn(async (_cleanupId, ownedClaim) => ({
        claim: ownedClaim,
        state: "closed",
      }));
      const mark = vi.fn(async (request: VoiceCapacityMarkRequest) =>
        v2.mark({
          protocol: 2,
          proof: receipts.get(request.receiptId)!,
          operationId: request.operationId,
          expectedPoolVersion: request.expectedPoolVersion,
        }),
      );
      const ports: VoiceCapacityStoreAdapterPorts = {
        now: () => START,
        maxProofAgeMs: 100,
        expectedPoolVersion: 4,
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
        mark,
      };
      const lease = await createVoiceCapacityStoreAdmission(ports).admit({
        threadId: THREAD,
        threadIncarnation: INCARNATION,
        threadRevision: 3,
        attemptId: ATTEMPT,
        activeAuthority,
      });
      expect(lease?.snapshot().state).toBe("active");
      expect(registerProof.mock.calls.map(([proof]) => proof.operation)).toEqual([
        "claim",
        "inspect",
      ]);
      expect(await lease?.markCapacity()).toBeNull();
      expect(mark).toHaveBeenCalledTimes(1);
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc.mock.calls[0]![0]).toBe("bfa_p5_v2_capacity_mark");
      const observed = await mark.mock.results[0]!.value;
      expect(observed).toMatchObject({ protocol: 2, status });
      expect(Object.isFrozen(observed)).toBe(true);
      const request = rpc.mock.calls[0]![1].p_request as VoiceV2MarkRequest;
      expect(request.proof.operation).toBe("inspect");
      expect(request.proof.receiptId).not.toBe(registerProof.mock.calls[1]![0].receiptId);
      expect(registerProof.mock.calls.map(([proof]) => proof.operation)).toEqual([
        "claim",
        "inspect",
        "inspect",
      ]);
      // The v1 marker expects exact {claim,state}, so neither protocol-2 status
      // can be adopted as its observation or become a provider-start result.
      const retained = lease?.markerSnapshot();
      expect(retained).toMatchObject({
        state: "unconfirmed",
        acknowledgment: null,
        operationId: request.operationId,
        expectedPoolVersion: request.expectedPoolVersion,
      });
      expect(await lease?.markCapacity()).toBeNull();
      expect(lease?.markerSnapshot()).toBe(retained);
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(registerProof).toHaveBeenCalledTimes(3);
      const owned = registerCleanup.mock.calls[0]![0];
      expect(request.proof.cleanupId).toBe(owned.cleanupId);
      expect(request.proof.claim).toEqual(owned.claim);
      await lease?.close();
      await lease?.close();
      expect(close).toHaveBeenCalledExactlyOnceWith(owned.cleanupId, owned.claim);
      expect(lease?.snapshot().state).toBe("closed");
      expect(lease?.markerSnapshot()).toBe(retained);
      expect(rpc).toHaveBeenCalledTimes(1);
    },
  );
});
