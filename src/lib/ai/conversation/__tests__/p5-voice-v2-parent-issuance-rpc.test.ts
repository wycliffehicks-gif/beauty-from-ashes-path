// Fictional transport only. These tests do not authenticate Auth, execute SQL,
// establish HTTP delivery/finality, or grant authority to use a provider.
import { describe, expect, it, vi } from "vitest";
import {
  createVoiceV2ParentIssuanceRpcPorts,
  type VoiceV2ParentIssuanceRpcClient,
  type VoiceV2ParentIssuanceRpcName,
} from "../service/voice-v2-parent-issuance-rpc.server";

const OWNER = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";
const THREAD = "33333333-3333-4333-8333-333333333333";
const INCARNATION = "44444444-4444-4444-8444-444444444444";
const OTHER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NIL = "00000000-0000-0000-0000-000000000000";
const VERIFIED = 1_900_000_000_000;
const AUTH_EXPIRY = VERIFIED + 1_800_000;
const ISSUED = VERIFIED + 10;
const EXPIRY = ISSUED + 300_000;
const FINGERPRINT = "a".repeat(64);
const ERROR = "voice-v2-parent-issuance-rpc-unavailable";
const pair = () => ({ ownerId: OWNER, authSessionId: SESSION });
const observation = () => ({ ...pair(), verifiedAt: VERIFIED, authExpiresAt: AUTH_EXPIRY });
const registration = () => ({
  ...pair(),
  parentVersion: 3,
  threadId: THREAD,
  threadIncarnation: INCARNATION,
  threadRevision: 7,
  authorityFingerprint: FINGERPRINT,
  verifiedAt: VERIFIED,
  authExpiresAt: AUTH_EXPIRY,
  issuedAt: ISSUED,
  expiresAt: EXPIRY,
});
const reading = () => ({ ...pair(), parentVersion: 3, authorityFingerprint: FINGERPRINT });
const parent = (revoked = false) => ({ protocol: 2, ...pair(), parentVersion: 3, revoked });
const issuance = () => ({
  protocol: 2,
  ...pair(),
  parentVersion: 3,
  threadId: THREAD,
  threadIncarnation: INCARNATION,
  threadRevision: 7,
  authorityFingerprint: FINGERPRINT,
  issuedAt: ISSUED,
  expiresAt: EXPIRY,
  revoked: false,
});
const success = (data: unknown) => ({ data, error: null, status: 200, statusText: "OK" });
function fixture() {
  const rpc = vi.fn(
    async (
      name: VoiceV2ParentIssuanceRpcName,
      _args: Readonly<Record<string, unknown>>,
    ): Promise<unknown> =>
      success(
        name === "bfa_p5_v2_revoke_parent"
          ? parent(true)
          : name === "bfa_p5_v2_register_issuance" || name === "bfa_p5_v2_read_issuance"
            ? issuance()
            : parent(),
      ),
  );
  return { rpc, ports: createVoiceV2ParentIssuanceRpcPorts({ rpc }) };
}
type Ports = ReturnType<typeof createVoiceV2ParentIssuanceRpcPorts>;
type ObserveQuery = Parameters<Ports["observeParent"]>[0];
type PairQuery = Parameters<Ports["readParent"]>[0];
type RegisterQuery = Parameters<Ports["registerIssuance"]>[0];
const reject = (promise: Promise<unknown>) => expect(promise).rejects.toThrow(ERROR);
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("inactive exact v2 parent and issuance-association transport", () => {
  it("constructs frozen ports without any request or authority observation", () => {
    const h = fixture();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(Object.keys(h.ports)).toEqual([
      "observeParent",
      "revokeParent",
      "readParent",
      "registerIssuance",
      "readIssuance",
    ]);
    expect(Object.isFrozen(h.ports)).toBe(true);
  });

  it("maps trusted parent observation to exact named SQL arguments", async () => {
    const h = fixture();
    expect(await h.ports.observeParent(observation())).toEqual(parent());
    expect(h.rpc.mock.calls).toEqual([
      [
        "bfa_p5_v2_observe_parent",
        {
          p_owner_id: OWNER,
          p_auth_session_id: SESSION,
          p_verified_ms: VERIFIED,
          p_auth_expires_ms: AUTH_EXPIRY,
        },
      ],
    ]);
    expect(Object.isFrozen(h.rpc.mock.calls[0][1])).toBe(true);
  });

  it("maps revocation and parent read without invented lifetime or Auth metadata", async () => {
    const h = fixture();
    expect(await h.ports.revokeParent(pair())).toEqual(parent(true));
    expect(await h.ports.readParent(pair())).toEqual(parent());
    expect(h.rpc.mock.calls).toEqual([
      ["bfa_p5_v2_revoke_parent", { p_owner_id: OWNER, p_auth_session_id: SESSION }],
      ["bfa_p5_v2_read_parent", { p_owner_id: OWNER, p_auth_session_id: SESSION }],
    ]);
  });

  it("maps one complete immutable issuance association without dropping parent identity", async () => {
    const h = fixture();
    expect(await h.ports.registerIssuance(registration())).toEqual(issuance());
    expect(h.rpc.mock.calls).toEqual([
      [
        "bfa_p5_v2_register_issuance",
        {
          p_owner_id: OWNER,
          p_auth_session_id: SESSION,
          p_parent_version: 3,
          p_thread_id: THREAD,
          p_incarnation: INCARNATION,
          p_revision: 7,
          p_fingerprint: FINGERPRINT,
          p_verified_ms: VERIFIED,
          p_auth_expires_ms: AUTH_EXPIRY,
          p_issued_ms: ISSUED,
          p_expires_ms: EXPIRY,
        },
      ],
    ]);
    expect(Object.isFrozen(h.rpc.mock.calls[0][1])).toBe(true);
  });

  it("reads issuance only for the exact requested parent version and fingerprint", async () => {
    const h = fixture();
    expect(await h.ports.readIssuance(reading())).toEqual(issuance());
    expect(h.rpc.mock.calls).toEqual([
      [
        "bfa_p5_v2_read_issuance",
        {
          p_owner_id: OWNER,
          p_auth_session_id: SESSION,
          p_parent_version: 3,
          p_fingerprint: FINGERPRINT,
        },
      ],
    ]);
  });

  it("preserves explicit null semantic denial independently for all five operations", async () => {
    const h = fixture();
    h.rpc.mockResolvedValue(success(null));
    expect(await h.ports.observeParent(observation())).toBeNull();
    expect(await h.ports.revokeParent(pair())).toBeNull();
    expect(await h.ports.readParent(pair())).toBeNull();
    expect(await h.ports.registerIssuance(registration())).toBeNull();
    expect(await h.ports.readIssuance(reading())).toBeNull();
    expect(h.rpc).toHaveBeenCalledTimes(5);
  });

  it("distinguishes clear observation, terminal revocation and observational reads", async () => {
    const h = fixture();
    h.rpc.mockResolvedValueOnce(success(parent(true)));
    await reject(h.ports.observeParent(observation()));
    h.rpc.mockResolvedValueOnce(success(parent(false)));
    await reject(h.ports.revokeParent(pair()));
    h.rpc.mockResolvedValueOnce(success(parent(true)));
    expect(await h.ports.readParent(pair())).toEqual(parent(true));
    expect(await h.ports.readParent(pair())).toEqual(parent(false));
  });

  it("preserves safe parent versions including saturation without assuming version zero", async () => {
    const h = fixture();
    for (const parentVersion of [0, 8, Number.MAX_SAFE_INTEGER]) {
      h.rpc.mockResolvedValueOnce(success({ ...parent(), parentVersion }));
      expect(await h.ports.observeParent(observation())).toEqual({ ...parent(), parentVersion });
    }
  });

  it("rejects noncanonical or nil identities before any transport", async () => {
    const h = fixture();
    for (const ownerId of [NIL, OTHER.toUpperCase(), "bad", null])
      await reject(h.ports.observeParent({ ...observation(), ownerId } as ObserveQuery));
    await reject(h.ports.revokeParent({ ...pair(), authSessionId: NIL }));
    await reject(h.ports.readParent({ ...pair(), authSessionId: OTHER.toUpperCase() }));
    await reject(h.ports.registerIssuance({ ...registration(), threadId: NIL }));
    await reject(h.ports.registerIssuance({ ...registration(), threadIncarnation: NIL }));
    await reject(h.ports.readIssuance({ ...reading(), authSessionId: NIL }));
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("rejects caller authority fields, inherited records and unexpected symbol fields", async () => {
    const h = fixture();
    for (const bad of [
      null,
      [],
      {},
      Object.create(observation()),
      { ...observation(), accessToken: "SYNTHETIC_PRIVATE" },
      { ...observation(), protocol: 2 },
      { ...observation(), [Symbol("extra")]: true },
    ])
      await reject(h.ports.observeParent(bad as ObserveQuery));
    await reject(h.ports.readParent({ ...pair(), expiresAt: EXPIRY } as PairQuery));
    await reject(
      h.ports.registerIssuance({ ...registration(), authenticated: true } as RegisterQuery),
    );
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("rejects accessor or hidden queries before evaluating value refinements", async () => {
    const h = fixture();
    const getter = vi.fn(() => EXPIRY);
    const a = observation(),
      b = registration(),
      c = reading();
    Object.defineProperty(a, "authExpiresAt", { get: getter, enumerable: true });
    Object.defineProperty(b, "expiresAt", { get: getter, enumerable: true });
    Object.defineProperty(c, "parentVersion", { value: 3, enumerable: false });
    await reject(h.ports.observeParent(a));
    await reject(h.ports.registerIssuance(b));
    await reject(h.ports.readIssuance(c));
    expect(getter).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("rejects unsafe observation times and missing positive eligibility", async () => {
    const h = fixture();
    for (const verifiedAt of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "1900000000000"])
      await reject(h.ports.observeParent({ ...observation(), verifiedAt } as ObserveQuery));
    for (const authExpiresAt of [0, VERIFIED, VERIFIED - 1, Number.MAX_SAFE_INTEGER + 1])
      await reject(h.ports.observeParent({ ...observation(), authExpiresAt }));
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("accepts exact one-millisecond and fifteen-minute bounded issuance endpoints", async () => {
    const h = fixture();
    for (const [verifiedAt, issuedAt, expiresAt, authExpiresAt] of [
      [0, 0, 1, 1],
      [VERIFIED, VERIFIED, VERIFIED + 900_000, VERIFIED + 900_000],
      [
        Number.MAX_SAFE_INTEGER - 1,
        Number.MAX_SAFE_INTEGER - 1,
        Number.MAX_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER,
      ],
    ]) {
      const q = { ...registration(), verifiedAt, issuedAt, expiresAt, authExpiresAt };
      const r = { ...issuance(), issuedAt, expiresAt };
      h.rpc.mockResolvedValueOnce(success(r));
      expect(await h.ports.registerIssuance(q)).toEqual(r);
    }
  });

  it("rejects reversed, excessive, Auth-exceeding or unsafe issuance metadata", async () => {
    const h = fixture();
    for (const change of [
      { expiresAt: ISSUED },
      { expiresAt: ISSUED - 1 },
      { expiresAt: ISSUED + 900_001 },
      { authExpiresAt: EXPIRY - 1 },
      { issuedAt: -1 },
      { parentVersion: -1 },
      { parentVersion: Number.MAX_SAFE_INTEGER + 1 },
      { threadRevision: 0.5 },
      { authorityFingerprint: "A".repeat(64) },
      { authorityFingerprint: "b".repeat(63) },
    ])
      await reject(h.ports.registerIssuance({ ...registration(), ...change }));
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("binds every parent reply to the original owner and actual Auth session", async () => {
    const h = fixture();
    for (const change of [{ ownerId: OTHER }, { authSessionId: OTHER }]) {
      h.rpc.mockResolvedValueOnce(success({ ...parent(), ...change }));
      await reject(h.ports.observeParent(observation()));
      h.rpc.mockResolvedValueOnce(success({ ...parent(true), ...change }));
      await reject(h.ports.revokeParent(pair()));
      h.rpc.mockResolvedValueOnce(success({ ...parent(), ...change }));
      await reject(h.ports.readParent(pair()));
    }
  });

  it("rejects any changed immutable registration field in the returned association", async () => {
    const h = fixture();
    for (const change of [
      { ownerId: OTHER },
      { authSessionId: OTHER },
      { parentVersion: 4 },
      { threadId: OTHER },
      { threadIncarnation: OTHER },
      { threadRevision: 8 },
      { authorityFingerprint: "b".repeat(64) },
      { issuedAt: ISSUED + 1 },
      { expiresAt: EXPIRY + 1 },
    ]) {
      h.rpc.mockResolvedValueOnce(success({ ...issuance(), ...change }));
      await reject(h.ports.registerIssuance(registration()));
    }
  });

  it("rejects wrong parent or fingerprint from issuance read without inventing unsupplied query fields", async () => {
    const h = fixture();
    for (const change of [
      { ownerId: OTHER },
      { authSessionId: OTHER },
      { parentVersion: 4 },
      { authorityFingerprint: "b".repeat(64) },
    ]) {
      h.rpc.mockResolvedValueOnce(success({ ...issuance(), ...change }));
      await reject(h.ports.readIssuance(reading()));
    }
    const observed = { ...issuance(), threadRevision: 8 };
    h.rpc.mockResolvedValueOnce(success(observed));
    expect(await h.ports.readIssuance(reading())).toEqual(observed);
  });

  it("denies legacy protocols, unexpected receipt fields and nonboolean terminal flags", async () => {
    const h = fixture();
    const missing: Partial<ReturnType<typeof parent>> = parent();
    delete missing.protocol;
    for (const data of [
      missing,
      { ...parent(), protocol: 1 },
      { ...parent(), protocol: "2" },
      { ...parent(), expiresAt: EXPIRY },
      { ...parent(), revoked: "false" },
      { ...parent(), [Symbol("extra")]: true },
      Object.create(parent()),
    ]) {
      h.rpc.mockResolvedValueOnce(success(data));
      await reject(h.ports.readParent(pair()));
    }
    h.rpc.mockResolvedValueOnce(success({ ...issuance(), revoked: true }));
    await reject(h.ports.readIssuance(reading()));
  });

  it("rejects missing/malformed data instead of treating it as null denial", async () => {
    const h = fixture();
    for (const data of [undefined, true, false, [], {}, "observed"]) {
      h.rpc.mockResolvedValueOnce(success(data));
      await reject(h.ports.readParent(pair()));
    }
  });

  it("rejects unsafe receipt counters and impossible issuance lifetime", async () => {
    const h = fixture();
    for (const parentVersion of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, "3", NaN]) {
      h.rpc.mockResolvedValueOnce(success({ ...parent(), parentVersion }));
      await reject(h.ports.readParent(pair()));
    }
    for (const data of [
      { ...issuance(), expiresAt: ISSUED },
      { ...issuance(), expiresAt: ISSUED + 900_001 },
      { ...issuance(), threadId: NIL },
    ]) {
      h.rpc.mockResolvedValueOnce(success(data));
      await reject(h.ports.readIssuance(reading()));
    }
  });

  it("rejects receipt accessors and hidden data without evaluating rejected getters", async () => {
    const h = fixture(),
      getter = vi.fn(() => EXPIRY);
    const a = issuance(),
      b = parent();
    Object.defineProperty(a, "expiresAt", { get: getter, enumerable: true });
    Object.defineProperty(b, "revoked", { value: false, enumerable: false });
    h.rpc.mockResolvedValueOnce(success(a));
    await reject(h.ports.readIssuance(reading()));
    h.rpc.mockResolvedValueOnce(success(b));
    await reject(h.ports.readParent(pair()));
    expect(getter).not.toHaveBeenCalled();
  });

  it("captures and freezes detached arguments before a caller mutates a pending registration", async () => {
    const h = fixture(),
      pending = deferred(),
      mutable = registration();
    h.rpc.mockReturnValueOnce(pending.promise);
    const result = h.ports.registerIssuance(mutable);
    mutable.ownerId = OTHER;
    mutable.authSessionId = OTHER;
    mutable.parentVersion++;
    mutable.authorityFingerprint = "b".repeat(64);
    mutable.expiresAt++;
    expect(h.rpc.mock.calls[0][1]).toMatchObject({
      p_owner_id: OWNER,
      p_auth_session_id: SESSION,
      p_parent_version: 3,
      p_fingerprint: FINGERPRINT,
      p_expires_ms: EXPIRY,
    });
    expect(Object.isFrozen(h.rpc.mock.calls[0][1])).toBe(true);
    pending.resolve(success(issuance()));
    expect(await result).toEqual(issuance());
  });

  it("accepts null-prototype data but returns detached frozen observations", async () => {
    const h = fixture(),
      data = Object.assign(Object.create(null), issuance());
    h.rpc.mockResolvedValueOnce(success(data));
    const value = await h.ports.readIssuance(Object.assign(Object.create(null), reading()));
    expect(value).toEqual(issuance());
    expect(value).not.toBe(data);
    expect(Object.isFrozen(value)).toBe(true);
    data.parentVersion++;
    data.revoked = true;
    expect(value?.parentVersion).toBe(3);
    expect(value?.revoked).toBe(false);
    const p = await h.ports.readParent(pair());
    expect(Object.isFrozen(p)).toBe(true);
  });

  it("settles overlapping associations in reverse order without shared last-call state", async () => {
    const h = fixture(),
      first = deferred(),
      second = deferred();
    h.rpc.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const a = h.ports.readIssuance(reading());
    const b = h.ports.readIssuance({ ...reading(), authSessionId: OTHER });
    second.resolve(success({ ...issuance(), authSessionId: OTHER }));
    expect(await b).toEqual({ ...issuance(), authSessionId: OTHER });
    first.resolve(success(issuance()));
    expect(await a).toEqual(issuance());
  });

  it("rejects swapped concurrent replies instead of transferring authority between Auth sessions", async () => {
    const h = fixture(),
      first = deferred(),
      second = deferred();
    h.rpc.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const a = reject(h.ports.readIssuance(reading()));
    const b = reject(h.ports.readIssuance({ ...reading(), authSessionId: OTHER }));
    second.resolve(success(issuance()));
    first.resolve(success({ ...issuance(), authSessionId: OTHER }));
    await Promise.all([a, b]);
  });

  it("rejects failed/malformed envelopes even when their data looks valid or is null", async () => {
    const h = fixture();
    for (const raw of [
      null,
      [],
      {},
      { data: parent() },
      { data: null, error: undefined },
      { ...success(null), error: { message: "SYNTHETIC_PRIVATE" } },
      ...[199, 300, 500, 200.5, "200", undefined, NaN].map((status) => ({
        ...success(parent()),
        status,
      })),
    ]) {
      h.rpc.mockResolvedValueOnce(raw);
      await reject(h.ports.readParent(pair()));
    }
  });

  it("rejects accessor envelope fields without invoking getters", async () => {
    const h = fixture(),
      getter = vi.fn(() => parent());
    const data = success(parent());
    Object.defineProperty(data, "data", { get: getter, enumerable: true });
    h.rpc.mockResolvedValueOnce(data);
    await reject(h.ports.readParent(pair()));
    const status = success(parent());
    Object.defineProperty(status, "status", { get: getter, enumerable: true });
    h.rpc.mockResolvedValueOnce(status);
    await reject(h.ports.readParent(pair()));
    expect(getter).not.toHaveBeenCalled();
  });

  it("accepts minimal success and denial envelopes without requiring HTTP metadata", async () => {
    const h = fixture();
    h.rpc.mockResolvedValueOnce({ data: parent(), error: null });
    expect(await h.ports.readParent(pair())).toEqual(parent());
    h.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await h.ports.readParent(pair())).toBeNull();
  });

  it("never retries or reuses earlier success after a committed but lost write reply", async () => {
    const h = fixture();
    expect(await h.ports.registerIssuance(registration())).toEqual(issuance());
    let fictionalCommitted = false;
    h.rpc.mockImplementationOnce(async () => {
      fictionalCommitted = true;
      throw new Error("SYNTHETIC_PRIVATE_REPLY_LOST");
    });
    await reject(h.ports.registerIssuance(registration()));
    expect(fictionalCommitted).toBe(true);
    expect(h.rpc).toHaveBeenCalledTimes(2);
  });

  it("returns a late SQL observation without using a local clock as current eligibility", async () => {
    const h = fixture(),
      pending = deferred();
    h.rpc.mockReturnValueOnce(pending.promise);
    const clock = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("local time is not SQL authority");
    });
    try {
      const result = h.ports.registerIssuance(registration());
      pending.resolve(success(issuance()));
      expect(await result).toEqual(issuance());
      expect(clock).not.toHaveBeenCalled();
    } finally {
      clock.mockRestore();
    }
  });

  it("sanitizes failures without causes, private identities, logs or retry", async () => {
    const h = fixture();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    h.rpc.mockRejectedValueOnce(new Error(`PRIVATE ${OWNER} ${SESSION}`, { cause: "private SQL" }));
    try {
      const error = await h.ports.observeParent(observation()).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(ERROR);
      expect(Object.hasOwn(error as Error, "cause")).toBe(false);
      expect(String(error)).not.toContain(OWNER);
      expect(errors).not.toHaveBeenCalled();
      expect(warnings).not.toHaveBeenCalled();
      expect(h.rpc).toHaveBeenCalledTimes(1);
    } finally {
      errors.mockRestore();
      warnings.mockRestore();
    }
  });

  it("captures the original transport method once and preserves its receiver", async () => {
    let gets = 0;
    const client = {
      marker: "original",
      get rpc() {
        gets++;
        return async function (this: { marker: string }) {
          expect(this.marker).toBe("original");
          return success(parent());
        };
      },
    };
    const ports = createVoiceV2ParentIssuanceRpcPorts(client);
    await ports.readParent(pair());
    await ports.observeParent(observation());
    expect(gets).toBe(1);
  });

  it("sanitizes invalid clients and synchronous transport throws", async () => {
    for (const client of [
      null,
      {},
      { rpc: 3 },
      {
        get rpc() {
          throw new Error("private client");
        },
      },
    ])
      expect(() =>
        createVoiceV2ParentIssuanceRpcPorts(client as unknown as VoiceV2ParentIssuanceRpcClient),
      ).toThrow(ERROR);
    const ports = createVoiceV2ParentIssuanceRpcPorts({
      rpc() {
        throw new Error("private sync");
      },
    });
    await reject(ports.revokeParent(pair()));
  });
});
