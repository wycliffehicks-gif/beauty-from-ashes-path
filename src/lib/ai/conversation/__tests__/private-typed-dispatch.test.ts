// Actual P1 request, direct provider serializer/parser, simulated Auth, RPC and external response.
import { beforeAll, describe, it, expect, vi } from "vitest";
import { ConversationService } from "../service/service";
import type { ConversationProviderRequest } from "../service/provider";
import { describePrivateTypedWire } from "../service/openai-provider.server";
import {
  createPrivateTypedDispatchProvider,
  type PrivateTypedDispatchOptions,
} from "../service/private-typed-dispatch.server";
import { sha256HexSync as hash } from "../service/sha256-sync";
import samplePrice from "../../../../../scripts/conversation-eval/price-snapshot.json";

const NOW = Date.parse("2026-11-26T12:00:00Z"),
  EXP = NOW + 60_000;
const owner = "11111111-1111-4111-8111-111111111111",
  session = "22222222-2222-4222-8222-222222222222",
  thread = "33333333-3333-4333-8333-333333333333",
  requestId = "44444444-4444-4444-8444-444444444444",
  approvalId = "55555555-5555-4555-8555-555555555555",
  dispatchId = "66666666-6666-4666-8666-666666666666";
const limits = {
  model: "gpt-6-luna",
  maxInputBytes: 64_000,
  maxOutputTokens: 1200,
  deadlineMs: 2000,
};
let request: ConversationProviderRequest;
let material: PrivateTypedDispatchOptions["material"];
beforeAll(async () => {
  const s = new ConversationService({
    verifiedOwnerId: owner,
    provider: {
      async generate(r) {
        request = r;
        return { text: "sample", sourceIds: [], interpretation: null };
      },
    },
  });
  await s.ready();
  s.ensureThread(thread, false);
  await s.runTurn(thread, s.admitUserMessage(thread, requestId, "A fictional workday."), {
    accept: () => true,
    apply: () => {},
  });
  const d = describePrivateTypedWire(request, limits)!;
  const priceSnapshotBytes = JSON.stringify({ ...samplePrice, retrievedOn: "2026-11-25" });
  const manifestBytes = JSON.stringify({
    version: "bfa-private-typed-send-v1",
    serviceRequestId: d.serviceRequestId,
    model: limits.model,
    tier: "default",
    priceSnapshotSha256: hash(priceSnapshotBytes),
    wireBytes: d.wireBytes,
    maxInputBytes: limits.maxInputBytes,
    maxOutputTokens: limits.maxOutputTokens,
    deadlineMs: limits.deadlineMs,
    expiresAt: EXP,
  });
  material = {
    approval: {
      approvalId,
      ownerId: owner,
      authSessionId: session,
      threadId: thread,
      revision: 2,
      requestId,
      manifestSha256: hash(manifestBytes),
      payloadSha256: d.wireSha256,
      maxMicros: 9500,
    },
    manifestBytes,
    priceSnapshotBytes,
  };
});
function response(valid = true) {
  return Response.json({
    id: "resp_fictional/typed.one",
    model: limits.model,
    service_tier: "default",
    status: "completed",
    usage: { input_tokens: 80, output_tokens: 20, total_tokens: 100 },
    output: [
      {
        type: "message",
        role: "assistant",
        status: "completed",
        content: [
          {
            type: "output_text",
            text: valid
              ? JSON.stringify({ text: "Fictional reply", sourceIds: [] })
              : "invalid response text",
          },
        ],
      },
    ],
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
function fixture() {
  const auth = { ownerId: owner, authSessionId: session, verifiedAt: NOW - 1000, expiresAt: EXP };
  const state = {
    time: NOW,
    phase: "new",
    evidence: null as string | null,
    markedAt: null as number | null,
    allowUntil: EXP,
    allow: true,
    validReply: true,
    enabled: true,
  };
  const observed: string[] = [];
  const gate = { after: (name: string, raw: unknown): unknown => raw };
  const rpc = vi.fn(async (name: string, args: Readonly<Record<string, unknown>>) => {
    const prefix = "bfa_private_text_spend_";
    const op = name.slice(prefix.length).replace(/^claim_dispatch$/, "claim");
    observed.push(op);
    let data: unknown = null;
    if (op === "claim") {
      data = state.phase === "new";
      if (data) state.phase = "held";
    } else if (op === "settle_dispatched") {
      if (state.phase === "dispatched") {
        state.evidence = String(args.p_evidence_sha256);
        state.phase = "settled";
        data = true;
      }
    } else {
      if (op === "dispatch" && state.phase === "held") {
        state.phase = "dispatched";
        state.markedAt = state.time;
      }
      if (op === "finish" && state.phase === "settled" && args.p_evidence_sha256 === state.evidence)
        state.phase = "finished";
      const verified = Date.parse(String(args.p_auth_verified_at)),
        authEnd = Date.parse(String(args.p_auth_expires_at));
      const cap = Date.parse(String(args.p_eligibility_expires_at));
      const held = state.phase === "held",
        finished = state.phase === "finished";
      if (state.allow && state.time < state.allowUntil)
        data = {
          protocol: 1,
          binding: {
            ...material.approval,
            threadRevision: 2,
            revision: undefined,
            provider: "openai",
            model: limits.model,
            tier: "default",
            approvalExpiresAt: EXP,
          },
          dispatchId: held ? null : args.p_dispatch_id,
          state: state.phase,
          currentRevision: finished ? 3 : 2,
          checkedAt: state.time,
          verifiedAt: verified,
          verificationExpiresAt: verified + 30_000,
          identityExpiresAt: authEnd,
          allowlistExpiresAt: state.allowUntil,
          effectiveExpiresAt: Math.min(authEnd, cap, state.allowUntil, EXP),
          dispatchMarkedAt: state.markedAt,
          settlementEvidenceSha256: state.evidence,
          finishedRevision: finished ? 3 : null,
        };
      if (data) delete (data as { binding: Record<string, unknown> }).binding.revision;
    }
    return { data: await gate.after(op, data), error: null, status: 200 };
  });
  const readKey = vi.fn(async () => "fictional-server-key");
  const readAuth = vi.fn(async () => (state.allow ? { ...auth, verifiedAt: state.time } : null));
  const transport = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    response(state.validReply),
  );
  const options = {
    enabled: () => state.enabled,
    material,
    limits,
    initialAuth: auth,
    dispatchId,
    envelopeExpiresAt: EXP,
    rpc: { rpc },
    readAuth,
    readKey,
    transport,
    now: () => state.time,
  };
  const provider = createPrivateTypedDispatchProvider(options)!;
  const controller = new AbortController();
  return {
    state,
    gate,
    rpc,
    readKey,
    readAuth,
    transport,
    options,
    provider,
    controller,
    observed,
    send: () => provider.generate(request, controller.signal),
  };
}
describe("one private in-app send", () => {
  it("retains an earlier route allowlist ceiling independently of Auth and later renewal", async () => {
    const f = fixture();
    let routeExpiry = NOW + 10;
    const provider = createPrivateTypedDispatchProvider({
      ...f.options,
      readAllowlistExpiresAt: () => routeExpiry,
    })!;
    f.readKey.mockImplementation(async () => {
      routeExpiry = EXP;
      f.state.time = NOW + 10;
      return "fictional-server-key";
    });
    await expect(provider.generate(request, f.controller.signal)).rejects.toThrow();
    expect(f.transport).not.toHaveBeenCalled();
    expect(f.rpc.mock.calls[0]![0]).toBe("bfa_private_text_spend_claim_dispatch");
    const read = f.rpc.mock.calls.find(([name]) => name === "bfa_private_text_spend_read")![1];
    expect(read.p_auth_expires_at).toBe(new Date(EXP).toISOString());
    expect(read.p_eligibility_expires_at).toBe(new Date(NOW + 10).toISOString());
  });
  it("a later route observation can suppress finish after the genuine receipt already settled", async () => {
    const f = fixture();
    let routeExpiry = EXP;
    const provider = createPrivateTypedDispatchProvider({
      ...f.options,
      readAllowlistExpiresAt: () => routeExpiry,
    })!;
    await provider.generate(request, f.controller.signal);
    expect(f.state.phase).toBe("settled");
    routeExpiry = NOW;
    expect(await provider.finish()).toBeNull();
    expect(f.observed).not.toContain("finish");
    expect(f.state.phase).toBe("settled");
    expect(f.transport).toHaveBeenCalledOnce();
  });
  it("unsafe prior allowlist evidence denies before a monetary claim", async () => {
    const f = fixture();
    const provider = createPrivateTypedDispatchProvider({
      ...f.options,
      readAllowlistExpiresAt: () => NaN,
    })!;
    await expect(provider.generate(request, f.controller.signal)).rejects.toThrow();
    expect(f.rpc).not.toHaveBeenCalled();
    expect(f.readKey).not.toHaveBeenCalled();
    expect(f.transport).not.toHaveBeenCalled();
  });
  it("claims, marks, sends once, reconciles, finishes once and checks the final revision", async () => {
    const f = fixture();
    expect(await f.provider.finish()).toBeNull();
    expect(await f.provider.mayReturn()).toBe(false);
    expect(await f.send()).toEqual({
      text: "Fictional reply",
      sourceIds: [],
      interpretation: null,
    });
    expect(await f.provider.mayReturn()).toBe(false);
    expect(await f.provider.finish()).toBe(3);
    expect(await f.provider.finish()).toBeNull();
    expect(await f.provider.mayReturn()).toBe(true);
    await expect(f.send()).rejects.toThrow("Private typed send unavailable");
    expect(f.observed).toEqual([
      "claim",
      "read",
      "dispatch",
      "read",
      "settle_dispatched",
      "read",
      "finish",
      "read",
    ]);
    expect(f.transport).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(f.rpc.mock.calls)).not.toContain("Fictional workday");
    expect(JSON.stringify(f.rpc.mock.calls)).not.toContain("fictional-server-key");
  });
  it("refuses invalid/disabled authority and preserves the original 30s verification start", async () => {
    const f = fixture();
    expect(createPrivateTypedDispatchProvider({ ...f.options, enabled: () => false })).toBeNull();
    expect(
      createPrivateTypedDispatchProvider({
        ...f.options,
        initialAuth: { ...f.options.initialAuth, authSessionId: owner },
      }),
    ).toBeNull();
    f.state.time = NOW + 29_000;
    await expect(f.send()).rejects.toThrow();
    expect(f.observed).toEqual([]);
    expect(f.readKey).not.toHaveBeenCalled();
  });
  it.each(["claim", "read", "dispatch", "settle_dispatched"])(
    "losing the %s acknowledgement never resends or finishes",
    async (failing) => {
      const f = fixture();
      f.gate.after = (name, data) => (name === failing ? null : data);
      await expect(f.send()).rejects.toThrow("Private typed send unavailable");
      await expect(f.send()).rejects.toThrow();
      expect(await f.provider.finish()).toBeNull();
      expect(f.transport).toHaveBeenCalledTimes(failing === "settle_dispatched" ? 1 : 0);
      if (failing === "claim" || failing === "read") expect(f.readKey).not.toHaveBeenCalled();
    },
  );
  it("a shorter allowlist observed before credential lookup cannot be extended afterward", async () => {
    const f = fixture();
    f.state.allowUntil = NOW + 5;
    f.readKey.mockImplementation(async () => {
      f.state.allowUntil = EXP;
      f.state.time += 5;
      return "fictional-server-key";
    });
    await expect(f.send()).rejects.toThrow();
    expect(f.state.phase).toBe("held");
    expect(f.transport).not.toHaveBeenCalled();
  });
  it("rejects a changed session after a credential wait", async () => {
    const f = fixture();
    f.readKey.mockImplementation(async () => {
      f.readAuth.mockResolvedValue({ ...f.options.initialAuth, authSessionId: thread });
      return "fictional-server-key";
    });
    await expect(f.send()).rejects.toThrow();
    expect(f.state.phase).toBe("held");
    expect(f.transport).not.toHaveBeenCalled();
  });
  it.each(["foreign binding", "other dispatch", "extra field", "wrong revision", "wrong clock"])(
    "rejects %s in the final protected read",
    async (fault) => {
      const f = fixture();
      f.gate.after = (name, data) => {
        if (name !== "read" || f.state.phase !== "dispatched") return data;
        const ack = data as Record<string, unknown>;
        if (fault === "foreign binding")
          return { ...ack, binding: { ...(ack.binding as object), authSessionId: owner } };
        if (fault === "other dispatch") return { ...ack, dispatchId: owner };
        if (fault === "wrong revision") return { ...ack, currentRevision: 3 };
        if (fault === "wrong clock") return { ...ack, verifiedAt: NOW };
        return { ...ack, surprise: true };
      };
      await expect(f.send()).rejects.toThrow();
      expect(f.state.phase).toBe("dispatched");
      expect(f.transport).not.toHaveBeenCalled();
    },
  );
  it("reconciles valid usage with invalid reply and withholds the turn", async () => {
    const f = fixture();
    f.state.validReply = false;
    await expect(f.send()).rejects.toThrow();
    expect(f.state.phase).toBe("settled");
    expect(await f.provider.finish()).toBeNull();
  });
  it("reconciles even when the user's access ended during the real transport window", async () => {
    const f = fixture();
    f.transport.mockImplementation(async () => {
      f.state.allow = false;
      return response();
    });
    await expect(f.send()).rejects.toThrow();
    expect(f.state.phase).toBe("settled");
    expect(await f.provider.finish()).toBeNull();
    expect(f.transport).toHaveBeenCalledTimes(1);
  });
  it("a sign-out during response sealing blocks delivery of an already finished turn", async () => {
    const f = fixture();
    await f.send();
    expect(await f.provider.finish()).toBe(3);
    f.state.allow = false;
    expect(await f.provider.mayReturn()).toBe(false);
    f.state.allow = true;
    expect(await f.provider.mayReturn()).toBe(false);
  });
  it("an abort-ignoring transport can furnish metering after the foreground is closed", async () => {
    const f = fixture(),
      started = deferred<void>(),
      later = deferred<Response>(),
      settled = deferred<void>();
    f.transport.mockImplementation(async () => {
      started.resolve();
      return later.promise;
    });
    f.gate.after = (name, value) => {
      if (name === "settle_dispatched") settled.resolve();
      return value;
    };
    const pending = f.send();
    await started.promise;
    f.controller.abort();
    await expect(pending).rejects.toThrow();
    expect(await f.provider.finish()).toBeNull();
    f.state.allow = false;
    later.resolve(response());
    await settled.promise;
    expect(f.state.phase).toBe("settled");
    expect(f.transport).toHaveBeenCalledTimes(1);
  });
  it("two request owners sharing one grant can forward at most one send", async () => {
    const f = fixture();
    const other = createPrivateTypedDispatchProvider({ ...f.options, dispatchId: owner })!;
    const results = await Promise.allSettled([
      f.send(),
      other.generate(request, new AbortController().signal),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(f.transport).toHaveBeenCalledTimes(1);
    expect(f.state.phase).toBe("settled");
  });
  it("losing a committed finish ACK suppresses delivery without another revision advance", async () => {
    const f = fixture();
    await f.send();
    f.gate.after = (name, data) => (name === "finish" ? null : data);
    expect(await f.provider.finish()).toBeNull();
    expect(f.state.phase).toBe("finished");
    expect(await f.provider.finish()).toBeNull();
    expect(await f.provider.mayReturn()).toBe(false);
    expect(f.observed.filter((x) => x === "finish")).toHaveLength(1);
  });
});
