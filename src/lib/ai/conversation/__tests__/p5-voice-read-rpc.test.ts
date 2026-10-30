import { describe, expect, it, vi } from "vitest";
import {
  createVoiceReadRpcPorts,
  type VoiceReadRpcClient,
  type VoiceReadRpcName,
} from "../service/voice-read-rpc.server";
import type { VoiceVerificationQuery } from "../service/voice-verification.server";

const OWNER = "11111111-1111-4111-8111-111111111111";
const THREAD = "22222222-2222-4222-8222-222222222222";
const INCARNATION = "33333333-3333-4333-8333-333333333333";
const ATTEMPT = "44444444-4444-4444-8444-444444444444";
const APPROVAL = "55555555-5555-4555-8555-555555555555";
const SESSION = "66666666-6666-4666-8666-666666666666";
const OTHER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EXPIRY = 1_900_000_000_000;
const query = (): VoiceVerificationQuery => ({
  ownerId: OWNER,
  threadId: THREAD,
  attemptId: ATTEMPT,
  authorityFingerprint: "c".repeat(64),
});
const sessionQuery = () => ({ ownerId: OWNER, sessionId: SESSION });
const fence = () => ({ ...sessionQuery(), version: 2, expiresAt: EXPIRY, revoked: false });
function current(ownerId = OWNER) {
  const owned = { ownerId, threadId: THREAD, threadIncarnation: INCARNATION, threadRevision: 7 };
  return {
    ...owned,
    deleted: false,
    allowlist: { ownerId, admitted: true, expiresAt: EXPIRY },
    authority: { ...owned, fingerprint: "c".repeat(64), expiresAt: EXPIRY - 5, revoked: false },
    approval: {
      ...owned,
      id: APPROVAL,
      digest: "b".repeat(64),
      scope: "developer-voice-session",
      attemptId: ATTEMPT,
      expiresAt: EXPIRY - 10,
      revoked: false,
    },
  };
}
function success(data: unknown) {
  return { data, error: null, status: 200, statusText: "OK" };
}
function fixture() {
  // Fictional transport only; no actual SQL, Auth, HTTP or provider is invoked.
  const rpc = vi.fn(
    async (name: VoiceReadRpcName, _args: Readonly<Record<string, unknown>>): Promise<unknown> =>
      success(name === "bfa_p5_voice_read_current" ? current() : fence()),
  );
  return { rpc, ports: createVoiceReadRpcPorts({ rpc }) };
}
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
const reject = (promise: Promise<unknown>) =>
  expect(promise).rejects.toThrow("voice-read-rpc-unavailable");

describe("P5 inactive protected read RPC adapter", () => {
  it("constructs only two read ports without invoking a transport", () => {
    const h = fixture();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(Object.keys(h.ports).sort()).toEqual(["readCurrent", "readSessionFence"]);
    expect(Object.isFrozen(h.ports)).toBe(true);
  });

  it("maps exact named arguments and preserves independent expiry/version fields", async () => {
    const h = fixture();
    expect(await h.ports.readSessionFence(sessionQuery())).toEqual(fence());
    expect(await h.ports.readCurrent(query())).toEqual(current());
    expect(h.rpc.mock.calls).toEqual([
      ["bfa_p5_voice_read_session_fence", { p_owner_id: OWNER, p_session_id: SESSION }],
      [
        "bfa_p5_voice_read_current",
        {
          p_owner_id: OWNER,
          p_thread_id: THREAD,
          p_attempt_id: ATTEMPT,
          p_authority_fingerprint: "c".repeat(64),
        },
      ],
    ]);
  });

  it("returns semantic null without provisioning, fallback or retry", async () => {
    const h = fixture();
    h.rpc.mockResolvedValue(success(null));
    expect(await h.ports.readSessionFence(sessionQuery())).toBeNull();
    expect(await h.ports.readCurrent(query())).toBeNull();
    expect(h.rpc.mock.calls.map(([name]) => name)).toEqual([
      "bfa_p5_voice_read_session_fence",
      "bfa_p5_voice_read_current",
    ]);
  });

  it("rejects malformed current queries before transport", async () => {
    const h = fixture();
    for (const bad of [
      null,
      [],
      { ...query(), ownerId: OTHER.toUpperCase() },
      { ...query(), threadId: "not-a-uuid" },
      { ...query(), attemptId: null },
      { ...query(), authorityFingerprint: "C".repeat(64) },
      { ...query(), authorityFingerprint: "c".repeat(63) },
      { ...query(), transcript: "SYNTHETIC_PRIVATE" },
      Object.create(query()),
    ]) {
      await reject(h.ports.readCurrent(bad as VoiceVerificationQuery));
    }
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("rejects malformed session queries before transport", async () => {
    const h = fixture();
    for (const bad of [
      null,
      { ...sessionQuery(), sessionId: OTHER.toUpperCase() },
      { ...sessionQuery(), ownerId: "" },
      { ...sessionQuery(), version: 0 },
      Object.create(sessionQuery()),
    ]) {
      await reject(h.ports.readSessionFence(bad as ReturnType<typeof sessionQuery>));
    }
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("rejects unsafe, fractional, string or nonpositive response values", async () => {
    const h = fixture();
    for (const version of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, "2", NaN, Infinity]) {
      h.rpc.mockResolvedValueOnce(success({ ...fence(), version }));
      await reject(h.ports.readSessionFence(sessionQuery()));
    }
    for (const expiresAt of [0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, "123", Infinity]) {
      h.rpc.mockResolvedValueOnce(success({ ...fence(), expiresAt }));
      await reject(h.ports.readSessionFence(sessionQuery()));
      const value = current();
      h.rpc.mockResolvedValueOnce(
        success({ ...value, authority: { ...value.authority, expiresAt } }),
      );
      await reject(h.ports.readCurrent(query()));
    }
    const value = current();
    h.rpc.mockResolvedValueOnce(success({ ...value, threadRevision: Number.MAX_SAFE_INTEGER + 1 }));
    await reject(h.ports.readCurrent(query()));
  });

  it("rejects terminal or denied flags rather than reinterpreting them as eligible", async () => {
    const h = fixture();
    h.rpc.mockResolvedValueOnce(success({ ...fence(), revoked: true }));
    await reject(h.ports.readSessionFence(sessionQuery()));
    for (const alter of [
      (v: ReturnType<typeof current>) => (v.deleted = true),
      (v: ReturnType<typeof current>) => (v.allowlist.admitted = false),
      (v: ReturnType<typeof current>) => (v.authority.revoked = true),
      (v: ReturnType<typeof current>) => (v.approval.revoked = true),
      (v: ReturnType<typeof current>) => (v.approval.scope = "text-evaluation"),
    ]) {
      const value = current();
      alter(value);
      h.rpc.mockResolvedValueOnce(success(value));
      await reject(h.ports.readCurrent(query()));
    }
  });

  it("binds the session response to both owner and exact session", async () => {
    const h = fixture();
    for (const value of [
      { ...fence(), ownerId: OTHER },
      { ...fence(), sessionId: OTHER },
    ]) {
      h.rpc.mockResolvedValueOnce(success(value));
      await reject(h.ports.readSessionFence(sessionQuery()));
    }
  });

  it("binds every returned record and request identity to one snapshot", async () => {
    const h = fixture();
    const changes: ((value: ReturnType<typeof current>) => void)[] = [
      (v) => {
        v.ownerId = OTHER;
      },
      (v) => {
        v.threadId = OTHER;
      },
      (v) => {
        v.threadIncarnation = OTHER;
      },
      (v) => {
        v.threadRevision++;
      },
      (v) => {
        v.allowlist.ownerId = OTHER;
      },
      (v) => {
        v.authority.ownerId = OTHER;
      },
      (v) => {
        v.authority.threadId = OTHER;
      },
      (v) => {
        v.authority.threadIncarnation = OTHER;
      },
      (v) => {
        v.authority.threadRevision++;
      },
      (v) => {
        v.authority.fingerprint = "a".repeat(64);
      },
      (v) => {
        v.approval.ownerId = OTHER;
      },
      (v) => {
        v.approval.threadId = OTHER;
      },
      (v) => {
        v.approval.threadIncarnation = OTHER;
      },
      (v) => {
        v.approval.threadRevision++;
      },
      (v) => {
        v.approval.attemptId = OTHER;
      },
    ];
    for (const change of changes) {
      const value = current();
      change(value);
      h.rpc.mockResolvedValueOnce(success(value));
      await reject(h.ports.readCurrent(query()));
    }
  });

  it("rejects extra, inherited, hidden and accessor snapshot fields", async () => {
    const h = fixture();
    const getter = vi.fn(() => OWNER);
    const accessor = current();
    Object.defineProperty(accessor.authority, "ownerId", { get: getter, enumerable: true });
    const hidden = current();
    Object.defineProperty(hidden.allowlist, "ownerId", { value: OWNER, enumerable: false });
    for (const bad of [
      { ...current(), saved_snapshot: "SYNTHETIC_PRIVATE" },
      { ...current(), authority: { ...current().authority, content: "SYNTHETIC_PRIVATE" } },
      { ...current(), approval: Object.create(current().approval) },
      { ...current(), [Symbol("extra")]: 1 },
      hidden,
      accessor,
    ]) {
      h.rpc.mockResolvedValueOnce(success(bad));
      await reject(h.ports.readCurrent(query()));
    }
    expect(getter).not.toHaveBeenCalled();
  });

  it("accepts plain null-prototype JSON records and freezes detached outputs", async () => {
    const h = fixture();
    const value = current();
    Object.setPrototypeOf(value, null);
    Object.setPrototypeOf(value.authority, null);
    h.rpc.mockResolvedValueOnce(success(value));
    const result = (await h.ports.readCurrent(query())) as ReturnType<typeof current>;
    expect(result).toEqual(value);
    for (const part of [result, result.allowlist, result.authority, result.approval])
      expect(Object.isFrozen(part)).toBe(true);
    value.authority.fingerprint = "a".repeat(64);
    value.approval.threadRevision++;
    expect(result.authority.fingerprint).toBe("c".repeat(64));
    expect(result.approval.threadRevision).toBe(7);
    const session = fence();
    h.rpc.mockResolvedValueOnce(success(session));
    const resultFence = (await h.ports.readSessionFence(sessionQuery())) as ReturnType<
      typeof fence
    >;
    session.version++;
    expect(Object.isFrozen(resultFence)).toBe(true);
    expect(resultFence.version).toBe(2);
  });

  it("owns immutable request arguments despite caller mutation while pending", async () => {
    const h = fixture();
    const pending = deferred();
    const original = { ...query() };
    h.rpc.mockReturnValueOnce(pending.promise);
    const result = h.ports.readCurrent(original);
    original.ownerId = OTHER;
    original.authorityFingerprint = "a".repeat(64);
    const args = h.rpc.mock.calls[0][1];
    expect(Object.isFrozen(args)).toBe(true);
    expect(args.p_owner_id).toBe(OWNER);
    pending.resolve(success(current()));
    expect(await result).toEqual(current());
  });

  it("settles overlapping reads in reverse order without shared identity state", async () => {
    const h = fixture();
    const first = deferred(),
      second = deferred();
    h.rpc.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const a = h.ports.readCurrent(query());
    const b = h.ports.readCurrent({ ...query(), ownerId: OTHER });
    second.resolve(success(current(OTHER)));
    expect(await b).toEqual(current(OTHER));
    first.resolve(success(current()));
    expect(await a).toEqual(current());
    expect(h.rpc).toHaveBeenCalledTimes(2);
  });

  it("rejects swapped concurrent responses independently", async () => {
    const h = fixture();
    const first = deferred(),
      second = deferred();
    h.rpc.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const a = reject(h.ports.readCurrent(query()));
    const b = reject(h.ports.readCurrent({ ...query(), ownerId: OTHER }));
    first.resolve(success(current(OTHER)));
    second.resolve(success(current()));
    await Promise.all([a, b]);
    expect(h.rpc).toHaveBeenCalledTimes(2);
  });

  it("does not reuse a previous success after a later denial or lost reply", async () => {
    const h = fixture();
    expect(await h.ports.readCurrent(query())).toEqual(current());
    h.rpc.mockResolvedValueOnce(success(null));
    expect(await h.ports.readCurrent(query())).toBeNull();
    h.rpc.mockRejectedValueOnce(new Error("SYNTHETIC_PRIVATE transport failure"));
    await reject(h.ports.readCurrent(query()));
    expect(h.rpc).toHaveBeenCalledTimes(3);
  });

  it("rejects malformed and contradictory envelopes without a fallback", async () => {
    const h = fixture();
    for (const bad of [
      undefined,
      null,
      [],
      { data: fence() },
      { error: null },
      { data: fence(), error: { message: "SYNTHETIC_PRIVATE" } },
      { data: fence(), error: undefined },
      { ...success(fence()), status: 500 },
      { ...success(fence()), status: "200" },
      { ...success(fence()), status: 200.5 },
      { ...success(fence()), status: 199 },
      Object.create(success(fence())),
    ]) {
      h.rpc.mockResolvedValueOnce(bad);
      await reject(h.ports.readSessionFence(sessionQuery()));
    }
    expect(new Set(h.rpc.mock.calls.map(([name]) => name))).toEqual(
      new Set(["bfa_p5_voice_read_session_fence"]),
    );
    expect(h.rpc).toHaveBeenCalledTimes(12);
  });

  it("sanitizes thrown details without cause and never automatically retries", async () => {
    const h = fixture();
    h.rpc.mockRejectedValueOnce(new Error(`SYNTHETIC_PRIVATE ${OWNER}`));
    const error = await h.ports.readCurrent(query()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("voice-read-rpc-unavailable");
    expect((error as Error).cause).toBeUndefined();
    expect(String(error)).not.toContain(OWNER);
    expect(String(error)).not.toContain("SYNTHETIC_PRIVATE");
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it("never evaluates accessor query or response-envelope fields", async () => {
    const h = fixture();
    const getter = vi.fn(() => OWNER);
    const q = sessionQuery();
    Object.defineProperty(q, "ownerId", { get: getter, enumerable: true });
    await reject(h.ports.readSessionFence(q));
    expect(getter).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
    const getData = vi.fn(() => current());
    h.rpc.mockResolvedValueOnce({
      get data() {
        return getData();
      },
      error: null,
    });
    await reject(h.ports.readCurrent(query()));
    expect(getData).not.toHaveBeenCalled();
  });

  it("captures the client method once with its receiver preserved", async () => {
    let gets = 0;
    const client = {
      token: "LOCAL_FIXTURE_RECEIVER",
      get rpc() {
        gets++;
        return async function (this: { token: string }) {
          expect(this.token).toBe("LOCAL_FIXTURE_RECEIVER");
          return success(null);
        };
      },
    };
    const ports = createVoiceReadRpcPorts(client);
    await ports.readSessionFence(sessionQuery());
    await ports.readCurrent(query());
    expect(gets).toBe(1);
  });

  it("sanitizes invalid client and getter construction failures", () => {
    for (const bad of [
      null,
      {},
      { rpc: 1 },
      {
        get rpc() {
          throw new Error("SYNTHETIC_PRIVATE");
        },
      },
    ]) {
      expect(() => createVoiceReadRpcPorts(bad as unknown as VoiceReadRpcClient)).toThrow(
        "voice-read-rpc-unavailable",
      );
    }
  });
});
