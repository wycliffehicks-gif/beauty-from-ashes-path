// Independent bridge composition with real local crypto and RPC adapters.
// Auth and transport/state changes are fictional doubles, not SQL execution,
// HTTP fault injection, external revocation propagation or provider teardown.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationService } from "../service/service";
import { fingerprint, seal } from "../staging/seal.server";
import { createVoiceReadRpcPorts } from "../service/voice-read-rpc.server";
import { createVoiceRpcStore, type VoiceRpcName } from "../service/voice-rpc-store.server";
import {
  createVoiceStoreAdmission,
  type VoiceOperationProof,
  type VoiceStoreAdapterPorts,
} from "../service/voice-store-adapter.server";
import { createVoiceSessionRevokeRpcPorts } from "../service/voice-session-revoke-rpc.server";

const OWNER = "f1111111-1111-4111-8111-111111111111";
const THREAD = "f2222222-2222-4222-8222-222222222222";
const INCARNATION = "f3333333-3333-4333-8333-333333333333";
const ATTEMPT = "f4444444-4444-4444-8444-444444444444";
const APPROVAL = "f5555555-5555-4555-8555-555555555555";
const SESSION = "f6666666-6666-4666-8666-666666666666";
const OTHER = "f7777777-7777-4777-8777-777777777777";
const START = 1_793_500_000_000;
type Args = Readonly<Record<string, unknown>>;
const success = (data: unknown) => ({ data, error: null, status: 200 });

async function fixture() {
  const service = new ConversationService({ verifiedOwnerId: OWNER });
  service.ensureThread(THREAD, false);
  const token = await seal({
    owner: OWNER,
    thread: THREAD,
    revision: 4,
    expires: START + 20_000,
    authority: service.exportAuthority(THREAD),
  });
  const request = {
    threadId: THREAD,
    threadIncarnation: INCARNATION,
    threadRevision: 4,
    attemptId: ATTEMPT,
    activeAuthority: token,
  };
  const binding = {
    ownerId: OWNER,
    threadId: THREAD,
    threadIncarnation: INCARNATION,
    threadRevision: 4,
  };
  const current = {
    ...binding,
    deleted: false,
    allowlist: { ownerId: OWNER, admitted: true, expiresAt: START + 15_000 },
    authority: {
      ...binding,
      fingerprint: await fingerprint(token),
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
  };
  const fence = {
    ownerId: OWNER,
    sessionId: SESSION,
    version: 3,
    expiresAt: START + 25_000,
    revoked: false,
  };
  const state: {
    revokeReply: "ok" | "lost" | "wrong-session";
    exposeRevokedReceipt: boolean;
  } = { revokeReply: "ok", exposeRevokedReceipt: false };
  const revokeRpc = vi.fn(async (_name: string, args: Args) => {
    // Explicit transport double. Actual DB mutation semantics are tested in
    // the separate optional PostgreSQL suite, not established by this model.
    let receipt;
    if (args.p_owner_id === OWNER && args.p_session_id === SESSION) {
      if (!fence.revoked) fence.version = Math.min(Number.MAX_SAFE_INTEGER, fence.version + 1);
      fence.revoked = true;
      receipt = structuredClone(fence);
    } else {
      receipt = {
        ownerId: args.p_owner_id,
        sessionId: args.p_session_id,
        version: 0,
        expiresAt: 1,
        revoked: true,
      };
    }
    if (state.revokeReply === "lost") throw new Error("fictional committed reply lost");
    if (state.revokeReply === "wrong-session") receipt.sessionId = OTHER;
    return success(receipt);
  });
  const revocations = createVoiceSessionRevokeRpcPorts({ rpc: revokeRpc });
  const readRpc = vi.fn(async (name: string, _args: Args) => {
    if (name === "bfa_p5_voice_read_current") return success(structuredClone(current));
    return success(fence.revoked && !state.exposeRevokedReceipt ? null : structuredClone(fence));
  });
  const writes: { name: VoiceRpcName; args: Args }[] = [];
  const hooks: Partial<Record<VoiceRpcName, () => Promise<void>>> = {};
  const store = createVoiceRpcStore({
    async rpc(name, args) {
      writes.push({ name, args: structuredClone(args) });
      await hooks[name]?.();
      if (name === "bfa_p5_voice_register_cleanup")
        return success({ cleanupId: args.p_cleanup_id, claim: args.p_claim });
      if (name === "bfa_p5_voice_register_proof") {
        const proof = args.p_proof as VoiceOperationProof;
        return success({
          receiptId: proof.receiptId,
          operation: proof.operation,
          claim: proof.claim,
          expiresAt: proof.expiresAt,
          effectiveExpiresAt: proof.effectiveExpiresAt,
        });
      }
      return success({
        claim: args.p_claim,
        state: name === "bfa_p5_capacity_close" ? "closed" : "claimed",
      });
    },
  });
  const authenticate = vi.fn(async () => ({
    ownerId: OWNER,
    sessionId: SESSION,
    expiresAt: START + 30_000,
  }));
  const now = vi.fn(() => START);
  const ports: VoiceStoreAdapterPorts = {
    ...createVoiceReadRpcPorts({ rpc: readRpc }),
    ...store,
    authenticate,
    now,
    maxProofAgeMs: 100,
  };
  return {
    fence,
    state,
    revokeRpc,
    revocations,
    readRpc,
    writes,
    hooks,
    authenticate,
    now,
    request,
    bridge: createVoiceStoreAdmission(ports),
  };
}

describe("P5 session revocation independent bridge review", () => {
  beforeEach(() => {
    vi.stubEnv("BFA_P3B_STATE_SECRET", crypto.randomUUID());
    vi.spyOn(Date, "now").mockReturnValue(START);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("invalidates an active lease on terminal revocation even at an unchanged maximum version", async () => {
    const f = await fixture();
    f.fence.version = Number.MAX_SAFE_INTEGER;
    const lease = await f.bridge.admit(f.request);
    expect(lease?.snapshot().state).toBe("active");
    const writes = f.writes.length;
    const receipt = await f.revocations.revokeSession({ ownerId: OWNER, sessionId: SESSION });
    expect(receipt).toEqual({ ...f.fence, version: Number.MAX_SAFE_INTEGER, revoked: true });
    expect(await lease!.revalidate()).toBe(false);
    expect(lease?.snapshot().state).toBe("invalid");
    expect(f.writes).toHaveLength(writes);
    const reads = f.readRpc.mock.calls.length;
    const auths = f.authenticate.mock.calls.length;
    f.authenticate.mockRejectedValue(new Error("fictional Auth unavailable"));
    f.now.mockImplementation(() => {
      throw new Error("fictional clock unavailable");
    });
    await lease!.close();
    expect(f.writes.at(-1)).toEqual({ name: "bfa_p5_capacity_close", args: f.writes[0]!.args });
    expect(f.readRpc).toHaveBeenCalledTimes(reads);
    expect(f.authenticate).toHaveBeenCalledTimes(auths);
    expect(lease?.snapshot().state).toBe("closed");
  });

  it("rejects admission when revocation commits while a proof acknowledgment is pending", async () => {
    const f = await fixture();
    f.hooks.bfa_p5_voice_register_proof = async () => {
      await f.revocations.revokeSession({ ownerId: OWNER, sessionId: SESSION });
    };
    const lease = await f.bridge.admit(f.request);
    expect(lease?.snapshot().state).toBe("invalid");
    expect(f.writes.map(({ name }) => name)).toEqual([
      "bfa_p5_voice_register_cleanup",
      "bfa_p5_voice_register_proof",
    ]);
    expect(f.revokeRpc).toHaveBeenCalledTimes(1);
    await lease!.close();
    expect(f.writes.at(-1)).toEqual({ name: "bfa_p5_capacity_close", args: f.writes[0]!.args });
  });

  it("retains denial and exact cleanup after a committed revocation reply is lost", async () => {
    const f = await fixture();
    const lease = await f.bridge.admit(f.request);
    expect(lease?.snapshot().state).toBe("active");
    f.state.revokeReply = "lost";
    await expect(
      f.revocations.revokeSession({ ownerId: OWNER, sessionId: SESSION }),
    ).rejects.toThrow("voice-session-revoke-rpc-unavailable");
    expect(f.fence.revoked).toBe(true);
    expect(await lease!.revalidate()).toBe(false);
    await lease!.close();
    expect(f.revokeRpc).toHaveBeenCalledTimes(1);
    expect(f.writes.at(-1)?.args).toEqual(f.writes[0]!.args);
    expect(lease?.snapshot().state).toBe("closed");
  });

  it("does not turn a wrong-session acknowledgment into proof that the committed fence rolled back", async () => {
    const f = await fixture();
    const lease = await f.bridge.admit(f.request);
    f.state.revokeReply = "wrong-session";
    await expect(
      f.revocations.revokeSession({ ownerId: OWNER, sessionId: SESSION }),
    ).rejects.toThrow("voice-session-revoke-rpc-unavailable");
    expect(f.fence.revoked).toBe(true);
    expect(await lease!.revalidate()).toBe(false);
    await lease!.close();
    expect(f.revokeRpc).toHaveBeenCalledTimes(1);
    expect(f.writes.at(-1)?.args).toEqual(f.writes[0]!.args);
  });

  it("does not apply another exact session's revocation receipt to the current lease", async () => {
    const f = await fixture();
    const lease = await f.bridge.admit(f.request);
    const receipt = await f.revocations.revokeSession({ ownerId: OWNER, sessionId: OTHER });
    expect(receipt).toEqual({
      ownerId: OWNER,
      sessionId: OTHER,
      version: 0,
      expiresAt: 1,
      revoked: true,
    });
    expect(f.fence.revoked).toBe(false);
    expect(await lease!.revalidate()).toBe(true);
    expect(f.revokeRpc).toHaveBeenCalledWith("bfa_p5_voice_revoke_session", {
      p_owner_id: OWNER,
      p_session_id: OTHER,
    });
    await lease!.close();
  });

  it("rejects a valid terminal receipt if transport presents it as an active session read", async () => {
    const f = await fixture();
    await f.revocations.revokeSession({ ownerId: OWNER, sessionId: SESSION });
    f.state.exposeRevokedReceipt = true;
    expect(await f.bridge.admit(f.request)).toBeNull();
    expect(f.writes).toEqual([]);
    expect(f.revokeRpc).toHaveBeenCalledTimes(1);
    expect(f.readRpc).toHaveBeenCalledTimes(1);
  });
});
