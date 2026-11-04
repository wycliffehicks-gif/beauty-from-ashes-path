// Fictional protected transport only. Actual SQL/current-state has its own suite.
// No real Auth, credentials, private content, provider or application route.
import { describe, expect, it, vi } from "vitest";
import {
  createVoiceV2CurrentRpcPorts,
  type VoiceV2CurrentQuery,
  type VoiceV2CurrentReceipt,
  type VoiceV2CurrentRpcClient,
  type VoiceV2CurrentRpcName,
} from "../service/voice-v2-current-rpc.server";

const OWNER = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";
const THREAD = "33333333-3333-4333-8333-333333333333";
const INCARNATION = "44444444-4444-4444-8444-444444444444";
const ATTEMPT = "77777777-7777-4777-8777-777777777777";
const APPROVAL = "88888888-8888-4888-8888-888888888888";
const OTHER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NIL = "00000000-0000-0000-0000-000000000000";
const VERIFIED = 1_900_000_000_000;
const ERROR = "voice-v2-current-rpc-unavailable";
function query() {
  return {
    protocol: 2 as const,
    ownerId: OWNER,
    authSessionId: SESSION,
    parentVersion: 3,
    threadId: THREAD,
    attemptId: ATTEMPT,
    authorityFingerprint: "a".repeat(64),
    verifiedAt: VERIFIED,
    identityExpiresAt: VERIFIED + 60_000,
  };
}
function receipt(request = query()) {
  const thread = {
    ownerId: request.ownerId,
    threadId: request.threadId,
    threadIncarnation: INCARNATION,
    threadRevision: 4,
  };
  return {
    protocol: 2 as const,
    request: structuredClone(request),
    current: {
      ...thread,
      deleted: false as const,
      allowlist: {
        ownerId: request.ownerId,
        admitted: true as const,
        expiresAt: VERIFIED + 90_000,
      },
      authority: {
        ...thread,
        fingerprint: request.authorityFingerprint,
        issuedAt: VERIFIED - 30_000,
        expiresAt: VERIFIED + 120_000,
        revoked: false as const,
      },
      approval: {
        ...thread,
        id: APPROVAL,
        digest: "b".repeat(64),
        scope: "developer-voice-session" as const,
        attemptId: request.attemptId,
        expiresAt: VERIFIED + 100_000,
        revoked: false as const,
      },
    },
  };
}
type MutableQuery = ReturnType<typeof query>;
type MutableReceipt = ReturnType<typeof receipt>;
const record = (value: object): Record<string, unknown> => value as Record<string, unknown>;
const success = (data: unknown) => ({ data, error: null, status: 200 });
function fixture() {
  const rpc = vi.fn(
    async (
      _name: VoiceV2CurrentRpcName,
      args: Readonly<Record<string, unknown>>,
    ): Promise<unknown> => success(receipt(args.p_request as MutableQuery)),
  );
  return { rpc, ports: createVoiceV2CurrentRpcPorts({ rpc }) };
}
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
function levels(value: MutableReceipt) {
  return {
    receipt: value,
    request: value.request,
    current: value.current,
    allowlist: value.current.allowlist,
    authority: value.current.authority,
    approval: value.current.approval,
  };
}

describe("inactive v2 post-issuance current transport", () => {
  it("maps one exact request and returns a detached deeply frozen content-free observation", async () => {
    const h = fixture(),
      request = query(),
      expected = receipt(request);
    const result = await h.ports.readCurrent(request);
    expect(result).toEqual(expected);
    expect(h.rpc.mock.calls).toEqual([["bfa_p5_v2_read_current", { p_request: request }]]);
    expect(Object.keys(h.ports)).toEqual(["readCurrent"]);
    expect(Object.keys(result!).sort()).toEqual(["current", "protocol", "request"]);
    const args = h.rpc.mock.calls[0][1],
      captured = args.p_request as VoiceV2CurrentQuery;
    expect(captured).not.toBe(request);
    expect(result!.request).not.toBe(captured);
    for (const value of [
      h.ports,
      args,
      captured,
      ...Object.values(levels(result as MutableReceipt)),
    ])
      expect(Object.isFrozen(value)).toBe(true);
    expect(Object.keys(result!.current).sort()).toEqual([
      "allowlist",
      "approval",
      "authority",
      "deleted",
      "ownerId",
      "threadId",
      "threadIncarnation",
      "threadRevision",
    ]);
    expect(Object.isFrozen(request)).toBe(false);
  });

  it("keeps SQL null as denial with one call and no repair, fallback, or shared cache", async () => {
    const h = fixture();
    h.rpc.mockResolvedValueOnce(success(null));
    expect(await h.ports.readCurrent(query())).toBeNull();
    await Promise.resolve();
    expect(h.rpc).toHaveBeenCalledTimes(1);
    expect(await h.ports.readCurrent(query())).toEqual(receipt());
    expect(h.rpc).toHaveBeenCalledTimes(2);
  });

  it("captures the protected transport method once with its receiver", async () => {
    let reads = 0;
    const original = vi.fn(async function (
      this: { tag: string },
      _name: VoiceV2CurrentRpcName,
      args: Readonly<Record<string, unknown>>,
    ) {
      expect(this.tag).toBe("fictional protected host");
      return success(receipt(args.p_request as MutableQuery));
    });
    const client = {
      tag: "fictional protected host",
      get rpc() {
        reads++;
        return original;
      },
    };
    const ports = createVoiceV2CurrentRpcPorts(client),
      replacement = vi.fn();
    Object.defineProperty(client, "rpc", { value: replacement });
    expect(await ports.readCurrent(query())).toEqual(receipt());
    expect(reads).toBe(1);
    expect(original).toHaveBeenCalledTimes(1);
    expect(replacement).not.toHaveBeenCalled();
  });

  it("detaches original request before waiting and returned records before caller mutation", async () => {
    const h = fixture(),
      pending = deferred(),
      request = query();
    h.rpc.mockReturnValueOnce(pending.promise);
    const result = h.ports.readCurrent(request);
    request.ownerId = OTHER;
    request.authSessionId = OTHER;
    request.parentVersion++;
    request.verifiedAt++;
    request.identityExpiresAt--;
    expect(h.rpc.mock.calls[0][1]).toEqual({ p_request: query() });
    const reply = receipt();
    pending.resolve(success(reply));
    const returned = await result;
    for (const value of Object.values(levels(reply))) record(value).mutated = true;
    reply.current.authority.expiresAt++;
    reply.request.verifiedAt++;
    expect(returned).toEqual(receipt());
  });

  it("keeps overlapping invocations separate and rejects a reply associated with the other query", async () => {
    const h = fixture(),
      first = deferred(),
      second = deferred();
    const a = query(),
      b = { ...query(), attemptId: OTHER, verifiedAt: VERIFIED + 1 };
    h.rpc.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const pa = h.ports.readCurrent(a),
      pb = h.ports.readCurrent(b);
    second.resolve(success(receipt(b)));
    expect(await pb).toEqual(receipt(b));
    first.resolve(success(receipt(b)));
    await reject(pa);
    expect(h.rpc).toHaveBeenCalledTimes(2);
    expect(h.rpc.mock.calls.map((call) => call[1].p_request)).toEqual([a, b]);
  });

  it("does not sample local time or refresh original verification from a reply", async () => {
    const h = fixture(),
      clock = vi.spyOn(Date, "now").mockImplementation(() => {
        throw new Error("Unexpected clock");
      });
    try {
      expect(await h.ports.readCurrent(query())).toEqual(receipt());
      expect(clock).not.toHaveBeenCalled();
    } finally {
      clock.mockRestore();
    }
  });

  it("preserves original issuance expiry when current Auth has a shorter ceiling", async () => {
    const h = fixture(),
      request = { ...query(), identityExpiresAt: VERIFIED + 1 };
    const expected = receipt(request);
    expect(expected.current.authority.expiresAt).toBeGreaterThan(request.identityExpiresAt);
    expect(await h.ports.readCurrent(request)).toEqual(expected);
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it("allows issuance after verification start without inventing an observed-now timestamp", async () => {
    const h = fixture(),
      reply = receipt();
    reply.current.authority.issuedAt = VERIFIED + 1;
    h.rpc.mockResolvedValueOnce(success(reply));
    expect(await h.ports.readCurrent(query())).toEqual(reply);
    expect(Object.hasOwn(reply, "observedAt")).toBe(false);
  });

  it.each([1, 900_000])(
    "accepts an immutable %i ms issuance interval without asserting present freshness",
    async (duration) => {
      const h = fixture(),
        reply = receipt();
      reply.current.authority.issuedAt = VERIFIED + 1;
      reply.current.authority.expiresAt = VERIFIED + 1 + duration;
      h.rpc.mockResolvedValueOnce(success(reply));
      expect(await h.ports.readCurrent(query())).toEqual(reply);
    },
  );

  it("accepts safe zero and maximum numeric boundaries with exact static intervals", async () => {
    const h = fixture(),
      request = {
        ...query(),
        verifiedAt: 0,
        identityExpiresAt: 1,
        parentVersion: Number.MAX_SAFE_INTEGER,
      };
    const reply = receipt(request);
    reply.current.threadRevision = Number.MAX_SAFE_INTEGER;
    reply.current.authority.threadRevision = Number.MAX_SAFE_INTEGER;
    reply.current.approval.threadRevision = Number.MAX_SAFE_INTEGER;
    reply.current.authority.issuedAt = Number.MAX_SAFE_INTEGER - 1;
    reply.current.authority.expiresAt = Number.MAX_SAFE_INTEGER;
    h.rpc.mockResolvedValueOnce(success(reply));
    expect(await h.ports.readCurrent(request)).toEqual(reply);
  });

  it("accepts null-prototype own-data records without treating shape as authenticated provenance", async () => {
    const h = fixture(),
      request = query(),
      reply = receipt();
    Object.setPrototypeOf(request, null);
    for (const value of Object.values(levels(reply))) Object.setPrototypeOf(value, null);
    h.rpc.mockResolvedValueOnce(success(reply));
    expect(await h.ports.readCurrent(request)).toEqual(receipt());
  });

  const badQueries: [string, (q: Record<string, unknown>) => void][] = [
    [
      "missing protocol",
      (q) => {
        delete q.protocol;
      },
    ],
    [
      "legacy protocol",
      (q) => {
        q.protocol = 1;
      },
    ],
    [
      "string protocol",
      (q) => {
        q.protocol = "2";
      },
    ],
    [
      "extra field",
      (q) => {
        q.allow = true;
      },
    ],
    [
      "uppercase UUID",
      (q) => {
        q.ownerId = OTHER.toUpperCase();
      },
    ],
    [
      "noncanonical UUID",
      (q) => {
        q.authSessionId = "session";
      },
    ],
    [
      "negative version",
      (q) => {
        q.parentVersion = -1;
      },
    ],
    [
      "fractional version",
      (q) => {
        q.parentVersion = 1.5;
      },
    ],
    [
      "string version",
      (q) => {
        q.parentVersion = "3";
      },
    ],
    [
      "unsafe version",
      (q) => {
        q.parentVersion = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      "uppercase fingerprint",
      (q) => {
        q.authorityFingerprint = "A".repeat(64);
      },
    ],
    [
      "short fingerprint",
      (q) => {
        q.authorityFingerprint = "a".repeat(63);
      },
    ],
    [
      "negative verification",
      (q) => {
        q.verifiedAt = -1;
      },
    ],
    [
      "fractional verification",
      (q) => {
        q.verifiedAt = VERIFIED + 0.5;
      },
    ],
    [
      "unsafe verification",
      (q) => {
        q.verifiedAt = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      "zero expiry",
      (q) => {
        q.identityExpiresAt = 0;
      },
    ],
    [
      "nonpositive interval",
      (q) => {
        q.identityExpiresAt = VERIFIED;
      },
    ],
    [
      "backward interval",
      (q) => {
        q.identityExpiresAt = VERIFIED - 1;
      },
    ],
    [
      "unsafe expiry",
      (q) => {
        q.identityExpiresAt = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      "NaN expiry",
      (q) => {
        q.identityExpiresAt = NaN;
      },
    ],
    [
      "infinite expiry",
      (q) => {
        q.identityExpiresAt = Infinity;
      },
    ],
    [
      "coerced time",
      (q) => {
        q.verifiedAt = String(VERIFIED);
      },
    ],
  ];
  it.each(badQueries)("rejects %s before transport", async (_label, change) => {
    const h = fixture(),
      request = query();
    change(record(request));
    await reject(h.ports.readCurrent(request));
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("rejects nil identities and missing required fields throughout the query", async () => {
    const h = fixture();
    for (const key of ["ownerId", "authSessionId", "threadId", "attemptId"]) {
      const request = query();
      record(request)[key] = NIL;
      await reject(h.ports.readCurrent(request));
    }
    for (const key of Object.keys(query())) {
      const request = query();
      delete record(request)[key];
      await reject(h.ports.readCurrent(request));
    }
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("rejects inherited, hidden and symbol query authority without evaluating getters", async () => {
    const h = fixture(),
      getters = vi.fn(() => VERIFIED);
    for (const key of Object.keys(query())) {
      const request = query();
      Object.defineProperty(request, key, { get: getters, enumerable: true });
      await reject(h.ports.readCurrent(request));
    }
    const inherited = Object.create(query());
    await reject(h.ports.readCurrent(inherited));
    for (const key of ["hidden", Symbol("hidden")]) {
      const request = query();
      Object.defineProperty(request, key, { value: 1 });
      await reject(h.ports.readCurrent(request));
    }
    expect(getters).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  const changedRequests: [string, (q: MutableQuery) => void][] = [
    [
      "owner",
      (q) => {
        q.ownerId = OTHER;
      },
    ],
    [
      "Auth session",
      (q) => {
        q.authSessionId = OTHER;
      },
    ],
    [
      "parent version",
      (q) => {
        q.parentVersion++;
      },
    ],
    [
      "thread",
      (q) => {
        q.threadId = OTHER;
      },
    ],
    [
      "attempt",
      (q) => {
        q.attemptId = OTHER;
      },
    ],
    [
      "fingerprint",
      (q) => {
        q.authorityFingerprint = "c".repeat(64);
      },
    ],
    [
      "verification start",
      (q) => {
        q.verifiedAt++;
      },
    ],
    [
      "shorter Auth expiry",
      (q) => {
        q.identityExpiresAt--;
      },
    ],
    [
      "longer Auth expiry",
      (q) => {
        q.identityExpiresAt++;
      },
    ],
  ];
  it.each(changedRequests)(
    "rejects an otherwise valid receipt echoing a different %s",
    async (_label, change) => {
      const h = fixture(),
        altered = query();
      change(altered);
      h.rpc.mockResolvedValueOnce(success(receipt(altered)));
      await reject(h.ports.readCurrent(query()));
      expect(h.rpc).toHaveBeenCalledTimes(1);
    },
  );

  const mismatches: [string, (r: MutableReceipt) => void][] = [
    [
      "current owner",
      (r) => {
        r.current.ownerId = OTHER;
      },
    ],
    [
      "current thread",
      (r) => {
        r.current.threadId = OTHER;
      },
    ],
    [
      "allowlist owner",
      (r) => {
        r.current.allowlist.ownerId = OTHER;
      },
    ],
    [
      "authority owner",
      (r) => {
        r.current.authority.ownerId = OTHER;
      },
    ],
    [
      "authority thread",
      (r) => {
        r.current.authority.threadId = OTHER;
      },
    ],
    [
      "authority incarnation",
      (r) => {
        r.current.authority.threadIncarnation = OTHER;
      },
    ],
    [
      "authority revision",
      (r) => {
        r.current.authority.threadRevision++;
      },
    ],
    [
      "authority fingerprint",
      (r) => {
        r.current.authority.fingerprint = "c".repeat(64);
      },
    ],
    [
      "approval owner",
      (r) => {
        r.current.approval.ownerId = OTHER;
      },
    ],
    [
      "approval thread",
      (r) => {
        r.current.approval.threadId = OTHER;
      },
    ],
    [
      "approval incarnation",
      (r) => {
        r.current.approval.threadIncarnation = OTHER;
      },
    ],
    [
      "approval revision",
      (r) => {
        r.current.approval.threadRevision++;
      },
    ],
    [
      "approval attempt",
      (r) => {
        r.current.approval.attemptId = OTHER;
      },
    ],
  ];
  it.each(mismatches)("rejects mismatched %s without retries", async (_label, change) => {
    const h = fixture(),
      reply = receipt();
    change(reply);
    h.rpc.mockResolvedValueOnce(success(reply));
    await reject(h.ports.readCurrent(query()));
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  const malformedStates: [string, (r: MutableReceipt) => void][] = [
    [
      "legacy envelope",
      (r) => {
        record(r).protocol = 1;
      },
    ],
    [
      "legacy request",
      (r) => {
        record(r.request).protocol = 1;
      },
    ],
    [
      "deleted thread",
      (r) => {
        record(r.current).deleted = true;
      },
    ],
    [
      "withdrawn allowlist",
      (r) => {
        record(r.current.allowlist).admitted = false;
      },
    ],
    [
      "revoked authority",
      (r) => {
        record(r.current.authority).revoked = true;
      },
    ],
    [
      "revoked approval",
      (r) => {
        record(r.current.approval).revoked = true;
      },
    ],
    [
      "wrong approval scope",
      (r) => {
        record(r.current.approval).scope = "participant";
      },
    ],
    [
      "invalid approval digest",
      (r) => {
        r.current.approval.digest = "z".repeat(64);
      },
    ],
    [
      "nil approval",
      (r) => {
        r.current.approval.id = NIL;
      },
    ],
    [
      "nil incarnation",
      (r) => {
        r.current.threadIncarnation = NIL;
      },
    ],
    [
      "fractional revision",
      (r) => {
        r.current.threadRevision = 0.5;
      },
    ],
    [
      "unsafe revision",
      (r) => {
        r.current.threadRevision = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      "negative issuance",
      (r) => {
        r.current.authority.issuedAt = -1;
      },
    ],
    [
      "fractional issuance",
      (r) => {
        r.current.authority.issuedAt = VERIFIED + 0.5;
      },
    ],
    [
      "unsafe issuance",
      (r) => {
        r.current.authority.issuedAt = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      "zero authority interval",
      (r) => {
        r.current.authority.issuedAt = r.current.authority.expiresAt;
      },
    ],
    [
      "overlong authority interval",
      (r) => {
        r.current.authority.expiresAt = r.current.authority.issuedAt + 900_001;
      },
    ],
    [
      "zero authority expiry",
      (r) => {
        r.current.authority.expiresAt = 0;
      },
    ],
  ];
  it.each(malformedStates)("rejects %s in protected replies", async (_label, change) => {
    const h = fixture(),
      reply = receipt();
    change(reply);
    h.rpc.mockResolvedValueOnce(success(reply));
    await reject(h.ports.readCurrent(query()));
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it.each(["allowlist", "authority", "approval"] as const)(
    "rejects %s already expired at original verification",
    async (name) => {
      const h = fixture();
      for (const expiry of [VERIFIED - 1, VERIFIED]) {
        const reply = receipt();
        reply.current[name].expiresAt = expiry;
        h.rpc.mockResolvedValueOnce(success(reply));
        await reject(h.ports.readCurrent(query()));
      }
      expect(h.rpc).toHaveBeenCalledTimes(2);
    },
  );

  it("rejects extra, missing, inherited, hidden and symbol fields at every reply record", async () => {
    const h = fixture();
    for (const key of Object.keys(levels(receipt())) as (keyof ReturnType<typeof levels>)[]) {
      for (const mode of ["extra", "missing", "inherited", "hidden", "symbol"]) {
        const reply = receipt(),
          value = levels(reply)[key],
          target = record(value);
        if (mode === "extra") target.extra = true;
        if (mode === "missing") delete target[Object.keys(target)[0]];
        if (mode === "inherited") Object.setPrototypeOf(target, { invented: true });
        if (mode === "hidden") Object.defineProperty(target, "hidden", { value: true });
        if (mode === "symbol") Object.defineProperty(target, Symbol("hidden"), { value: true });
        h.rpc.mockResolvedValueOnce(success(reply));
        await reject(h.ports.readCurrent(query()));
      }
    }
    expect(h.rpc).toHaveBeenCalledTimes(30);
  });

  it("never evaluates rejected nested reply getters, including cross-field interval values", async () => {
    const h = fixture(),
      getters = vi.fn(() => "private value");
    for (const [level, key] of [
      ["receipt", "protocol"],
      ["request", "verifiedAt"],
      ["current", "ownerId"],
      ["allowlist", "expiresAt"],
      ["authority", "issuedAt"],
      ["authority", "expiresAt"],
      ["approval", "expiresAt"],
    ] as const) {
      const reply = receipt();
      Object.defineProperty(levels(reply)[level], key, { get: getters, enumerable: true });
      h.rpc.mockResolvedValueOnce(success(reply));
      await reject(h.ports.readCurrent(query()));
    }
    expect(getters).not.toHaveBeenCalled();
    expect(h.rpc).toHaveBeenCalledTimes(7);
  });

  it("rejects unversioned, minimal, augmented and malformed observation bodies", async () => {
    const h = fixture();
    for (const data of [
      receipt().current,
      {},
      false,
      true,
      [],
      "allowed",
      1,
      undefined,
      { protocol: 2, request: query() },
      { ...receipt(), allow: true },
      { ...receipt(), current: null },
      { ...receipt(), request: null },
    ]) {
      h.rpc.mockResolvedValueOnce(success(data));
      await reject(h.ports.readCurrent(query()));
    }
    expect(h.rpc).toHaveBeenCalledTimes(12);
  });

  it("accepts ordinary transport metadata without granting it authority", async () => {
    const h = fixture();
    for (const envelope of [
      { data: receipt(), error: null },
      { ...success(receipt()), count: 1, statusText: "OK" },
    ]) {
      h.rpc.mockResolvedValueOnce(envelope);
      expect(await h.ports.readCurrent(query())).toEqual(receipt());
    }
  });

  it("rejects erroneous transport envelopes and does not disclose their contents", async () => {
    const h = fixture();
    for (const envelope of [
      null,
      [],
      {},
      { data: receipt() },
      { error: null },
      { data: receipt(), error: { message: "private SQL details" } },
      { data: receipt(), error: false },
      { ...success(receipt()), status: 500 },
      { ...success(receipt()), status: "200" },
      { ...success(receipt()), status: 199 },
      { ...success(receipt()), status: 300 },
      { ...success(receipt()), status: 200.5 },
    ]) {
      h.rpc.mockResolvedValueOnce(envelope);
      try {
        await h.ports.readCurrent(query());
        expect.fail("expected rejection");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe(ERROR);
        expect(Object.hasOwn(error as object, "cause")).toBe(false);
      }
    }
    expect(h.rpc).toHaveBeenCalledTimes(12);
  });

  it("rejects inherited or accessor transport authority without evaluating getters", async () => {
    const h = fixture(),
      getters = vi.fn(() => receipt());
    const envelopes: unknown[] = [Object.create(success(receipt()))];
    for (const key of ["data", "error", "status"]) {
      const envelope = success(receipt());
      Object.defineProperty(envelope, key, { get: getters, enumerable: true });
      envelopes.push(envelope);
    }
    for (const envelope of envelopes) {
      h.rpc.mockResolvedValueOnce(envelope);
      await reject(h.ports.readCurrent(query()));
    }
    expect(getters).not.toHaveBeenCalled();
    expect(h.rpc).toHaveBeenCalledTimes(4);
  });

  it.each(["throw", "reject", "late malformed"])(
    "retains one original invocation after %s uncertainty",
    async (kind) => {
      const h = fixture(),
        request = query();
      if (kind === "throw")
        h.rpc.mockImplementationOnce(() => {
          throw new Error("Private failure");
        });
      else if (kind === "reject")
        h.rpc.mockRejectedValueOnce(new Error("Committed high-water may exist"));
      else
        h.rpc.mockResolvedValueOnce(
          success({ ...receipt(), request: { ...query(), verifiedAt: VERIFIED + 1 } }),
        );
      await reject(h.ports.readCurrent(request));
      await Promise.resolve();
      expect(h.rpc).toHaveBeenCalledTimes(1);
      expect(h.rpc.mock.calls[0][1]).toEqual({ p_request: query() });
      expect(request).toEqual(query());
    },
  );

  it("rejects malformed inputs and unavailable clients without transport or fallback", async () => {
    const h = fixture();
    for (const value of [null, undefined, false, 2, "query", []])
      await reject(h.ports.readCurrent(value as unknown as VoiceV2CurrentQuery));
    expect(h.rpc).not.toHaveBeenCalled();
    for (const client of [
      null,
      undefined,
      {},
      { rpc: null },
      { rpc: 1 },
      {
        get rpc() {
          throw new Error("private getter");
        },
      },
    ])
      expect(() =>
        createVoiceV2CurrentRpcPorts(client as unknown as VoiceV2CurrentRpcClient),
      ).toThrow(ERROR);
  });

  it("returns structural receipt types without adding dispatch, approval grants or mutation helpers", async () => {
    const h = fixture();
    const result: VoiceV2CurrentReceipt | null = await h.ports.readCurrent(query());
    expect(result!.current.approval.scope).toBe("developer-voice-session");
    expect(Object.keys(h.ports)).toEqual(["readCurrent"]);
    expect(Object.keys(result!)).toEqual(["protocol", "request", "current"]);
    expect(Object.hasOwn(result!, "allow")).toBe(false);
  });
});
