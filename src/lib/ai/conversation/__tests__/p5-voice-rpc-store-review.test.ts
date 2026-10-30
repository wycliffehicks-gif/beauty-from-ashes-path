import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createVoiceRpcStore,
  type VoiceRpcClient,
  type VoiceRpcName,
} from "../service/voice-rpc-store.server";
import {
  createVoiceStoreAdmission,
  type VoiceOperationProof,
  type VoiceStoreAdapterPorts,
} from "../service/voice-store-adapter.server";
import type { VoiceAdmissionClaim } from "../service/voice-admission.server";
import { ConversationService } from "../service/service";
import { fingerprint, seal } from "../staging/seal.server";

const OWNER = "a1111111-1111-4111-8111-111111111111";
const THREAD = "a2222222-2222-4222-8222-222222222222";
const INCARNATION = "a3333333-3333-4333-8333-333333333333";
const ATTEMPT = "a4444444-4444-4444-8444-444444444444";
const APPROVAL = "a5555555-5555-4555-8555-555555555555";
const SESSION = "a6666666-6666-4666-8666-666666666666";
const HANDLE = "a7777777-7777-4777-8777-777777777777";
const OTHER = "a8888888-8888-4888-8888-888888888888";
const START = 1_790_000_000_000;
type Args = Readonly<Record<string, unknown>>;
type RpcCall = { name: VoiceRpcName; args: Args };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function claim(claimId = HANDLE): VoiceAdmissionClaim {
  return {
    claimId,
    expiresAt: START + 10_000,
    binding: {
      ownerId: OWNER,
      threadId: THREAD,
      threadIncarnation: INCARNATION,
      threadRevision: 7,
      attemptId: ATTEMPT,
      approvalId: APPROVAL,
      approvalDigest: "b".repeat(64),
      scope: "developer-voice-session",
    },
  };
}

function success(data: unknown) {
  return { data, error: null, status: 200 };
}

function response(name: VoiceRpcName, args: Args) {
  if (name === "bfa_p5_voice_register_cleanup") {
    return success({ cleanupId: args.p_cleanup_id, claim: args.p_claim });
  }
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
}

async function fixture() {
  vi.spyOn(Date, "now").mockReturnValue(START);
  const service = new ConversationService({ verifiedOwnerId: OWNER });
  service.ensureThread(THREAD, false);
  const token = await seal({
    owner: OWNER,
    thread: THREAD,
    revision: 7,
    expires: START + 20_000,
    authority: service.exportAuthority(THREAD),
  });
  const request = {
    threadId: THREAD,
    threadIncarnation: INCARNATION,
    threadRevision: 7,
    attemptId: ATTEMPT,
    activeAuthority: token,
  };
  const binding = {
    ownerId: OWNER,
    threadId: THREAD,
    threadIncarnation: INCARNATION,
    threadRevision: 7,
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
  const hooks: Partial<Record<VoiceRpcName, (args: Args) => Promise<unknown>>> = {};
  const calls: RpcCall[] = [];
  // Fictional transport acknowledgments and deliberately discarded replies.
  // This fixture is not a database, durable ledger, HTTP or provider test.
  const rpc = vi.fn(async (name: VoiceRpcName, args: Args): Promise<unknown> => {
    calls.push({ name, args: structuredClone(args) });
    const hook = hooks[name];
    return hook ? hook(args) : response(name, args);
  });
  const ports: VoiceStoreAdapterPorts = {
    ...createVoiceRpcStore({ rpc }),
    now: vi.fn(() => START),
    maxProofAgeMs: 100,
    authenticate: vi.fn(async () => ({
      ownerId: OWNER,
      sessionId: SESSION,
      expiresAt: START + 30_000,
    })),
    readSessionFence: vi.fn(async () => ({
      ownerId: OWNER,
      sessionId: SESSION,
      version: 4,
      expiresAt: START + 25_000,
      revoked: false,
    })),
    readCurrent: vi.fn(async () => structuredClone(current)),
  };
  return { ports, calls, hooks, rpc, request, bridge: createVoiceStoreAdmission(ports) };
}

describe("P5 RPC adapter independent uncertainty and identity review", () => {
  beforeEach(() => vi.stubEnv("BFA_P3B_STATE_SECRET", crypto.randomUUID()));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("retains exact cleanup after a modeled committed registration reply is lost", async () => {
    const h = await fixture();
    let registered: Args | undefined;
    h.hooks.bfa_p5_voice_register_cleanup = async (args) => {
      registered = structuredClone(args);
      throw new Error("fictional committed registration; reply lost");
    };
    const lease = await h.bridge.admit(h.request);
    expect(lease?.snapshot().state).toBe("invalid");
    expect(h.calls.map((call) => call.name)).toEqual(["bfa_p5_voice_register_cleanup"]);
    expect(await lease?.revalidate()).toBe(false);
    await lease!.close();
    expect(h.calls[1]).toEqual({ name: "bfa_p5_capacity_close", args: registered });
    expect(lease?.snapshot().state).toBe("closed");
  });

  it("never reissues a possibly committed combined claim and can close after Auth and clock failure", async () => {
    const h = await fixture();
    let committed: VoiceAdmissionClaim | undefined;
    h.hooks.bfa_p5_capacity_claim = async (args) => {
      committed = structuredClone(args.p_claim as VoiceAdmissionClaim);
      throw new Error("fictional mutation committed; response disappeared");
    };
    const lease = await h.bridge.admit(h.request);
    expect(lease?.snapshot().state).toBe("invalid");
    expect(lease?.snapshot().claim).toEqual(committed);
    expect(await lease?.revalidate()).toBe(false);
    const before = h.calls.length;
    const authCalls = vi.mocked(h.ports.authenticate).mock.calls.length;
    vi.mocked(h.ports.authenticate).mockRejectedValue(new Error("revoked"));
    vi.mocked(h.ports.now).mockImplementation(() => {
      throw new Error("clock unavailable");
    });
    await lease!.close();
    expect(h.calls.slice(before)).toEqual([
      {
        name: "bfa_p5_capacity_close",
        args: {
          p_cleanup_id: h.calls[0]!.args.p_cleanup_id,
          p_claim: committed,
        },
      },
    ]);
    expect(h.calls.filter((call) => call.name === "bfa_p5_capacity_claim")).toHaveLength(1);
    expect(h.calls.some((call) => call.name === "bfa_p5_voice_inspect")).toBe(false);
    expect(h.ports.authenticate).toHaveBeenCalledTimes(authCalls);
  });

  it("explicit proof null denies without retry, fallback or abandoning cleanup", async () => {
    const h = await fixture();
    h.hooks.bfa_p5_voice_register_proof = async () => success(null);
    const lease = await h.bridge.admit(h.request);
    expect(lease?.snapshot().state).toBe("invalid");
    expect(h.calls.map((call) => call.name)).toEqual([
      "bfa_p5_voice_register_cleanup",
      "bfa_p5_voice_register_proof",
    ]);
    await lease!.close();
    expect(h.calls.at(-1)!.name).toBe("bfa_p5_capacity_close");
    expect(h.calls.at(-1)!.args).toEqual(h.calls[0]!.args);
  });

  it("a changed winner identity cannot replace the bridge's retained cleanup claim", async () => {
    const h = await fixture();
    h.hooks.bfa_p5_capacity_claim = async (args) =>
      success({
        claim: { ...(args.p_claim as VoiceAdmissionClaim), claimId: OTHER },
        state: "replayed",
      });
    const lease = await h.bridge.admit(h.request);
    expect(lease?.snapshot().state).toBe("invalid");
    await lease!.close();
    const cleanup = h.calls.at(-1)!;
    expect(cleanup.args).toEqual(h.calls[0]!.args);
    expect((cleanup.args.p_claim as VoiceAdmissionClaim).claimId).not.toBe(OTHER);
    expect(h.calls.filter((call) => call.name === "bfa_p5_capacity_claim")).toHaveLength(1);
  });

  it("wrong close acknowledgment stays unconfirmed; deliberate retry uses the same exact ownership", async () => {
    const h = await fixture();
    const lease = await h.bridge.admit(h.request);
    expect(lease?.snapshot().state).toBe("active");
    const initial = h.calls.length;
    h.hooks.bfa_p5_capacity_close = async (args) => {
      delete h.hooks.bfa_p5_capacity_close;
      return success({
        claim: { ...(args.p_claim as VoiceAdmissionClaim), expiresAt: START + 9999 },
        state: "closed",
      });
    };
    await expect(lease!.close()).rejects.toThrow("voice-admission-close-unconfirmed");
    expect(lease?.snapshot().state).toBe("close-unconfirmed");
    expect(await lease!.revalidate()).toBe(false);
    await lease!.close();
    expect(lease?.snapshot().state).toBe("closed");
    expect(h.calls.slice(initial).map((call) => call.name)).toEqual([
      "bfa_p5_capacity_close",
      "bfa_p5_capacity_close",
    ]);
    expect(h.calls[initial]!.args).toEqual(h.calls[initial + 1]!.args);
  });

  it("late inspected eligibility cannot revive a lease whose capacity cleanup already acknowledged", async () => {
    const h = await fixture();
    const lease = await h.bridge.admit(h.request);
    const pending = deferred<unknown>();
    let inspected: Args | undefined;
    h.hooks.bfa_p5_voice_inspect = async (args) => {
      inspected = args;
      return pending.promise;
    };
    const checking = lease!.revalidate();
    await vi.waitFor(() => expect(inspected).toBeDefined());
    await lease!.close();
    pending.resolve(response("bfa_p5_voice_inspect", inspected!));
    expect(await checking).toBe(false);
    expect(lease?.snapshot().state).toBe("closed");
    expect(h.calls.filter((call) => call.name === "bfa_p5_capacity_claim")).toHaveLength(1);
  });

  it("overlapping calls reject swapped claims independently without a shared last-call identity", async () => {
    const first = claim();
    const second = { ...claim(OTHER), binding: { ...claim().binding, attemptId: OTHER } };
    const a = deferred<unknown>();
    const b = deferred<unknown>();
    const rpc = vi.fn(async (_name: VoiceRpcName, args: Args) =>
      (args.p_claim as VoiceAdmissionClaim).claimId === first.claimId ? a.promise : b.promise,
    );
    const store = createVoiceRpcStore({ rpc });
    const firstResult = store.claim(HANDLE, first).catch((error: unknown) => error);
    const secondResult = store.claim(OTHER, second).catch((error: unknown) => error);
    b.resolve(success({ claim: first, state: "claimed" }));
    a.resolve(success({ claim: second, state: "claimed" }));
    for (const result of await Promise.all([firstResult, secondResult])) {
      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toBe("voice-rpc-unavailable");
    }
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("captures original nested input before waiting and returns no shared response references", async () => {
    const input = { ...claim(), binding: { ...claim().binding } };
    const original = structuredClone(input);
    const pending = deferred<unknown>();
    const rpc = vi.fn(async () => pending.promise);
    const store = createVoiceRpcStore({ rpc });
    const checking = store.inspect(HANDLE, input);
    input.binding.threadRevision = 99;
    input.expiresAt += 1000;
    const data = { claim: structuredClone(original), state: "claimed" };
    pending.resolve(success(data));
    const result = (await checking) as { claim: VoiceAdmissionClaim; state: string };
    data.claim.binding.threadRevision = 100;
    expect(result).toEqual({ claim: original, state: "claimed" });
    expect(Object.isFrozen(result.claim.binding)).toBe(true);
    expect(result.claim).not.toBe(data.claim);
    expect(result.claim).not.toBe(input);
  });

  it("missing capacity RPC cannot silently fall back to the base-only claim", async () => {
    const rpc = vi.fn(async (_name: VoiceRpcName, _args: Args) => ({
      data: { claim: claim(), state: "claimed" },
      error: { code: "PGRST202", message: "fictional service key and SQL details" },
      status: 404,
    }));
    const store = createVoiceRpcStore({ rpc });
    const error = await store.claim(HANDLE, claim()).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("voice-rpc-unavailable");
    expect((error as Error).cause).toBeUndefined();
    expect((error as Error).stack).not.toContain("fictional service key");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]![0]).toBe("bfa_p5_capacity_claim");
  });

  it("keeps the server client's method binding and refuses inherited success envelope fields", async () => {
    const client = {
      calls: [] as RpcCall[],
      async rpc(name: VoiceRpcName, args: Args) {
        this.calls.push({ name, args });
        return Object.create(response(name, args)) as unknown;
      },
    } satisfies VoiceRpcClient & { calls: RpcCall[] };
    await expect(createVoiceRpcStore(client).close(HANDLE, claim())).rejects.toThrow(
      "voice-rpc-unavailable",
    );
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]!.name).toBe("bfa_p5_capacity_close");
  });
});
