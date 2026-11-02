import { describe, expect, it, vi } from "vitest";
import {
  createVoiceSessionProvisionRpcPorts,
  type VoiceSessionProvisionRpcClient,
  type VoiceSessionProvisionRpcName,
  type VoiceSessionProvisioningQuery,
} from "../service/voice-session-provision-rpc.server";

const OWNER = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";
const OTHER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VERIFIED = 1_900_000_000_000;
const EXPIRY = VERIFIED + 300_000;
const query = () => ({
  ownerId: OWNER,
  sessionId: SESSION,
  verifiedAt: VERIFIED,
  expiresAt: EXPIRY,
});
function receipt(ownerId = OWNER, sessionId = SESSION) {
  return { ownerId, sessionId, version: 0, expiresAt: EXPIRY, revoked: false };
}
const success = (data: unknown) => ({ data, error: null, status: 200, statusText: "OK" });
function fixture() {
  // Fictional protected transport only; no Auth, SQL, HTTP or provider evidence.
  const rpc = vi.fn(
    async (
      _name: VoiceSessionProvisionRpcName,
      _args: Readonly<Record<string, unknown>>,
    ): Promise<unknown> => success(receipt()),
  );
  return { rpc, ports: createVoiceSessionProvisionRpcPorts({ rpc }) };
}
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
const reject = (promise: Promise<unknown>) =>
  expect(promise).rejects.toThrow("voice-session-provision-rpc-unavailable");

describe("P5 inactive insert-once session-fence provisioning transport", () => {
  it("constructs one frozen port without making a request or provisioning a session", () => {
    const h = fixture();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(Object.keys(h.ports)).toEqual(["provisionSession"]);
    expect(Object.isFrozen(h.ports)).toBe(true);
  });

  it("maps exact trusted metadata to one invocation and frozen named arguments", async () => {
    const h = fixture();
    expect(await h.ports.provisionSession(query())).toEqual(receipt());
    expect(h.rpc.mock.calls).toEqual([
      [
        "bfa_p5_voice_provision_session",
        {
          p_owner_id: OWNER,
          p_session_id: SESSION,
          p_verified_ms: VERIFIED,
          p_expires_ms: EXPIRY,
        },
      ],
    ]);
    expect(Object.isFrozen(h.rpc.mock.calls[0][1])).toBe(true);
  });

  it("preserves exact active versions without resetting or incrementing them", async () => {
    const h = fixture();
    for (const version of [0, 8, Number.MAX_SAFE_INTEGER]) {
      h.rpc.mockResolvedValueOnce(success({ ...receipt(), version }));
      expect(await h.ports.provisionSession(query())).toEqual({ ...receipt(), version });
    }
    expect(h.rpc).toHaveBeenCalledTimes(3);
  });

  it("preserves explicit null as semantic denial without a retry or fabricated receipt", async () => {
    const h = fixture();
    h.rpc.mockResolvedValueOnce(success(null));
    expect(await h.ports.provisionSession(query())).toBeNull();
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it("accepts the bounded lifetime endpoints including safe-integer time ceilings", async () => {
    const h = fixture();
    for (const [verifiedAt, expiresAt] of [
      [0, 1],
      [VERIFIED, VERIFIED + 900_000],
      [Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER],
    ]) {
      h.rpc.mockResolvedValueOnce(success({ ...receipt(), expiresAt }));
      expect(await h.ports.provisionSession({ ...query(), verifiedAt, expiresAt })).toEqual({
        ...receipt(),
        expiresAt,
      });
    }
  });

  it("rejects caller authority, extra status or malformed identity before transport", async () => {
    const h = fixture();
    for (const bad of [
      null,
      [],
      {},
      { ownerId: OWNER },
      { ...query(), ownerId: null },
      { ...query(), ownerId: OTHER.toUpperCase() },
      { ...query(), sessionId: "bad" },
      { ...query(), accessToken: "SYNTHETIC_PRIVATE_TOKEN" },
      { ...query(), version: 0 },
      { ...query(), revoked: false },
      { ...query(), authenticated: true },
      Object.create(query()),
      { ...query(), [Symbol("extra")]: true },
    ])
      await reject(h.ports.provisionSession(bad as VoiceSessionProvisioningQuery));
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("rejects unsafe times, zero or reversed duration and excessive lifetime before transport", async () => {
    const h = fixture();
    for (const verifiedAt of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, "1900000000000", NaN, Infinity])
      await reject(
        h.ports.provisionSession({ ...query(), verifiedAt } as VoiceSessionProvisioningQuery),
      );
    for (const expiresAt of [
      0,
      -1,
      0.5,
      Number.MAX_SAFE_INTEGER + 1,
      "1900000300000",
      NaN,
      Infinity,
      VERIFIED,
      VERIFIED - 1,
      VERIFIED + 900_001,
    ])
      await reject(
        h.ports.provisionSession({ ...query(), expiresAt } as VoiceSessionProvisioningQuery),
      );
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("rejects accessor and hidden query fields without evaluating lifetime getters", async () => {
    const h = fixture();
    const getter = vi.fn(() => EXPIRY);
    const accessor = query();
    Object.defineProperty(accessor, "expiresAt", { get: getter, enumerable: true });
    const hidden = query();
    Object.defineProperty(hidden, "verifiedAt", { value: VERIFIED, enumerable: false });
    await reject(h.ports.provisionSession(accessor));
    await reject(h.ports.provisionSession(hidden));
    expect(getter).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("does not confuse missing, boolean or incomplete replies with null denial or success", async () => {
    const h = fixture();
    for (const data of [undefined, true, false, [], {}, "active", { revoked: false }]) {
      h.rpc.mockResolvedValueOnce(success(data));
      await reject(h.ports.provisionSession(query()));
    }
    expect(h.rpc).toHaveBeenCalledTimes(7);
  });

  it("rejects unsafe versions and expiries without coercion", async () => {
    const h = fixture();
    for (const version of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, "0", NaN, Infinity]) {
      h.rpc.mockResolvedValueOnce(success({ ...receipt(), version }));
      await reject(h.ports.provisionSession(query()));
    }
    for (const expiresAt of [
      0,
      -1,
      0.5,
      Number.MAX_SAFE_INTEGER + 1,
      "1900000300000",
      NaN,
      Infinity,
    ]) {
      h.rpc.mockResolvedValueOnce(success({ ...receipt(), expiresAt }));
      await reject(h.ports.provisionSession(query()));
    }
  });

  it("requires literal active false, canonical UUIDs and complete receipt identity", async () => {
    const h = fixture();
    for (const data of [
      ...[true, "false", 0, null, undefined].map((revoked) => ({ ...receipt(), revoked })),
      { ...receipt(), ownerId: OTHER.toUpperCase() },
      { ...receipt(), ownerId: undefined },
      { ...receipt(), sessionId: null },
      { ...receipt(), sessionId: "" },
    ]) {
      h.rpc.mockResolvedValueOnce(success(data));
      await reject(h.ports.provisionSession(query()));
    }
  });

  it("binds acknowledgment to exact owner, session and original immutable expiry", async () => {
    const h = fixture();
    for (const data of [
      receipt(OTHER),
      receipt(OWNER, OTHER),
      receipt(OTHER, OTHER),
      { ...receipt(), expiresAt: EXPIRY + 1 },
      { ...receipt(), expiresAt: EXPIRY - 1 },
    ]) {
      h.rpc.mockResolvedValueOnce(success(data));
      await reject(h.ports.provisionSession(query()));
    }
  });

  it("rejects extra, hidden, inherited and missing receipt fields", async () => {
    const h = fixture();
    const hidden = receipt();
    Object.defineProperty(hidden, "version", { value: 0, enumerable: false });
    const missing: Partial<ReturnType<typeof receipt>> = receipt();
    delete missing.expiresAt;
    for (const data of [
      { ...receipt(), verifiedAt: VERIFIED },
      { ...receipt(), [Symbol("extra")]: true },
      hidden,
      Object.create(receipt()),
      missing,
    ]) {
      h.rpc.mockResolvedValueOnce(success(data));
      await reject(h.ports.provisionSession(query()));
    }
  });

  it("rejects accessor receipt fields without reading rejected values", async () => {
    const h = fixture();
    const getter = vi.fn(() => false);
    const data = receipt();
    Object.defineProperty(data, "revoked", { get: getter, enumerable: true });
    h.rpc.mockResolvedValueOnce(success(data));
    await reject(h.ports.provisionSession(query()));
    expect(getter).not.toHaveBeenCalled();
  });

  it("accepts null-prototype data and detaches and freezes the returned receipt", async () => {
    const h = fixture();
    const data = Object.assign(Object.create(null), receipt());
    h.rpc.mockResolvedValueOnce(success(data));
    const value = await h.ports.provisionSession(Object.assign(Object.create(null), query()));
    expect(value).toEqual(receipt());
    expect(value).not.toBe(data);
    expect(Object.isFrozen(value)).toBe(true);
    data.revoked = true;
    data.expiresAt = 1;
    expect(value?.revoked).toBe(false);
    expect(value?.expiresAt).toBe(EXPIRY);
  });

  it("captures all input metadata before waiting for a delayed reply", async () => {
    const h = fixture(),
      pending = deferred(),
      mutable = query();
    h.rpc.mockReturnValueOnce(pending.promise);
    const result = h.ports.provisionSession(mutable);
    mutable.ownerId = OTHER;
    mutable.sessionId = OTHER;
    mutable.verifiedAt++;
    mutable.expiresAt++;
    expect(h.rpc.mock.calls[0][1]).toEqual({
      p_owner_id: OWNER,
      p_session_id: SESSION,
      p_verified_ms: VERIFIED,
      p_expires_ms: EXPIRY,
    });
    pending.resolve(success(receipt()));
    expect(await result).toEqual(receipt());
  });

  it("settles overlapping provisioning replies in reverse order independently", async () => {
    const h = fixture(),
      first = deferred(),
      second = deferred();
    h.rpc.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const a = h.ports.provisionSession(query());
    const b = h.ports.provisionSession({ ...query(), sessionId: OTHER, expiresAt: EXPIRY + 1 });
    const otherReceipt = { ...receipt(OWNER, OTHER), expiresAt: EXPIRY + 1 };
    second.resolve(success(otherReceipt));
    expect(await b).toEqual(otherReceipt);
    first.resolve(success(receipt()));
    expect(await a).toEqual(receipt());
    expect(h.rpc).toHaveBeenCalledTimes(2);
  });

  it("rejects swapped concurrent acknowledgments instead of using a cached identity", async () => {
    const h = fixture(),
      first = deferred(),
      second = deferred();
    h.rpc.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const a = reject(h.ports.provisionSession(query()));
    const b = reject(h.ports.provisionSession({ ...query(), ownerId: OTHER }));
    second.resolve(success(receipt()));
    first.resolve(success(receipt(OTHER)));
    await Promise.all([a, b]);
  });

  it("rejects failed or malformed envelopes even when their data is null", async () => {
    const h = fixture();
    for (const raw of [
      null,
      [],
      {},
      { data: receipt() },
      { data: null, error: undefined },
      { ...success(null), error: { message: "private" } },
      ...[0, 199, 300, 500, 200.5, "200", undefined, NaN].map((status) => ({
        ...success(receipt()),
        status,
      })),
    ]) {
      h.rpc.mockResolvedValueOnce(raw);
      await reject(h.ports.provisionSession(query()));
    }
  });

  it("accepts minimal successful and denied envelopes without HTTP metadata", async () => {
    const h = fixture();
    h.rpc.mockResolvedValueOnce({ data: receipt(), error: null });
    expect(await h.ports.provisionSession(query())).toEqual(receipt());
    h.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await h.ports.provisionSession(query())).toBeNull();
  });

  it("does not evaluate accessor or hidden response-envelope fields", async () => {
    const h = fixture();
    const getter = vi.fn(() => receipt());
    const raw = success(receipt());
    Object.defineProperty(raw, "data", { get: getter, enumerable: true });
    h.rpc.mockResolvedValueOnce(raw);
    await reject(h.ports.provisionSession(query()));
    const hidden = success(null);
    Object.defineProperty(hidden, "error", { value: null, enumerable: false });
    h.rpc.mockResolvedValueOnce(hidden);
    await reject(h.ports.provisionSession(query()));
    expect(getter).not.toHaveBeenCalled();
  });

  it("does not reuse earlier success or retry after a committed but lost reply", async () => {
    const h = fixture();
    expect(await h.ports.provisionSession(query())).toEqual(receipt());
    let fictionalCommitted = false;
    h.rpc.mockImplementationOnce(async () => {
      fictionalCommitted = true;
      throw new Error("SYNTHETIC_PRIVATE_REPLY_LOST");
    });
    await reject(h.ports.provisionSession(query()));
    expect(fictionalCommitted).toBe(true);
    expect(h.rpc).toHaveBeenCalledTimes(2);
  });

  it("returns only a SQL observation without using a local clock as fresh eligibility", async () => {
    const h = fixture(),
      pending = deferred();
    h.rpc.mockReturnValueOnce(pending.promise);
    const clock = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("local clock is not server authority");
    });
    try {
      const result = h.ports.provisionSession(query());
      pending.resolve(success(receipt()));
      expect(await result).toEqual(receipt());
      expect(clock).not.toHaveBeenCalled();
    } finally {
      clock.mockRestore();
    }
  });

  it("sanitizes failures without cause, private identity, logging or retry", async () => {
    const h = fixture();
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const warningLog = vi.spyOn(console, "warn").mockImplementation(() => {});
    h.rpc.mockRejectedValueOnce(new Error(`PRIVATE ${OWNER} ${SESSION}`, { cause: "private SQL" }));
    try {
      const error = await h.ports.provisionSession(query()).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("voice-session-provision-rpc-unavailable");
      expect(Object.hasOwn(error as Error, "cause")).toBe(false);
      expect(String(error)).not.toContain(OWNER);
      expect(errorLog).not.toHaveBeenCalled();
      expect(warningLog).not.toHaveBeenCalled();
      expect(h.rpc).toHaveBeenCalledTimes(1);
    } finally {
      errorLog.mockRestore();
      warningLog.mockRestore();
    }
  });

  it("captures the transport method once and preserves the receiver", async () => {
    let gets = 0;
    const client = {
      marker: "receiver",
      get rpc() {
        gets++;
        return async function (this: { marker: string }) {
          expect(this.marker).toBe("receiver");
          return success(receipt());
        };
      },
    };
    const ports = createVoiceSessionProvisionRpcPorts(client);
    await ports.provisionSession(query());
    await ports.provisionSession(query());
    expect(gets).toBe(1);
  });

  it("sanitizes invalid client construction and synchronous transport throws", async () => {
    for (const client of [
      null,
      {},
      { rpc: 3 },
      {
        get rpc() {
          throw new Error("SYNTHETIC_PRIVATE_CLIENT");
        },
      },
    ])
      expect(() =>
        createVoiceSessionProvisionRpcPorts(client as unknown as VoiceSessionProvisionRpcClient),
      ).toThrow("voice-session-provision-rpc-unavailable");
    const ports = createVoiceSessionProvisionRpcPorts({
      rpc() {
        throw new Error("private sync failure");
      },
    });
    await reject(ports.provisionSession(query()));
  });
});
