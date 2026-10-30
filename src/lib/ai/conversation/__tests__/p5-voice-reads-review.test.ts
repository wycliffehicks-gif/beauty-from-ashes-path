// Independent real-bridge checks with local crypto and fictional Auth/RPC.
// These are not production Auth, HTTP, SQL or provider acceptance.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVoiceReadRpcPorts, type VoiceReadRpcName } from "../service/voice-read-rpc.server";
import { createVoiceRpcStore, type VoiceRpcName } from "../service/voice-rpc-store.server";
import {
  createVoiceStoreAdmission,
  type VoiceOperationProof,
  type VoiceStoreAdapterPorts,
} from "../service/voice-store-adapter.server";
import { ConversationService } from "../service/service";
import { fingerprint, seal } from "../staging/seal.server";

const OWNER = "c1111111-1111-4111-8111-111111111111";
const THREAD = "c2222222-2222-4222-8222-222222222222";
const INCARNATION = "c3333333-3333-4333-8333-333333333333";
const ATTEMPT = "c4444444-4444-4444-8444-444444444444";
const APPROVAL = "c5555555-5555-4555-8555-555555555555";
const SESSION = "c6666666-6666-4666-8666-666666666666";
const OTHER = "c7777777-7777-4777-8777-777777777777";
const START = 1_790_000_000_000;
type Args = Readonly<Record<string, unknown>>;

function success(data: unknown) {
  return { data, error: null, status: 200 };
}
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
  const readHooks: Partial<Record<VoiceReadRpcName, () => Promise<unknown>>> = {};
  const writeHooks: Partial<Record<VoiceRpcName, (args: Args) => Promise<void>>> = {};
  const readCalls: { name: VoiceReadRpcName; args: Args }[] = [];
  const writeCalls: { name: VoiceRpcName; args: Args }[] = [];
  const reads = createVoiceReadRpcPorts({
    async rpc(name, args) {
      readCalls.push({ name, args: structuredClone(args) });
      const hook = readHooks[name];
      if (hook) return hook();
      return success(structuredClone(name === "bfa_p5_voice_read_current" ? current : fence));
    },
  });
  const writes = createVoiceRpcStore({
    async rpc(name, args) {
      writeCalls.push({ name, args: structuredClone(args) });
      await writeHooks[name]?.(args);
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
  const ports: VoiceStoreAdapterPorts = {
    ...reads,
    ...writes,
    authenticate,
    now: vi.fn(() => START),
    maxProofAgeMs: 100,
  };
  return {
    ports,
    current,
    fence,
    authenticate,
    readHooks,
    writeHooks,
    readCalls,
    writeCalls,
    request,
    bridge: createVoiceStoreAdmission(ports),
  };
}

describe("P5 protected readers independent bridge review", () => {
  beforeEach(() => vi.stubEnv("BFA_P3B_STATE_SECRET", crypto.randomUUID()));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("composes both exact read mappings with actual crypto and reads afresh on revalidation", async () => {
    const f = await fixture();
    const lease = await f.bridge.admit(f.request);
    expect(lease?.snapshot().state).toBe("active");
    const first = f.readCalls.length;
    expect(await lease!.revalidate()).toBe(true);
    expect(f.readCalls.length).toBeGreaterThan(first);
    const fences = f.readCalls.filter((c) => c.name === "bfa_p5_voice_read_session_fence");
    expect(fences).toHaveLength(f.authenticate.mock.calls.length);
    expect(
      fences.every((c) => c.args.p_owner_id === OWNER && c.args.p_session_id === SESSION),
    ).toBe(true);
    const currents = f.readCalls.filter((c) => c.name === "bfa_p5_voice_read_current");
    expect(currents.length).toBeGreaterThan(2);
    expect(
      currents.every(
        (c) =>
          c.args.p_owner_id === OWNER &&
          c.args.p_thread_id === THREAD &&
          c.args.p_attempt_id === ATTEMPT &&
          c.args.p_authority_fingerprint === f.current.authority.fingerprint,
      ),
    ).toBe(true);
    expect(f.writeCalls.filter((c) => c.name === "bfa_p5_capacity_claim")).toHaveLength(1);
    expect(f.writeCalls.some((c) => c.name === "bfa_p5_voice_inspect")).toBe(true);
    await lease!.close();
  });

  it("does not provision or acquire anything when the initial protected session row is absent", async () => {
    const f = await fixture();
    f.readHooks.bfa_p5_voice_read_session_fence = async () => success(null);
    expect(await f.bridge.admit(f.request)).toBeNull();
    expect(f.readCalls.map((c) => c.name)).toEqual(["bfa_p5_voice_read_session_fence"]);
    expect(f.writeCalls).toEqual([]);
  });

  it("rejects an internally consistent other incarnation against the original sealed request", async () => {
    const f = await fixture();
    f.current.threadIncarnation = OTHER;
    f.current.authority.threadIncarnation = OTHER;
    f.current.approval.threadIncarnation = OTHER;
    expect(await f.bridge.admit(f.request)).toBeNull();
    expect(f.readCalls.some((c) => c.name === "bfa_p5_voice_read_current")).toBe(true);
    expect(f.writeCalls).toEqual([]);
  });

  it("retains exact cleanup when a current-record denial appears after proof registration", async () => {
    const f = await fixture();
    f.writeHooks.bfa_p5_voice_register_proof = async () => {
      f.readHooks.bfa_p5_voice_read_current = async () => success(null);
    };
    const lease = await f.bridge.admit(f.request);
    expect(lease?.snapshot().state).toBe("invalid");
    expect(f.writeCalls.map((c) => c.name)).toEqual([
      "bfa_p5_voice_register_cleanup",
      "bfa_p5_voice_register_proof",
    ]);
    const reads = f.readCalls.length;
    const auths = f.authenticate.mock.calls.length;
    await lease!.close();
    expect(f.writeCalls.at(-1)).toEqual({
      name: "bfa_p5_capacity_close",
      args: f.writeCalls[0]!.args,
    });
    expect(f.readCalls).toHaveLength(reads);
    expect(f.authenticate).toHaveBeenCalledTimes(auths);
  });

  it("invalidates an active lease when a later fresh session fence changes version", async () => {
    const f = await fixture();
    const lease = await f.bridge.admit(f.request);
    expect(lease?.snapshot().state).toBe("active");
    const writes = f.writeCalls.length;
    f.fence.version += 1;
    expect(await lease!.revalidate()).toBe(false);
    expect(lease?.snapshot().state).toBe("invalid");
    expect(f.writeCalls).toHaveLength(writes);
    await lease!.close();
    expect(f.writeCalls.at(-1)?.args).toEqual(f.writeCalls[0]!.args);
  });

  it("denies a shortened current deadline after proof issuance without retrying a claim", async () => {
    const f = await fixture();
    f.writeHooks.bfa_p5_voice_register_proof = async () => {
      f.current.approval.expiresAt = START + 5_000;
    };
    const lease = await f.bridge.admit(f.request);
    expect(lease?.snapshot().state).toBe("invalid");
    expect(f.writeCalls.filter((c) => c.name === "bfa_p5_voice_register_proof")).toHaveLength(1);
    expect(f.writeCalls.some((c) => c.name === "bfa_p5_capacity_claim")).toBe(false);
    await lease!.close();
    expect(f.writeCalls.at(-1)?.args).toEqual(f.writeCalls[0]!.args);
  });

  it("keeps cleanup reachable after a read transport throws, even if Auth then fails", async () => {
    const f = await fixture();
    f.writeHooks.bfa_p5_voice_register_cleanup = async () => {
      f.readHooks.bfa_p5_voice_read_session_fence = async () => {
        throw new Error("fictional read lost; private body must not escape");
      };
    };
    const lease = await f.bridge.admit(f.request);
    expect(lease?.snapshot().state).toBe("invalid");
    expect(f.writeCalls).toHaveLength(1);
    f.authenticate.mockRejectedValue(new Error("fictional Auth revoked"));
    await lease!.close();
    expect(f.writeCalls.at(-1)).toEqual({
      name: "bfa_p5_capacity_close",
      args: f.writeCalls[0]!.args,
    });
    expect(lease?.snapshot().state).toBe("closed");
  });
});
