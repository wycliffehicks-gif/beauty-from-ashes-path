import { describe, expect, it, vi } from "vitest";
import {
  createVoicePreissueReadRpcPorts,
  type VoicePreissueReadRpcClient,
  type VoicePreissueReadRpcName,
} from "../service/voice-preissue-read-rpc.server";

const OWNER = "11111111-1111-4111-8111-111111111111";
const THREAD = "22222222-2222-4222-8222-222222222222";
const INCARNATION = "33333333-3333-4333-8333-333333333333";
const OTHER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CREATED = "2026-10-31T12:34:56.123456Z";
const EXPIRY = 1_900_000_000_000;
const query = () => ({ ownerId: OWNER, threadId: THREAD });
function current(ownerId = OWNER, threadId = THREAD) {
  return {
    ownerId,
    threadId,
    threadRevision: 7,
    sourceCreatedAt: CREATED,
    threadIncarnation: INCARNATION as string | null,
    deleted: false,
    allowlist: { ownerId, admitted: true, expiresAt: EXPIRY },
  };
}
function success(data: unknown) {
  return { data, error: null, status: 200, statusText: "OK" };
}
function fixture() {
  // Fictional transport only: no SQL, HTTP, Auth, microphone or provider calls.
  const rpc = vi.fn(
    async (
      _name: VoicePreissueReadRpcName,
      _args: Readonly<Record<string, unknown>>,
    ): Promise<unknown> => success(current()),
  );
  return { rpc, ports: createVoicePreissueReadRpcPorts({ rpc }) };
}
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
const reject = (promise: Promise<unknown>) =>
  expect(promise).rejects.toThrow("voice-preissue-read-rpc-unavailable");

describe("P5 inactive protected pre-issuance metadata read RPC", () => {
  it("constructs only the immutable metadata read port without transport access", () => {
    const h = fixture();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(Object.keys(h.ports)).toEqual(["readCurrentThread"]);
    expect(Object.isFrozen(h.ports)).toBe(true);
  });

  it("maps only owner and thread to the fixed pre-issuance RPC", async () => {
    const h = fixture();
    expect(await h.ports.readCurrentThread(query())).toEqual(current());
    expect(h.rpc.mock.calls).toEqual([
      ["bfa_p5_voice_read_current_thread", { p_owner_id: OWNER, p_thread_id: THREAD }],
    ]);
    expect(Object.isFrozen(h.rpc.mock.calls[0][1])).toBe(true);
  });

  it("permits an absent generation without inventing an incarnation", async () => {
    const h = fixture();
    h.rpc.mockResolvedValueOnce(success({ ...current(), threadIncarnation: null }));
    const value = (await h.ports.readCurrentThread(query())) as ReturnType<typeof current>;
    expect(value.threadIncarnation).toBeNull();
    expect(value.sourceCreatedAt).toBe(CREATED);
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it("returns SQL null denial without fallback, provisioning or retry", async () => {
    const h = fixture();
    h.rpc.mockResolvedValueOnce(success(null));
    expect(await h.ports.readCurrentThread(query())).toBeNull();
    expect(h.rpc.mock.calls).toEqual([
      ["bfa_p5_voice_read_current_thread", { p_owner_id: OWNER, p_thread_id: THREAD }],
    ]);
  });

  it("rejects malformed queries and legacy-token input before transport", async () => {
    const h = fixture();
    for (const bad of [
      null,
      [],
      {},
      { ...query(), ownerId: OTHER.toUpperCase() },
      { ...query(), threadId: "not-a-uuid" },
      { ...query(), ownerId: null },
      { ownerId: OWNER },
      { ...query(), activeAuthority: "SYNTHETIC_PRIVATE_TOKEN" },
      { ...query(), authorityFingerprint: "a".repeat(64) },
      { ...query(), sourceCreatedAt: CREATED },
      { ...query(), transcript: "SYNTHETIC_PRIVATE" },
      Object.create(query()),
      { ...query(), [Symbol("extra")]: true },
    ]) {
      await reject(h.ports.readCurrentThread(bad as ReturnType<typeof query>));
    }
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("rejects hidden and accessor query fields without invoking accessors", async () => {
    const h = fixture();
    const getter = vi.fn(() => OWNER);
    const accessor = query();
    Object.defineProperty(accessor, "ownerId", { get: getter, enumerable: true });
    const hidden = query();
    Object.defineProperty(hidden, "threadId", { value: THREAD, enumerable: false });
    await reject(h.ports.readCurrentThread(accessor));
    await reject(h.ports.readCurrentThread(hidden));
    expect(getter).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("rejects unsafe, negative, fractional and nonnumeric revisions or expiries", async () => {
    const h = fixture();
    for (const threadRevision of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, "7", NaN, Infinity]) {
      h.rpc.mockResolvedValueOnce(success({ ...current(), threadRevision }));
      await reject(h.ports.readCurrentThread(query()));
    }
    for (const expiresAt of [0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, "123", NaN, Infinity]) {
      h.rpc.mockResolvedValueOnce(
        success({ ...current(), allowlist: { ...current().allowlist, expiresAt } }),
      );
      await reject(h.ports.readCurrentThread(query()));
    }
  });

  it("preserves zero revision and the exact safe integer bounds", async () => {
    const h = fixture();
    for (const threadRevision of [0, Number.MAX_SAFE_INTEGER]) {
      const value = {
        ...current(),
        threadRevision,
        allowlist: { ...current().allowlist, expiresAt: Number.MAX_SAFE_INTEGER },
      };
      h.rpc.mockResolvedValueOnce(success(value));
      expect(await h.ports.readCurrentThread(query())).toEqual(value);
    }
  });

  it("rejects noncanonical UUIDs and missing incarnations", async () => {
    const h = fixture();
    for (const value of [
      { ...current(), ownerId: OTHER.toUpperCase() },
      { ...current(), threadId: "" },
      { ...current(), threadIncarnation: OTHER.toUpperCase() },
      { ...current(), threadIncarnation: "" },
      { ...current(), threadIncarnation: undefined },
      { ...current(), allowlist: { ...current().allowlist, ownerId: "bad" } },
    ]) {
      h.rpc.mockResolvedValueOnce(success(value));
      await reject(h.ports.readCurrentThread(query()));
    }
  });

  it("rejects deleted or non-admitted records and coerced flags", async () => {
    const h = fixture();
    for (const value of [
      { ...current(), deleted: true },
      { ...current(), deleted: 0 },
      { ...current(), allowlist: { ...current().allowlist, admitted: false } },
      { ...current(), allowlist: { ...current().allowlist, admitted: "true" } },
    ]) {
      h.rpc.mockResolvedValueOnce(success(value));
      await reject(h.ports.readCurrentThread(query()));
    }
  });

  it("binds metadata and allowlist ownership to the exact query", async () => {
    const h = fixture();
    for (const value of [
      current(OTHER),
      current(OWNER, OTHER),
      { ...current(), allowlist: { ...current().allowlist, ownerId: OTHER } },
    ]) {
      h.rpc.mockResolvedValueOnce(success(value));
      await reject(h.ports.readCurrentThread(query()));
    }
  });

  it("preserves all six microseconds without collapsing consistency metadata", async () => {
    const h = fixture();
    const dates = [
      "0001-01-01T00:00:00.000000Z",
      "2000-02-29T00:00:00.000001Z",
      "2024-02-29T23:59:59.999999Z",
      CREATED,
      "2026-10-31T12:34:56.123457Z",
      "9999-12-31T23:59:59.999999Z",
    ];
    const seen: string[] = [];
    for (const sourceCreatedAt of dates) {
      h.rpc.mockResolvedValueOnce(success({ ...current(), sourceCreatedAt }));
      const value = (await h.ports.readCurrentThread(query())) as ReturnType<typeof current>;
      expect(value.sourceCreatedAt).toBe(sourceCreatedAt);
      expect(value.threadIncarnation).toBe(INCARNATION);
      seen.push(value.sourceCreatedAt);
    }
    expect(new Set(seen).size).toBe(dates.length);
  });

  it("rejects noncanonical timestamps, precision loss and invalid calendar values", async () => {
    const h = fixture();
    for (const sourceCreatedAt of [
      "2026-10-31T12:34:56.123Z",
      "2026-10-31T12:34:56.1234567Z",
      "2026-10-31T12:34:56Z",
      "2026-10-31T12:34:56.123456+00:00",
      "2026-10-31 12:34:56.123456Z",
      "2026-10-31t12:34:56.123456z",
      "2026-1-31T12:34:56.123456Z",
      `${CREATED}\n`,
      ` ${CREATED}`,
      "0000-01-01T00:00:00.000000Z",
      "10000-01-01T00:00:00.000000Z",
      "1900-02-29T00:00:00.000000Z",
      "2026-02-29T00:00:00.000000Z",
      "2026-04-31T00:00:00.000000Z",
      "2026-00-01T00:00:00.000000Z",
      "2026-13-01T00:00:00.000000Z",
      "2026-01-00T00:00:00.000000Z",
      "2026-01-32T00:00:00.000000Z",
      "2026-01-01T24:00:00.000000Z",
      "2026-01-01T00:60:00.000000Z",
      "2026-01-01T00:00:60.000000Z",
      "infinity",
      "-infinity",
      null,
      1_900_000_000_000,
    ]) {
      h.rpc.mockResolvedValueOnce(success({ ...current(), sourceCreatedAt }));
      await reject(h.ports.readCurrentThread(query()));
    }
  });

  it("rejects extra, inherited, hidden and accessor metadata fields", async () => {
    const h = fixture();
    const getter = vi.fn(() => CREATED);
    const accessor = current();
    Object.defineProperty(accessor, "sourceCreatedAt", { get: getter, enumerable: true });
    const nestedGetter = vi.fn(() => OWNER);
    const nestedAccessor = current();
    Object.defineProperty(nestedAccessor.allowlist, "ownerId", {
      get: nestedGetter,
      enumerable: true,
    });
    const hidden = current();
    Object.defineProperty(hidden.allowlist, "ownerId", { value: OWNER, enumerable: false });
    for (const value of [
      { ...current(), saved_snapshot: "SYNTHETIC_PRIVATE" },
      { ...current(), allowlist: { ...current().allowlist, content: "SYNTHETIC_PRIVATE" } },
      { ...current(), allowlist: Object.create(current().allowlist) },
      { ...current(), [Symbol("extra")]: 1 },
      { ...current(), allowlist: { ...current().allowlist, [Symbol("extra")]: 1 } },
      Object.create(current()),
      hidden,
      accessor,
      nestedAccessor,
    ]) {
      h.rpc.mockResolvedValueOnce(success(value));
      await reject(h.ports.readCurrentThread(query()));
    }
    expect(getter).not.toHaveBeenCalled();
    expect(nestedGetter).not.toHaveBeenCalled();
  });

  it("accepts null-prototype plain records and freezes detached nested output", async () => {
    const h = fixture();
    const value = current();
    Object.setPrototypeOf(value, null);
    Object.setPrototypeOf(value.allowlist, null);
    const q = Object.assign(Object.create(null), query());
    h.rpc.mockResolvedValueOnce(Object.assign(Object.create(null), success(value)));
    const result = (await h.ports.readCurrentThread(q)) as ReturnType<typeof current>;
    expect(result).toEqual(value);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.allowlist)).toBe(true);
    value.sourceCreatedAt = "2026-10-31T12:34:56.123457Z";
    value.allowlist.expiresAt--;
    value.threadIncarnation = null;
    expect(result.sourceCreatedAt).toBe(CREATED);
    expect(result.threadIncarnation).toBe(INCARNATION);
    expect(result.allowlist.expiresAt).toBe(EXPIRY);
    expect(Reflect.set(result, "threadRevision", 8)).toBe(false);
    expect(Reflect.set(result.allowlist, "admitted", false)).toBe(false);
  });

  it("owns the query before await despite caller mutation while pending", async () => {
    const h = fixture();
    const pending = deferred();
    const original = query();
    h.rpc.mockReturnValueOnce(pending.promise);
    const result = h.ports.readCurrentThread(original);
    original.ownerId = OTHER;
    original.threadId = OTHER;
    const args = h.rpc.mock.calls[0][1];
    expect(args).toEqual({ p_owner_id: OWNER, p_thread_id: THREAD });
    expect(Reflect.set(args, "p_owner_id", OTHER)).toBe(false);
    pending.resolve(success(current()));
    expect(await result).toEqual(current());
  });

  it("settles overlapping reads in reverse order with independent snapshots", async () => {
    const h = fixture();
    const first = deferred();
    const second = deferred();
    h.rpc.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const a = h.ports.readCurrentThread(query());
    const b = h.ports.readCurrentThread({ ownerId: OTHER, threadId: OTHER });
    second.resolve(success(current(OTHER, OTHER)));
    expect(await b).toEqual(current(OTHER, OTHER));
    first.resolve(success(current()));
    expect(await a).toEqual(current());
    expect(h.rpc).toHaveBeenCalledTimes(2);
  });

  it("rejects swapped concurrent replies independently", async () => {
    const h = fixture();
    const first = deferred();
    const second = deferred();
    h.rpc.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const a = reject(h.ports.readCurrentThread(query()));
    const b = reject(h.ports.readCurrentThread({ ownerId: OTHER, threadId: OTHER }));
    first.resolve(success(current(OTHER, OTHER)));
    second.resolve(success(current()));
    await Promise.all([a, b]);
    expect(h.rpc).toHaveBeenCalledTimes(2);
  });

  it("never reuses successful metadata after denial or lost response", async () => {
    const h = fixture();
    expect(await h.ports.readCurrentThread(query())).toEqual(current());
    h.rpc.mockResolvedValueOnce(success(null));
    expect(await h.ports.readCurrentThread(query())).toBeNull();
    h.rpc.mockRejectedValueOnce(new Error("SYNTHETIC_PRIVATE transport detail"));
    await reject(h.ports.readCurrentThread(query()));
    expect(h.rpc).toHaveBeenCalledTimes(3);
  });

  it("rejects malformed or contradictory RPC envelopes without fallback", async () => {
    const h = fixture();
    const badEnvelopes = [
      undefined,
      null,
      [],
      { data: current() },
      { error: null },
      { data: current(), error: { message: "SYNTHETIC_PRIVATE" } },
      { data: current(), error: undefined },
      { data: null, error: false },
      { ...success(current()), status: 500 },
      { ...success(current()), status: "200" },
      { ...success(current()), status: 200.5 },
      { ...success(current()), status: 199 },
      { ...success(current()), status: 300 },
      { ...success(current()), status: undefined },
      Object.create(success(current())),
    ];
    for (const value of badEnvelopes) {
      h.rpc.mockResolvedValueOnce(value);
      await reject(h.ports.readCurrentThread(query()));
    }
    expect(h.rpc).toHaveBeenCalledTimes(badEnvelopes.length);
    expect(new Set(h.rpc.mock.calls.map(([name]) => name))).toEqual(
      new Set(["bfa_p5_voice_read_current_thread"]),
    );
  });

  it("permits the minimal success envelope without requiring optional HTTP metadata", async () => {
    const h = fixture();
    h.rpc.mockResolvedValueOnce({ data: current(), error: null });
    expect(await h.ports.readCurrentThread(query())).toEqual(current());
  });

  it("never evaluates accessor or hidden response-envelope fields", async () => {
    const h = fixture();
    const getter = vi.fn(() => current());
    for (const field of ["data", "error", "status"]) {
      const accessor = success(current());
      Object.defineProperty(accessor, field, { get: getter, enumerable: true });
      h.rpc.mockResolvedValueOnce(accessor);
      await reject(h.ports.readCurrentThread(query()));
      const hidden = success(current());
      Object.defineProperty(hidden, field, { enumerable: false });
      h.rpc.mockResolvedValueOnce(hidden);
      await reject(h.ports.readCurrentThread(query()));
    }
    expect(getter).not.toHaveBeenCalled();
  });

  it("sanitizes transport failures without causes, private data, logging or retry", async () => {
    const h = fixture();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      h.rpc.mockRejectedValueOnce(new Error(`SYNTHETIC_PRIVATE ${OWNER} ${CREATED}`));
      const error = await h.ports.readCurrentThread(query()).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("voice-preissue-read-rpc-unavailable");
      expect((error as Error).cause).toBeUndefined();
      expect(String(error)).not.toContain(OWNER);
      expect(String(error)).not.toContain(CREATED);
      expect(String(error)).not.toContain("SYNTHETIC_PRIVATE");
      expect(log).not.toHaveBeenCalled();
      expect(h.rpc).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
    }
  });

  it("captures the client method once with its receiver preserved", async () => {
    let gets = 0;
    const client = {
      marker: "LOCAL_FIXTURE_RECEIVER",
      get rpc() {
        gets++;
        return async function (this: { marker: string }) {
          expect(this.marker).toBe("LOCAL_FIXTURE_RECEIVER");
          return success(null);
        };
      },
    };
    const ports = createVoicePreissueReadRpcPorts(client);
    expect(gets).toBe(1);
    await ports.readCurrentThread(query());
    await ports.readCurrentThread(query());
    expect(gets).toBe(1);
  });

  it("sanitizes client construction and synchronous transport failures", async () => {
    for (const value of [
      null,
      {},
      { rpc: 1 },
      {
        get rpc() {
          throw new Error("SYNTHETIC_PRIVATE");
        },
      },
    ]) {
      expect(() =>
        createVoicePreissueReadRpcPorts(value as unknown as VoicePreissueReadRpcClient),
      ).toThrow("voice-preissue-read-rpc-unavailable");
    }
    const rpc = vi.fn(() => {
      throw new Error("SYNTHETIC_PRIVATE");
    });
    await reject(createVoicePreissueReadRpcPorts({ rpc }).readCurrentThread(query()));
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
