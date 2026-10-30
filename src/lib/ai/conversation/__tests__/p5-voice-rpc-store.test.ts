import { describe, expect, it, vi } from "vitest";
import type { VoiceAdmissionClaim } from "../service/voice-admission.server";
import type { VoiceOperationProof } from "../service/voice-store-adapter.server";
import {
  createVoiceRpcStore,
  type VoiceRpcClient,
  type VoiceRpcName,
} from "../service/voice-rpc-store.server";

const OWNER = "11111111-1111-4111-8111-111111111111";
const THREAD = "22222222-2222-4222-8222-222222222222";
const INCARNATION = "33333333-3333-4333-8333-333333333333";
const ATTEMPT = "44444444-4444-4444-8444-444444444444";
const APPROVAL = "55555555-5555-4555-8555-555555555555";
const SESSION = "66666666-6666-4666-8666-666666666666";
const CLAIM = "77777777-7777-4777-8777-777777777777";
const CLEANUP = "88888888-8888-4888-8888-888888888888";
const RECEIPT = "99999999-9999-4999-8999-999999999999";
const OTHER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const START = 1_790_000_000_000;

function claim(): VoiceAdmissionClaim {
  return {
    claimId: CLAIM,
    expiresAt: START + 20_000,
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
function proof(): VoiceOperationProof {
  return {
    receiptId: RECEIPT,
    operation: "claim",
    claim: claim(),
    cleanupId: CLEANUP,
    ownerSessionId: SESSION,
    sessionVersion: 2,
    authorityFingerprint: "c".repeat(64),
    identityExpiresAt: START + 40_000,
    verifiedAt: START,
    expiresAt: START + 1_000,
    effectiveExpiresAt: START + 10_000,
  };
}
function proofAck(p: VoiceOperationProof) {
  return {
    receiptId: p.receiptId,
    operation: p.operation,
    claim: p.claim,
    expiresAt: p.expiresAt,
    effectiveExpiresAt: p.effectiveExpiresAt,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function fixture() {
  // Explicit fictional transport. This implements no database transaction,
  // service-role authentication, remote HTTP request or provider operation.
  const rpc = vi.fn(async (name: VoiceRpcName, args: Readonly<Record<string, unknown>>) => {
    const data =
      name === "bfa_p5_voice_register_cleanup"
        ? { cleanupId: args.p_cleanup_id, claim: args.p_claim }
        : name === "bfa_p5_voice_register_proof"
          ? proofAck(args.p_proof as VoiceOperationProof)
          : { claim: args.p_claim, state: name === "bfa_p5_capacity_close" ? "closed" : "claimed" };
    return { data, error: null, status: 200, statusText: "OK" };
  });
  return { rpc, store: createVoiceRpcStore({ rpc }) };
}
const reject = (promise: Promise<unknown>) =>
  expect(promise).rejects.toThrow("voice-rpc-unavailable");

describe("P5 inactive exact RPC transport mapping", () => {
  it("constructs only five ports without invoking a client or creating capabilities", () => {
    const h = fixture();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(Object.keys(h.store).sort()).toEqual([
      "claim",
      "close",
      "inspect",
      "registerCleanup",
      "registerProof",
    ]);
    expect(Object.isFrozen(h.store)).toBe(true);
  });

  it("maps exact cleanup/proof and combined capacity admission with no base-only claim", async () => {
    const h = fixture();
    const p = proof();
    await h.store.registerCleanup({ cleanupId: CLEANUP, claim: p.claim });
    await h.store.registerProof(p);
    await h.store.claim(RECEIPT, p.claim);
    await h.store.inspect(RECEIPT, p.claim);
    await h.store.close(CLEANUP, p.claim);
    expect(h.rpc.mock.calls).toEqual([
      ["bfa_p5_voice_register_cleanup", { p_cleanup_id: CLEANUP, p_claim: p.claim }],
      ["bfa_p5_voice_register_proof", { p_proof: p }],
      ["bfa_p5_capacity_claim", { p_receipt_id: RECEIPT, p_claim: p.claim }],
      ["bfa_p5_voice_inspect", { p_receipt_id: RECEIPT, p_claim: p.claim }],
      ["bfa_p5_capacity_close", { p_cleanup_id: CLEANUP, p_claim: p.claim }],
    ]);
  });

  it("does not retry or fall back when the combined capacity RPC is unavailable", async () => {
    const h = fixture();
    h.rpc.mockRejectedValueOnce(new Error("42883 private SQL fixture failure"));
    await reject(h.store.claim(RECEIPT, claim()));
    expect(h.rpc).toHaveBeenCalledTimes(1);
    expect(h.rpc.mock.calls[0][0]).toBe("bfa_p5_capacity_claim");
  });

  it("sanitizes invalid client construction and thrown getter errors", () => {
    for (const client of [
      null,
      {},
      { rpc: 1 },
      {
        get rpc() {
          throw new Error("SYNTHETIC_PRIVATE");
        },
      },
    ]) {
      expect(() => createVoiceRpcStore(client as unknown as VoiceRpcClient)).toThrow(
        "voice-rpc-unavailable",
      );
    }
  });

  it("validates malformed claims and handles before invoking the transport", async () => {
    const h = fixture();
    const c = claim();
    for (const invalid of [
      null,
      { ...c, claimId: OTHER.toUpperCase() },
      { ...c, expiresAt: "1" },
      { ...c, expiresAt: 0 },
      { ...c, expiresAt: Number.MAX_SAFE_INTEGER + 1 },
      { ...c, binding: { ...c.binding, threadRevision: 1.5 } },
      { ...c, binding: { ...c.binding, scope: "text-evaluation" } },
      { ...c, binding: { ...c.binding, owner: OWNER } },
      { ...c, transcript: "excluded" },
    ]) {
      await reject(h.store.claim(RECEIPT, invalid as VoiceAdmissionClaim));
    }
    for (const invalid of [undefined, "", OTHER.toUpperCase(), 123]) {
      await reject(h.store.close(invalid as string, c));
    }
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("validates cleanup shape rather than stripping untrusted extra fields", async () => {
    const h = fixture();
    await reject(
      h.store.registerCleanup({ cleanupId: CLEANUP, claim: claim(), ownerId: OWNER } as never),
    );
    await reject(h.store.registerCleanup({ cleanupId: null, claim: claim() } as never));
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("rejects inherited authority fields and non-JSON extra keys before transport", async () => {
    const h = fixture();
    const c = claim();
    for (const invalid of [
      Object.create(c),
      { ...c, binding: Object.create(c.binding) },
      { ...c, [Symbol("extra")]: "excluded" },
    ]) {
      await reject(h.store.claim(RECEIPT, invalid as VoiceAdmissionClaim));
    }
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("rejects inherited or extra nested response fields instead of treating them as acknowledgment", async () => {
    const c = claim();
    for (const data of [
      Object.create({ claim: c, state: "claimed" }),
      { claim: Object.create(c), state: "claimed" },
      { claim: { ...c, binding: Object.create(c.binding) }, state: "claimed" },
      { claim: c, state: "claimed", [Symbol("extra")]: "excluded" },
    ]) {
      const rpc = vi.fn(async () => ({ data, error: null }));
      await reject(createVoiceRpcStore({ rpc }).claim(RECEIPT, c));
      expect(rpc).toHaveBeenCalledTimes(1);
    }
  });

  it("checks the proof wire contract and lifetime inequalities before transport", async () => {
    const h = fixture();
    const p = proof();
    for (const invalid of [
      { ...p, operation: "close" },
      { ...p, authorityFingerprint: "x".repeat(64) },
      { ...p, verifiedAt: -1 },
      { ...p, sessionVersion: Number.MAX_SAFE_INTEGER + 1 },
      { ...p, expiresAt: p.verifiedAt },
      {
        ...p,
        expiresAt: START + 30_001,
        effectiveExpiresAt: START + 40_000,
        claim: { ...p.claim, expiresAt: START + 40_000 },
      },
      { ...p, effectiveExpiresAt: p.claim.expiresAt + 1 },
      { ...p, identityExpiresAt: p.effectiveExpiresAt - 1 },
      { ...p, expiresAt: p.effectiveExpiresAt + 1 },
      { ...p, providerKey: "excluded" },
    ]) {
      await reject(h.store.registerProof(invalid as VoiceOperationProof));
    }
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("detaches and freezes the proof and claim before awaiting a response", async () => {
    const wait = deferred<unknown>();
    const rpc = vi.fn(
      (_name: VoiceRpcName, _args: Readonly<Record<string, unknown>>) => wait.promise,
    );
    const store = createVoiceRpcStore({ rpc });
    const p = proof();
    const original = structuredClone(p);
    const pending = store.registerProof(p);
    const args = rpc.mock.calls[0]![1] as Readonly<Record<string, unknown>>;
    const sent = args.p_proof as VoiceOperationProof;
    expect(Object.isFrozen(args)).toBe(true);
    expect(Object.isFrozen(sent)).toBe(true);
    expect(Object.isFrozen(sent.claim)).toBe(true);
    expect(Object.isFrozen(sent.claim.binding)).toBe(true);
    Object.assign(p, { receiptId: OTHER });
    Object.assign(p.claim.binding, { ownerId: OTHER });
    wait.resolve({ data: proofAck(original), error: null });
    expect(await pending).toEqual(proofAck(original));
    expect(sent).toEqual(original);
  });

  it("copies admission identity before the caller mutates an outstanding request", async () => {
    const wait = deferred<unknown>();
    const rpc = vi.fn(() => wait.promise);
    const store = createVoiceRpcStore({ rpc });
    const c = claim();
    const original = structuredClone(c);
    const pending = store.claim(RECEIPT, c);
    Object.assign(c, { claimId: OTHER, expiresAt: c.expiresAt + 1 });
    Object.assign(c.binding, { attemptId: OTHER });
    wait.resolve({ data: { claim: original, state: "claimed" }, error: null });
    expect(await pending).toEqual({ claim: original, state: "claimed" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("isolates concurrent claim responses even when they settle in reverse order", async () => {
    const a = deferred<unknown>();
    const b = deferred<unknown>();
    const rpc = vi.fn().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const store = createVoiceRpcStore({ rpc });
    const first = claim();
    const second = { ...claim(), claimId: OTHER, binding: { ...claim().binding, ownerId: OTHER } };
    const pa = store.claim(RECEIPT, first);
    const pb = store.claim(OTHER, second);
    b.resolve({ data: { claim: second, state: "denied" }, error: null });
    expect(await pb).toEqual({ claim: second, state: "denied" });
    a.resolve({ data: { claim: first, state: "claimed" }, error: null });
    expect(await pa).toEqual({ claim: first, state: "claimed" });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("rejects missing or contradictory response envelopes instead of inferring success", async () => {
    const good = { claim: claim(), state: "claimed" };
    for (const raw of [
      null,
      undefined,
      [good],
      JSON.stringify(good),
      { data: good },
      { error: null },
      { data: good, error: undefined },
      { data: good, error: false },
      { data: good, error: { message: "private" } },
      Object.create({ data: good, error: null }),
      { data: good, error: null, status: 500 },
      { data: good, error: null, status: "200" },
    ]) {
      const rpc = vi.fn(async () => raw);
      await reject(createVoiceRpcStore({ rpc }).claim(RECEIPT, claim()));
      expect(rpc).toHaveBeenCalledTimes(1);
    }
  });

  it("requires exact claim acknowledgment identity and SQL states", async () => {
    const c = claim();
    for (const data of [
      null,
      { claim: c },
      { claim: { ...c, claimId: OTHER }, state: "claimed" },
      { claim: { ...c, expiresAt: c.expiresAt + 1 }, state: "claimed" },
      { claim: { ...c, binding: { ...c.binding, threadIncarnation: OTHER } }, state: "claimed" },
      { claim: c, state: "claimed", permitted: true },
      { claim: c, state: "uncertain" },
      { claim: c, state: "marked" },
    ]) {
      await reject(
        createVoiceRpcStore({ rpc: vi.fn(async () => ({ data, error: null })) }).inspect(
          RECEIPT,
          c,
        ),
      );
    }
  });

  it("preserves exact SQL denials/replays/closure without retrying or creating another hold", async () => {
    for (const state of ["denied", "replayed", "closed"]) {
      const rpc = vi.fn(async () => ({ data: { claim: claim(), state }, error: null }));
      expect(await createVoiceRpcStore({ rpc }).claim(RECEIPT, claim())).toEqual({
        claim: claim(),
        state,
      });
      expect(rpc).toHaveBeenCalledTimes(1);
    }
  });

  it("requires exact closed state for capacity cleanup", async () => {
    const rpc = vi.fn(async () => ({ data: { claim: claim(), state: "claimed" }, error: null }));
    await reject(createVoiceRpcStore({ rpc }).close(CLEANUP, claim()));
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("treats explicit null proof as a committed semantic denial without retry", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null, status: 200 }));
    expect(await createVoiceRpcStore({ rpc }).registerProof(proof())).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects proof acknowledgments that rebind or extend any exact lifetime", async () => {
    const p = proof();
    for (const data of [
      { ...proofAck(p), receiptId: OTHER },
      { ...proofAck(p), operation: "inspect" },
      { ...proofAck(p), expiresAt: p.expiresAt + 1 },
      { ...proofAck(p), effectiveExpiresAt: p.effectiveExpiresAt - 1 },
      { ...proofAck(p), claim: { ...p.claim, binding: { ...p.claim.binding, approvalId: OTHER } } },
      { ...proofAck(p), cleanupId: CLEANUP },
    ]) {
      const rpc = vi.fn(async () => ({ data, error: null }));
      await reject(createVoiceRpcStore({ rpc }).registerProof(p));
      expect(rpc).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects cleanup acknowledgments for a different handle or with extra data", async () => {
    const registration = { cleanupId: CLEANUP, claim: claim() };
    for (const data of [
      { ...registration, cleanupId: OTHER },
      { ...registration, claim: { ...claim(), claimId: OTHER } },
      { ...registration, transcript: "excluded" },
    ]) {
      const rpc = vi.fn(async () => ({ data, error: null }));
      await reject(createVoiceRpcStore({ rpc }).registerCleanup(registration));
      expect(rpc).toHaveBeenCalledTimes(1);
    }
  });

  it("returns detached frozen acknowledgments without reflecting transport metadata", async () => {
    const data = { claim: claim(), state: "claimed" };
    const rpc = vi.fn(async () => ({ data, error: null, status: 200, diagnostic: "excluded" }));
    const result = (await createVoiceRpcStore({ rpc }).claim(RECEIPT, claim())) as {
      claim: VoiceAdmissionClaim;
      state: string;
    };
    Object.assign(data.claim.binding, { ownerId: OTHER });
    expect(result).toEqual({ claim: claim(), state: "claimed" });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.claim)).toBe(true);
    expect(Object.isFrozen(result.claim.binding)).toBe(true);
  });

  it("sanitizes synchronous throws, rejected promises and hostile response getters", async () => {
    const privateError = new Error("SYNTHETIC_PRIVATE_SQL_AND_CONTENT");
    const transports: VoiceRpcClient[] = [
      {
        rpc() {
          throw privateError;
        },
      },
      {
        rpc: async () => {
          throw privateError;
        },
      },
      {
        rpc: async () => ({
          error: null,
          get data() {
            throw privateError;
          },
        }),
      },
    ];
    for (const client of transports) {
      let caught: unknown;
      try {
        await createVoiceRpcStore(client).close(CLEANUP, claim());
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe("voice-rpc-unavailable");
      expect((caught as Error).cause).toBeUndefined();
      expect(JSON.stringify(caught)).not.toContain("SYNTHETIC_PRIVATE");
    }
  });
});
