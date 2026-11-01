import { describe, expect, it, vi } from "vitest";
import {
  createVoiceSessionRevokeRpcPorts,
  type VoiceSessionRevokeRpcClient,
  type VoiceSessionRevokeRpcName,
  type VoiceSessionRevocationQuery,
} from "../service/voice-session-revoke-rpc.server";

const OWNER = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";
const OTHER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EXPIRY = 1_900_000_000_000;
const query = () => ({ ownerId: OWNER, sessionId: SESSION });
function receipt(ownerId = OWNER, sessionId = SESSION) {
  return { ownerId, sessionId, version: 8, expiresAt: EXPIRY, revoked: true };
}
const success = (data: unknown) => ({ data, error: null, status: 200, statusText: "OK" });
function fixture() {
  // Fictional transport: no SQL, Auth, HTTP, voice or provider invocation.
  const rpc = vi.fn(
    async (
      _name: VoiceSessionRevokeRpcName,
      _args: Readonly<Record<string, unknown>>,
    ): Promise<unknown> => success(receipt()),
  );
  return { rpc, ports: createVoiceSessionRevokeRpcPorts({ rpc }) };
}
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
const reject = (promise: Promise<unknown>) =>
  expect(promise).rejects.toThrow("voice-session-revoke-rpc-unavailable");

describe("P5 inactive terminal exact-session revocation RPC", () => {
  it("constructs only an immutable revocation port without making a request", () => {
    const h = fixture();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(Object.keys(h.ports)).toEqual(["revokeSession"]);
    expect(Object.isFrozen(h.ports)).toBe(true);
  });

  it("maps only the exact owner and session to the fixed terminal mutation", async () => {
    const h = fixture();
    expect(await h.ports.revokeSession(query())).toEqual(receipt());
    expect(h.rpc.mock.calls).toEqual([
      ["bfa_p5_voice_revoke_session", { p_owner_id: OWNER, p_session_id: SESSION }],
    ]);
    expect(Object.isFrozen(h.rpc.mock.calls[0][1])).toBe(true);
  });

  it("accepts a revoked-before-provision tombstone without enabling or renewal", async () => {
    const h = fixture();
    const tombstone = { ...receipt(), version: 0, expiresAt: 1 };
    h.rpc.mockResolvedValueOnce(success(tombstone));
    expect(await h.ports.revokeSession(query())).toEqual(tombstone);
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it("preserves saturated safe version and expiry values without incrementing locally", async () => {
    const h = fixture();
    const maximum = {
      ...receipt(),
      version: Number.MAX_SAFE_INTEGER,
      expiresAt: Number.MAX_SAFE_INTEGER,
    };
    h.rpc.mockResolvedValueOnce(success(maximum));
    expect(await h.ports.revokeSession(query())).toEqual(maximum);
  });

  it("does not consult the local clock or reject an expired revocation receipt", async () => {
    const h = fixture();
    h.rpc.mockResolvedValueOnce(success({ ...receipt(), expiresAt: 2 }));
    const clock = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("clock unavailable");
    });
    try {
      expect(await h.ports.revokeSession(query())).toEqual({ ...receipt(), expiresAt: 2 });
      expect(clock).not.toHaveBeenCalled();
    } finally {
      clock.mockRestore();
    }
  });

  it("rejects malformed queries and browser authority material before transport", async () => {
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
      { ...query(), expectedVersion: 8 },
      { ...query(), revoked: false },
      { ...query(), expiresAt: EXPIRY },
      Object.create(query()),
      { ...query(), [Symbol("extra")]: true },
    ]) {
      await reject(h.ports.revokeSession(bad as VoiceSessionRevocationQuery));
    }
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("rejects hidden or accessor query fields without evaluating accessors", async () => {
    const h = fixture();
    const getter = vi.fn(() => OWNER);
    const accessor = query();
    Object.defineProperty(accessor, "ownerId", { get: getter, enumerable: true });
    const hidden = query();
    Object.defineProperty(hidden, "sessionId", { value: SESSION, enumerable: false });
    await reject(h.ports.revokeSession(accessor));
    await reject(h.ports.revokeSession(hidden));
    expect(getter).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("never converts null, booleans or incomplete acknowledgments into success", async () => {
    const h = fixture();
    for (const data of [null, undefined, true, false, [], {}, "revoked", { revoked: true }]) {
      h.rpc.mockResolvedValueOnce(success(data));
      await reject(h.ports.revokeSession(query()));
    }
    expect(h.rpc).toHaveBeenCalledTimes(8);
  });

  it("rejects unsafe, negative, fractional or nonnumeric version and expiry", async () => {
    const h = fixture();
    for (const version of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, "8", NaN, Infinity]) {
      h.rpc.mockResolvedValueOnce(success({ ...receipt(), version }));
      await reject(h.ports.revokeSession(query()));
    }
    for (const expiresAt of [0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, "1", NaN, Infinity]) {
      h.rpc.mockResolvedValueOnce(success({ ...receipt(), expiresAt }));
      await reject(h.ports.revokeSession(query()));
    }
  });

  it("rejects noncanonical or missing receipt identifiers", async () => {
    const h = fixture();
    for (const data of [
      { ...receipt(), ownerId: OTHER.toUpperCase() },
      { ...receipt(), sessionId: "" },
      { ...receipt(), ownerId: undefined },
      { ...receipt(), sessionId: null },
    ]) {
      h.rpc.mockResolvedValueOnce(success(data));
      await reject(h.ports.revokeSession(query()));
    }
  });

  it("requires literal revoked true rather than an active or coerced state", async () => {
    const h = fixture();
    for (const revoked of [false, "true", 1, null, undefined]) {
      h.rpc.mockResolvedValueOnce(success({ ...receipt(), revoked }));
      await reject(h.ports.revokeSession(query()));
    }
  });

  it("binds acknowledgment to both exact owner and session", async () => {
    const h = fixture();
    for (const data of [receipt(OTHER), receipt(OWNER, OTHER), receipt(OTHER, OTHER)]) {
      h.rpc.mockResolvedValueOnce(success(data));
      await reject(h.ports.revokeSession(query()));
    }
  });

  it("rejects extra, hidden, inherited and missing receipt fields", async () => {
    const h = fixture();
    const hidden = receipt();
    Object.defineProperty(hidden, "version", { value: 8, enumerable: false });
    const missing: Partial<ReturnType<typeof receipt>> = receipt();
    delete missing.expiresAt;
    for (const data of [
      { ...receipt(), transcript: "SYNTHETIC_PRIVATE" },
      { ...receipt(), [Symbol("extra")]: true },
      hidden,
      Object.create(receipt()),
      missing,
    ]) {
      h.rpc.mockResolvedValueOnce(success(data));
      await reject(h.ports.revokeSession(query()));
    }
  });

  it("rejects accessor receipt fields without reading private values", async () => {
    const h = fixture();
    const getter = vi.fn(() => true);
    const data = receipt();
    Object.defineProperty(data, "revoked", { get: getter, enumerable: true });
    h.rpc.mockResolvedValueOnce(success(data));
    await reject(h.ports.revokeSession(query()));
    expect(getter).not.toHaveBeenCalled();
  });

  it("accepts null-prototype data while returning a detached frozen receipt", async () => {
    const h = fixture();
    const data = Object.assign(Object.create(null), receipt());
    h.rpc.mockResolvedValueOnce(success(data));
    const value = await h.ports.revokeSession(Object.assign(Object.create(null), query()));
    expect(value).toEqual(receipt());
    expect(value).not.toBe(data);
    expect(Object.isFrozen(value)).toBe(true);
    data.revoked = false;
    data.version = 99;
    expect(value.revoked).toBe(true);
    expect(value.version).toBe(8);
  });

  it("captures the exact identity before awaiting a delayed response", async () => {
    const h = fixture(),
      pending = deferred(),
      mutable = query();
    h.rpc.mockReturnValueOnce(pending.promise);
    const result = h.ports.revokeSession(mutable);
    mutable.ownerId = OTHER;
    mutable.sessionId = OTHER;
    expect(h.rpc.mock.calls[0][1]).toEqual({ p_owner_id: OWNER, p_session_id: SESSION });
    pending.resolve(success(receipt()));
    expect(await result).toEqual(receipt());
  });

  it("settles overlapping exact revocations in reverse order independently", async () => {
    const h = fixture(),
      first = deferred(),
      second = deferred();
    h.rpc.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const a = h.ports.revokeSession(query());
    const b = h.ports.revokeSession({ ownerId: OWNER, sessionId: OTHER });
    second.resolve(success(receipt(OWNER, OTHER)));
    expect(await b).toEqual(receipt(OWNER, OTHER));
    first.resolve(success(receipt()));
    expect(await a).toEqual(receipt());
    expect(h.rpc).toHaveBeenCalledTimes(2);
  });

  it("rejects swapped concurrent acknowledgments instead of sharing a cached identity", async () => {
    const h = fixture(),
      first = deferred(),
      second = deferred();
    h.rpc.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const a = reject(h.ports.revokeSession(query()));
    const b = reject(h.ports.revokeSession({ ownerId: OTHER, sessionId: SESSION }));
    second.resolve(success(receipt()));
    first.resolve(success(receipt(OTHER)));
    await Promise.all([a, b]);
  });

  it("rejects malformed or contradictory response envelopes", async () => {
    const h = fixture();
    for (const raw of [
      null,
      [],
      {},
      { data: receipt() },
      { data: receipt(), error: undefined },
      { ...success(receipt()), error: { message: "private" } },
      ...[0, 199, 300, 500, 200.5, "200", undefined, NaN].map((status) => ({
        ...success(receipt()),
        status,
      })),
    ]) {
      h.rpc.mockResolvedValueOnce(raw);
      await reject(h.ports.revokeSession(query()));
    }
  });

  it("accepts the minimal success envelope without optional HTTP metadata", async () => {
    const h = fixture();
    h.rpc.mockResolvedValueOnce({ data: receipt(), error: null });
    expect(await h.ports.revokeSession(query())).toEqual(receipt());
  });

  it("does not evaluate accessor or hidden response-envelope fields", async () => {
    const h = fixture();
    const getter = vi.fn(() => receipt());
    const raw = success(receipt());
    Object.defineProperty(raw, "data", { get: getter, enumerable: true });
    h.rpc.mockResolvedValueOnce(raw);
    await reject(h.ports.revokeSession(query()));
    const hidden = success(receipt());
    Object.defineProperty(hidden, "error", { value: null, enumerable: false });
    h.rpc.mockResolvedValueOnce(hidden);
    await reject(h.ports.revokeSession(query()));
    expect(getter).not.toHaveBeenCalled();
  });

  it("retains transport-side commit despite lost acknowledgment without retry or cached success", async () => {
    const h = fixture();
    expect(await h.ports.revokeSession(query())).toEqual(receipt());
    let fictionalCommitted = false;
    h.rpc.mockImplementationOnce(async () => {
      fictionalCommitted = true;
      throw new Error("SYNTHETIC_PRIVATE_DATABASE_REPLY_LOST");
    });
    await reject(h.ports.revokeSession(query()));
    expect(fictionalCommitted).toBe(true);
    expect(h.rpc).toHaveBeenCalledTimes(2);
  });

  it("sanitizes failures without causes, identity, body, logging or retry", async () => {
    const h = fixture();
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const warningLog = vi.spyOn(console, "warn").mockImplementation(() => {});
    h.rpc.mockRejectedValueOnce(new Error(`PRIVATE ${OWNER} ${SESSION}`, { cause: "private SQL" }));
    try {
      const error = await h.ports.revokeSession(query()).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("voice-session-revoke-rpc-unavailable");
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

  it("captures the transport method once and preserves its receiver", async () => {
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
    const ports = createVoiceSessionRevokeRpcPorts(client);
    await ports.revokeSession(query());
    await ports.revokeSession(query());
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
    ]) {
      expect(() =>
        createVoiceSessionRevokeRpcPorts(client as unknown as VoiceSessionRevokeRpcClient),
      ).toThrow("voice-session-revoke-rpc-unavailable");
    }
    const ports = createVoiceSessionRevokeRpcPorts({
      rpc() {
        throw new Error("private sync failure");
      },
    });
    await reject(ports.revokeSession(query()));
  });
});
