// Independent mixed-protocol composition. The v2 metadata adapter, existing v1
// issuer and service are actual code. Auth, clock and transport are fictional;
// this establishes neither live authentication nor a complete v2 issuance path.
import { describe, expect, it, vi } from "vitest";
import { ConversationService } from "../service/service";
import { createVoiceAuthorityIssuer } from "../service/voice-issuance.server";
import { createVoiceV2PreissueRpcPorts } from "../service/voice-v2-preissue-rpc.server";

const OWNER = "e1111111-1111-4111-8111-111111111111";
const SESSION = "e2222222-2222-4222-8222-222222222222";
const THREAD = "e3333333-3333-4333-8333-333333333333";
const INCARNATION = "e4444444-4444-4444-8444-444444444444";
const START = 1_793_500_000_000;
const CREATED = "2026-11-03T12:00:00.123456Z";

describe("P5 v2 pre-issuance observations cannot bypass v1 protocol boundaries", () => {
  it.each([null, INCARNATION])(
    "v1 issuer rejects a v2 current-thread receipt with incarnation=%s before writes",
    async (threadIncarnation) => {
      const rpc = vi.fn(async () => ({
        data: {
          protocol: 2,
          ownerId: OWNER,
          authSessionId: SESSION,
          parentVersion: 0,
          threadId: THREAD,
          threadRevision: 0,
          sourceCreatedAt: CREATED,
          threadIncarnation,
          deleted: false,
          allowlist: { ownerId: OWNER, admitted: true, expiresAt: START + 60_000 },
        },
        error: null,
        status: 200,
      }));
      const v2 = createVoiceV2PreissueRpcPorts({ rpc });
      const observation = await v2.readCurrentThread({
        ownerId: OWNER,
        authSessionId: SESSION,
        parentVersion: 0,
        threadId: THREAD,
        verifiedAt: START,
        authExpiresAt: START + 60_000,
      });
      expect(observation).toMatchObject({ protocol: 2, sourceCreatedAt: CREATED });
      expect(Object.isFrozen(observation)).toBe(true);
      expect(Object.isFrozen(observation!.allowlist)).toBe(true);

      const service = new ConversationService({ verifiedOwnerId: OWNER });
      service.ensureThread(THREAD, false);
      const authenticate = vi.fn(async () => ({
        ownerId: OWNER,
        sessionId: SESSION,
        expiresAt: START + 60_000,
      }));
      const readSessionFence = vi.fn(async () => ({
        ownerId: OWNER,
        sessionId: SESSION,
        version: 0,
        expiresAt: START + 60_000,
        revoked: false,
      }));
      const readCurrentThread = vi.fn(async () => observation);
      const registerGeneration = vi.fn(async () => INCARNATION);
      const registerIssuance = vi.fn(async () => true);
      const issuer = createVoiceAuthorityIssuer({
        maxAuthorityAgeMs: 60_000,
        now: () => START,
        authenticate,
        readSessionFence,
        readCurrentThread,
        registerGeneration,
        registerIssuance,
      });
      expect(
        await issuer.issue({
          service,
          threadId: THREAD,
          threadRevision: 0,
          sourceCreatedAt: CREATED,
        }),
      ).toBeNull();
      expect(authenticate).toHaveBeenCalledTimes(1);
      expect(readSessionFence).toHaveBeenCalledTimes(1);
      expect(readCurrentThread).toHaveBeenCalledTimes(1);
      expect(registerGeneration).not.toHaveBeenCalled();
      expect(registerIssuance).not.toHaveBeenCalled();
      expect(rpc).toHaveBeenCalledTimes(1);
    },
  );
});
