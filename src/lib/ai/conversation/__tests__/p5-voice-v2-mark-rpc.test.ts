// Fictional protected transport only. Actual SQL/accounting has a separate suite.
// No Auth, credentials, provider, microphone, runtime route or retry is installed.
import { describe, expect, it, vi } from "vitest";
import {
  createVoiceV2MarkRpcPorts,
  type VoiceV2MarkRequest,
  type VoiceV2MarkRpcClient,
  type VoiceV2MarkRpcName,
  type VoiceV2MarkStatus,
} from "../service/voice-v2-mark-rpc.server";

const OWNER = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";
const THREAD = "33333333-3333-4333-8333-333333333333";
const INCARNATION = "44444444-4444-4444-8444-444444444444";
const CLEANUP = "55555555-5555-4555-8555-555555555555";
const CLAIM = "66666666-6666-4666-8666-666666666666";
const ATTEMPT = "77777777-7777-4777-8777-777777777777";
const APPROVAL = "88888888-8888-4888-8888-888888888888";
const RECEIPT = "99999999-9999-4999-8999-999999999999";
const OPERATION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NIL = "00000000-0000-0000-0000-000000000000";
const VERIFIED = 1_900_000_000_000;
const ERROR = "voice-v2-mark-rpc-unavailable";
const statuses = ["marked", "already-marked", "denied", "quarantined", "closed"] as const;
function body() {
  return {
    protocol: 2 as const,
    proof: {
      protocol: 2 as const,
      receiptId: RECEIPT,
      operation: "inspect" as const,
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
    },
    operationId: OPERATION,
    expectedPoolVersion: 7,
  };
}
type MutableRequest = ReturnType<typeof body>;
const ack = (request: unknown, status: VoiceV2MarkStatus = "marked") => ({
  protocol: 2,
  request,
  status,
});
const success = (data: unknown) => ({ data, error: null, status: 200 });
function fixture() {
  const rpc = vi.fn(
    async (_name: VoiceV2MarkRpcName, args: Readonly<Record<string, unknown>>): Promise<unknown> =>
      success(ack(structuredClone(args.p_request))),
  );
  return { rpc, ports: createVoiceV2MarkRpcPorts({ rpc }) };
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
function levels(request: MutableRequest) {
  return {
    request,
    proof: request.proof,
    claim: request.proof.claim,
    binding: request.proof.claim.binding,
  };
}

describe("inactive v2 capacity marker transport", () => {
  it("maps only the versioned marker with detached frozen full request and acknowledgment", async () => {
    const h = fixture(),
      request = body();
    const result = await h.ports.mark(request);
    expect(h.rpc.mock.calls).toEqual([["bfa_p5_v2_capacity_mark", { p_request: request }]]);
    expect(result).toEqual(ack(request));
    expect(Object.keys(h.ports)).toEqual(["mark"]);
    expect(Object.keys(result).sort()).toEqual(["protocol", "request", "status"]);
    const args = h.rpc.mock.calls[0][1];
    const captured = args.p_request as VoiceV2MarkRequest;
    for (const value of [
      h.ports,
      args,
      captured,
      captured.proof,
      captured.proof.claim,
      captured.proof.claim.binding,
      result,
      result.request,
      result.request.proof,
      result.request.proof.claim,
      result.request.proof.claim.binding,
    ])
      expect(Object.isFrozen(value)).toBe(true);
    expect(captured).not.toBe(request);
    expect(captured.proof).not.toBe(request.proof);
    expect(captured.proof.claim).not.toBe(request.proof.claim);
    expect(captured.proof.claim.binding).not.toBe(request.proof.claim.binding);
    expect(result.request).not.toBe(captured);
    expect(result.request.proof.claim.binding).not.toBe(captured.proof.claim.binding);
  });

  it.each(statuses)(
    "retains %s as an exact observation without dispatch permission or replay",
    async (status) => {
      const h = fixture(),
        request = body();
      h.rpc.mockResolvedValueOnce(success(ack(request, status)));
      expect(await h.ports.mark(request)).toEqual(ack(request, status));
      await Promise.resolve();
      expect(h.rpc).toHaveBeenCalledTimes(1);
      expect(request).toEqual(body());
    },
  );

  it("captures the mandatory protected client method once with its receiver", async () => {
    let reads = 0;
    const original = vi.fn(async function (
      this: { tag: string },
      _name: VoiceV2MarkRpcName,
      args: Readonly<Record<string, unknown>>,
    ) {
      expect(this.tag).toBe("fictional protected transport");
      return success(ack(structuredClone(args.p_request)));
    });
    const client = {
      tag: "fictional protected transport",
      get rpc() {
        reads++;
        return original;
      },
    };
    const ports = createVoiceV2MarkRpcPorts(client),
      replacement = vi.fn();
    Object.defineProperty(client, "rpc", { value: replacement });
    expect(await ports.mark(body())).toEqual(ack(body()));
    expect(reads).toBe(1);
    expect(original).toHaveBeenCalledTimes(1);
    expect(replacement).not.toHaveBeenCalled();
  });

  it("detaches before waiting and preserves original operation, version and verification evidence", async () => {
    const h = fixture(),
      pending = deferred(),
      request = body();
    h.rpc.mockReturnValueOnce(pending.promise);
    const result = h.ports.mark(request);
    request.operationId = OTHER;
    request.expectedPoolVersion++;
    request.proof.authSessionId = OTHER;
    request.proof.verifiedAt++;
    request.proof.claim.binding.ownerId = OTHER;
    request.proof.claim.expiresAt++;
    expect(h.rpc.mock.calls[0][1].p_request).toEqual(body());
    await Promise.resolve();
    expect(h.rpc).toHaveBeenCalledTimes(1);
    const reply = body();
    pending.resolve(success(ack(reply)));
    const returned = await result;
    reply.operationId = OTHER;
    reply.proof.claim.binding.ownerId = OTHER;
    expect(returned).toEqual(ack(body()));
    expect(Object.isFrozen(request)).toBe(false);
  });

  it("does not sample local time or manufacture newer verification", async () => {
    const h = fixture();
    const clock = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("unexpected clock");
    });
    try {
      expect(await h.ports.mark(body())).toEqual(ack(body()));
      expect(clock).not.toHaveBeenCalled();
    } finally {
      clock.mockRestore();
    }
  });

  it("accepts exact null-prototype records without treating their shape as Auth", async () => {
    const h = fixture(),
      request = body();
    for (const value of Object.values(levels(request))) Object.setPrototypeOf(value, null);
    const reply = ack(structuredClone(request));
    Object.setPrototypeOf(reply, null);
    h.rpc.mockResolvedValueOnce(success(reply));
    expect(await h.ports.mark(request)).toEqual(ack(body()));
  });

  it.each([1, 30_000])(
    "accepts a static %i ms interval without asserting current freshness",
    async (duration) => {
      const h = fixture(),
        request = body();
      request.proof.expiresAt = request.proof.verifiedAt + duration;
      expect(await h.ports.mark(request)).toEqual(ack(request));
    },
  );

  it.each([1, Number.MAX_SAFE_INTEGER])(
    "preserves safe positive pool version %s",
    async (version) => {
      const h = fixture(),
        request = body();
      request.expectedPoolVersion = version;
      request.proof.verifiedAt = 0;
      request.proof.expiresAt = 1;
      request.proof.effectiveExpiresAt = 1;
      request.proof.identityExpiresAt = Number.MAX_SAFE_INTEGER;
      request.proof.claim.expiresAt = Number.MAX_SAFE_INTEGER;
      request.proof.parentVersion = Number.MAX_SAFE_INTEGER;
      request.proof.claim.binding.threadRevision = 0;
      expect(await h.ports.mark(request)).toEqual(ack(request));
    },
  );

  const invalid: [string, (r: MutableRequest) => void][] = [
    [
      "zero pool version",
      (r) => {
        r.expectedPoolVersion = 0;
      },
    ],
    [
      "negative pool version",
      (r) => {
        r.expectedPoolVersion = -1;
      },
    ],
    [
      "fractional pool version",
      (r) => {
        r.expectedPoolVersion = 1.5;
      },
    ],
    [
      "unsafe pool version",
      (r) => {
        r.expectedPoolVersion = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      "infinite pool version",
      (r) => {
        r.expectedPoolVersion = Infinity;
      },
    ],
    [
      "NaN pool version",
      (r) => {
        r.expectedPoolVersion = NaN;
      },
    ],
    [
      "coerced pool version",
      (r) => {
        record(r).expectedPoolVersion = "7";
      },
    ],
    [
      "uppercase operation ID",
      (r) => {
        r.operationId = OPERATION.toUpperCase();
      },
    ],
    [
      "non-UUID operation ID",
      (r) => {
        r.operationId = "operation";
      },
    ],
    [
      "claim proof at marker",
      (r) => {
        record(r.proof).operation = "claim";
      },
    ],
    [
      "unknown proof operation",
      (r) => {
        record(r.proof).operation = "mark";
      },
    ],
    [
      "missing request protocol",
      (r) => {
        delete record(r).protocol;
      },
    ],
    [
      "legacy request protocol",
      (r) => {
        record(r).protocol = 1;
      },
    ],
    [
      "coerced request protocol",
      (r) => {
        record(r).protocol = "2";
      },
    ],
    [
      "missing proof protocol",
      (r) => {
        delete record(r.proof).protocol;
      },
    ],
    [
      "legacy nested proof",
      (r) => {
        record(r.proof).protocol = 1;
      },
    ],
    [
      "coerced proof protocol",
      (r) => {
        record(r.proof).protocol = "2";
      },
    ],
    [
      "zero proof duration",
      (r) => {
        r.proof.expiresAt = r.proof.verifiedAt;
      },
    ],
    [
      "negative proof duration",
      (r) => {
        r.proof.expiresAt = r.proof.verifiedAt - 1;
      },
    ],
    [
      "overlong proof duration",
      (r) => {
        r.proof.expiresAt = r.proof.verifiedAt + 30_001;
      },
    ],
    [
      "proof above effective ceiling",
      (r) => {
        r.proof.effectiveExpiresAt = r.proof.expiresAt - 1;
      },
    ],
    [
      "effective above claim ceiling",
      (r) => {
        r.proof.claim.expiresAt = r.proof.effectiveExpiresAt - 1;
      },
    ],
    [
      "effective above Auth ceiling",
      (r) => {
        r.proof.identityExpiresAt = r.proof.effectiveExpiresAt - 1;
      },
    ],
    [
      "Auth expiry at verification",
      (r) => {
        r.proof.identityExpiresAt = r.proof.verifiedAt;
      },
    ],
    [
      "negative verification",
      (r) => {
        r.proof.verifiedAt = -1;
      },
    ],
    [
      "fractional verification",
      (r) => {
        r.proof.verifiedAt += 0.5;
      },
    ],
    [
      "unsafe expiry",
      (r) => {
        r.proof.identityExpiresAt = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      "coerced verification",
      (r) => {
        record(r.proof).verifiedAt = String(VERIFIED);
      },
    ],
    [
      "negative parent version",
      (r) => {
        r.proof.parentVersion = -1;
      },
    ],
    [
      "unsafe revision",
      (r) => {
        r.proof.claim.binding.threadRevision = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      "uppercase Auth identity",
      (r) => {
        r.proof.authSessionId = OTHER.toUpperCase();
      },
    ],
    [
      "uppercase fingerprint",
      (r) => {
        r.proof.authorityFingerprint = "B".repeat(64);
      },
    ],
    [
      "non-string approval digest",
      (r) => {
        record(r.proof.claim.binding).approvalDigest = 3;
      },
    ],
    [
      "incorrect scope",
      (r) => {
        record(r.proof.claim.binding).scope = "participant-voice-session";
      },
    ],
    [
      "supplied consumption metadata",
      (r) => {
        record(r.proof).consumedAt = null;
      },
    ],
    [
      "unexpected authority token",
      (r) => {
        record(r).activeAuthority = "private-token";
      },
    ],
    [
      "legacy Auth field names",
      (r) => {
        const p = record(r.proof);
        p.ownerSessionId = p.authSessionId;
        p.sessionVersion = p.parentVersion;
        delete p.authSessionId;
        delete p.parentVersion;
      },
    ],
  ];
  it.each(invalid)("rejects %s before consuming any proof", async (_label, mutate) => {
    const h = fixture(),
      request = body();
    mutate(request);
    await reject(h.ports.mark(request));
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("rejects nil identities throughout the request before SQL", async () => {
    const paths = [
      ["operationId"],
      ...["receiptId", "cleanupId", "authSessionId"].map((k) => ["proof", k]),
      ["proof", "claim", "claimId"],
      ...["ownerId", "threadId", "threadIncarnation", "attemptId", "approvalId"].map((k) => [
        "proof",
        "claim",
        "binding",
        k,
      ]),
    ];
    for (const path of paths) {
      const h = fixture(),
        request = body();
      let target = record(request);
      for (const key of path.slice(0, -1)) target = target[key] as Record<string, unknown>;
      target[path.at(-1)!] = NIL;
      await reject(h.ports.mark(request));
      expect(h.rpc).not.toHaveBeenCalled();
    }
  });

  it("rejects inherited, symbol and hidden fields at every request boundary", async () => {
    for (const level of ["request", "proof", "claim", "binding"] as const) {
      for (const kind of ["inherited", "symbol", "hidden", "missing", "extra"] as const) {
        const h = fixture(),
          request = body(),
          target = record(levels(request)[level]);
        if (kind === "inherited") Object.setPrototypeOf(target, { inherited: true });
        if (kind === "symbol") Object.defineProperty(target, Symbol("extra"), { value: true });
        if (kind === "hidden") Object.defineProperty(target, "extra", { value: true });
        if (kind === "missing") delete target[Object.keys(target)[0]];
        if (kind === "extra") target.extra = true;
        await reject(h.ports.mark(request));
        expect(h.rpc).not.toHaveBeenCalled();
      }
    }
  });

  it("never evaluates rejected request getters, including nested interval and operation fields", async () => {
    for (const [level, key] of [
      ["request", "proof"],
      ["request", "operationId"],
      ["request", "expectedPoolVersion"],
      ["proof", "operation"],
      ["proof", "verifiedAt"],
      ["claim", "expiresAt"],
      ["binding", "ownerId"],
    ] as const) {
      const h = fixture(),
        request = body(),
        getter = vi.fn(() => {
          throw new Error("private getter");
        });
      Object.defineProperty(levels(request)[level], key, { get: getter, enumerable: true });
      await reject(h.ports.mark(request));
      expect(getter).not.toHaveBeenCalled();
      expect(h.rpc).not.toHaveBeenCalled();
    }
  });

  const mismatches: [string, (r: MutableRequest) => void][] = [
    [
      "operation ID",
      (r) => {
        r.operationId = OTHER;
      },
    ],
    [
      "expected pool version",
      (r) => {
        r.expectedPoolVersion++;
      },
    ],
    [
      "receipt",
      (r) => {
        r.proof.receiptId = OTHER;
      },
    ],
    [
      "cleanup",
      (r) => {
        r.proof.cleanupId = OTHER;
      },
    ],
    [
      "Auth session",
      (r) => {
        r.proof.authSessionId = OTHER;
      },
    ],
    [
      "parent version",
      (r) => {
        r.proof.parentVersion++;
      },
    ],
    [
      "fingerprint",
      (r) => {
        r.proof.authorityFingerprint = "d".repeat(64);
      },
    ],
    [
      "Auth expiry",
      (r) => {
        r.proof.identityExpiresAt++;
      },
    ],
    [
      "original verification",
      (r) => {
        r.proof.verifiedAt++;
      },
    ],
    [
      "receipt expiry",
      (r) => {
        r.proof.expiresAt++;
      },
    ],
    [
      "effective expiry",
      (r) => {
        r.proof.effectiveExpiresAt++;
      },
    ],
    [
      "claim",
      (r) => {
        r.proof.claim.claimId = OTHER;
      },
    ],
    [
      "claim expiry",
      (r) => {
        r.proof.claim.expiresAt++;
      },
    ],
    [
      "owner",
      (r) => {
        r.proof.claim.binding.ownerId = OTHER;
      },
    ],
    [
      "thread",
      (r) => {
        r.proof.claim.binding.threadId = OTHER;
      },
    ],
    [
      "incarnation",
      (r) => {
        r.proof.claim.binding.threadIncarnation = OTHER;
      },
    ],
    [
      "revision",
      (r) => {
        r.proof.claim.binding.threadRevision++;
      },
    ],
    [
      "attempt",
      (r) => {
        r.proof.claim.binding.attemptId = OTHER;
      },
    ],
    [
      "approval",
      (r) => {
        r.proof.claim.binding.approvalId = OTHER;
      },
    ],
    [
      "approval digest",
      (r) => {
        r.proof.claim.binding.approvalDigest = "d".repeat(64);
      },
    ],
  ];
  it.each(mismatches)(
    "rejects mismatched %s under every status, including denial and already-marked",
    async (_label, mutate) => {
      for (const status of statuses) {
        const h = fixture(),
          request = body();
        mutate(request);
        h.rpc.mockResolvedValueOnce(success(ack(request, status)));
        await reject(h.ports.mark(body()));
        expect(h.rpc).toHaveBeenCalledTimes(1);
      }
    },
  );

  it("rejects refreshed or shortened original evidence", async () => {
    for (const kind of ["shortened", "refreshed"] as const) {
      const h = fixture(),
        request = body();
      if (kind === "shortened") request.proof.effectiveExpiresAt = request.proof.expiresAt;
      else {
        request.proof.verifiedAt += 100;
        request.proof.expiresAt += 100;
      }
      h.rpc.mockResolvedValueOnce(success(ack(request)));
      await reject(h.ports.mark(body()));
      expect(h.rpc).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects legacy, mixed-protocol, minimal and augmented acknowledgments", async () => {
    const request = body();
    for (const value of [
      null,
      request,
      { claim: request.proof.claim, state: "marked" },
      { protocol: 2, proof: request.proof, status: "marked" },
      { request, status: "marked" },
      { ...ack(request), protocol: 1 },
      { ...ack(request), protocol: "2" },
      ack({ ...request, protocol: 1 }),
      ack({ ...request, proof: { ...request.proof, protocol: 1 } }),
      ack({ ...request, proof: { ...request.proof, operation: "claim" } }),
      ack({ ...request, proof: { ...request.proof, expiresAt: VERIFIED } }),
      ack({ ...request, proof: { ...request.proof, consumedAt: 1 } }),
      { ...ack(request), state: "marked" },
      { ...ack(request), canDispatch: true },
      ...["claimed", "active", "replayed", "uncertain", true, null].map((status) => ({
        ...ack(request),
        status,
      })),
    ]) {
      const h = fixture();
      h.rpc.mockResolvedValueOnce(success(value));
      await reject(h.ports.mark(body()));
      expect(h.rpc).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects reply accessors without reading their values", async () => {
    for (const level of ["ack", "request", "proof", "claim", "binding"] as const) {
      const h = fixture(),
        request = body(),
        reply = ack(request);
      const target = level === "ack" ? reply : levels(request)[level];
      const key =
        level === "ack"
          ? "status"
          : level === "request"
            ? "operationId"
            : level === "proof"
              ? "verifiedAt"
              : level === "claim"
                ? "expiresAt"
                : "ownerId";
      const getter = vi.fn(() => {
        throw new Error("private reply getter");
      });
      Object.defineProperty(target, key, { enumerable: true, get: getter });
      h.rpc.mockResolvedValueOnce(success(reply));
      await reject(h.ports.mark(body()));
      expect(getter).not.toHaveBeenCalled();
      expect(h.rpc).toHaveBeenCalledTimes(1);
    }
  });

  it.each(["lost", "malformed", "SQL error"] as const)(
    "retains uncertainty after modeled committed %s response without replay or replacement identity",
    async (mode) => {
      const h = fixture(),
        retained = body(),
        committed: unknown[] = [];
      h.rpc.mockImplementationOnce(async (_name, args) => {
        committed.push(structuredClone(args.p_request));
        if (mode === "lost") throw new Error(`private transport ${OPERATION}`);
        if (mode === "SQL error")
          return { data: ack(args.p_request), error: { message: "private SQL" } };
        return success({ status: "marked" });
      });
      const error = await h.ports.mark(retained).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(ERROR);
      expect((error as Error).cause).toBeUndefined();
      expect(Object.keys(error as Error)).toEqual([]);
      expect(committed).toEqual([body()]);
      expect(retained).toEqual(body());
      await Promise.resolve();
      expect(h.rpc).toHaveBeenCalledTimes(1);
    },
  );

  it.each([199, 300, 200.5, "200", Infinity, NaN])(
    "rejects contradictory HTTP status %s without retry",
    async (status) => {
      const h = fixture();
      h.rpc.mockResolvedValueOnce({ data: ack(body()), error: null, status });
      await reject(h.ports.mark(body()));
      expect(h.rpc).toHaveBeenCalledTimes(1);
    },
  );

  it("accepts success envelopes with absent status or ordinary transport metadata", async () => {
    for (const envelope of [
      { data: ack(body()), error: null },
      { data: ack(body()), error: null, status: 299, statusText: "success", count: null },
    ]) {
      const h = fixture();
      h.rpc.mockResolvedValueOnce(envelope);
      expect(await h.ports.mark(body())).toEqual(ack(body()));
    }
  });

  it("rejects missing, malformed or erroneous envelopes with sanitized failures", async () => {
    for (const raw of [
      null,
      undefined,
      [],
      ack(body()),
      { data: ack(body()) },
      { data: ack(body()), error: undefined },
      { data: ack(body()), error: false },
      { data: ack(body()), error: { message: "private detail" } },
    ]) {
      const h = fixture();
      h.rpc.mockResolvedValueOnce(raw);
      await reject(h.ports.mark(body()));
      expect(h.rpc).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects inherited or accessor envelope authority without evaluating getters", async () => {
    for (const key of ["data", "error", "status"] as const) {
      const h = fixture(),
        envelope = success(ack(body()));
      const getter = vi.fn(() => {
        throw new Error("private envelope getter");
      });
      Object.defineProperty(envelope, key, { enumerable: true, get: getter });
      h.rpc.mockResolvedValueOnce(envelope);
      await reject(h.ports.mark(body()));
      expect(getter).not.toHaveBeenCalled();
    }
    const h = fixture();
    h.rpc.mockResolvedValueOnce(Object.create(success(ack(body()))));
    await reject(h.ports.mark(body()));
  });

  it("rejects nonobject inputs and unavailable clients before SQL", async () => {
    for (const raw of [null, undefined, 1, "request", [], new Date(0)]) {
      const h = fixture();
      await reject(h.ports.mark(raw as unknown as VoiceV2MarkRequest));
      expect(h.rpc).not.toHaveBeenCalled();
    }
    for (const raw of [null, undefined, {}, { rpc: false }])
      expect(() => createVoiceV2MarkRpcPorts(raw as unknown as VoiceV2MarkRpcClient)).toThrow(
        ERROR,
      );
    expect(() =>
      createVoiceV2MarkRpcPorts({
        get rpc(): VoiceV2MarkRpcClient["rpc"] {
          throw new Error("private client getter");
        },
      }),
    ).toThrow(ERROR);
  });
});
