// Independent protocol-boundary composition. The v2 adapter and existing v1
// initializer/issuer are actual code; Auth and transport are fictional. No SQL,
// remote Auth, provider operation or deployment compatibility is established.
import { describe, expect, it, vi } from "vitest";
import { ConversationService } from "../service/service";
import { createVoiceSessionInitializer } from "../service/voice-session-initializer.server";
import { createVoiceAuthorityIssuer } from "../service/voice-issuance.server";
import { createVoiceV2ParentIssuanceRpcPorts } from "../service/voice-v2-parent-issuance-rpc.server";

const OWNER = "d1111111-1111-4111-8111-111111111111";
const SESSION = "d2222222-2222-4222-8222-222222222222";
const THREAD = "d3333333-3333-4333-8333-333333333333";
const INCARNATION = "d4444444-4444-4444-8444-444444444444";
const START = 1_793_500_000_000;

async function fixture(revoked: boolean) {
  const rpc = vi.fn(async () => ({
    data: {
      protocol: 2,
      ownerId: OWNER,
      authSessionId: SESSION,
      parentVersion: revoked ? 1 : 0,
      revoked,
    },
    error: null,
    status: 200,
  }));
  const v2 = createVoiceV2ParentIssuanceRpcPorts({ rpc });
  const observation = await v2.readParent({ ownerId: OWNER, authSessionId: SESSION });
  expect(observation).toEqual({
    protocol: 2,
    ownerId: OWNER,
    authSessionId: SESSION,
    parentVersion: revoked ? 1 : 0,
    revoked,
  });
  expect(Object.isFrozen(observation)).toBe(true);
  expect(observation).not.toHaveProperty("expiresAt");
  const authenticate = vi.fn(async () => ({
    ownerId: OWNER,
    sessionId: SESSION,
    expiresAt: START + 60_000,
  }));
  const readSessionFence = vi.fn(async () => observation);
  const provisionSession = vi.fn(async () => null);
  const registerGeneration = vi.fn(async () => INCARNATION);
  const registerIssuance = vi.fn(async () => true);
  const readCurrentThread = vi.fn(async () => ({
    ownerId: OWNER,
    threadId: THREAD,
    threadRevision: 0,
    sourceCreatedAt: "2026-11-02T12:00:00.000Z",
    threadIncarnation: null,
    deleted: false,
    allowlist: { ownerId: OWNER, admitted: true, expiresAt: START + 60_000 },
  }));
  return {
    observation,
    rpc,
    authenticate,
    readSessionFence,
    provisionSession,
    registerGeneration,
    registerIssuance,
    readCurrentThread,
  };
}

describe("P5 v2 parent observations do not become v1 authority", () => {
  it.each([false, true])(
    "v1 initialization rejects a v2 fence with revoked=%s before writing",
    async (revoked) => {
      const f = await fixture(revoked);
      const initializer = createVoiceSessionInitializer({
        maxFenceAgeMs: 60_000,
        now: () => START,
        authenticate: f.authenticate,
        readSessionFence: f.readSessionFence,
        provisionSession: f.provisionSession,
      });
      expect(await initializer.initialize()).toBeNull();
      expect(f.readSessionFence).toHaveBeenCalledTimes(1);
      expect(f.provisionSession).not.toHaveBeenCalled();
      expect(initializer.snapshot()).toMatchObject({
        state: "unconfirmed",
        request: null,
        writeAttempted: false,
      });
      expect(await initializer.initialize()).toBeNull();
      expect(f.readSessionFence).toHaveBeenCalledTimes(1);
    },
  );

  it.each([false, true])(
    "v1 issuance rejects a v2 fence with revoked=%s before lifecycle registration",
    async (revoked) => {
      const f = await fixture(revoked);
      const service = new ConversationService({ verifiedOwnerId: OWNER });
      service.ensureThread(THREAD, false);
      const issuer = createVoiceAuthorityIssuer({
        maxAuthorityAgeMs: 60_000,
        now: () => START,
        authenticate: f.authenticate,
        readSessionFence: f.readSessionFence,
        readCurrentThread: f.readCurrentThread,
        registerGeneration: f.registerGeneration,
        registerIssuance: f.registerIssuance,
      });
      expect(
        await issuer.issue({
          service,
          threadId: THREAD,
          threadRevision: 0,
          sourceCreatedAt: "2026-11-02T12:00:00.000Z",
        }),
      ).toBeNull();
      expect(f.readSessionFence).toHaveBeenCalledTimes(1);
      expect(f.readCurrentThread).not.toHaveBeenCalled();
      expect(f.registerGeneration).not.toHaveBeenCalled();
      expect(f.registerIssuance).not.toHaveBeenCalled();
      expect(f.rpc).toHaveBeenCalledTimes(1);
    },
  );
});
