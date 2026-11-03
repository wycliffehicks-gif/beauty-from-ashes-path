// Fictional transport contract only. Actual isolated SQL has a separate suite.
// No real Auth, credentials, model, microphone or provider operation occurs.
import { describe, expect, it, vi } from "vitest";
import {
  createVoiceV2ProofRpcPorts,
  type VoiceV2ProofRegistration,
  type VoiceV2ProofRpcClient,
  type VoiceV2ProofRpcName,
} from "../service/voice-v2-proof-rpc.server";

const OWNER = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";
const THREAD = "33333333-3333-4333-8333-333333333333";
const INCARNATION = "44444444-4444-4444-8444-444444444444";
const CLEANUP = "55555555-5555-4555-8555-555555555555";
const CLAIM = "66666666-6666-4666-8666-666666666666";
const ATTEMPT = "77777777-7777-4777-8777-777777777777";
const APPROVAL = "88888888-8888-4888-8888-888888888888";
const RECEIPT = "99999999-9999-4999-8999-999999999999";
const OTHER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NIL = "00000000-0000-0000-0000-000000000000";
const VERIFIED = 1_900_000_000_000;
const ERROR = "voice-v2-proof-rpc-unavailable";
function body(operation: "claim" | "inspect" = "claim") {
  return {
    protocol: 2 as const,
    receiptId: RECEIPT,
    operation,
    claim: {
      claimId: CLAIM,
      binding: {
        ownerId: OWNER,
        threadId: THREAD,
        threadIncarnation: INCARNATION,
        threadRevision: 7,
        attemptId: ATTEMPT,
        approvalId: APPROVAL,
        approvalDigest: "c".repeat(64),
        scope: "developer-voice-session" as const,
      },
      expiresAt: VERIFIED + 90_000,
    },
    cleanupId: CLEANUP,
    authSessionId: SESSION,
    parentVersion: 3,
    authorityFingerprint: "b".repeat(64),
    identityExpiresAt: VERIFIED + 120_000,
    verifiedAt: VERIFIED,
    expiresAt: VERIFIED + 20_000,
    effectiveExpiresAt: VERIFIED + 60_000,
  };
}
type MutableProof = ReturnType<typeof body>;
const success = (data: unknown) => ({ data, error: null, status: 200, statusText: "OK" });
function fixture() {
  const rpc = vi.fn(
    async (_name: VoiceV2ProofRpcName, args: Readonly<Record<string, unknown>>): Promise<unknown> =>
      success(structuredClone(args.p_proof)),
  );
  return { rpc, ports: createVoiceV2ProofRpcPorts({ rpc }) };
}
const record = (value: object) => value as unknown as Record<string, unknown>;
const reject = (promise: Promise<unknown>) => expect(promise).rejects.toThrow(ERROR);
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("inactive exact v2 proof transport", () => {
  it("constructs a frozen registration-only port without requests", () => {
    const h = fixture();
    expect(Object.keys(h.ports)).toEqual(["registerProof"]);
    expect(Object.isFrozen(h.ports)).toBe(true);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it.each(["claim", "inspect"] as const)(
    "maps %s proof to one exact versioned request and full immutable acknowledgment",
    async (operation) => {
      const h = fixture();
      const proof = body(operation);
      const result = await h.ports.registerProof(proof);
      expect(result).toEqual(proof);
      expect(Object.keys(result!)).toHaveLength(12);
      expect(h.rpc.mock.calls).toEqual([["bfa_p5_v2_register_proof", { p_proof: proof }]]);
      const args = h.rpc.mock.calls[0][1];
      const captured = args.p_proof as VoiceV2ProofRegistration;
      for (const value of [
        args,
        captured,
        captured.claim,
        captured.claim.binding,
        result,
        result!.claim,
        result!.claim.binding,
      ])
        expect(Object.isFrozen(value)).toBe(true);
      expect(captured).not.toBe(proof);
      expect(captured.claim).not.toBe(proof.claim);
      expect(captured.claim.binding).not.toBe(proof.claim.binding);
      expect(result).not.toBe(captured);
    },
  );

  it("accepts own data records with null prototypes without trusting inherited identity", async () => {
    const h = fixture();
    const proof = body();
    Object.setPrototypeOf(proof, null);
    Object.setPrototypeOf(proof.claim, null);
    Object.setPrototypeOf(proof.claim.binding, null);
    expect(await h.ports.registerProof(proof)).toEqual(body());
  });

  it("captures the original transport once with its receiver", async () => {
    const original = vi.fn(async function (
      this: { tag: string },
      _name: VoiceV2ProofRpcName,
      args: Readonly<Record<string, unknown>>,
    ) {
      expect(this.tag).toBe("trusted fixture");
      return success(structuredClone(args.p_proof));
    });
    let reads = 0;
    const client = {
      tag: "trusted fixture",
      get rpc() {
        reads++;
        return original;
      },
    };
    const ports = createVoiceV2ProofRpcPorts(client);
    const replacement = vi.fn();
    Object.defineProperty(client, "rpc", { value: replacement });
    expect(await ports.registerProof(body())).toEqual(body());
    expect(reads).toBe(1);
    expect(original).toHaveBeenCalledTimes(1);
    expect(replacement).not.toHaveBeenCalled();
  });

  it("does not consult a local clock or refresh supplied verification", async () => {
    const h = fixture();
    const clock = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("unexpected local clock");
    });
    try {
      expect(await h.ports.registerProof(body())).toEqual(body());
      expect(clock).not.toHaveBeenCalled();
    } finally {
      clock.mockRestore();
    }
  });

  it("detaches the caller's nested claim and all timing before a pending transport wait", async () => {
    const h = fixture();
    const pending = deferred();
    h.rpc.mockReturnValueOnce(pending.promise);
    const proof = body();
    const result = h.ports.registerProof(proof);
    const args = h.rpc.mock.calls[0][1];
    expect(args.p_proof).toEqual(body());
    proof.authSessionId = OTHER;
    proof.verifiedAt++;
    proof.claim.binding.ownerId = OTHER;
    proof.claim.expiresAt++;
    expect(args.p_proof).toEqual(body());
    pending.resolve(success(body()));
    expect(await result).toEqual(body());
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it("detaches returned evidence from mutable reply bytes", async () => {
    const h = fixture();
    const raw = body();
    h.rpc.mockResolvedValueOnce(success(raw));
    const result = await h.ports.registerProof(body());
    raw.parentVersion++;
    raw.claim.binding.ownerId = OTHER;
    expect(result).toEqual(body());
    expect(result!.claim).not.toBe(raw.claim);
  });

  it("matches the complete tuple independent of reply key order", async () => {
    const h = fixture();
    const raw = body();
    const reversed: Record<string, unknown> = Object.fromEntries(Object.entries(raw).reverse());
    reversed.claim = Object.fromEntries(Object.entries(raw.claim).reverse());
    h.rpc.mockResolvedValueOnce(success(reversed));
    expect(await h.ports.registerProof(body())).toEqual(body());
  });

  it.each([1, 30_000])(
    "accepts the inclusive %i ms receipt interval without extending it",
    async (duration) => {
      const h = fixture();
      const proof = body();
      proof.expiresAt = proof.verifiedAt + duration;
      expect(await h.ports.registerProof(proof)).toEqual(proof);
    },
  );

  it("accepts safe zero/max counter boundaries and a positive first-millisecond receipt", async () => {
    const h = fixture();
    const proof = body();
    proof.verifiedAt = 0;
    proof.expiresAt = 1;
    proof.effectiveExpiresAt = 1;
    proof.identityExpiresAt = Number.MAX_SAFE_INTEGER;
    proof.claim.expiresAt = Number.MAX_SAFE_INTEGER;
    proof.parentVersion = Number.MAX_SAFE_INTEGER;
    proof.claim.binding.threadRevision = 0;
    expect(await h.ports.registerProof(proof)).toEqual(proof);
  });

  const invalidIntervals: [string, (proof: MutableProof) => void][] = [
    [
      "zero receipt duration",
      (p) => {
        p.expiresAt = p.verifiedAt;
      },
    ],
    [
      "receipt older than verification",
      (p) => {
        p.expiresAt = p.verifiedAt - 1;
      },
    ],
    [
      "over 30000ms receipt",
      (p) => {
        p.expiresAt = p.verifiedAt + 30_001;
      },
    ],
    [
      "receipt above effective ceiling",
      (p) => {
        p.effectiveExpiresAt = p.expiresAt - 1;
      },
    ],
    [
      "effective above claim ceiling",
      (p) => {
        p.claim.expiresAt = p.effectiveExpiresAt - 1;
      },
    ],
    [
      "effective above Auth ceiling",
      (p) => {
        p.identityExpiresAt = p.effectiveExpiresAt - 1;
      },
    ],
    [
      "Auth expiry equal to verification",
      (p) => {
        p.identityExpiresAt = p.verifiedAt;
      },
    ],
    [
      "negative verification",
      (p) => {
        p.verifiedAt = -1;
      },
    ],
    [
      "unsafe expiry",
      (p) => {
        p.identityExpiresAt = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      "fractional verification",
      (p) => {
        p.verifiedAt += 0.5;
      },
    ],
    [
      "nonfinite expiry",
      (p) => {
        p.claim.expiresAt = Infinity;
      },
    ],
    [
      "NaN expiry",
      (p) => {
        p.expiresAt = NaN;
      },
    ],
  ];
  it.each(invalidIntervals)("rejects %s before transport", async (_label, mutate) => {
    const h = fixture();
    const proof = body();
    mutate(proof);
    await reject(h.ports.registerProof(proof));
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("rejects every nil identity across the complete request tree", async () => {
    const paths = [
      ["receiptId"],
      ["cleanupId"],
      ["authSessionId"],
      ["claim", "claimId"],
      ...["ownerId", "threadId", "threadIncarnation", "attemptId", "approvalId"].map((key) => [
        "claim",
        "binding",
        key,
      ]),
    ];
    for (const keys of paths) {
      const h = fixture();
      const proof = body();
      let target = record(proof);
      for (const key of keys.slice(0, -1)) target = target[key] as Record<string, unknown>;
      target[keys.at(-1)!] = NIL;
      await reject(h.ports.registerProof(proof));
      expect(h.rpc).not.toHaveBeenCalled();
    }
  });

  const malformedInputs: [string, (proof: MutableProof) => void][] = [
    [
      "missing protocol",
      (p) => {
        delete record(p).protocol;
      },
    ],
    [
      "legacy protocol",
      (p) => {
        record(p).protocol = 1;
      },
    ],
    [
      "coerced protocol",
      (p) => {
        record(p).protocol = "2";
      },
    ],
    [
      "legacy Auth field names",
      (p) => {
        const r = record(p);
        r.ownerSessionId = p.authSessionId;
        r.sessionVersion = p.parentVersion;
        delete r.authSessionId;
        delete r.parentVersion;
      },
    ],
    [
      "unexpected supplied token",
      (p) => {
        record(p).activeAuthority = "private-token";
      },
    ],
    [
      "uppercase UUID",
      (p) => {
        p.authSessionId = OTHER.toUpperCase();
      },
    ],
    [
      "invalid fingerprint",
      (p) => {
        p.authorityFingerprint = "B".repeat(64);
      },
    ],
    [
      "unknown operation",
      (p) => {
        record(p).operation = "dispatch";
      },
    ],
    [
      "negative parent version",
      (p) => {
        p.parentVersion = -1;
      },
    ],
    [
      "unsafe thread revision",
      (p) => {
        p.claim.binding.threadRevision = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      "incorrect scope",
      (p) => {
        record(p.claim.binding).scope = "participant-voice-session";
      },
    ],
    [
      "non-string digest",
      (p) => {
        record(p.claim.binding).approvalDigest = 99;
      },
    ],
  ];
  it.each(malformedInputs)(
    "rejects %s without calling a legacy or v2 RPC",
    async (_label, mutate) => {
      const h = fixture();
      const proof = body();
      mutate(proof);
      await reject(h.ports.registerProof(proof));
      expect(h.rpc).not.toHaveBeenCalled();
    },
  );

  it("rejects inherited fields, symbols and nonenumerable additions at each nested boundary", async () => {
    for (const level of ["proof", "claim", "binding"] as const) {
      for (const kind of ["inherited", "symbol", "hidden"] as const) {
        const h = fixture();
        const proof = body();
        const target = record(
          level === "proof" ? proof : level === "claim" ? proof.claim : proof.claim.binding,
        );
        if (kind === "inherited") Object.setPrototypeOf(target, { inherited: true });
        if (kind === "symbol") target[Symbol("extra") as unknown as string] = true;
        if (kind === "hidden") Object.defineProperty(target, "hidden", { value: true });
        await reject(h.ports.registerProof(proof));
        expect(h.rpc).not.toHaveBeenCalled();
      }
    }
  });

  it("rejects accessor-backed fields without evaluating any getter during interval checks", async () => {
    for (const level of ["proof", "claim", "binding"] as const) {
      const h = fixture();
      const proof = body();
      const target =
        level === "proof" ? proof : level === "claim" ? proof.claim : proof.claim.binding;
      const key = level === "proof" ? "verifiedAt" : level === "claim" ? "expiresAt" : "ownerId";
      const getter = vi.fn(() => {
        throw new Error("private accessor");
      });
      Object.defineProperty(target, key, { enumerable: true, get: getter });
      await reject(h.ports.registerProof(proof));
      expect(getter).not.toHaveBeenCalled();
      expect(h.rpc).not.toHaveBeenCalled();
    }
  });

  const mismatches: [string, (proof: MutableProof) => void][] = [
    [
      "receipt",
      (p) => {
        p.receiptId = OTHER;
      },
    ],
    [
      "operation",
      (p) => {
        p.operation = "inspect";
      },
    ],
    [
      "cleanup",
      (p) => {
        p.cleanupId = OTHER;
      },
    ],
    [
      "Auth session",
      (p) => {
        p.authSessionId = OTHER;
      },
    ],
    [
      "parent version",
      (p) => {
        p.parentVersion++;
      },
    ],
    [
      "fingerprint",
      (p) => {
        p.authorityFingerprint = "d".repeat(64);
      },
    ],
    [
      "Auth expiry",
      (p) => {
        p.identityExpiresAt++;
      },
    ],
    [
      "original verification",
      (p) => {
        p.verifiedAt++;
      },
    ],
    [
      "receipt expiry",
      (p) => {
        p.expiresAt++;
      },
    ],
    [
      "effective expiry",
      (p) => {
        p.effectiveExpiresAt++;
      },
    ],
    [
      "claim",
      (p) => {
        p.claim.claimId = OTHER;
      },
    ],
    [
      "claim expiry",
      (p) => {
        p.claim.expiresAt++;
      },
    ],
    [
      "owner",
      (p) => {
        p.claim.binding.ownerId = OTHER;
      },
    ],
    [
      "thread",
      (p) => {
        p.claim.binding.threadId = OTHER;
      },
    ],
    [
      "incarnation",
      (p) => {
        p.claim.binding.threadIncarnation = OTHER;
      },
    ],
    [
      "revision",
      (p) => {
        p.claim.binding.threadRevision++;
      },
    ],
    [
      "attempt",
      (p) => {
        p.claim.binding.attemptId = OTHER;
      },
    ],
    [
      "approval",
      (p) => {
        p.claim.binding.approvalId = OTHER;
      },
    ],
    [
      "approval digest",
      (p) => {
        p.claim.binding.approvalDigest = "d".repeat(64);
      },
    ],
  ];
  it.each(mismatches)(
    "rejects a valid-shaped reply with a different %s without retry",
    async (_label, mutate) => {
      const h = fixture();
      const reply = body();
      mutate(reply);
      h.rpc.mockResolvedValueOnce(success(reply));
      await reject(h.ports.registerProof(body()));
      expect(h.rpc).toHaveBeenCalledTimes(1);
    },
  );

  it("does not accept a shortened or refreshed receipt as the registered immutable request", async () => {
    for (const change of ["shorter", "refreshed"] as const) {
      const h = fixture();
      const reply = body();
      if (change === "shorter") {
        reply.effectiveExpiresAt = reply.expiresAt;
      } else {
        reply.verifiedAt += 100;
        reply.expiresAt += 100;
      }
      h.rpc.mockResolvedValueOnce(success(reply));
      await reject(h.ports.registerProof(body()));
      expect(h.rpc).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects old minimal ACKs, v1 protocol and already-consumed metadata", async () => {
    const proof = body();
    for (const reply of [
      {
        receiptId: proof.receiptId,
        operation: proof.operation,
        claim: proof.claim,
        expiresAt: proof.expiresAt,
        effectiveExpiresAt: proof.effectiveExpiresAt,
      },
      { ...proof, protocol: 1 },
      { ...proof, consumedAt: null },
    ]) {
      const h = fixture();
      h.rpc.mockResolvedValueOnce(success(reply));
      await reject(h.ports.registerProof(body()));
      expect(h.rpc).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects malformed reply intervals and accessors before matching", async () => {
    const h = fixture();
    const badInterval = body();
    badInterval.expiresAt = badInterval.verifiedAt;
    h.rpc.mockResolvedValueOnce(success(badInterval));
    await reject(h.ports.registerProof(body()));
    const getter = vi.fn(() => {
      throw new Error("private reply accessor");
    });
    const accessor = body();
    Object.defineProperty(accessor.claim, "expiresAt", { enumerable: true, get: getter });
    h.rpc.mockResolvedValueOnce(success(accessor));
    await reject(h.ports.registerProof(body()));
    expect(getter).not.toHaveBeenCalled();
    expect(h.rpc).toHaveBeenCalledTimes(2);
  });

  it("returns semantic null without assuming rollback or creating a second request", async () => {
    const h = fixture();
    const retained = body();
    const copy = structuredClone(retained);
    h.rpc.mockResolvedValueOnce(success(null));
    expect(await h.ports.registerProof(retained)).toBeNull();
    expect(retained).toEqual(copy);
    await Promise.resolve();
    expect(h.rpc.mock.calls).toEqual([["bfa_p5_v2_register_proof", { p_proof: copy }]]);
  });

  it("retains the original caller identity after a modeled committed malformed reply", async () => {
    const committed: unknown[] = [];
    const h = fixture();
    h.rpc.mockImplementationOnce(async (_name, args) => {
      committed.push(structuredClone(args.p_proof));
      return success({ receiptId: RECEIPT });
    });
    const retained = body();
    await reject(h.ports.registerProof(retained));
    expect(committed).toEqual([retained]);
    expect(retained).toEqual(body());
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it("sanitizes a lost reply without retaining or exposing raw transport error details", async () => {
    const h = fixture();
    h.rpc.mockRejectedValueOnce(new Error(`private SQL row ${RECEIPT}`));
    const error = await h.ports.registerProof(body()).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(ERROR);
    expect((error as Error).cause).toBeUndefined();
    expect(Object.keys(error as Error)).toEqual([]);
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it.each([199, 300, 200.5, "200", Infinity, NaN])(
    "rejects contradictory HTTP status %s",
    async (status) => {
      const h = fixture();
      h.rpc.mockResolvedValueOnce({ data: body(), error: null, status });
      await reject(h.ports.registerProof(body()));
      expect(h.rpc).toHaveBeenCalledTimes(1);
    },
  );

  it("accepts successful envelopes with no status or ordinary extra metadata", async () => {
    const h = fixture();
    h.rpc.mockResolvedValueOnce({ data: body(), error: null });
    expect(await h.ports.registerProof(body())).toEqual(body());
    h.rpc.mockResolvedValueOnce({
      data: body(),
      error: null,
      status: 299,
      statusText: "success",
      count: null,
    });
    expect(await h.ports.registerProof(body())).toEqual(body());
  });

  it("rejects malformed envelopes, arrays, missing error and nonnull error values", async () => {
    for (const raw of [
      null,
      undefined,
      [],
      body(),
      { data: body() },
      { data: body(), error: undefined },
      { data: body(), error: false },
      { data: body(), error: { message: "private server detail" } },
    ]) {
      const h = fixture();
      h.rpc.mockResolvedValueOnce(raw);
      await reject(h.ports.registerProof(body()));
      expect(h.rpc).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects inherited or accessor envelope authority without evaluating it", async () => {
    for (const key of ["data", "error", "status"] as const) {
      const h = fixture();
      const envelope = success(body());
      const getter = vi.fn(() => {
        throw new Error("private envelope getter");
      });
      Object.defineProperty(envelope, key, { enumerable: true, get: getter });
      h.rpc.mockResolvedValueOnce(envelope);
      await reject(h.ports.registerProof(body()));
      expect(getter).not.toHaveBeenCalled();
    }
    const h = fixture();
    h.rpc.mockResolvedValueOnce(Object.create(success(body())));
    await reject(h.ports.registerProof(body()));
  });

  it("rejects nonobject inputs before transport and invalid clients before construction", async () => {
    for (const raw of [null, undefined, 1, "proof", [], new Date(0)]) {
      const h = fixture();
      await reject(h.ports.registerProof(raw as unknown as VoiceV2ProofRegistration));
      expect(h.rpc).not.toHaveBeenCalled();
    }
    for (const raw of [null, undefined, {}, { rpc: false }])
      expect(() => createVoiceV2ProofRpcPorts(raw as unknown as VoiceV2ProofRpcClient)).toThrow(
        ERROR,
      );
    expect(() =>
      createVoiceV2ProofRpcPorts({
        get rpc(): VoiceV2ProofRpcClient["rpc"] {
          throw new Error("private client getter");
        },
      }),
    ).toThrow(ERROR);
  });

  it("waits on the exact unresolved reply without a background retry or replacement identity", async () => {
    const h = fixture();
    const pending = deferred();
    h.rpc.mockReturnValueOnce(pending.promise);
    const result = h.ports.registerProof(body());
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(h.rpc).toHaveBeenCalledTimes(1);
    pending.resolve(success(body()));
    expect(await result).toEqual(body());
  });
});
