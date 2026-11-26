// Injected HTTP fixtures only: no live key, network or provider acceptance.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  preparePrivateTypedSender,
  type PrivateTypedUsageReceipt,
  type ConversationExchangeMeta,
} from "../service/openai-provider.server";
import { CONVERSATION_POLICY_BLOCK, CONVERSATION_POLICY_BLOCK_SHA256 } from "../policy";
import type { ConversationProviderRequest } from "../service/provider";
const KEY = "fictional-offline-credential",
  MODEL = "gpt-6-luna";
const limits = { model: MODEL, maxOutputTokens: 64, maxInputBytes: 64_000, deadlineMs: 100 };
function makeRequest(over: Partial<ConversationProviderRequest> = {}): ConversationProviderRequest {
  return {
    requestId: "req-1",
    policyIdentity: "bfa-conversation-guide-v0.1",
    policySha256: CONVERSATION_POLICY_BLOCK_SHA256,
    policyBody: CONVERSATION_POLICY_BLOCK,
    context: {
      contractVersion: "bfa-conversation-contract-v1",
      policyIdentity: "bfa-conversation-guide-v0.1",
      threadId: "bfa-thread-t1",
      turnId: "bfa-turn-e0-t1",
      message: "I was angry when I came home yesterday.",
      excerpts: [],
      spiritual: {
        devotionalContentPermitted: false,
        prayerPermitted: false,
        scripturePermitted: false,
        reason: "preference-off-no-grant",
      },
      restrictions: [],
      sources: [],
      exclusionsNote: "excluded",
    },
    history: [],
    effective: [],
    historyComplete: true,
    revisions: { preference: 0, restrictions: 0 },
    fixture: {
      caseId: "C07-report",
      recallRequest: false,
      mockInterpretation: { tag: "guess-anger", text: "Perhaps you were angry." },
      grantKind: null,
    },
    ...over,
  };
}

function okApiResponse(
  replyText: string,
  sourceIds: string[] = [],
  over: Record<string, unknown> = {},
) {
  return {
    id: "resp_abc123",
    model: MODEL,
    service_tier: "default",
    status: "completed",
    output: [
      { type: "reasoning", summary: [] },
      {
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: JSON.stringify({ text: replyText, sourceIds }) }],
      },
    ],
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
      output_tokens_details: { reasoning_tokens: 0 },
      input_tokens_details: { cached_tokens: 0 },
    },
    ...over,
  };
}
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};
const reply = (over: Record<string, unknown> = {}) =>
  new Response(JSON.stringify(okApiResponse("Fictional answer.", [], over)), {
    headers: { "x-request-id": "fixture-header" },
  });
const opts = (fetchImpl: typeof fetch) => ({
  apiKey: KEY,
  fetchImpl,
  beforeDispatch: async () => true,
  mayDispatchNow: () => true,
  onReceipt: vi.fn<(r: PrivateTypedUsageReceipt) => void>(),
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe("exact private one-send transport", () => {
  it("pins reviewed bytes through request mutation and waits for accounting before answer", async () => {
    const request = makeRequest();
    const sender = preparePrivateTypedSender(request, limits)!;
    const original = sender.wireBody;
    const observed: PrivateTypedUsageReceipt[] = [];
    const account = deferred<void>();
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => reply());
    const port = {
      ...opts(fetcher),
      onReceipt: async (r: PrivateTypedUsageReceipt) => {
        observed.push(r);
        await account.promise;
      },
    };
    Object.assign(request.context, { message: "Changed after review" });
    Object.assign(request, { requestId: "req-99" });
    const result = sender.send(port, new AbortController().signal);
    let done = false;
    void result.then(() => {
      done = true;
    });
    await vi.waitFor(() => expect(observed).toHaveLength(1));
    expect(done).toBe(false);
    expect(fetcher.mock.calls[0][1]?.body).toBe(original);
    expect(observed[0]).toMatchObject({
      requestId: "req-1",
      requestPayloadSha256: sender.description.wireSha256,
      providerStatus: "completed",
    });
    expect(JSON.stringify(observed[0])).not.toContain("Fictional answer");
    expect(Object.isFrozen(observed[0].usage)).toBe(true);
    account.resolve();
    expect((await result).text).toBe("Fictional answer.");
    await expect(sender.send(port, new AbortController().signal)).rejects.toMatchObject({
      code: "invalid-request",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("checks fresh access then synchronously checks eligibility immediately before fetch", async () => {
    const log: string[] = [];
    const gate = deferred<boolean>();
    const fetcher = vi.fn(async () => {
      log.push("fetch");
      return reply();
    });
    const port = {
      ...opts(fetcher),
      beforeDispatch: () => {
        log.push("fresh");
        return gate.promise;
      },
      mayDispatchNow: () => {
        log.push("sync");
        return true;
      },
    };
    const running = preparePrivateTypedSender(makeRequest(), limits)!.send(
      port,
      new AbortController().signal,
    );
    expect(log).toEqual(["fresh"]);
    expect(fetcher).not.toHaveBeenCalled();
    gate.resolve(true);
    await running;
    expect(log).toEqual(["fresh", "sync", "fetch"]);
  });
  it.each(["false", "throw", "sync-false", "sync-throw", "abort"])(
    "denies %s without actual dispatch or receipt",
    async (mode) => {
      const fetcher = vi.fn(async () => reply());
      const controller = new AbortController();
      const exchange: ConversationExchangeMeta[] = [];
      const port = {
        ...opts(fetcher),
        beforeDispatch: async () => {
          if (mode === "throw") throw Error("PRIVATE");
          if (mode === "abort") controller.abort();
          return mode !== "false";
        },
        mayDispatchNow: () => {
          if (mode === "sync-throw") throw Error("PRIVATE");
          return mode !== "sync-false";
        },
        onExchange: (m: ConversationExchangeMeta) => exchange.push(m),
      };
      await expect(
        preparePrivateTypedSender(makeRequest(), limits)!.send(port, controller.signal),
      ).rejects.toThrow();
      expect(fetcher).not.toHaveBeenCalled();
      expect(port.onReceipt).not.toHaveBeenCalled();
      expect(exchange.at(-1)?.didDispatch).toBe(false);
      expect(JSON.stringify(exchange)).not.toContain("PRIVATE");
    },
  );
  it("a timed-out async check cannot later dispatch", async () => {
    vi.useFakeTimers();
    const gate = deferred<boolean>();
    const fetcher = vi.fn(async () => reply());
    const port = { ...opts(fetcher), beforeDispatch: () => gate.promise };
    const running = preparePrivateTypedSender(makeRequest(), limits)!.send(
      port,
      new AbortController().signal,
    );
    const rejected = expect(running).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    gate.resolve(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("accounts completed envelope with invalid reply without claiming accepted text", async () => {
    const port = opts(vi.fn(async () => reply({ output: [] })));
    await expect(
      preparePrivateTypedSender(makeRequest(), limits)!.send(port, new AbortController().signal),
    ).rejects.toMatchObject({ code: "invalid-response" });
    expect(port.onReceipt).toHaveBeenCalledTimes(1);
    expect(port.onReceipt.mock.calls[0][0]).toMatchObject({
      kind: "private-typed-usage-v1",
      providerStatus: "completed",
    });
    expect(port.onReceipt.mock.calls[0][0]).not.toHaveProperty("outcome");
  });
  it.each(["abort", "timeout"])(
    "accounts late receipt after %s but never delivers late answer",
    async (mode) => {
      vi.useFakeTimers();
      const late = deferred<Response>();
      const fetcher = vi.fn(() => late.promise);
      const port = opts(fetcher);
      const controller = new AbortController();
      const running = preparePrivateTypedSender(makeRequest(), limits)!.send(
        port,
        controller.signal,
      );
      const rejected = expect(running).rejects.toMatchObject({
        code: mode === "abort" ? "aborted" : "timeout",
      });
      await vi.advanceTimersByTimeAsync(0);
      if (mode === "abort") controller.abort();
      else await vi.advanceTimersByTimeAsync(100);
      await rejected;
      late.resolve(reply());
      await vi.advanceTimersByTimeAsync(0);
      expect(port.onReceipt).toHaveBeenCalledTimes(1);
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it("cancels a response beyond the bounded late receipt window", async () => {
    vi.useFakeTimers();
    const late = deferred<Response>();
    const port = opts(vi.fn(() => late.promise));
    const cancel = vi.fn();
    const running = preparePrivateTypedSender(makeRequest(), limits)!.send(
      port,
      new AbortController().signal,
    );
    const rejected = expect(running).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(5200);
    await rejected;
    late.resolve(new Response(new ReadableStream({ cancel })));
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalled();
    expect(port.onReceipt).not.toHaveBeenCalled();
  });
  it.each([
    { model: "foreign" },
    { service_tier: "flex" },
    { status: "incomplete" },
    { error: { message: "private" } },
    { id: "bad id" },
    { usage: { input_tokens: 1, output_tokens: 2, total_tokens: 8 } },
    { usage: { input_tokens: 1, output_tokens: 65, total_tokens: 66 } },
  ])("refuses ambiguous usage envelope %j", async (change) => {
    const port = opts(vi.fn(async () => reply(change)));
    await preparePrivateTypedSender(makeRequest(), limits)!
      .send(port, new AbortController().signal)
      .catch(() => {});
    expect(port.onReceipt).not.toHaveBeenCalled();
  });
  it.each([429, 503, 302])("does not retry status %s or emit usage", async (status) => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify(okApiResponse("hidden")), { status }),
    );
    const port = opts(fetcher);
    await expect(
      preparePrivateTypedSender(makeRequest(), limits)!.send(port, new AbortController().signal),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(port.onReceipt).not.toHaveBeenCalled();
  });
  it("captures ports before the wait", async () => {
    const gate = deferred<boolean>();
    const fetcher = vi.fn(async () => reply());
    const port = { ...opts(fetcher), beforeDispatch: () => gate.promise };
    const receipt = port.onReceipt;
    const running = preparePrivateTypedSender(makeRequest(), limits)!.send(
      port,
      new AbortController().signal,
    );
    port.fetchImpl = vi.fn(async () => {
      throw Error("wrong");
    });
    port.mayDispatchNow = () => false;
    port.onReceipt = vi.fn();
    gate.resolve(true);
    await running;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(receipt).toHaveBeenCalledTimes(1);
    expect(port.onReceipt).not.toHaveBeenCalled();
  });
  it("isolates independent prepared calls", async () => {
    const first = preparePrivateTypedSender(makeRequest(), limits)!;
    const second = preparePrivateTypedSender(makeRequest({ requestId: "req-2" }), limits)!;
    const a = opts(vi.fn(async () => reply({ id: "resp_first" }))),
      b = opts(vi.fn(async () => reply({ id: "resp_second" })));
    await Promise.all([
      first.send(a, new AbortController().signal),
      second.send(b, new AbortController().signal),
    ]);
    expect(a.onReceipt.mock.calls[0][0]).toMatchObject({
      requestId: "req-1",
      responseId: "resp_first",
    });
    expect(b.onReceipt.mock.calls[0][0]).toMatchObject({
      requestId: "req-2",
      responseId: "resp_second",
    });
  });
  it("pins admitted sources even if the original request is extended after review", async () => {
    const request = makeRequest();
    const sender = preparePrivateTypedSender(request, limits)!;
    Object.assign(request.context, { sources: [{ excerpt: { sourceKey: "later-source" } }] });
    const port = opts(
      vi.fn(async () => new Response(JSON.stringify(okApiResponse("Fictional", ["later-source"])))),
    );
    await expect(sender.send(port, new AbortController().signal)).rejects.toMatchObject({
      code: "invalid-sources",
    });
    expect(port.onReceipt).toHaveBeenCalledTimes(1);
  });
  it.each(["async-truthy", "sync-truthy"])("requires boolean true from %s guard", async (mode) => {
    const fetcher = vi.fn(async () => reply());
    const port = {
      ...opts(fetcher),
      beforeDispatch: async () => (mode === "async-truthy" ? ("yes" as unknown as boolean) : true),
      mayDispatchNow: () => (mode === "sync-truthy" ? (1 as unknown as boolean) : true),
    };
    await expect(
      preparePrivateTypedSender(makeRequest(), limits)!.send(port, new AbortController().signal),
    ).rejects.toMatchObject({ code: "access-denied" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["missing-key", "pre-aborted"])("does not call final guard on %s", async (mode) => {
    const fetcher = vi.fn(async () => reply()),
      beforeDispatch = vi.fn(async () => true),
      controller = new AbortController();
    if (mode === "pre-aborted") controller.abort();
    const port = {
      ...opts(fetcher),
      apiKey: mode === "missing-key" ? undefined : KEY,
      beforeDispatch,
    };
    await expect(
      preparePrivateTypedSender(makeRequest(), limits)!.send(port, controller.signal),
    ).rejects.toMatchObject({ code: mode });
    expect(beforeDispatch).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("cancels an oversized body without promoting its metadata", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(256 * 1024 + 1));
      },
      cancel,
    });
    const port = opts(vi.fn(async () => new Response(body)));
    await expect(
      preparePrivateTypedSender(makeRequest(), limits)!.send(port, new AbortController().signal),
    ).rejects.toMatchObject({ code: "response-too-large" });
    expect(cancel).toHaveBeenCalled();
    expect(port.onReceipt).not.toHaveBeenCalled();
  });
  it("includes final access waits in the fixed late-receipt window", async () => {
    vi.useFakeTimers();
    const gate = deferred<boolean>(),
      late = deferred<Response>(),
      cancel = vi.fn();
    const port = { ...opts(vi.fn(() => late.promise)), beforeDispatch: () => gate.promise };
    const running = preparePrivateTypedSender(makeRequest(), limits)!.send(
      port,
      new AbortController().signal,
    );
    const rejected = expect(running).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(90);
    gate.resolve(true);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5010);
    await rejected;
    late.resolve(new Response(new ReadableStream({ cancel })));
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalled();
    expect(port.onReceipt).not.toHaveBeenCalled();
  });
  it.each(
    ["input_tokens_details", "output_tokens_details"].flatMap((field) =>
      ["bad", [], null, 1].map((value) => ({ field, value })),
    ),
  )("refuses malformed present metering details %j", async ({ field, value }) => {
    const port = opts(
      vi.fn(async () =>
        reply({
          usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150, [field]: value },
        }),
      ),
    );
    await preparePrivateTypedSender(makeRequest(), limits)!
      .send(port, new AbortController().signal)
      .catch(() => {});
    expect(port.onReceipt).not.toHaveBeenCalled();
  });
  it.each(["bad id", "", "x".repeat(201), "resp_" + KEY])(
    "refuses malformed or sensitive present receipt header %j",
    async (header) => {
      const port = opts(
        vi.fn(
          async () =>
            new Response(JSON.stringify(okApiResponse("Fictional")), {
              headers: { "x-request-id": header },
            }),
        ),
      );
      await preparePrivateTypedSender(makeRequest(), limits)!
        .send(port, new AbortController().signal)
        .catch(() => {});
      expect(port.onReceipt).not.toHaveBeenCalled();
    },
  );
  it("allows genuinely absent optional details and header with conservative usage", async () => {
    const port = opts(
      vi.fn(
        async () =>
          new Response(
            JSON.stringify(
              okApiResponse("Fictional", [], {
                usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
              }),
            ),
          ),
      ),
    );
    await preparePrivateTypedSender(makeRequest(), limits)!.send(
      port,
      new AbortController().signal,
    );
    expect(port.onReceipt).toHaveBeenCalledTimes(1);
    expect(port.onReceipt.mock.calls[0][0]).toMatchObject({
      providerRequestId: null,
      usage: { reasoningTokens: null, cachedInputTokens: null, cacheWriteTokens: null },
    });
  });
  it("denies dispatch when synchronous work crosses the foreground deadline before timers fire", async () => {
    vi.useFakeTimers();
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    const fetcher = vi.fn(async () => reply());
    const port = {
      ...opts(fetcher),
      beforeDispatch: async () => {
        clock = 101;
        return true;
      },
    };
    await expect(
      preparePrivateTypedSender(makeRequest(), limits)!.send(port, new AbortController().signal),
    ).rejects.toMatchObject({ code: "timeout" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(port.onReceipt).not.toHaveBeenCalled();
  });
  it("suppresses an answer delayed by accounting while retaining the trusted receipt, without timer delivery", async () => {
    vi.useFakeTimers();
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    const exchange: ConversationExchangeMeta[] = [];
    const receipt = vi.fn(() => {
      clock = 101;
    });
    const port = {
      ...opts(vi.fn(async () => reply())),
      onReceipt: receipt,
      onExchange: (m: ConversationExchangeMeta) => exchange.push(m),
    };
    await expect(
      preparePrivateTypedSender(makeRequest(), limits)!.send(port, new AbortController().signal),
    ).rejects.toMatchObject({ code: "timeout" });
    expect(receipt).toHaveBeenCalledTimes(1);
    expect(exchange.at(-1)).toMatchObject({ didDispatch: true, outcome: "timeout" });
  });
  it.each([100, 5100])(
    "checks hard receipt and answer time after reading bytes at %s",
    async (at) => {
      vi.useFakeTimers();
      let clock = 0;
      vi.spyOn(performance, "now").mockImplementation(() => clock);
      const bytes = new TextEncoder().encode(JSON.stringify(okApiResponse("Fictional")));
      const port = opts(
        vi.fn(
          async () =>
            new Response(
              new ReadableStream({
                start(c) {
                  c.enqueue(bytes);
                },
                pull(c) {
                  clock = at;
                  c.close();
                },
              }),
            ),
        ),
      );
      await expect(
        preparePrivateTypedSender(makeRequest(), limits)!.send(port, new AbortController().signal),
      ).rejects.toMatchObject({ code: "timeout" });
      expect(port.onReceipt).toHaveBeenCalledTimes(at === 100 ? 1 : 0);
    },
  );
  it.each([-1, NaN])("denies a backward or unsafe monotonic sample %s before fetch", async (at) => {
    vi.useFakeTimers();
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    const fetcher = vi.fn(async () => reply());
    const port = {
      ...opts(fetcher),
      beforeDispatch: async () => {
        clock = at;
        return true;
      },
    };
    await expect(
      preparePrivateTypedSender(makeRequest(), limits)!.send(port, new AbortController().signal),
    ).rejects.toMatchObject({ code: "timeout" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
