// Fictional protected transport only. Actual SQL/accounting has a separate suite.
// No real Auth, credentials, microphone, provider or runtime route is involved.
import { describe, expect, it, vi } from "vitest";
import {
  createVoiceV2CapacityRpcPorts,
  type VoiceV2CapacityRpcClient,
  type VoiceV2CapacityRpcName,
  type VoiceV2CapacityStatus,
} from "../service/voice-v2-capacity-rpc.server";
import type { VoiceV2ProofReceipt } from "../service/voice-v2-proof-rpc.server";

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
const ERROR = "voice-v2-capacity-rpc-unavailable";
const operations = ["claim", "inspect"] as const;
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
        threadRevision: 4,
        attemptId: ATTEMPT,
        approvalId: APPROVAL,
        approvalDigest: "a".repeat(64),
        scope: "developer-voice-session" as const,
      },
      expiresAt: VERIFIED + 120_000,
    },
    cleanupId: CLEANUP,
    authSessionId: SESSION,
    parentVersion: 0,
    authorityFingerprint: "b".repeat(64),
    identityExpiresAt: VERIFIED + 110_000,
    verifiedAt: VERIFIED,
    expiresAt: VERIFIED + 20_000,
    effectiveExpiresAt: VERIFIED + 100_000,
  };
}
type MutableProof = ReturnType<typeof body>;
const ack = (proof: unknown, status: VoiceV2CapacityStatus = "claimed") => ({
  protocol: 2,
  proof,
  status,
});
const success = (data: unknown) => ({ data, error: null, status: 200 });
function fixture() {
  const rpc = vi.fn(
    async (
      _name: VoiceV2CapacityRpcName,
      args: Readonly<Record<string, unknown>>,
    ): Promise<unknown> => success(ack(structuredClone(args.p_proof))),
  );
  return { rpc, ports: createVoiceV2CapacityRpcPorts({ rpc }) };
}
const record = (value: object): Record<string, unknown> => value as Record<string, unknown>;
async function reject(result: Promise<unknown>) {
  await expect(result).rejects.toThrow(ERROR);
}
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("inactive v2 atomic capacity and inspect transport", () => {
  it.each(operations)(
    "maps %s only to its versioned endpoint with detached frozen full proof",
    async (operation) => {
      const h = fixture();
      const proof = body(operation);
      const result = await h.ports[operation](proof);
      const name = operation === "claim" ? "bfa_p5_v2_capacity_claim" : "bfa_p5_v2_voice_inspect";
      expect(h.rpc.mock.calls).toEqual([[name, { p_proof: proof }]]);
      expect(result).toEqual(ack(proof));
      expect(Object.keys(h.ports).sort()).toEqual(["claim", "inspect"]);
      const args = h.rpc.mock.calls[0][1];
      const captured = args.p_proof as VoiceV2ProofReceipt;
      for (const value of [
        h.ports,
        args,
        captured,
        captured.claim,
        captured.claim.binding,
        result,
        result.proof,
        result.proof.claim,
        result.proof.claim.binding,
      ])
        expect(Object.isFrozen(value)).toBe(true);
      expect(captured).not.toBe(proof);
      expect(captured.claim.binding).not.toBe(proof.claim.binding);
      expect(result.proof).not.toBe(captured);
      expect(Object.hasOwn(result, "state")).toBe(false);
      expect(Object.hasOwn(result, "claim")).toBe(false);
    },
  );

  it.each(operations)(
    "rejects the wrong proof operation before %s consumes anything",
    async (operation) => {
      const h = fixture();
      const proof = body(operation === "claim" ? "inspect" : "claim");
      await reject(h.ports[operation](proof));
      expect(h.rpc).not.toHaveBeenCalled();
    },
  );

  it.each(["claimed", "denied", "closed"] as const)(
    "retains exact %s observations without a retry or dispatch flag",
    async (status) => {
      for (const operation of operations) {
        const h = fixture();
        const proof = body(operation);
        h.rpc.mockResolvedValueOnce(success(ack(proof, status)));
        expect(await h.ports[operation](proof)).toEqual(ack(proof, status));
        await Promise.resolve();
        expect(h.rpc).toHaveBeenCalledTimes(1);
        expect(proof).toEqual(body(operation));
      }
    },
  );

  it("captures one protected client method with its receiver", async () => {
    let reads = 0;
    const original = vi.fn(async function (
      this: { tag: string },
      _name: VoiceV2CapacityRpcName,
      args: Readonly<Record<string, unknown>>,
    ) {
      expect(this.tag).toBe("fictional protected transport");
      return success(ack(structuredClone(args.p_proof)));
    });
    const client = {
      tag: "fictional protected transport",
      get rpc() {
        reads++;
        return original;
      },
    };
    const ports = createVoiceV2CapacityRpcPorts(client);
    const replacement = vi.fn();
    Object.defineProperty(client, "rpc", { value: replacement });
    for (const operation of operations)
      expect(await ports[operation](body(operation))).toEqual(ack(body(operation)));
    expect(reads).toBe(1);
    expect(original).toHaveBeenCalledTimes(2);
    expect(replacement).not.toHaveBeenCalled();
  });

  it("never samples a local clock or refreshes original verification", async () => {
    const h = fixture();
    const clock = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("unexpected local clock");
    });
    try {
      for (const operation of operations)
        expect(await h.ports[operation](body(operation))).toEqual(ack(body(operation)));
      expect(clock).not.toHaveBeenCalled();
    } finally {
      clock.mockRestore();
    }
  });

  it.each(operations)(
    "detaches the entire %s request before waiting and leaves retained caller evidence intact",
    async (operation) => {
      const h = fixture();
      const pending = deferred();
      h.rpc.mockReturnValueOnce(pending.promise);
      const proof = body(operation);
      const result = h.ports[operation](proof);
      proof.authSessionId = OTHER;
      proof.verifiedAt++;
      proof.claim.binding.ownerId = OTHER;
      proof.claim.expiresAt++;
      expect(h.rpc.mock.calls[0][1].p_proof).toEqual(body(operation));
      for (let i = 0; i < 5; i++) await Promise.resolve();
      expect(h.rpc).toHaveBeenCalledTimes(1);
      pending.resolve(success(ack(body(operation))));
      expect(await result).toEqual(ack(body(operation)));
      expect(proof.authSessionId).toBe(OTHER);
      expect(h.rpc).toHaveBeenCalledTimes(1);
    },
  );

  it("keeps concurrent claim and inspect responses associated with their own requests", async () => {
    const h = fixture();
    const claimPending = deferred(),
      inspectPending = deferred();
    h.rpc.mockReturnValueOnce(claimPending.promise).mockReturnValueOnce(inspectPending.promise);
    const inspectProof = body("inspect");
    inspectProof.receiptId = OTHER;
    const claimed = h.ports.claim(body()),
      inspected = h.ports.inspect(inspectProof);
    inspectPending.resolve(success(ack(inspectProof, "denied")));
    expect(await inspected).toEqual(ack(inspectProof, "denied"));
    claimPending.resolve(success(ack(body())));
    expect(await claimed).toEqual(ack(body()));
    expect(h.rpc).toHaveBeenCalledTimes(2);
  });

  it("returns detached reply evidence independent of raw nested objects and key order", async () => {
    const h = fixture();
    const proof = body();
    const reversed: Record<string, unknown> = Object.fromEntries(Object.entries(proof).reverse());
    reversed.claim = Object.fromEntries(Object.entries(proof.claim).reverse());
    h.rpc.mockResolvedValueOnce(success({ status: "claimed", proof: reversed, protocol: 2 }));
    const result = await h.ports.claim(body());
    proof.claim.binding.ownerId = OTHER;
    reversed.verifiedAt = 0;
    expect(result).toEqual(ack(body()));
    expect(result.proof.claim.binding).not.toBe(proof.claim.binding);
  });

  it("accepts exact null-prototype data records without accepting inherited authority", async () => {
    const h = fixture(),
      proof = body();
    for (const value of [proof, proof.claim, proof.claim.binding])
      Object.setPrototypeOf(value, null);
    const reply = ack(structuredClone(proof));
    Object.setPrototypeOf(reply, null);
    h.rpc.mockResolvedValueOnce(success(reply));
    expect(await h.ports.claim(proof)).toEqual(ack(body()));
  });

  it.each([1, 30_000])("preserves the inclusive %i ms static proof interval", async (duration) => {
    const h = fixture(),
      proof = body();
    proof.expiresAt = proof.verifiedAt + duration;
    expect(await h.ports.claim(proof)).toEqual(ack(proof));
  });

  it("accepts safe zero and max counters without interpreting them as current authority", async () => {
    const h = fixture(),
      proof = body();
    proof.verifiedAt = 0;
    proof.expiresAt = 1;
    proof.effectiveExpiresAt = 1;
    proof.identityExpiresAt = Number.MAX_SAFE_INTEGER;
    proof.claim.expiresAt = Number.MAX_SAFE_INTEGER;
    proof.parentVersion = Number.MAX_SAFE_INTEGER;
    proof.claim.binding.threadRevision = 0;
    expect(await h.ports.claim(proof)).toEqual(ack(proof));
  });

  const invalid: [string, (p: MutableProof) => void][] = [
    [
      "zero duration",
      (p) => {
        p.expiresAt = p.verifiedAt;
      },
    ],
    [
      "negative duration",
      (p) => {
        p.expiresAt = p.verifiedAt - 1;
      },
    ],
    [
      "overlong interval",
      (p) => {
        p.expiresAt = p.verifiedAt + 30_001;
      },
    ],
    [
      "proof above effective ceiling",
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
      "Auth expiry at verification",
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
      "fractional verification",
      (p) => {
        p.verifiedAt += 0.5;
      },
    ],
    [
      "unsafe expiry",
      (p) => {
        p.identityExpiresAt = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      "infinite expiry",
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
      "unexpected sealed token",
      (p) => {
        record(p).activeAuthority = "private-token";
      },
    ],
    [
      "uppercase identity",
      (p) => {
        p.authSessionId = OTHER.toUpperCase();
      },
    ],
    [
      "uppercase fingerprint",
      (p) => {
        p.authorityFingerprint = "B".repeat(64);
      },
    ],
    [
      "non-string approval digest",
      (p) => {
        record(p.claim.binding).approvalDigest = 3;
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
      "unsafe revision",
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
      "supplied consumed marker",
      (p) => {
        record(p).consumedAt = null;
      },
    ],
  ];
  it.each(invalid)("rejects %s without any consuming RPC", async (_label, mutate) => {
    const h = fixture(),
      proof = body();
    mutate(proof);
    await reject(h.ports.claim(proof));
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("rejects every nil identity across the proof tree before invoking SQL", async () => {
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
    for (const path of paths) {
      const h = fixture(),
        proof = body();
      let target = record(proof);
      for (const key of path.slice(0, -1)) target = target[key] as Record<string, unknown>;
      target[path.at(-1)!] = NIL;
      await reject(h.ports.claim(proof));
      expect(h.rpc).not.toHaveBeenCalled();
    }
  });

  it("rejects inherited, symbol and hidden request fields at every nested boundary", async () => {
    for (const level of ["proof", "claim", "binding"] as const) {
      for (const kind of ["inherited", "symbol", "hidden"] as const) {
        const h = fixture(),
          proof = body();
        const target = record(
          level === "proof" ? proof : level === "claim" ? proof.claim : proof.claim.binding,
        );
        if (kind === "inherited") Object.setPrototypeOf(target, { inherited: true });
        if (kind === "symbol") Object.defineProperty(target, Symbol("extra"), { value: true });
        if (kind === "hidden") Object.defineProperty(target, "extra", { value: true });
        await reject(h.ports.claim(proof));
        expect(h.rpc).not.toHaveBeenCalled();
      }
    }
  });

  it("never evaluates rejected request getters during operation or interval validation", async () => {
    for (const [level, key] of [
      ["proof", "operation"],
      ["proof", "verifiedAt"],
      ["claim", "expiresAt"],
      ["binding", "ownerId"],
    ] as const) {
      const h = fixture(),
        proof = body();
      const target =
        level === "proof" ? proof : level === "claim" ? proof.claim : proof.claim.binding;
      const getter = vi.fn(() => {
        throw new Error("private getter");
      });
      Object.defineProperty(target, key, { get: getter, enumerable: true });
      await reject(h.ports.claim(proof));
      expect(getter).not.toHaveBeenCalled();
      expect(h.rpc).not.toHaveBeenCalled();
    }
  });

  const mismatches: [string, (p: MutableProof) => void][] = [
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
      "verification time",
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
    "rejects a different %s even in a denied or closed acknowledgment",
    async (_label, mutate) => {
      for (const status of ["claimed", "denied", "closed"] as const) {
        const h = fixture(),
          proof = body();
        mutate(proof);
        h.rpc.mockResolvedValueOnce(success(ack(proof, status)));
        await reject(h.ports.claim(body()));
        expect(h.rpc).toHaveBeenCalledTimes(1);
      }
    },
  );

  it("rejects a shortened or refreshed proof rather than replacing the original evidence", async () => {
    for (const kind of ["shorter", "refreshed"] as const) {
      const h = fixture(),
        proof = body();
      if (kind === "shorter") proof.effectiveExpiresAt = proof.expiresAt;
      else {
        proof.verifiedAt += 100;
        proof.expiresAt += 100;
      }
      h.rpc.mockResolvedValueOnce(success(ack(proof)));
      await reject(h.ports.claim(body()));
      expect(h.rpc).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects null, minimal v1, alternate protocol, added metadata and non-admission states", async () => {
    const proof = body();
    for (const value of [
      null,
      proof,
      { claim: proof.claim, state: "claimed" },
      { proof, status: "claimed" },
      { protocol: 1, proof, status: "claimed" },
      { protocol: "2", proof, status: "claimed" },
      { ...ack(proof), state: "claimed" },
      ack({ ...proof, consumedAt: 1 }),
      ...["marked", "replayed", "active", "quarantined", true].map((status) => ({
        ...ack(proof),
        status,
      })),
    ]) {
      const h = fixture();
      h.rpc.mockResolvedValueOnce(success(value));
      await reject(h.ports.claim(body()));
      expect(h.rpc).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects malformed proof intervals in replies", async () => {
    const h = fixture(),
      proof = body();
    proof.expiresAt = proof.verifiedAt;
    h.rpc.mockResolvedValueOnce(success(ack(proof)));
    await reject(h.ports.claim(body()));
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects reply accessors without reading their values", async () => {
    for (const level of ["ack", "proof", "claim", "binding"] as const) {
      const h = fixture(),
        proof = body(),
        reply = ack(proof);
      const target =
        level === "ack"
          ? reply
          : level === "proof"
            ? proof
            : level === "claim"
              ? proof.claim
              : proof.claim.binding;
      const key =
        level === "ack"
          ? "status"
          : level === "proof"
            ? "operation"
            : level === "claim"
              ? "expiresAt"
              : "ownerId";
      const getter = vi.fn(() => {
        throw new Error("private reply getter");
      });
      Object.defineProperty(target, key, { enumerable: true, get: getter });
      h.rpc.mockResolvedValueOnce(success(reply));
      await reject(h.ports.claim(body()));
      expect(getter).not.toHaveBeenCalled();
      expect(h.rpc).toHaveBeenCalledTimes(1);
    }
  });

  it("does not manufacture rollback or a replacement request after modeled committed lost or malformed replies", async () => {
    for (const mode of ["lost", "malformed"] as const) {
      const committed: unknown[] = [],
        h = fixture(),
        retained = body();
      h.rpc.mockImplementationOnce(async (_name, args) => {
        committed.push(structuredClone(args.p_proof));
        if (mode === "lost") throw new Error(`private transport ${RECEIPT}`);
        return success({ status: "claimed" });
      });
      const error = await h.ports.claim(retained).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(ERROR);
      expect((error as Error).cause).toBeUndefined();
      expect(Object.keys(error as Error)).toEqual([]);
      expect(committed).toEqual([body()]);
      expect(retained).toEqual(body());
      await Promise.resolve();
      expect(h.rpc).toHaveBeenCalledTimes(1);
    }
  });

  it.each([199, 300, 200.5, "200", Infinity, NaN])(
    "rejects contradictory envelope HTTP status %s",
    async (status) => {
      const h = fixture();
      h.rpc.mockResolvedValueOnce({ data: ack(body()), error: null, status });
      await reject(h.ports.claim(body()));
      expect(h.rpc).toHaveBeenCalledTimes(1);
    },
  );

  it("accepts successful envelopes with absent status or ordinary extra metadata", async () => {
    const h = fixture();
    h.rpc.mockResolvedValueOnce({ data: ack(body()), error: null });
    expect(await h.ports.claim(body())).toEqual(ack(body()));
    h.rpc.mockResolvedValueOnce({
      data: ack(body()),
      error: null,
      status: 299,
      statusText: "success",
      count: null,
    });
    expect(await h.ports.claim(body())).toEqual(ack(body()));
  });

  it("rejects missing, non-object or erroneous envelopes without exposing raw details", async () => {
    for (const raw of [
      null,
      undefined,
      [],
      ack(body()),
      { data: ack(body()) },
      { data: ack(body()), error: undefined },
      { data: ack(body()), error: false },
      { data: ack(body()), error: { message: "private server detail" } },
    ]) {
      const h = fixture();
      h.rpc.mockResolvedValueOnce(raw);
      await reject(h.ports.claim(body()));
      expect(h.rpc).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects inherited and accessor envelope authority without evaluating getters", async () => {
    for (const key of ["data", "error", "status"] as const) {
      const h = fixture(),
        envelope = success(ack(body()));
      const getter = vi.fn(() => {
        throw new Error("private envelope getter");
      });
      Object.defineProperty(envelope, key, { enumerable: true, get: getter });
      h.rpc.mockResolvedValueOnce(envelope);
      await reject(h.ports.claim(body()));
      expect(getter).not.toHaveBeenCalled();
    }
    const h = fixture();
    h.rpc.mockResolvedValueOnce(Object.create(success(ack(body()))));
    await reject(h.ports.claim(body()));
  });

  it("rejects nonobject inputs and invalid clients before any SQL invocation", async () => {
    for (const raw of [null, undefined, 1, "proof", [], new Date(0)]) {
      const h = fixture();
      await reject(h.ports.claim(raw as unknown as VoiceV2ProofReceipt));
      expect(h.rpc).not.toHaveBeenCalled();
    }
    for (const raw of [null, undefined, {}, { rpc: false }])
      expect(() =>
        createVoiceV2CapacityRpcPorts(raw as unknown as VoiceV2CapacityRpcClient),
      ).toThrow(ERROR);
    expect(() =>
      createVoiceV2CapacityRpcPorts({
        get rpc(): VoiceV2CapacityRpcClient["rpc"] {
          throw new Error("private client getter");
        },
      }),
    ).toThrow(ERROR);
  });
});
