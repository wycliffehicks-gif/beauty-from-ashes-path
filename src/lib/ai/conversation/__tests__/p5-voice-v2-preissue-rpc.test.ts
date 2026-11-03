// Fictional transport contracts only: no SQL/Auth/provider, runtime route or
// live credential. Actual isolated SQL composition is tested separately.
import { describe, expect, it, vi } from "vitest";
import {
  createVoiceV2PreissueRpcPorts,
  type VoiceV2PreissueRpcClient,
  type VoiceV2PreissueRpcName,
  type VoiceV2CurrentThreadQuery,
  type VoiceV2GenerationRegistration,
} from "../service/voice-v2-preissue-rpc.server";

const OWNER = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";
const THREAD = "33333333-3333-4333-8333-333333333333";
const INCARNATION = "44444444-4444-4444-8444-444444444444";
const OTHER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NIL = "00000000-0000-0000-0000-000000000000";
const VERIFIED = 1_900_000_000_000;
const AUTH_EXPIRY = VERIFIED + 900_000;
const ALLOW_EXPIRY = AUTH_EXPIRY + 900_000;
const CREATED = "2026-11-03T12:34:56.123456Z";
const ERROR = "voice-v2-preissue-rpc-unavailable";
const query = () => ({
  ownerId: OWNER,
  authSessionId: SESSION,
  parentVersion: 3,
  threadId: THREAD,
  verifiedAt: VERIFIED,
  authExpiresAt: AUTH_EXPIRY,
});
const registration = () => ({ ...query(), threadRevision: 7, sourceCreatedAt: CREATED });
const current = (threadIncarnation: string | null = INCARNATION) => ({
  protocol: 2,
  ownerId: OWNER,
  authSessionId: SESSION,
  parentVersion: 3,
  threadId: THREAD,
  threadRevision: 7,
  sourceCreatedAt: CREATED,
  threadIncarnation,
  deleted: false,
  allowlist: { ownerId: OWNER, admitted: true, expiresAt: ALLOW_EXPIRY },
});
const success = (data: unknown) => ({ data, error: null, status: 200, statusText: "OK" });
function fixture() {
  const rpc = vi.fn(
    async (
      _name: VoiceV2PreissueRpcName,
      _args: Readonly<Record<string, unknown>>,
    ): Promise<unknown> => success(current()),
  );
  return { rpc, ports: createVoiceV2PreissueRpcPorts({ rpc }) };
}
const reject = (promise: Promise<unknown>) => expect(promise).rejects.toThrow(ERROR);
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("inactive exact v2 pre-issuance transport", () => {
  it("constructs only frozen read/register ports and performs no request", () => {
    const h = fixture();
    expect(Object.keys(h.ports)).toEqual(["readCurrentThread", "registerGeneration"]);
    expect(Object.isFrozen(h.ports)).toBe(true);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("maps current-thread read with exact parent and trusted observation metadata", async () => {
    const h = fixture();
    expect(await h.ports.readCurrentThread(query())).toEqual(current());
    expect(h.rpc.mock.calls).toEqual([
      [
        "bfa_p5_v2_read_current_thread",
        {
          p_owner_id: OWNER,
          p_auth_session_id: SESSION,
          p_parent_version: 3,
          p_thread_id: THREAD,
          p_verified_ms: VERIFIED,
          p_auth_expires_ms: AUTH_EXPIRY,
        },
      ],
    ]);
    expect(Object.isFrozen(h.rpc.mock.calls[0][1])).toBe(true);
  });

  it("maps generation registration without an issuance or caller incarnation", async () => {
    const h = fixture();
    expect(await h.ports.registerGeneration(registration())).toEqual(current());
    expect(h.rpc.mock.calls).toEqual([
      [
        "bfa_p5_v2_register_generation",
        {
          p_owner_id: OWNER,
          p_auth_session_id: SESSION,
          p_parent_version: 3,
          p_thread_id: THREAD,
          p_revision: 7,
          p_source_created_at: CREATED,
          p_verified_ms: VERIFIED,
          p_auth_expires_ms: AUTH_EXPIRY,
        },
      ],
    ]);
    expect(Object.isFrozen(h.rpc.mock.calls[0][1])).toBe(true);
  });

  it("preserves explicit semantic-null denial without a retry or fallback", async () => {
    const h = fixture();
    h.rpc.mockResolvedValue(success(null));
    expect(await h.ports.readCurrentThread(query())).toBeNull();
    expect(await h.ports.registerGeneration(registration())).toBeNull();
    expect(h.rpc).toHaveBeenCalledTimes(2);
  });

  it("distinguishes true generation absence on read from a required registered UUID", async () => {
    const h = fixture();
    h.rpc.mockResolvedValue(success(current(null)));
    expect(await h.ports.readCurrentThread(query())).toEqual(current(null));
    await reject(h.ports.registerGeneration(registration()));
    h.rpc.mockResolvedValue(success(current(NIL)));
    await reject(h.ports.readCurrentThread(query()));
    await reject(h.ports.registerGeneration(registration()));
  });

  it("rejects noncanonical or nil request identities before transport", async () => {
    const h = fixture();
    for (const key of ["ownerId", "authSessionId", "threadId"])
      for (const value of [NIL, OTHER.toUpperCase(), "bad", null, 12]) {
        await reject(h.ports.readCurrentThread({ ...query(), [key]: value }));
        await reject(h.ports.registerGeneration({ ...registration(), [key]: value }));
      }
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("rejects unsafe versions, timestamps and verification intervals before transport", async () => {
    const h = fixture();
    for (const key of ["parentVersion", "verifiedAt", "authExpiresAt"])
      for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "2", null])
        await reject(h.ports.readCurrentThread({ ...query(), [key]: value }));
    for (const value of [0, VERIFIED - 1, VERIFIED])
      await reject(h.ports.registerGeneration({ ...registration(), authExpiresAt: value }));
    for (const value of [-1, 0.5, NaN, Number.MAX_SAFE_INTEGER + 1, null])
      await reject(
        h.ports.registerGeneration({
          ...registration(),
          threadRevision: value,
        } as VoiceV2GenerationRegistration),
      );
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("accepts valid safe endpoints without inventing a local time ceiling", async () => {
    const h = fixture();
    h.rpc.mockResolvedValue(success({ ...current(), parentVersion: Number.MAX_SAFE_INTEGER }));
    expect(
      await h.ports.readCurrentThread({
        ...query(),
        parentVersion: Number.MAX_SAFE_INTEGER,
        verifiedAt: Number.MAX_SAFE_INTEGER - 1,
        authExpiresAt: Number.MAX_SAFE_INTEGER,
      }),
    ).toMatchObject({ parentVersion: Number.MAX_SAFE_INTEGER });
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid Gregorian or noncanonical source creation metadata", async () => {
    const h = fixture();
    const invalid = [
      "2026-02-29T00:00:00.000000Z",
      "1900-02-29T00:00:00.000000Z",
      "2026-04-31T00:00:00.000000Z",
      "2026-00-01T00:00:00.000000Z",
      "2026-13-01T00:00:00.000000Z",
      "2026-11-00T00:00:00.000000Z",
      "2026-11-03T24:00:00.000000Z",
      "2026-11-03T12:60:00.000000Z",
      "2026-11-03T12:34:60.000000Z",
      "0000-01-01T00:00:00.000000Z",
      "10000-01-01T00:00:00.000000Z",
      "2026-11-03T12:34:56.123Z",
      "2026-11-03T12:34:56.1234560Z",
      "2026-11-03 12:34:56.123456Z",
      "2026-11-03T12:34:56.123456+00:00",
      "2026-11-03T12:34:56.123456z",
      "2026-11-03T12:34:56.123456Z\n",
      "infinity",
    ];
    for (const sourceCreatedAt of invalid)
      await reject(h.ports.registerGeneration({ ...registration(), sourceCreatedAt }));
    expect(h.rpc).not.toHaveBeenCalled();
    for (const sourceCreatedAt of invalid) {
      h.rpc.mockResolvedValue(success({ ...current(), sourceCreatedAt }));
      await reject(h.ports.readCurrentThread(query()));
    }
  });

  it("retains all six microsecond digits and valid calendar boundaries without Date parsing", async () => {
    const h = fixture();
    const parse = vi.spyOn(Date, "parse").mockImplementation(() => {
      throw new Error("Date coercion forbidden");
    });
    try {
      for (const sourceCreatedAt of [
        "0001-01-01T00:00:00.000001Z",
        "2000-02-29T23:59:59.999999Z",
        "2024-02-29T12:00:00.123456Z",
        "9999-12-31T23:59:59.999999Z",
      ]) {
        h.rpc.mockResolvedValue(success({ ...current(), sourceCreatedAt }));
        expect(
          await h.ports.registerGeneration({ ...registration(), sourceCreatedAt }),
        ).toMatchObject({
          sourceCreatedAt,
        });
        expect(h.rpc.mock.calls.at(-1)?.[1].p_source_created_at).toBe(sourceCreatedAt);
      }
      expect(parse).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
    }
  });

  it("requires exact own enumerable request fields without tokens or caller incarnation", async () => {
    const h = fixture();
    const requests: unknown[] = [
      undefined,
      null,
      [],
      Object.create(query()),
      { ...query(), token: "fictional-secret" },
      { ...query(), [Symbol("extra")]: true },
      Object.defineProperty({ ...query() }, "threadId", { enumerable: false }),
      { ...query(), sourceCreatedAt: CREATED },
    ];
    for (const value of requests)
      await reject(h.ports.readCurrentThread(value as VoiceV2CurrentThreadQuery));
    for (const extra of [
      { threadIncarnation: INCARNATION },
      { authorityFingerprint: "a".repeat(64) },
      { protocol: 2 },
    ])
      await reject(h.ports.registerGeneration({ ...registration(), ...extra }));
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("does not evaluate rejected request getters, including Auth interval fields", async () => {
    const h = fixture();
    let reads = 0;
    for (const key of Object.keys(registration())) {
      const q = Object.defineProperty(registration(), key, {
        enumerable: true,
        get() {
          reads++;
          throw new Error("private getter evaluated");
        },
      });
      await reject(h.ports.registerGeneration(q));
    }
    expect(reads).toBe(0);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("accepts plain null-prototype own-data objects", async () => {
    const h = fixture();
    const data = Object.assign(Object.create(null), current());
    data.allowlist = Object.assign(Object.create(null), data.allowlist);
    h.rpc.mockResolvedValue(Object.assign(Object.create(null), success(data)));
    expect(await h.ports.readCurrentThread(Object.assign(Object.create(null), query()))).toEqual(
      current(),
    );
  });

  it("rejects any wrong parent, thread or nested allowlist owner association", async () => {
    const h = fixture();
    for (const change of [
      { ownerId: OTHER },
      { authSessionId: OTHER },
      { parentVersion: 4 },
      { threadId: OTHER },
      { allowlist: { ...current().allowlist, ownerId: OTHER } },
    ]) {
      h.rpc.mockResolvedValue(success({ ...current(), ...change }));
      await reject(h.ports.readCurrentThread(query()));
      await reject(h.ports.registerGeneration(registration()));
    }
    expect(h.rpc).toHaveBeenCalledTimes(10);
  });

  it("matches registration revision and every source microsecond without requiring a read revision", async () => {
    const h = fixture();
    for (const change of [
      { threadRevision: 8 },
      { sourceCreatedAt: "2026-11-03T12:34:56.123457Z" },
    ]) {
      h.rpc.mockResolvedValue(success({ ...current(), ...change }));
      expect(await h.ports.readCurrentThread(query())).toMatchObject(change);
      await reject(h.ports.registerGeneration(registration()));
    }
  });

  it("rejects old protocol receipts and invalid current lifecycle metadata", async () => {
    const h = fixture();
    const v1 = current();
    Reflect.deleteProperty(v1, "protocol");
    Reflect.deleteProperty(v1, "authSessionId");
    Reflect.deleteProperty(v1, "parentVersion");
    for (const value of [
      v1,
      { ...current(), protocol: 1 },
      { ...current(), protocol: "2" },
      { ...current(), deleted: true },
      { ...current(), threadRevision: Number.MAX_SAFE_INTEGER + 1 },
      { ...current(), threadIncarnation: OTHER.toUpperCase() },
      { ...current(), allowlist: { ...current().allowlist, admitted: false } },
      { ...current(), allowlist: { ...current().allowlist, expiresAt: 0 } },
      { ...current(), allowlist: { ...current().allowlist, expiresAt: Infinity } },
      { ...current(), verifiedAt: VERIFIED },
    ]) {
      h.rpc.mockResolvedValue(success(value));
      await reject(h.ports.readCurrentThread(query()));
    }
  });

  it("rejects non-own or extra response fields at outer and nested levels", async () => {
    const h = fixture();
    for (const value of [
      Object.create(current()),
      { ...current(), [Symbol("extra")]: true },
      Object.defineProperty(current(), "sourceCreatedAt", { enumerable: false }),
      { ...current(), allowlist: Object.create(current().allowlist) },
      { ...current(), allowlist: { ...current().allowlist, extra: true } },
      { ...current(), allowlist: { ...current().allowlist, [Symbol("extra")]: true } },
    ]) {
      h.rpc.mockResolvedValue(success(value));
      await reject(h.ports.readCurrentThread(query()));
    }
  });

  it("rejects response and nested-policy accessors without evaluating them", async () => {
    const h = fixture();
    let reads = 0;
    for (const key of Object.keys(current())) {
      const data = Object.defineProperty(current(), key, {
        enumerable: true,
        get() {
          reads++;
          throw new Error("private response getter");
        },
      });
      h.rpc.mockResolvedValue(success(data));
      await reject(h.ports.registerGeneration(registration()));
    }
    const data = current();
    Object.defineProperty(data.allowlist, "expiresAt", {
      enumerable: true,
      get() {
        reads++;
        throw new Error("private nested getter");
      },
    });
    h.rpc.mockResolvedValue(success(data));
    await reject(h.ports.readCurrentThread(query()));
    expect(reads).toBe(0);
  });

  it("distinguishes malformed transport envelopes from explicit null denial", async () => {
    const h = fixture();
    for (const value of [
      undefined,
      null,
      false,
      [],
      { data: current() },
      { error: null },
      { data: current(), error: undefined },
      { data: current(), error: { message: "private SQL body" } },
      { data: undefined, error: null },
      { data: false, error: null },
      Object.create(success(current())),
    ]) {
      h.rpc.mockResolvedValue(value);
      await reject(h.ports.readCurrentThread(query()));
    }
  });

  it("requires a successful optional transport status and permits absent status", async () => {
    const h = fixture();
    for (const status of [199, 300, 401, 200.5, "200", null, undefined]) {
      h.rpc.mockResolvedValue({ data: current(), error: null, status });
      await reject(h.ports.registerGeneration(registration()));
    }
    h.rpc.mockResolvedValue({ data: current(), error: null });
    expect(await h.ports.registerGeneration(registration())).toEqual(current());
  });

  it("does not evaluate rejected envelope getters", async () => {
    const h = fixture();
    let reads = 0;
    for (const key of ["data", "error", "status"]) {
      const envelope = Object.defineProperty(success(current()), key, {
        enumerable: true,
        get() {
          reads++;
          throw new Error("secret transport getter");
        },
      });
      h.rpc.mockResolvedValue(envelope);
      await reject(h.ports.readCurrentThread(query()));
    }
    expect(reads).toBe(0);
  });

  it("detaches requests before an await and freezes detached nested receipts", async () => {
    const h = fixture(),
      pending = deferred(),
      q = registration(),
      data = current();
    h.rpc.mockReturnValueOnce(pending.promise);
    const result = h.ports.registerGeneration(q);
    q.ownerId = OTHER;
    q.sourceCreatedAt = "2000-01-01T00:00:00.000000Z";
    q.threadRevision = 100;
    expect(h.rpc.mock.calls[0][1]).toMatchObject({
      p_owner_id: OWNER,
      p_source_created_at: CREATED,
      p_revision: 7,
    });
    pending.resolve(success(data));
    const receipt = await result;
    expect(receipt).toEqual(current());
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.isFrozen(receipt!.allowlist)).toBe(true);
    expect(receipt).not.toBe(data);
    expect(receipt!.allowlist).not.toBe(data.allowlist);
    data.sourceCreatedAt = "2000-01-01T00:00:00.000000Z";
    data.allowlist.ownerId = OTHER;
    expect(receipt).toEqual(current());
  });

  it("isolates out-of-order concurrent calls without a shared current generation", async () => {
    const h = fixture(),
      first = deferred(),
      second = deferred();
    h.rpc.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const a = h.ports.registerGeneration(registration());
    const b = h.ports.registerGeneration({ ...registration(), threadId: OTHER, threadRevision: 9 });
    second.resolve(success({ ...current(SESSION), threadId: OTHER, threadRevision: 9 }));
    expect(await b).toMatchObject({
      threadId: OTHER,
      threadRevision: 9,
      threadIncarnation: SESSION,
    });
    first.resolve(success(current()));
    expect(await a).toEqual(current());
    expect(h.rpc).toHaveBeenCalledTimes(2);
  });

  it("rejects crossed concurrent replies rather than associating by response arrival", async () => {
    const h = fixture(),
      first = deferred(),
      second = deferred();
    h.rpc.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const a = h.ports.readCurrentThread(query());
    const b = h.ports.readCurrentThread({ ...query(), authSessionId: OTHER });
    const rejectedA = reject(a),
      rejectedB = reject(b);
    second.resolve(success(current()));
    first.resolve(success({ ...current(), authSessionId: OTHER }));
    await Promise.all([rejectedA, rejectedB]);
    expect(h.rpc).toHaveBeenCalledTimes(2);
  });

  it("captures and binds one client method without later replacement or fallback", async () => {
    const original = vi.fn(async function (this: { marker: string }) {
      expect(this.marker).toBe("protected-host");
      return success(current());
    });
    const replacement = vi.fn(async () => success(null));
    const client = { marker: "protected-host", rpc: original };
    const ports = createVoiceV2PreissueRpcPorts(client);
    client.rpc = replacement;
    expect(await ports.readCurrentThread(query())).toEqual(current());
    expect(await ports.registerGeneration(registration())).toEqual(current());
    expect(original).toHaveBeenCalledTimes(2);
    expect(replacement).not.toHaveBeenCalled();
  });

  it("sanitizes construction failure without exposing the client or underlying cause", () => {
    for (const client of [null, undefined, {}, { rpc: 1 }])
      expect(() =>
        createVoiceV2PreissueRpcPorts(client as unknown as VoiceV2PreissueRpcClient),
      ).toThrow(ERROR);
    expect(() =>
      createVoiceV2PreissueRpcPorts({
        get rpc(): VoiceV2PreissueRpcClient["rpc"] {
          throw new Error("secret client credentials");
        },
      }),
    ).toThrow(ERROR);
  });

  it("retains ambiguous transport failure as sanitized error with exactly one invocation", async () => {
    const h = fixture();
    h.rpc.mockRejectedValue(new Error("fictional committed registration response lost: private"));
    let error: unknown;
    try {
      await h.ports.registerGeneration(registration());
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(ERROR);
    expect(Object.hasOwn(error as Error, "cause")).toBe(false);
    expect(String(error)).not.toContain("private");
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it("does not cache an earlier observation or replay it after a later denial", async () => {
    const h = fixture();
    expect(await h.ports.readCurrentThread(query())).toEqual(current());
    h.rpc.mockResolvedValueOnce(success(null));
    expect(await h.ports.readCurrentThread(query())).toBeNull();
    h.rpc.mockRejectedValueOnce(new Error("fictional unavailable"));
    await reject(h.ports.readCurrentThread(query()));
    expect(h.rpc).toHaveBeenCalledTimes(3);
  });
});
