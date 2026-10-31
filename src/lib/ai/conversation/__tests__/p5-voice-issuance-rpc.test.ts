import { describe, expect, it, vi } from "vitest";
import {
  createVoiceIssuanceRpcPorts,
  type VoiceGenerationRegistration,
  type VoiceIssuanceRegistration,
  type VoiceIssuanceRpcClient,
  type VoiceIssuanceRpcName,
} from "../service/voice-issuance-rpc.server";

const OWNER = "11111111-1111-4111-8111-111111111111";
const THREAD = "22222222-2222-4222-8222-222222222222";
const INCARNATION = "33333333-3333-4333-8333-333333333333";
const OTHER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const START = 1_900_000_000_000;
const generation = (): VoiceGenerationRegistration => ({ ownerId: OWNER, threadId: THREAD });
const issuance = (): VoiceIssuanceRegistration => ({
  ...generation(),
  threadIncarnation: INCARNATION,
  threadRevision: 7,
  authorityFingerprint: "d".repeat(64),
  issuedAt: START,
  expiresAt: START + 600_000,
});
const success = (data: unknown) => ({ data, error: null, status: 200, statusText: "OK" });
function fixture() {
  // Fictional transport only: no actual SQL, HTTP, Auth or provider invocation.
  const rpc = vi.fn(
    async (
      name: VoiceIssuanceRpcName,
      _args: Readonly<Record<string, unknown>>,
    ): Promise<unknown> =>
      success(name === "bfa_p5_voice_register_generation" ? INCARNATION : true),
  );
  return { rpc, ports: createVoiceIssuanceRpcPorts({ rpc }) };
}
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
const rejected = (promise: Promise<unknown>) =>
  expect(promise).rejects.toThrow("voice-issuance-rpc-unavailable");

describe("P5 inactive trusted issuance RPC mapping", () => {
  it("constructs only the two immutable registration ports without invoking a client", () => {
    const h = fixture();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(Object.keys(h.ports).sort()).toEqual(["registerGeneration", "registerIssuance"]);
    expect(Object.isFrozen(h.ports)).toBe(true);
  });

  it("maps both existing SQL signatures with exact named arguments", async () => {
    const h = fixture();
    expect(await h.ports.registerGeneration(generation())).toBe(INCARNATION);
    expect(await h.ports.registerIssuance(issuance())).toBe(true);
    expect(h.rpc.mock.calls).toEqual([
      ["bfa_p5_voice_register_generation", { p_owner: OWNER, p_thread: THREAD }],
      [
        "bfa_p5_voice_register_issuance",
        {
          p_owner: OWNER,
          p_thread: THREAD,
          p_incarnation: INCARNATION,
          p_revision: 7,
          p_fingerprint: "d".repeat(64),
          p_issued_ms: START,
          p_expires_ms: START + 600_000,
        },
      ],
    ]);
  });

  it("preserves false semantic denial without generation fallback or retry", async () => {
    const h = fixture();
    h.rpc.mockResolvedValue(success(false));
    expect(await h.ports.registerIssuance(issuance())).toBe(false);
    expect(h.rpc.mock.calls.map(([name]) => name)).toEqual(["bfa_p5_voice_register_issuance"]);
  });

  it("accepts exact safe numeric boundaries and the maximum fifteen-minute lifetime", async () => {
    const h = fixture();
    for (const fields of [
      { issuedAt: 0, expiresAt: 1, threadRevision: 0 },
      { issuedAt: START, expiresAt: START + 900_000, threadRevision: 7 },
      {
        issuedAt: Number.MAX_SAFE_INTEGER - 1,
        expiresAt: Number.MAX_SAFE_INTEGER,
        threadRevision: Number.MAX_SAFE_INTEGER,
      },
    ])
      expect(await h.ports.registerIssuance({ ...issuance(), ...fields })).toBe(true);
    expect(h.rpc).toHaveBeenCalledTimes(3);
  });

  it("rejects noncanonical or malformed identity before invoking any transport", async () => {
    const h = fixture();
    for (const bad of [null, 1, "", "not-a-uuid", OTHER.toUpperCase()]) {
      for (const key of ["ownerId", "threadId"])
        await rejected(
          h.ports.registerGeneration({
            ...generation(),
            [key]: bad,
          } as VoiceGenerationRegistration),
        );
      await rejected(
        h.ports.registerIssuance({
          ...issuance(),
          threadIncarnation: bad,
        } as VoiceIssuanceRegistration),
      );
    }
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("rejects unsafe or coercible counts and invalid issuance lifetimes", async () => {
    const h = fixture();
    for (const key of ["threadRevision", "issuedAt", "expiresAt"])
      for (const bad of [-1, 1.5, "1", NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null])
        await rejected(
          h.ports.registerIssuance({ ...issuance(), [key]: bad } as VoiceIssuanceRegistration),
        );
    for (const fields of [
      { issuedAt: 0, expiresAt: 0 },
      { issuedAt: START, expiresAt: START },
      { issuedAt: START, expiresAt: START - 1 },
      { issuedAt: START, expiresAt: START + 900_001 },
    ])
      await rejected(h.ports.registerIssuance({ ...issuance(), ...fields }));
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("rejects malformed fingerprints and unknown token or content inputs", async () => {
    const h = fixture();
    for (const authorityFingerprint of ["d".repeat(63), "D".repeat(64), "z".repeat(64), 1, null])
      await rejected(
        h.ports.registerIssuance({
          ...issuance(),
          authorityFingerprint,
        } as VoiceIssuanceRegistration),
      );
    for (const extra of [{ token: "old-envelope" }, { authority: {} }, { expires: START }]) {
      await rejected(h.ports.registerGeneration({ ...generation(), ...extra }));
      await rejected(h.ports.registerIssuance({ ...issuance(), ...extra }));
    }
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("requires own enumerable data fields and never evaluates query accessors", async () => {
    const h = fixture();
    const getter = vi.fn(() => OWNER);
    const accessor = Object.defineProperty({ threadId: THREAD }, "ownerId", {
      get: getter,
      enumerable: true,
    });
    const hidden = Object.defineProperty({ threadId: THREAD }, "ownerId", { value: OWNER });
    const inherited = Object.assign(Object.create({ ownerId: OWNER }), { threadId: THREAD });
    const symbol = Object.assign(generation(), { [Symbol("extra")]: "ignored?" });
    for (const value of [accessor, hidden, inherited, symbol, [], null])
      await rejected(h.ports.registerGeneration(value as VoiceGenerationRegistration));
    expect(getter).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("accepts plain null-prototype request records without retaining caller references", async () => {
    const h = fixture();
    expect(await h.ports.registerGeneration(Object.assign(Object.create(null), generation()))).toBe(
      INCARNATION,
    );
    expect(await h.ports.registerIssuance(Object.assign(Object.create(null), issuance()))).toBe(
      true,
    );
  });

  it("requires a canonical UUID generation acknowledgment", async () => {
    const h = fixture();
    for (const data of [
      null,
      true,
      false,
      1,
      "",
      OTHER.toUpperCase(),
      { incarnation: INCARNATION },
      [INCARNATION],
    ]) {
      h.rpc.mockResolvedValue(success(data));
      await rejected(h.ports.registerGeneration(generation()));
    }
    expect(h.rpc).toHaveBeenCalledTimes(8);
  });

  it("requires a literal issuance boolean and treats null as malformed rather than denial", async () => {
    const h = fixture();
    for (const data of [null, undefined, 0, 1, "true", "false", {}, [], { registered: true }]) {
      h.rpc.mockResolvedValue(success(data));
      await rejected(h.ports.registerIssuance(issuance()));
    }
    expect(h.rpc).toHaveBeenCalledTimes(9);
  });

  it("rejects missing/error/malformed RPC envelopes and unsuccessful status metadata", async () => {
    const h = fixture();
    for (const reply of [
      undefined,
      null,
      [],
      true,
      { data: true },
      { error: null },
      { data: true, error: undefined },
      { data: true, error: { message: "private SQL detail" } },
      ...[0, 199, 300, 500, 200.5, "200", null, undefined, NaN].map((status) => ({
        data: true,
        error: null,
        status,
      })),
    ]) {
      h.rpc.mockResolvedValue(reply);
      await rejected(h.ports.registerIssuance(issuance()));
    }
  });

  it("does not evaluate response identity/error/status accessors or accept inherited envelope fields", async () => {
    const h = fixture();
    const getter = vi.fn(() => true);
    for (const key of ["data", "error", "status"]) {
      const reply = Object.defineProperty(success(true), key, { get: getter, enumerable: true });
      h.rpc.mockResolvedValue(reply);
      await rejected(h.ports.registerIssuance(issuance()));
    }
    h.rpc.mockResolvedValue(Object.assign(Object.create({ error: null }), { data: true }));
    await rejected(h.ports.registerIssuance(issuance()));
    expect(getter).not.toHaveBeenCalled();
  });

  it("allows ordinary SDK metadata and absent status without coercing the result", async () => {
    const h = fixture();
    h.rpc.mockResolvedValue({ data: true, error: null, count: null, statusText: "OK" });
    expect(await h.ports.registerIssuance(issuance())).toBe(true);
    h.rpc.mockResolvedValue(
      Object.assign(Object.create(null), { data: INCARNATION, error: null, status: 299 }),
    );
    expect(await h.ports.registerGeneration(generation())).toBe(INCARNATION);
  });

  it("detaches arguments before await and freezes them against client mutation", async () => {
    const h = fixture();
    const pending = deferred();
    const original = { ...issuance() };
    h.rpc.mockImplementation((_name, args) => {
      expect(Object.isFrozen(args)).toBe(true);
      expect(() => {
        (args as Record<string, unknown>).p_owner = OTHER;
      }).toThrow();
      return pending.promise;
    });
    const issued = h.ports.registerIssuance(original);
    original.ownerId = OTHER;
    original.authorityFingerprint = "a".repeat(64);
    original.expiresAt = START + 1;
    expect(h.rpc.mock.calls[0]![1]).toMatchObject({
      p_owner: OWNER,
      p_fingerprint: "d".repeat(64),
      p_expires_ms: START + 600_000,
    });
    pending.resolve(success(true));
    expect(await issued).toBe(true);
  });

  it("isolates overlapping generation and issuance calls settled in reverse order", async () => {
    const h = fixture();
    const first = deferred(),
      second = deferred();
    h.rpc.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    const one = h.ports.registerGeneration(generation());
    const two = h.ports.registerIssuance({ ...issuance(), ownerId: OTHER });
    second.resolve(success(false));
    expect(await two).toBe(false);
    first.resolve(success(INCARNATION));
    expect(await one).toBe(INCARNATION);
    expect(h.rpc.mock.calls[0]![1]).toEqual({ p_owner: OWNER, p_thread: THREAD });
    expect(h.rpc.mock.calls[1]![1]).toMatchObject({ p_owner: OTHER, p_incarnation: INCARNATION });
    expect(h.rpc).toHaveBeenCalledTimes(2);
  });

  it("sanitizes lost or rejected replies without retry, cause, record or private message", async () => {
    const h = fixture();
    const privateError = new Error(`private-token ${OWNER} ${"d".repeat(64)}`);
    h.rpc.mockRejectedValue(privateError);
    for (const run of [
      () => h.ports.registerGeneration(generation()),
      () => h.ports.registerIssuance(issuance()),
    ]) {
      const error = await run().catch((value: unknown) => value);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("voice-issuance-rpc-unavailable");
      expect(Object.keys(error as object)).toEqual([]);
      expect(Object.hasOwn(error as object, "cause")).toBe(false);
      expect(String(error)).not.toContain(OWNER);
      expect(error).not.toBe(privateError);
    }
    expect(h.rpc).toHaveBeenCalledTimes(2);
  });

  it("sanitizes synchronous invocation failure and throwing query reflection", async () => {
    const h = fixture();
    h.rpc.mockImplementation(() => {
      throw new Error("private transport failure");
    });
    await rejected(h.ports.registerGeneration(generation()));
    const query = new Proxy(generation(), {
      getPrototypeOf() {
        throw new Error("private proxy failure");
      },
    });
    await rejected(h.ports.registerGeneration(query));
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it("captures the client method once with its receiver and ignores later method replacement", async () => {
    let reads = 0;
    const original = vi.fn(function (
      this: { marker: string },
      _name: VoiceIssuanceRpcName,
      _args: Readonly<Record<string, unknown>>,
    ) {
      expect(this.marker).toBe("trusted-fixture");
      return Promise.resolve(success(INCARNATION));
    });
    const client = {
      marker: "trusted-fixture",
      get rpc() {
        reads += 1;
        return original;
      },
    };
    const ports = createVoiceIssuanceRpcPorts(client);
    Object.defineProperty(client, "rpc", {
      value: () => {
        throw new Error("replacement");
      },
    });
    expect(await ports.registerGeneration(generation())).toBe(INCARNATION);
    expect(reads).toBe(1);
    expect(original).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid or throwing client construction with a fixed sanitized error", () => {
    for (const client of [
      null,
      {},
      { rpc: 1 },
      {
        get rpc() {
          throw new Error("private client");
        },
      },
    ])
      expect(() =>
        createVoiceIssuanceRpcPorts(client as unknown as VoiceIssuanceRpcClient),
      ).toThrow("voice-issuance-rpc-unavailable");
  });
});
