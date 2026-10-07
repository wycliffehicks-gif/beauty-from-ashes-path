// Every request is an injected local fake. No provider or credentials are used.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDirectOpenAITransport,
  OPENAI_MAX_OUTPUT_CHARS,
  OPENAI_MAX_RESPONSE_BYTES,
  OPENAI_RESPONSES_URL,
  type DirectOpenAIRequest,
} from "../../../../scripts/direct-openai-smoke/transport";

const secret = "synthetic-private-key-never-persist";
const model = "gpt-6-luna";
const request: DirectOpenAIRequest = {
  systemPolicy: "Synthetic reviewed system policy.",
  groundedPayload: '{"selections":["Keep this private"]}',
  maxOutputTokens: 4096,
  deadlineMs: 45_000,
};
const message = (text = "You may leave this here today.") => ({
  type: "message",
  role: "assistant",
  status: "completed",
  content: [{ type: "output_text", text }],
});
const payload = (overrides: Record<string, unknown> = {}) => ({
  id: "resp_synthetic",
  model,
  status: "completed",
  error: null,
  incomplete_details: null,
  output: [message()],
  usage: {
    input_tokens: 120,
    output_tokens: 40,
    total_tokens: 160,
    output_tokens_details: { reasoning_tokens: 0 },
  },
  ...overrides,
});
const response = (overrides: Record<string, unknown> = {}) =>
  new Response(JSON.stringify(payload(overrides)), {
    headers: { "x-request-id": "req_synthetic" },
  });
const make = (fetchImpl: typeof fetch, options: Record<string, unknown> = {}) =>
  createDirectOpenAITransport({ apiKey: secret, model, fetchImpl, ...options });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("isolated direct OpenAI transport", () => {
  it("uses only the approved Responses fields, fixed endpoint and secret header", async () => {
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(_url).toBe(OPENAI_RESPONSES_URL);
      expect(init?.redirect).toBe("error");
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${secret}`);
      expect(JSON.parse(String(init?.body))).toEqual({
        model,
        instructions: request.systemPolicy,
        input: [{ role: "user", content: request.groundedPayload }],
        max_output_tokens: 4096,
        store: false,
        stream: false,
        service_tier: "default",
        prompt_cache_options: { mode: "explicit" },
        reasoning: { effort: "none" },
        text: { verbosity: "medium" },
      });
      expect(String(init?.body)).not.toContain(secret);
      return response();
    });
    const result = await make(fetchImpl).generate(request);
    expect(result).toMatchObject({
      status: "complete",
      text: "You may leave this here today.",
      failureCode: null,
      requestedModel: model,
      reportedModel: model,
      modelMismatch: false,
      responseId: "resp_synthetic",
      requestId: "req_synthetic",
      usage: { inputTokens: 120, outputTokens: 40, reasoningTokens: 0, totalTokens: 160 },
    });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("concatenates every message output_text in order and never exports reasoning", async () => {
    const result = await make(
      vi.fn(async () =>
        response({
          output: [
            {
              type: "reasoning",
              content: [{ type: "reasoning_text", text: "DO NOT EXPORT" }],
              summary: ["PRIVATE"],
            },
            {
              ...message(),
              content: [
                { type: "output_text", text: " First" },
                { type: "output_text", text: " part.\n" },
              ],
            },
            message("Second part. "),
          ],
        }),
      ),
    ).generate(request);
    expect(result.text).toBe(" First part.\nSecond part. ");
    expect(JSON.stringify(result)).not.toMatch(/DO NOT EXPORT|PRIVATE|reasoning_text|summary/);
  });

  it("records an exact model mismatch for caller review, without silently changing it", async () => {
    const result = await make(
      vi.fn(async () => response({ model: "gpt-6-luna-2026-09-01" })),
    ).generate(request);
    expect(result).toMatchObject({
      status: "complete",
      reportedModel: "gpt-6-luna-2026-09-01",
      modelMismatch: true,
    });
  });

  it("drops malformed or overlong identifiers and invalid usage rather than inventing counts", async () => {
    const result = await make(
      vi.fn(
        async () =>
          new Response(
            JSON.stringify(
              payload({
                id: "x".repeat(201),
                model: "model with spaces",
                usage: {
                  input_tokens: -1,
                  output_tokens: 1.5,
                  total_tokens: "10",
                  output_tokens_details: { reasoning_tokens: 10_000_001 },
                },
              }),
            ),
            { headers: { "x-request-id": "x".repeat(201) } },
          ),
      ),
    ).generate(request);
    expect(result).toMatchObject({
      responseId: null,
      reportedModel: null,
      requestId: null,
      modelMismatch: true,
      usage: { inputTokens: null, outputTokens: null, reasoningTokens: null, totalTokens: null },
    });
  });

  it.each(["max_output_tokens", "content_filter", "unexpected-provider-detail"])(
    "keeps %s incomplete output out of complete results",
    async (reason) => {
      const result = await make(
        vi.fn(async () =>
          response({
            status: "incomplete",
            incomplete_details: { reason },
            output: [message("Unfinished")],
          }),
        ),
      ).generate(request);
      expect(result).toMatchObject({
        status: "incomplete",
        text: "Unfinished",
        failureCode: null,
        incompleteReason: reason === "unexpected-provider-detail" ? "unknown" : reason,
      });
    },
  );

  it("keeps an empty reasoning-only incomplete response incomplete, with usage", async () => {
    const result = await make(
      vi.fn(async () =>
        response({
          status: "incomplete",
          incomplete_details: { reason: "max_output_tokens" },
          output: [{ type: "reasoning", summary: [{ text: "unretained" }] }],
        }),
      ),
    ).generate(request);
    expect(result).toMatchObject({ status: "incomplete", text: null, usage: { outputTokens: 40 } });
  });

  it("does not promote a message marked incomplete when its envelope says completed", async () => {
    const result = await make(
      vi.fn(async () => response({ output: [{ ...message(), status: "incomplete" }] })),
    ).generate(request);
    expect(result).toMatchObject({ status: "incomplete", incompleteReason: "unknown" });
  });

  it("detects refusal anywhere in content and does not expose refusal or partial text", async () => {
    const result = await make(
      vi.fn(async () =>
        response({
          output: [
            message("Some partial text"),
            {
              ...message(),
              content: [{ type: "refusal", refusal: `Raw refusal ${secret}` }],
            },
          ],
        }),
      ),
    ).generate(request);
    expect(result).toMatchObject({ status: "failed", failureCode: "refused", text: null });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it.each([301, 302, 307, 308, 429, 401, 500])(
    "never reads the error body or retries HTTP %s",
    async (status) => {
      const cancel = vi.fn();
      const fetchImpl = vi.fn(async () => new Response(new ReadableStream({ cancel }), { status }));
      const result = await make(fetchImpl).generate(request);
      expect(result.failureCode).toBe(
        status < 400 ? "redirect" : status === 429 ? "rate-limited" : "provider-failure",
      );
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    },
  );

  it("discards thrown errors and provider error messages without logging", async () => {
    const log = vi.spyOn(console, "log");
    const error = vi.spyOn(console, "error");
    const thrown = await make(
      vi.fn(async () => {
        throw new Error(`Bearer ${secret}`);
      }),
    ).generate(request);
    const returned = await make(
      vi.fn(async () => response({ error: { message: secret } })),
    ).generate(request);
    expect(thrown.failureCode).toBe("network");
    expect(returned.failureCode).toBe("provider-failure");
    expect(JSON.stringify([thrown, returned])).not.toContain(secret);
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("rejects key echoes in output or metadata", async () => {
    const result = await make(
      vi.fn(
        async () =>
          new Response(
            JSON.stringify(
              payload({
                id: secret,
                model: secret,
                output: [message(secret)],
              }),
            ),
            { headers: { "x-request-id": secret } },
          ),
      ),
    ).generate(request);
    expect(result).toMatchObject({
      failureCode: "invalid-response",
      text: null,
      responseId: null,
      reportedModel: null,
      requestId: null,
    });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("enforces the whole-body deadline when a reader ignores abort and cancellation", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const releaseLock = vi.fn();
    let signal: AbortSignal | null | undefined;
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      signal = init?.signal;
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        body: { getReader: () => ({ read: () => new Promise(() => {}), cancel, releaseLock }) },
      } as unknown as Response;
    });
    const pending = make(fetchImpl).generate(request);
    await vi.advanceTimersByTimeAsync(45_000);
    expect(await pending).toMatchObject({ status: "failed", failureCode: "timeout" });
    expect(signal?.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns at the deadline when fetch ignores abort, and cancels a late body", async () => {
    vi.useFakeTimers();
    let resolveFetch!: (value: Response) => void;
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const pending = make(fetchImpl).generate({ ...request, deadlineMs: 15 });
    await vi.advanceTimersByTimeAsync(15);
    expect((await pending).failureCode).toBe("timeout");
    const cancel = vi.fn();
    resolveFetch(new Response(new ReadableStream({ cancel })));
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("aborts and cancels an oversized byte stream without exposing it", async () => {
    const cancel = vi.fn();
    let signal: AbortSignal | null | undefined;
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      signal = init?.signal;
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(OPENAI_MAX_RESPONSE_BYTES + 1));
          },
          cancel,
        }),
      );
    });
    expect(await make(fetchImpl).generate(request)).toMatchObject({
      failureCode: "response-too-large",
      text: null,
    });
    expect(signal?.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects aggregate output above the character ceiling", async () => {
    const result = await make(
      vi.fn(async () =>
        response({ output: [message("x".repeat(OPENAI_MAX_OUTPUT_CHARS)), message("x")] }),
      ),
    ).generate(request);
    expect(result).toMatchObject({ failureCode: "output-too-large", text: null });
  });

  it.each([
    { output: [message("")] },
    { output: [message("bad\u0000text")] },
    { output: [{ type: "function_call", arguments: "unused" }] },
    { output: [{ ...message(), role: "user" }] },
    { status: "in_progress" },
    { status: "completed", incomplete_details: { reason: "max_output_tokens" } },
  ])("fails closed on malformed output %s", async (overrides) => {
    expect((await make(vi.fn(async () => response(overrides))).generate(request)).failureCode).toBe(
      "invalid-response",
    );
  });

  it("requires a key without invoking fetch", async () => {
    const fetchImpl = vi.fn();
    expect((await make(fetchImpl, { apiKey: undefined }).generate(request)).failureCode).toBe(
      "missing-key",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    { maxOutputTokens: 0 },
    { maxOutputTokens: 4097 },
    { maxOutputTokens: 1.5 },
    { deadlineMs: 0 },
    { deadlineMs: 45_001 },
    { deadlineMs: Number.NaN },
    { systemPolicy: "" },
    { groundedPayload: " " },
    { systemPolicy: "x".repeat(24_001) },
    { groundedPayload: secret },
  ])("rejects invalid request caps/input without any network %s", async (patch) => {
    const fetchImpl = vi.fn();
    expect((await make(fetchImpl).generate({ ...request, ...patch })).failureCode).toBe(
      "invalid-request",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
