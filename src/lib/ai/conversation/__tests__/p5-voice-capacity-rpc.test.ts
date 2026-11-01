import { describe, expect, it, vi } from "vitest";
import {
  createVoiceCapacityRpcPorts,
  type VoiceCapacityMarkRequest,
  type VoiceCapacityReconcileRequest,
  type VoiceCapacityObservation,
  type VoiceCapacityRpcClient,
  type VoiceCapacityRpcName,
} from "../service/voice-capacity-rpc.server";

const OWNER = "11111111-1111-4111-8111-111111111111";
const THREAD = "22222222-2222-4222-8222-222222222222";
const INCARNATION = "33333333-3333-4333-8333-333333333333";
const ATTEMPT = "44444444-4444-4444-8444-444444444444";
const APPROVAL = "55555555-5555-4555-8555-555555555555";
const CLAIM = "66666666-6666-4666-8666-666666666666";
const RECEIPT = "77777777-7777-4777-8777-777777777777";
const OPERATION = "88888888-8888-4888-8888-888888888888";
const CLEANUP = "99999999-9999-4999-8999-999999999999";
const EVIDENCE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const EXPIRY = 1_900_000_000_000;
const ERROR = "voice-capacity-rpc-unavailable";
function claim() {
  return {
    claimId: CLAIM,
    expiresAt: EXPIRY,
    binding: {
      ownerId: OWNER,
      threadId: THREAD,
      threadIncarnation: INCARNATION,
      threadRevision: 0,
      attemptId: ATTEMPT,
      approvalId: APPROVAL,
      approvalDigest: "a".repeat(64),
      scope: "developer-voice-session" as const,
    },
  };
}
const mark = () => ({
  receiptId: RECEIPT,
  claim: claim(),
  operationId: OPERATION,
  expectedPoolVersion: 1,
});
function observation(kind: VoiceCapacityObservation["kind"] = "created"): VoiceCapacityObservation {
  return kind === "created" || kind === "ended"
    ? { evidenceId: EVIDENCE, operationId: OPERATION, kind, sessionId: "Session_Exact:1-a" }
    : { evidenceId: EVIDENCE, operationId: OPERATION, kind, sessionId: null };
}
const reconcile = (kind: VoiceCapacityObservation["kind"] = "created") => ({
  cleanupId: CLEANUP,
  claim: claim(),
  observation: observation(kind),
});
const success = (data: unknown) => ({ data, error: null, status: 200, statusText: "OK" });
const ack = (state: string, value = claim()) => ({ claim: value, state });
function fixture() {
  // Modeled transport only; no SQL, HTTP, Auth or provider request is made.
  const rpc = vi.fn(
    async (
      name: VoiceCapacityRpcName,
      args: Readonly<Record<string, unknown>>,
    ): Promise<unknown> => {
      const kind = (args.p_observation as { kind: string } | undefined)?.kind;
      const state =
        name === "bfa_p5_capacity_mark"
          ? "marked"
          : kind === "created"
            ? "creation-observed"
            : kind === "unknown"
              ? "uncertain"
              : "terminal-recorded";
      return success({ claim: args.p_claim, state });
    },
  );
  return { rpc, ports: createVoiceCapacityRpcPorts({ rpc }) };
}
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((yes) => {
    resolve = yes;
  });
  return { resolve, promise };
}
const reject = (promise: Promise<unknown>) => expect(promise).rejects.toThrow(ERROR);

describe("P5 inactive capacity mark and reconciliation transport", () => {
  it("constructs only two frozen transport ports without making a request", () => {
    const h = fixture();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(Object.keys(h.ports)).toEqual(["mark", "reconcile"]);
    expect(Object.isFrozen(h.ports)).toBe(true);
  });
  it("maps the exact fresh proof, claim, immutable operation and expected pool version", async () => {
    const h = fixture();
    expect(await h.ports.mark(mark())).toEqual(ack("marked"));
    expect(h.rpc.mock.calls).toEqual([
      [
        "bfa_p5_capacity_mark",
        {
          p_receipt_id: RECEIPT,
          p_claim: claim(),
          p_operation_id: OPERATION,
          p_expected_version: 1,
        },
      ],
    ]);
    const args = h.rpc.mock.calls[0][1];
    expect(Object.isFrozen(args)).toBe(true);
    expect(Object.isFrozen(args.p_claim)).toBe(true);
    expect(Object.isFrozen((args.p_claim as ReturnType<typeof claim>).binding)).toBe(true);
  });
  it("maps each observation kind exactly without altering provider session identity", async () => {
    for (const kind of ["created", "ended", "not-created", "unknown"] as const) {
      const h = fixture(),
        request = reconcile(kind);
      await h.ports.reconcile(request);
      expect(h.rpc.mock.calls).toEqual([
        [
          "bfa_p5_capacity_reconcile",
          { p_cleanup_id: CLEANUP, p_claim: claim(), p_observation: observation(kind) },
        ],
      ]);
      expect(Object.isFrozen(h.rpc.mock.calls[0][1].p_observation)).toBe(true);
      expect(h.rpc.mock.calls[0][1].p_observation).not.toBe(request.observation);
    }
  });
  it("preserves all mark wire states including closed without creating a dispatch boolean or invented echo", async () => {
    const h = fixture();
    for (const state of ["marked", "already-marked", "denied", "quarantined", "closed"]) {
      h.rpc.mockResolvedValueOnce(success(ack(state)));
      const result = await h.ports.mark(mark());
      expect(result).toEqual(ack(state));
      expect(Object.keys(result)).toEqual(["claim", "state"]);
    }
    expect(h.rpc).toHaveBeenCalledTimes(5);
  });
  it("accepts only reconciliation states compatible with the actual observation kind", async () => {
    const h = fixture();
    const common = ["denied", "quarantined", "duplicate-evidence"];
    const allowed = {
      created: [...common, "creation-observed", "late-evidence"],
      ended: [...common, "terminal-recorded"],
      "not-created": [...common, "terminal-recorded"],
      unknown: [...common, "uncertain", "late-evidence"],
    };
    for (const kind of ["created", "ended", "not-created", "unknown"] as const) {
      for (const state of [
        ...common,
        "creation-observed",
        "late-evidence",
        "terminal-recorded",
        "uncertain",
        "marked",
        "closed",
      ]) {
        h.rpc.mockResolvedValueOnce(success(ack(state)));
        const pending = h.ports.reconcile(reconcile(kind));
        if (allowed[kind].includes(state)) expect(await pending).toEqual(ack(state));
        else await reject(pending);
      }
    }
  });
  it("rejects malformed requests and extra authority material before transport", async () => {
    const h = fixture();
    for (const bad of [
      null,
      [],
      {},
      { ...mark(), receiptId: undefined },
      { ...mark(), claim: null },
      { ...mark(), activeAuthority: "PRIVATE" },
      { ...mark(), [Symbol("extra")]: true },
      Object.create(mark()),
    ])
      await reject(h.ports.mark(bad as VoiceCapacityMarkRequest));
    for (const bad of [
      null,
      {},
      [],
      { ...reconcile(), cleanupId: undefined },
      { ...reconcile(), observation: null },
      { ...reconcile(), providerResponse: "PRIVATE" },
      Object.create(reconcile()),
    ])
      await reject(h.ports.reconcile(bad as VoiceCapacityReconcileRequest));
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("rejects malformed claim and binding fields at either operation boundary", async () => {
    const h = fixture();
    for (const value of [
      { ...claim(), extra: true },
      { claimId: CLAIM, expiresAt: EXPIRY },
      { ...claim(), binding: null },
      { ...claim(), binding: { ...claim().binding, extra: true } },
      { ...claim(), binding: { ...claim().binding, scope: "voice" } },
      { ...claim(), binding: { ...claim().binding, approvalDigest: "A".repeat(64) } },
    ]) {
      await reject(h.ports.mark({ ...mark(), claim: value } as VoiceCapacityMarkRequest));
      await reject(
        h.ports.reconcile({ ...reconcile(), claim: value } as VoiceCapacityReconcileRequest),
      );
    }
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("rejects noncanonical identities rather than coercing them", async () => {
    const h = fixture();
    for (const value of ["invalid", null, OTHER.toUpperCase(), 1]) {
      await reject(h.ports.mark({ ...mark(), operationId: value } as VoiceCapacityMarkRequest));
      await reject(h.ports.mark({ ...mark(), receiptId: value } as VoiceCapacityMarkRequest));
      await reject(
        h.ports.reconcile({ ...reconcile(), cleanupId: value } as VoiceCapacityReconcileRequest),
      );
      await reject(
        h.ports.reconcile({
          ...reconcile(),
          observation: { ...observation(), evidenceId: value },
        } as VoiceCapacityReconcileRequest),
      );
    }
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("enforces safe numeric values while preserving exact inclusive boundaries", async () => {
    const h = fixture();
    for (const value of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, "1", null]) {
      await reject(
        h.ports.mark({ ...mark(), expectedPoolVersion: value } as VoiceCapacityMarkRequest),
      );
      await reject(
        h.ports.mark({
          ...mark(),
          claim: { ...claim(), binding: { ...claim().binding, threadRevision: value } },
        } as VoiceCapacityMarkRequest),
      );
      await reject(
        h.ports.reconcile({
          ...reconcile(),
          claim: { ...claim(), expiresAt: value },
        } as VoiceCapacityReconcileRequest),
      );
    }
    await reject(h.ports.mark({ ...mark(), expectedPoolVersion: 0 }));
    await reject(h.ports.reconcile({ ...reconcile(), claim: { ...claim(), expiresAt: 0 } }));
    const bound = {
      ...claim(),
      expiresAt: Number.MAX_SAFE_INTEGER,
      binding: { ...claim().binding, threadRevision: Number.MAX_SAFE_INTEGER },
    };
    expect(
      await h.ports.mark({ ...mark(), claim: bound, expectedPoolVersion: Number.MAX_SAFE_INTEGER }),
    ).toEqual({ claim: bound, state: "marked" });
    expect(
      await h.ports.reconcile({ ...reconcile("unknown"), claim: { ...claim(), expiresAt: 1 } }),
    ).toEqual({ claim: { ...claim(), expiresAt: 1 }, state: "uncertain" });
  });
  it("requires exact null versus normalized session strings for each observation kind", async () => {
    const h = fixture();
    for (const kind of ["created", "ended", "not-created", "unknown"] as const) {
      const bad =
        kind === "created" || kind === "ended"
          ? [
              null,
              "",
              "a".repeat(161),
              "space here",
              "x/y",
              "é",
              "x\n",
              "x\r",
              "x\u2028",
              "x\u2029",
              4,
            ]
          : ["session", "", undefined, false];
      for (const sessionId of bad)
        await reject(
          h.ports.reconcile({
            ...reconcile(kind),
            observation: { ...observation(kind), sessionId },
          } as VoiceCapacityReconcileRequest),
        );
    }
    await reject(
      h.ports.reconcile({
        ...reconcile(),
        observation: { ...observation(), kind: "timeout" },
      } as unknown as VoiceCapacityReconcileRequest),
    );
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("preserves maximum normalized session length and case without local clock eligibility", async () => {
    const h = fixture(),
      request = {
        ...reconcile(),
        observation: {
          ...observation("created"),
          kind: "created" as const,
          sessionId: "A_b:-9".padEnd(160, "X"),
        },
      };
    const clock = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("no clock");
    });
    try {
      expect((await h.ports.reconcile(request)).state).toBe("creation-observed");
      expect(clock).not.toHaveBeenCalled();
    } finally {
      clock.mockRestore();
    }
    expect(h.rpc.mock.calls[0][1].p_observation).toEqual(request.observation);
  });
  it("rejects accessor and hidden fields throughout requests without evaluating getters", async () => {
    const h = fixture(),
      getter = vi.fn(() => OWNER);
    const cases = [mark(), mark(), mark()];
    Object.defineProperty(cases[0], "receiptId", { get: getter, enumerable: true });
    Object.defineProperty(cases[1].claim, "claimId", { value: CLAIM, enumerable: false });
    Object.defineProperty(cases[2].claim.binding, "ownerId", { get: getter, enumerable: true });
    for (const request of cases) await reject(h.ports.mark(request));
    const rec = reconcile();
    Object.defineProperty(rec.observation, "sessionId", { get: getter, enumerable: true });
    await reject(h.ports.reconcile(rec));
    expect(getter).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("refuses null, scalar, incomplete and extra-field acknowledgments", async () => {
    const h = fixture();
    for (const value of [
      null,
      false,
      true,
      [],
      {},
      { state: "marked" },
      { ...ack("marked"), operationId: OPERATION },
      { ...ack("marked"), [Symbol("extra")]: true },
    ]) {
      h.rpc.mockResolvedValueOnce(success(value));
      await reject(h.ports.mark(mark()));
    }
    for (const state of ["claimed", "uncertain", "terminal-recorded", "Marked", true, undefined]) {
      h.rpc.mockResolvedValueOnce(success({ claim: claim(), state }));
      await reject(h.ports.mark(mark()));
    }
  });
  it("binds every returned claim field to the exact request on both RPCs", async () => {
    const h = fixture();
    const variants = [
      { ...claim(), claimId: OTHER },
      { ...claim(), expiresAt: EXPIRY - 1 },
      ...Object.keys(claim().binding)
        .filter((key) => key !== "scope")
        .map((key) => ({
          ...claim(),
          binding: {
            ...claim().binding,
            [key]: key === "threadRevision" ? 1 : key === "approvalDigest" ? "b".repeat(64) : OTHER,
          },
        })),
    ];
    for (const value of variants) {
      h.rpc.mockResolvedValueOnce(success(ack("marked", value)));
      await reject(h.ports.mark(mark()));
      h.rpc.mockResolvedValueOnce(success(ack("creation-observed", value)));
      await reject(h.ports.reconcile(reconcile()));
    }
  });
  it("rejects inherited, hidden and accessor acknowledgment fields without evaluating them", async () => {
    const h = fixture(),
      getter = vi.fn(() => "marked");
    const hidden = ack("marked");
    Object.defineProperty(hidden, "state", { value: "marked", enumerable: false });
    const accessor = ack("marked");
    Object.defineProperty(accessor.claim.binding, "ownerId", { get: getter, enumerable: true });
    for (const value of [Object.create(ack("marked")), hidden, accessor]) {
      h.rpc.mockResolvedValueOnce(success(value));
      await reject(h.ports.mark(mark()));
    }
    expect(getter).not.toHaveBeenCalled();
  });
  it("accepts null-prototype plain records and returns detached deeply frozen claims", async () => {
    const h = fixture(),
      request = mark();
    Object.setPrototypeOf(request, null);
    Object.setPrototypeOf(request.claim, null);
    Object.setPrototypeOf(request.claim.binding, null);
    const reply = ack("marked");
    Object.setPrototypeOf(reply, null);
    Object.setPrototypeOf(reply.claim.binding, null);
    h.rpc.mockResolvedValueOnce(success(reply));
    const result = await h.ports.mark(request);
    expect(result).toEqual(ack("marked"));
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.claim)).toBe(true);
    expect(Object.isFrozen(result.claim.binding)).toBe(true);
    request.claim.binding.ownerId = OTHER;
    reply.claim.binding.ownerId = OTHER;
    expect(result.claim.binding.ownerId).toBe(OWNER);
  });
  it("owns nested mark identity before awaiting caller mutation", async () => {
    const h = fixture(),
      d = deferred(),
      request = mark();
    h.rpc.mockReturnValueOnce(d.promise);
    const pending = h.ports.mark(request);
    request.claim.binding.ownerId = OTHER;
    request.operationId = OTHER;
    request.expectedPoolVersion = 9;
    d.resolve(success(ack("marked")));
    expect(await pending).toEqual(ack("marked"));
    expect(h.rpc.mock.calls[0][1]).toEqual({
      p_receipt_id: RECEIPT,
      p_claim: claim(),
      p_operation_id: OPERATION,
      p_expected_version: 1,
    });
  });
  it("owns reconciliation cleanup and observation before awaiting caller mutation", async () => {
    const h = fixture(),
      d = deferred(),
      request = reconcile();
    h.rpc.mockReturnValueOnce(d.promise);
    const pending = h.ports.reconcile(request);
    request.cleanupId = OTHER;
    request.claim.expiresAt = 1;
    Object.assign(request.observation, {
      operationId: OTHER,
      evidenceId: OTHER,
      sessionId: "changed",
    });
    d.resolve(success(ack("creation-observed")));
    expect(await pending).toEqual(ack("creation-observed"));
    expect(h.rpc.mock.calls[0][1]).toEqual({
      p_cleanup_id: CLEANUP,
      p_claim: claim(),
      p_observation: observation(),
    });
  });
  it("settles overlapping operations in reverse order with independent snapshots", async () => {
    const h = fixture(),
      a = deferred(),
      b = deferred(),
      other = { ...claim(), claimId: OTHER };
    h.rpc.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const first = h.ports.mark(mark()),
      second = h.ports.reconcile({ ...reconcile("unknown"), claim: other });
    b.resolve(success(ack("uncertain", other)));
    expect(await second).toEqual(ack("uncertain", other));
    a.resolve(success(ack("marked")));
    expect(await first).toEqual(ack("marked"));
  });
  it("rejects swapped concurrent claim acknowledgments without cross-call cached authority", async () => {
    const h = fixture(),
      a = deferred(),
      b = deferred(),
      other = { ...claim(), claimId: OTHER };
    h.rpc.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const first = h.ports.mark(mark()),
      second = h.ports.mark({ ...mark(), claim: other, operationId: OTHER });
    const checks = [reject(first), reject(second)];
    a.resolve(success(ack("marked", other)));
    b.resolve(success(ack("marked")));
    await Promise.all(checks);
  });
  it("does not fabricate association evidence omitted by scalar claim/state SQL acknowledgments", async () => {
    const h = fixture();
    const first = await h.ports.mark(mark()),
      second = await h.ports.mark({
        ...mark(),
        receiptId: OTHER,
        operationId: OTHER,
        expectedPoolVersion: 2,
      });
    expect(first).toEqual(second);
    expect(Object.keys(second)).toEqual(["claim", "state"]);
    // Same-claim stale replies cannot be detected here; trusted request/reply
    // association is mandatory. Neither result is a provider-create capability.
    expect(h.rpc.mock.calls[0][1]).not.toEqual(h.rpc.mock.calls[1][1]);
  });
  it("rejects malformed or contradictory RPC envelopes and permits minimal explicit success", async () => {
    const h = fixture();
    for (const result of [
      null,
      [],
      {},
      { data: ack("marked") },
      { data: ack("marked"), error: undefined },
      { data: ack("marked"), error: "private" },
      { ...success(ack("marked")), status: 500 },
      { ...success(ack("marked")), status: "200" },
      { ...success(ack("marked")), status: 200.5 },
      Object.create(success(ack("marked"))),
    ]) {
      h.rpc.mockResolvedValueOnce(result);
      await reject(h.ports.mark(mark()));
    }
    h.rpc.mockResolvedValueOnce({ data: ack("marked"), error: null });
    expect(await h.ports.mark(mark())).toEqual(ack("marked"));
  });
  it("rejects hidden or accessor response-envelope fields without reading them", async () => {
    const h = fixture(),
      getter = vi.fn(() => null);
    for (const key of ["data", "error", "status"]) {
      const value = success(ack("marked"));
      Object.defineProperty(value, key, { get: getter, enumerable: true });
      h.rpc.mockResolvedValueOnce(value);
      await reject(h.ports.mark(mark()));
      const hidden = success(ack("marked"));
      Object.defineProperty(hidden, key, { value: null, enumerable: false });
      h.rpc.mockResolvedValueOnce(hidden);
      await reject(h.ports.mark(mark()));
    }
    expect(getter).not.toHaveBeenCalled();
  });
  it("never retries or returns cached success after a committed mark loses its acknowledgment", async () => {
    const h = fixture();
    let committed = false;
    h.rpc.mockImplementationOnce(async () => {
      committed = true;
      throw new Error("response lost");
    });
    await reject(h.ports.mark(mark()));
    expect(committed).toBe(true);
    expect(h.rpc).toHaveBeenCalledTimes(1);
    h.rpc.mockResolvedValueOnce(success(ack("already-marked")));
    expect(await h.ports.mark(mark())).toEqual(ack("already-marked"));
    expect(h.rpc).toHaveBeenCalledTimes(2);
  });
  it("preserves reconciliation uncertainty after malformed committed replies without guessing finality", async () => {
    const h = fixture();
    let recorded = false;
    h.rpc.mockImplementationOnce(async () => {
      recorded = true;
      return success(null);
    });
    await reject(h.ports.reconcile(reconcile("ended")));
    expect(recorded).toBe(true);
    expect(h.rpc).toHaveBeenCalledTimes(1);
    h.rpc.mockResolvedValueOnce(success(ack("duplicate-evidence")));
    expect(await h.ports.reconcile(reconcile("ended"))).toEqual(ack("duplicate-evidence"));
    expect(h.rpc).toHaveBeenCalledTimes(2);
  });
  it("sanitizes failures without causes, private payloads, logs or retry", async () => {
    const h = fixture(),
      log = vi.spyOn(console, "error").mockImplementation(() => undefined),
      secret = "PRIVATE_PROVIDER_BODY";
    h.rpc.mockRejectedValueOnce(new Error(secret, { cause: { claim: claim(), secret } }));
    try {
      const error = await h.ports.reconcile(reconcile()).catch((value: unknown) => value);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(ERROR);
      expect(Object.hasOwn(error as object, "cause")).toBe(false);
      expect(JSON.stringify(error)).not.toContain(secret);
      expect(log).not.toHaveBeenCalled();
      expect(h.rpc).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
    }
  });
  it("captures the trusted client method once and sanitizes construction or synchronous failure", async () => {
    const client = {
      tag: "trusted",
      rpc: vi.fn(function (
        this: { tag: string },
        _name: VoiceCapacityRpcName,
        args: Readonly<Record<string, unknown>>,
      ) {
        expect(this.tag).toBe("trusted");
        return Promise.resolve(success({ claim: args.p_claim, state: "marked" }));
      }),
    };
    const ports = createVoiceCapacityRpcPorts(client);
    client.rpc = vi.fn(() => Promise.reject(new Error("replacement")));
    expect(await ports.mark(mark())).toEqual(ack("marked"));
    expect(client.rpc).not.toHaveBeenCalled();
    for (const invalid of [null, {}, { rpc: 1 }])
      expect(() =>
        createVoiceCapacityRpcPorts(invalid as unknown as VoiceCapacityRpcClient),
      ).toThrow(ERROR);
    const getter = Object.defineProperty({}, "rpc", {
      get() {
        throw new Error("private construction");
      },
    });
    expect(() => createVoiceCapacityRpcPorts(getter as VoiceCapacityRpcClient)).toThrow(ERROR);
    await reject(
      createVoiceCapacityRpcPorts({
        rpc() {
          throw new Error("private sync");
        },
      }).mark(mark()),
    );
  });
});
