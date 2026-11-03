// Independent mixed-protocol composition: actual v2 transport, unchanged v1
// admission bridge and local crypto. Auth/persistence are explicitly fictional.
// This proves no old-bridge fallback, not SQL or real provider acceptance.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationService } from "../service/service";
import { fingerprint, seal } from "../staging/seal.server";
import {
  createVoiceStoreAdmission,
  type VoiceCleanupRegistration,
  type VoiceStoreAdapterPorts,
} from "../service/voice-store-adapter.server";
import {
  createVoiceV2CleanupRpcPorts,
  type VoiceV2CleanupRpcName,
} from "../service/voice-v2-cleanup-rpc.server";

const OWNER = "e1111111-1111-4111-8111-111111111111";
const SESSION = "e2222222-2222-4222-8222-222222222222";
const THREAD = "e3333333-3333-4333-8333-333333333333";
const INCARNATION = "e4444444-4444-4444-8444-444444444444";
const ATTEMPT = "e5555555-5555-4555-8555-555555555555";
const APPROVAL = "e6666666-6666-4666-8666-666666666666";
const START = 1_793_700_000_000;

describe("P5 v2 cleanup observations cannot enter the v1 admission chain", () => {
  beforeEach(() => {
    vi.stubEnv("BFA_P3B_STATE_SECRET", "fictional-v2-cleanup-review-key-only");
    vi.spyOn(Date, "now").mockReturnValue(START);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each(["registration", "terminal observation"] as const)(
    "retains exact cleanup but refuses proof/admission for a v2 %s",
    async (mode) => {
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
        async (_name: VoiceV2CleanupRpcName, args: Readonly<Record<string, unknown>>) => ({
          data: {
            protocol: 2,
            cleanupId: args.p_cleanup_id,
            claim: args.p_claim,
            authSessionId: args.p_auth_session_id,
            parentVersion: args.p_parent_version,
            authorityFingerprint: args.p_fingerprint,
            effectiveExpiresAt: START + 10_000,
            closedAt: mode === "terminal observation" ? START - 1 : null,
            expiredAt: null,
            invalidatedAt: null,
          },
          error: null,
          status: 200,
        }),
      );
      const v2 = createVoiceV2CleanupRpcPorts({ rpc });
      const currentBinding = {
        ownerId: OWNER,
        threadId: THREAD,
        threadIncarnation: INCARNATION,
        threadRevision: 3,
      };
      const registerCleanup = vi.fn(async (owned: VoiceCleanupRegistration) => {
        const association = {
          ...owned,
          authSessionId: SESSION,
          parentVersion: 4,
          authorityFingerprint,
        };
        const observed =
          mode === "registration"
            ? await v2.registerCleanup({
                ...association,
                verifiedAt: START,
                authExpiresAt: START + 30_000,
              })
            : await v2.readCleanup(association);
        return observed;
      });
      const registerProof = vi.fn(async () => null);
      const claim = vi.fn(async () => null);
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
          ...currentBinding,
          deleted: false,
          allowlist: { ownerId: OWNER, admitted: true, expiresAt: START + 15_000 },
          authority: {
            ...currentBinding,
            fingerprint: authorityFingerprint,
            expiresAt: START + 20_000,
            revoked: false,
          },
          approval: {
            ...currentBinding,
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
      expect(registerCleanup).toHaveBeenCalledTimes(1);
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc.mock.calls[0]![0]).toBe(
        mode === "registration" ? "bfa_p5_v2_register_cleanup" : "bfa_p5_v2_read_cleanup",
      );
      const observed = await registerCleanup.mock.results[0]!.value;
      expect(observed).toMatchObject({ protocol: 2 });
      expect(Object.isFrozen(observed)).toBe(true);
      expect(lease?.snapshot().state).toBe("invalid");
      expect(registerProof).not.toHaveBeenCalled();
      expect(claim).not.toHaveBeenCalled();
      expect(inspect).not.toHaveBeenCalled();
      const owned = registerCleanup.mock.calls[0]![0];
      await lease?.close();
      expect(close).toHaveBeenCalledExactlyOnceWith(owned.cleanupId, owned.claim);
      expect(lease?.snapshot().state).toBe("closed");
      expect(rpc).toHaveBeenCalledTimes(1);
    },
  );
});
