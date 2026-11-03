// Fictional transport contracts only: no SQL, Auth, provider or runtime route.
// Actual isolated SQL composition is tested in the separate SQL fixture.
import { describe, expect, it, vi } from "vitest";
import {
  createVoiceV2CleanupRpcPorts,
  type VoiceV2CleanupRegistration,
  type VoiceV2CleanupReadQuery,
  type VoiceV2CleanupRpcClient,
  type VoiceV2CleanupRpcName,
} from "../service/voice-v2-cleanup-rpc.server";

const OWNER = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";
const THREAD = "33333333-3333-4333-8333-333333333333";
const INCARNATION = "44444444-4444-4444-8444-444444444444";
const CLEANUP = "55555555-5555-4555-8555-555555555555";
const CLAIM = "66666666-6666-4666-8666-666666666666";
const ATTEMPT = "77777777-7777-4777-8777-777777777777";
const APPROVAL = "88888888-8888-4888-8888-888888888888";
const OTHER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NIL = "00000000-0000-0000-0000-000000000000";
const FINGERPRINT = "b".repeat(64);
const DIGEST = "c".repeat(64);
const VERIFIED = 1_900_000_000_000;
const AUTH_EXPIRY = VERIFIED + 120_000;
const CLAIM_EXPIRY = VERIFIED + 90_000;
const EFFECTIVE = VERIFIED + 60_000;
const ERROR = "voice-v2-cleanup-rpc-unavailable";
const query = () => ({
  cleanupId: CLEANUP,
  claim: {
    claimId: CLAIM,
    binding: {
      ownerId: OWNER,
      threadId: THREAD,
      threadIncarnation: INCARNATION,
      threadRevision: 7,
      attemptId: ATTEMPT,
      approvalId: APPROVAL,
      approvalDigest: DIGEST,
      scope: "developer-voice-session" as const,
    },
    expiresAt: CLAIM_EXPIRY,
  },
  authSessionId: SESSION,
  parentVersion: 3,
  authorityFingerprint: FINGERPRINT,
});
const registration = () => ({ ...query(), verifiedAt: VERIFIED, authExpiresAt: AUTH_EXPIRY });
const receipt = () => ({
  protocol: 2,
  ...query(),
  effectiveExpiresAt: EFFECTIVE,
  closedAt: null as number | null,
  expiredAt: null as number | null,
  invalidatedAt: null as number | null,
});
const success = (data: unknown) => ({ data, error: null, status: 200, statusText: "OK" });
function fixture() {
  const rpc = vi.fn(
    async (
      _name: VoiceV2CleanupRpcName,
      _args: Readonly<Record<string, unknown>>,
    ): Promise<unknown> => success(receipt()),
  );
  return { rpc, ports: createVoiceV2CleanupRpcPorts({ rpc }) };
}
const reject = (promise: Promise<unknown>) => expect(promise).rejects.toThrow(ERROR);
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function asRecord(value: object): Record<string, unknown> {
  return value as unknown as Record<string, unknown>;
}

describe("inactive exact v2 cleanup transport", () => {
  it("constructs only frozen registration/read ports without making a request", () => {
    const h = fixture();
    expect(Object.keys(h.ports)).toEqual(["registerCleanup", "readCleanup"]);
    expect(Object.isFrozen(h.ports)).toBe(true);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("maps registration with exact nested claim and independently supplied Auth observation", async () => {
    const h = fixture();
    expect(await h.ports.registerCleanup(registration())).toEqual(receipt());
    expect(h.rpc.mock.calls).toEqual([
      [
        "bfa_p5_v2_register_cleanup",
        {
          p_cleanup_id: CLEANUP,
          p_claim: query().claim,
          p_auth_session_id: SESSION,
          p_parent_version: 3,
          p_fingerprint: FINGERPRINT,
          p_verified_ms: VERIFIED,
          p_auth_expires_ms: AUTH_EXPIRY,
        },
      ],
    ]);
    const args = h.rpc.mock.calls[0][1];
    const claim = args.p_claim as ReturnType<typeof query>["claim"];
    expect(Object.isFrozen(args)).toBe(true);
    expect(Object.isFrozen(claim)).toBe(true);
    expect(Object.isFrozen(claim.binding)).toBe(true);
  });

  it("maps exact read without a clock, fresh Auth call or write metadata", async () => {
    const h = fixture();
    const clock = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("unexpected local clock");
    });
    try {
      expect(await h.ports.readCleanup(query())).toEqual(receipt());
      expect(h.rpc.mock.calls).toEqual([
        [
          "bfa_p5_v2_read_cleanup",
          {
            p_cleanup_id: CLEANUP,
            p_claim: query().claim,
            p_auth_session_id: SESSION,
            p_parent_version: 3,
            p_fingerprint: FINGERPRINT,
          },
        ],
      ]);
    } finally {
      clock.mockRestore();
    }
  });

  it("preserves semantic-null denial as uncertainty with no retry or fallback", async () => {
    const h = fixture();
    h.rpc.mockResolvedValue(success(null));
    expect(await h.ports.registerCleanup(registration())).toBeNull();
    expect(await h.ports.readCleanup(query())).toBeNull();
    expect(h.rpc).toHaveBeenCalledTimes(2);
    expect(h.rpc.mock.calls.map((call) => call[0])).toEqual([
      "bfa_p5_v2_register_cleanup",
      "bfa_p5_v2_read_cleanup",
    ]);
  });

  it.each(["closedAt", "expiredAt", "invalidatedAt"] as const)(
    "reads retained %s evidence but refuses it as active registration acknowledgment",
    async (field) => {
      const h = fixture();
      const value = receipt();
      value[field] = 0;
      value.effectiveExpiresAt = 1;
      h.rpc.mockResolvedValue(success(value));
      expect(await h.ports.readCleanup(query())).toEqual(value);
      await reject(h.ports.registerCleanup(registration()));
      expect(h.rpc).toHaveBeenCalledTimes(2);
    },
  );

  it("reads multiple retained terminal timestamps without inventing precedence or eligibility", async () => {
    const h = fixture();
    const value = { ...receipt(), closedAt: 10, expiredAt: 9, invalidatedAt: 8 };
    h.rpc.mockResolvedValue(success(value));
    expect(await h.ports.readCleanup(query())).toEqual(value);
  });

  it("allows exact safe integer boundaries and a positive shorter effective deadline", async () => {
    const h = fixture();
    const input = registration();
    input.parentVersion = Number.MAX_SAFE_INTEGER;
    input.claim.binding.threadRevision = 0;
    input.verifiedAt = 0;
    input.authExpiresAt = Number.MAX_SAFE_INTEGER;
    input.claim.expiresAt = Number.MAX_SAFE_INTEGER;
    const value = {
      ...receipt(),
      parentVersion: input.parentVersion,
      claim: structuredClone(input.claim),
      effectiveExpiresAt: 1,
    };
    h.rpc.mockResolvedValue(success(value));
    expect(await h.ports.registerCleanup(input)).toEqual(value);
  });

  it("rejects every noncanonical or nil nested request identity before transport", async () => {
    const h = fixture();
    for (const bad of [NIL, OTHER.toUpperCase(), "", "not-a-uuid"]) {
      for (const field of ["cleanupId", "authSessionId"] as const) {
        const input = registration();
        input[field] = bad;
        await reject(h.ports.registerCleanup(input));
      }
      const input = registration();
      input.claim.claimId = bad;
      await reject(h.ports.registerCleanup(input));
      for (const field of [
        "ownerId",
        "threadId",
        "threadIncarnation",
        "attemptId",
        "approvalId",
      ] as const) {
        const input = registration();
        input.claim.binding[field] = bad;
        await reject(h.ports.registerCleanup(input));
      }
    }
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("rejects unsafe, fractional, negative and coercible numbers before transport", async () => {
    const h = fixture();
    for (const bad of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, "3"]) {
      for (const field of ["parentVersion", "verifiedAt", "authExpiresAt"] as const) {
        const input = registration();
        asRecord(input)[field] = bad;
        await reject(h.ports.registerCleanup(input));
      }
      const input = registration();
      asRecord(input.claim.binding).threadRevision = bad;
      await reject(h.ports.registerCleanup(input));
      asRecord(input.claim.binding).threadRevision = 7;
      asRecord(input.claim).expiresAt = bad;
      await reject(h.ports.registerCleanup(input));
    }
    for (const field of ["claim", "auth"] as const) {
      const input = registration();
      if (field === "claim") input.claim.expiresAt = 0;
      else input.authExpiresAt = 0;
      await reject(h.ports.registerCleanup(input));
    }
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("rejects invalid Auth intervals without obtaining a new time or making a request", async () => {
    const h = fixture();
    for (const expiry of [VERIFIED, VERIFIED - 1])
      await reject(h.ports.registerCleanup({ ...registration(), authExpiresAt: expiry }));
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("rejects unrecognized scope and noncanonical fingerprints and approval digests", async () => {
    const h = fixture();
    for (const bad of ["A".repeat(64), "g".repeat(64), "b".repeat(63), "b".repeat(65), ""]) {
      await reject(h.ports.registerCleanup({ ...registration(), authorityFingerprint: bad }));
      const input = registration();
      input.claim.binding.approvalDigest = bad;
      await reject(h.ports.registerCleanup(input));
    }
    const input = registration();
    asRecord(input.claim.binding).scope = "participant-voice";
    await reject(h.ports.registerCleanup(input));
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("rejects caller protocol, owner, token, deadline and unrecognized nested fields", async () => {
    const h = fixture();
    for (const extra of [
      { protocol: 2 },
      { ownerId: OWNER },
      { activeAuthority: "caller-token" },
      { effectiveExpiresAt: EFFECTIVE },
    ])
      await reject(h.ports.registerCleanup({ ...registration(), ...extra }));
    for (const place of ["claim", "binding"] as const) {
      const input = registration();
      asRecord(place === "claim" ? input.claim : input.claim.binding).unexpected = true;
      await reject(h.ports.registerCleanup(input));
    }
    await reject(h.ports.readCleanup(registration()));
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it.each(["query", "claim", "binding"] as const)(
    "does not invoke rejected own accessors at the %s request boundary",
    async (place) => {
      const h = fixture();
      const input = registration();
      const getter = vi.fn(() => {
        throw new Error("private getter");
      });
      const target =
        place === "query" ? input : place === "claim" ? input.claim : input.claim.binding;
      const key = place === "query" ? "verifiedAt" : place === "claim" ? "binding" : "ownerId";
      Object.defineProperty(target, key, { enumerable: true, get: getter });
      await reject(h.ports.registerCleanup(input));
      expect(getter).not.toHaveBeenCalled();
      expect(h.rpc).not.toHaveBeenCalled();
    },
  );

  it("rejects inherited, hidden and symbol-bearing request identity without transport", async () => {
    const h = fixture();
    const inherited = Object.create(registration()) as VoiceV2CleanupRegistration;
    await reject(h.ports.registerCleanup(inherited));
    const hidden = registration();
    Object.defineProperty(hidden.claim.binding, "ownerId", { enumerable: false, value: OWNER });
    await reject(h.ports.registerCleanup(hidden));
    const symbol = registration();
    Object.defineProperty(symbol.claim, Symbol("private"), { value: true });
    await reject(h.ports.registerCleanup(symbol));
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("accepts exact null-prototype wire objects and still detaches them", async () => {
    const h = fixture();
    const input = registration();
    Object.setPrototypeOf(input, null);
    Object.setPrototypeOf(input.claim, null);
    Object.setPrototypeOf(input.claim.binding, null);
    const output = await h.ports.registerCleanup(input);
    expect(output).toEqual(receipt());
    expect(h.rpc.mock.calls[0][1].p_claim).not.toBe(input.claim);
  });

  it.each(["cleanupId", "authSessionId", "parentVersion", "authorityFingerprint"] as const)(
    "rejects a reply for a different %s on either operation",
    async (field) => {
      const h = fixture();
      const value = receipt();
      asRecord(value)[field] =
        field === "parentVersion" ? 4 : field === "authorityFingerprint" ? "d".repeat(64) : OTHER;
      h.rpc.mockResolvedValue(success(value));
      await reject(h.ports.registerCleanup(registration()));
      await reject(h.ports.readCleanup(query()));
    },
  );

  it("matches every immutable nested claim field on either operation", async () => {
    const h = fixture();
    const mutations: ((value: ReturnType<typeof receipt>) => void)[] = [
      (v) => {
        v.claim.claimId = OTHER;
      },
      (v) => {
        v.claim.expiresAt += 1;
      },
      ...(["ownerId", "threadId", "threadIncarnation", "attemptId", "approvalId"] as const).map(
        (field) => (v: ReturnType<typeof receipt>) => {
          v.claim.binding[field] = OTHER;
        },
      ),
      (v) => {
        v.claim.binding.threadRevision += 1;
      },
      (v) => {
        v.claim.binding.approvalDigest = "d".repeat(64);
      },
    ];
    for (const mutate of mutations) {
      const value = receipt();
      mutate(value);
      h.rpc.mockResolvedValue(success(value));
      await reject(h.ports.registerCleanup(registration()));
      await reject(h.ports.readCleanup(query()));
    }
    expect(h.rpc).toHaveBeenCalledTimes(mutations.length * 2);
  });

  it("rejects missing or mixed protocol and legacy unbound metadata without a fallback", async () => {
    const h = fixture();
    for (const protocol of [undefined, null, 1, "2", 3]) {
      const value = receipt();
      if (protocol === undefined) delete asRecord(value).protocol;
      else asRecord(value).protocol = protocol;
      h.rpc.mockResolvedValue(success(value));
      await reject(h.ports.registerCleanup(registration()));
      await reject(h.ports.readCleanup(query()));
    }
    h.rpc.mockResolvedValue(success({ cleanupId: CLEANUP, claim: query().claim }));
    await reject(h.ports.registerCleanup(registration()));
    await reject(h.ports.readCleanup(query()));
    expect(h.rpc.mock.calls.every((call) => call[0].startsWith("bfa_p5_v2_"))).toBe(true);
  });

  it("rejects missing, extra, nil and unsafe reply metadata", async () => {
    const h = fixture();
    const values = [
      { ...receipt(), cleanupId: NIL },
      { ...receipt(), authSessionId: NIL },
      { ...receipt(), parentVersion: Number.MAX_SAFE_INTEGER + 1 },
      { ...receipt(), closedAt: -1 },
      { ...receipt(), expiredAt: 1.5 },
      { ...receipt(), invalidatedAt: Number.MAX_SAFE_INTEGER + 1 },
      { ...receipt(), closedAt: "0" },
      { ...receipt(), effectiveExpiresAt: 0 },
      { ...receipt(), effectiveExpiresAt: "100" },
      { ...receipt(), privateWriting: "not wire metadata" },
    ];
    const missing = receipt();
    delete asRecord(missing).closedAt;
    values.push(missing);
    for (const value of values) {
      h.rpc.mockResolvedValue(success(value));
      await reject(h.ports.readCleanup(query()));
    }
  });

  it("rejects response ceilings above the claim and registration Auth ceiling", async () => {
    const h = fixture();
    h.rpc.mockResolvedValue(success({ ...receipt(), effectiveExpiresAt: CLAIM_EXPIRY + 1 }));
    await reject(h.ports.readCleanup(query()));
    await reject(h.ports.registerCleanup(registration()));
    h.rpc.mockResolvedValue(success({ ...receipt(), effectiveExpiresAt: VERIFIED + 40_000 }));
    await reject(h.ports.registerCleanup({ ...registration(), authExpiresAt: VERIFIED + 30_000 }));
    expect(await h.ports.readCleanup(query())).toMatchObject({
      effectiveExpiresAt: VERIFIED + 40_000,
    });
  });

  it("accepts a shorter ceiling but rejects a registration acknowledgment expired by verification", async () => {
    const h = fixture();
    h.rpc.mockResolvedValue(success({ ...receipt(), effectiveExpiresAt: VERIFIED + 1 }));
    expect(await h.ports.registerCleanup(registration())).toMatchObject({
      effectiveExpiresAt: VERIFIED + 1,
    });
    for (const effectiveExpiresAt of [VERIFIED, VERIFIED - 1]) {
      h.rpc.mockResolvedValue(success({ ...receipt(), effectiveExpiresAt }));
      await reject(h.ports.registerCleanup(registration()));
      expect(await h.ports.readCleanup(query())).toMatchObject({ effectiveExpiresAt });
    }
  });

  it.each(["receipt", "claim", "binding"] as const)(
    "does not evaluate rejected %s response accessors",
    async (place) => {
      const h = fixture();
      const value = receipt();
      const getter = vi.fn(() => {
        throw new Error("private getter");
      });
      const target =
        place === "receipt" ? value : place === "claim" ? value.claim : value.claim.binding;
      const key =
        place === "receipt" ? "effectiveExpiresAt" : place === "claim" ? "binding" : "ownerId";
      Object.defineProperty(target, key, { enumerable: true, get: getter });
      h.rpc.mockResolvedValue(success(value));
      await reject(h.ports.registerCleanup(registration()));
      await reject(h.ports.readCleanup(query()));
      expect(getter).not.toHaveBeenCalled();
    },
  );

  it("rejects inherited or hidden reply fields and symbol-bearing nested bindings", async () => {
    const h = fixture();
    const inherited = Object.create(receipt()) as unknown;
    const hidden = receipt();
    Object.defineProperty(hidden, "protocol", { value: 2, enumerable: false });
    const symbol = receipt();
    Object.defineProperty(symbol.claim.binding, Symbol("extra"), { value: true });
    for (const value of [inherited, hidden, symbol]) {
      h.rpc.mockResolvedValue(success(value));
      await reject(h.ports.readCleanup(query()));
    }
  });

  it("rejects malformed envelopes and unsuccessful status instead of treating them as denial", async () => {
    const h = fixture();
    for (const raw of [
      undefined,
      null,
      [],
      true,
      receipt(),
      { data: receipt() },
      { data: receipt(), error: "private SQL error" },
      { data: null, error: { message: "private error" } },
      { data: receipt(), error: undefined },
      ...[199, 300, 500, "200", 200.5, NaN].map((status) => ({ ...success(receipt()), status })),
    ]) {
      h.rpc.mockResolvedValue(raw);
      await reject(h.ports.registerCleanup(registration()));
    }
  });

  it("accepts successful 2xx envelope metadata without assuming it proves current eligibility", async () => {
    const h = fixture();
    for (const status of [200, 201, 299]) {
      h.rpc.mockResolvedValue({ ...success(receipt()), status, count: 1 });
      expect(await h.ports.readCleanup(query())).toEqual(receipt());
    }
    h.rpc.mockResolvedValue({ data: receipt(), error: null });
    expect(await h.ports.readCleanup(query())).toEqual(receipt());
  });

  it("does not invoke envelope accessors or inherited data/error fields", async () => {
    const h = fixture();
    for (const key of ["data", "error", "status"] as const) {
      const raw = success(receipt());
      const getter = vi.fn(() => {
        throw new Error("private envelope");
      });
      Object.defineProperty(raw, key, { enumerable: true, get: getter });
      h.rpc.mockResolvedValue(raw);
      await reject(h.ports.readCleanup(query()));
      expect(getter).not.toHaveBeenCalled();
    }
    h.rpc.mockResolvedValue(Object.create(success(receipt())));
    await reject(h.ports.readCleanup(query()));
  });

  it.each(["register", "read"] as const)(
    "captures a detached immutable %s request before its first transport wait",
    async (operation) => {
      const h = fixture();
      const pending = deferred();
      h.rpc.mockReturnValueOnce(pending.promise);
      const input = operation === "register" ? registration() : query();
      const expected = structuredClone(input);
      const result =
        operation === "register"
          ? h.ports.registerCleanup(input as VoiceV2CleanupRegistration)
          : h.ports.readCleanup(input);
      input.cleanupId = OTHER;
      input.claim.claimId = OTHER;
      input.claim.binding.ownerId = OTHER;
      input.claim.binding.threadRevision = 99;
      input.authSessionId = OTHER;
      input.parentVersion = 99;
      input.authorityFingerprint = "d".repeat(64);
      expect(h.rpc.mock.calls[0][1]).toMatchObject({
        p_cleanup_id: expected.cleanupId,
        p_claim: expected.claim,
        p_auth_session_id: expected.authSessionId,
        p_parent_version: expected.parentVersion,
        p_fingerprint: expected.authorityFingerprint,
      });
      pending.resolve(success(receipt()));
      expect(await result).toEqual(receipt());
      expect(h.rpc).toHaveBeenCalledTimes(1);
    },
  );

  it("does not let mutated caller state make a mismatching late response valid", async () => {
    const h = fixture();
    const pending = deferred();
    h.rpc.mockReturnValueOnce(pending.promise);
    const input = registration();
    const result = h.ports.registerCleanup(input);
    input.claim.binding.ownerId = OTHER;
    const value = receipt();
    value.claim.binding.ownerId = OTHER;
    pending.resolve(success(value));
    await reject(result);
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it("detaches and freezes every returned claim layer without freezing the transport-owned reply", async () => {
    const h = fixture();
    const value = receipt();
    h.rpc.mockResolvedValue(success(value));
    const result = await h.ports.readCleanup(query());
    expect(result).not.toBe(value);
    expect(result!.claim).not.toBe(value.claim);
    expect(result!.claim.binding).not.toBe(value.claim.binding);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result!.claim)).toBe(true);
    expect(Object.isFrozen(result!.claim.binding)).toBe(true);
    expect(Object.isFrozen(value)).toBe(false);
    expect(Object.isFrozen(value.claim.binding)).toBe(false);
    value.claim.binding.ownerId = OTHER;
    value.effectiveExpiresAt = 1;
    value.closedAt = 0;
    expect(result).toEqual(receipt());
  });

  it("captures the original bound transport function once without reading replacement methods", async () => {
    const client = {
      marker: "original",
      rpc: vi.fn(function (
        this: { marker: string },
        _name: VoiceV2CleanupRpcName,
        _args: Readonly<Record<string, unknown>>,
      ) {
        expect(this.marker).toBe("original");
        return Promise.resolve(success(receipt()));
      }),
    };
    const original = client.rpc;
    const ports = createVoiceV2CleanupRpcPorts(client);
    const getter = vi.fn(() => {
      throw new Error("replacement client");
    });
    Object.defineProperty(client, "rpc", { get: getter });
    expect(await ports.readCleanup(query())).toEqual(receipt());
    expect(original).toHaveBeenCalledTimes(1);
    expect(getter).not.toHaveBeenCalled();
  });

  it("sanitizes invalid client construction without attempting a transport", () => {
    for (const value of [null, undefined, {}, { rpc: true }])
      expect(() =>
        createVoiceV2CleanupRpcPorts(value as unknown as VoiceV2CleanupRpcClient),
      ).toThrow(ERROR);
    const value = {
      get rpc(): VoiceV2CleanupRpcClient["rpc"] {
        throw new Error("private credential");
      },
    };
    expect(() => createVoiceV2CleanupRpcPorts(value)).toThrow(ERROR);
  });

  it("sanitizes thrown or lost write replies without a retry, identity replacement or leaked cause", async () => {
    const h = fixture();
    h.rpc.mockRejectedValueOnce(new Error("private SQL payload and credential"));
    const input = registration();
    const original = structuredClone(input);
    const error = await h.ports.registerCleanup(input).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(ERROR);
    expect((error as Error).cause).toBeUndefined();
    expect(Object.keys(error as Error)).toEqual([]);
    expect(input).toEqual(original);
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it("waits for its exact pending reply without initiating background retry or a new identity", async () => {
    const h = fixture();
    const pending = deferred();
    h.rpc.mockReturnValueOnce(pending.promise);
    const result = h.ports.registerCleanup(registration());
    await Promise.resolve();
    await Promise.resolve();
    expect(h.rpc).toHaveBeenCalledTimes(1);
    pending.resolve(success(null));
    expect(await result).toBeNull();
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects non-object read inputs without creating a request", async () => {
    const h = fixture();
    for (const value of [undefined, null, [], true, 1, "metadata"])
      await reject(h.ports.readCleanup(value as unknown as VoiceV2CleanupReadQuery));
    expect(h.rpc).not.toHaveBeenCalled();
  });
});
