/**
 * Direct Responses API transport for the isolated fictional smoke runner only.
 * No environment reads, participant imports, retries, tools or conversation state.
 * Schema checked against OpenAI's text, reasoning and structured-output guides.
 */
export const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
export const OPENAI_MAX_RESPONSE_BYTES = 256 * 1024;
export const OPENAI_MAX_OUTPUT_CHARS = 12_000;
export const OPENAI_MAX_INPUT_CHARS = 24_000;
export const OPENAI_MAX_OUTPUT_TOKENS = 4_096;
export const OPENAI_MAX_DEADLINE_MS = 45_000;

export interface DirectOpenAIRequest {
  readonly systemPolicy: string;
  readonly groundedPayload: string;
  readonly maxOutputTokens: number;
  readonly deadlineMs: number;
}

export type DirectOpenAIFailureCode =
  | "missing-key"
  | "invalid-request"
  | "timeout"
  | "network"
  | "redirect"
  | "rate-limited"
  | "provider-failure"
  | "invalid-response"
  | "response-too-large"
  | "output-too-large"
  | "refused";

export interface DirectOpenAIResult {
  status: "complete" | "incomplete" | "failed";
  text: string | null;
  failureCode: DirectOpenAIFailureCode | null;
  requestedModel: string;
  reportedModel: string | null;
  responseId: string | null;
  requestId: string | null;
  /** Exact identity differs or was not supplied; caller reviews documented aliases. */
  modelMismatch: boolean;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    reasoningTokens: number | null;
    totalTokens: number | null;
  };
  incompleteReason: "max_output_tokens" | "content_filter" | "unknown" | null;
}

export interface DirectOpenAITransportOptions {
  apiKey: string | undefined;
  model: string;
  fetchImpl?: typeof fetch;
  /** Caller must verify this effort is supported by its exact selected model. */
  reasoningEffort?: "none" | "low" | "medium" | "high";
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function identifier(value: unknown, secret?: string): string | null {
  return typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,199}$/.test(value) &&
    !(secret && value.includes(secret))
    ? value
    : null;
}

function count(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 10_000_000
    ? value
    : null;
}

function cancelBody(response: Response | undefined) {
  try {
    void response?.body?.cancel().catch(() => {});
  } catch {
    // Cancellation errors cannot escape or expose provider error details.
  }
}

async function readBounded(
  response: Response,
  trackReader: (reader: ReadableStreamDefaultReader<Uint8Array>) => void,
): Promise<{ kind: "text"; value: string } | { kind: "oversize" | "missing" }> {
  if (!response.body) return { kind: "missing" };
  const reader = response.body.getReader();
  trackReader(reader);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  let complete = false;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) {
        complete = true;
        return { kind: "text", value: text + decoder.decode() };
      }
      bytes += chunk.value.byteLength;
      if (bytes > OPENAI_MAX_RESPONSE_BYTES) return { kind: "oversize" };
      text += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    if (!complete) {
      try {
        void reader.cancel().catch(() => {});
      } catch {
        // Best effort; the whole-operation race still enforces the deadline.
      }
    }
    try {
      reader.releaseLock();
    } catch {
      // A test or interrupted stream can still have a pending read.
    }
  }
}

export function createDirectOpenAITransport(options: DirectOpenAITransportOptions) {
  // Capture only the explicit server-side key supplied by the caller.
  const apiKey = options.apiKey;
  const requestedModel = identifier(options.model, apiKey) ?? "invalid-model";
  const effort = options.reasoningEffort ?? "none";
  const doFetch = options.fetchImpl ?? fetch;

  return {
    async generate(req: DirectOpenAIRequest): Promise<DirectOpenAIResult> {
      const result: DirectOpenAIResult = {
        status: "failed",
        text: null,
        failureCode: null,
        requestedModel,
        reportedModel: null,
        responseId: null,
        requestId: null,
        modelMismatch: true,
        usage: { inputTokens: null, outputTokens: null, reasoningTokens: null, totalTokens: null },
        incompleteReason: null,
      };
      const fail = (failureCode: DirectOpenAIFailureCode): DirectOpenAIResult => ({
        ...result,
        status: "failed",
        text: null,
        failureCode,
        incompleteReason: null,
      });
      if (!apiKey || !apiKey.trim()) return fail("missing-key");
      if (
        requestedModel === "invalid-model" ||
        !["none", "low", "medium", "high"].includes(effort) ||
        /[\r\n]/.test(apiKey) ||
        !req ||
        typeof req.systemPolicy !== "string" ||
        !req.systemPolicy.trim() ||
        typeof req.groundedPayload !== "string" ||
        !req.groundedPayload.trim() ||
        req.systemPolicy.length + req.groundedPayload.length > OPENAI_MAX_INPUT_CHARS ||
        req.systemPolicy.includes(apiKey) ||
        req.groundedPayload.includes(apiKey) ||
        !Number.isSafeInteger(req.maxOutputTokens) ||
        req.maxOutputTokens < 1 ||
        req.maxOutputTokens > OPENAI_MAX_OUTPUT_TOKENS ||
        !Number.isSafeInteger(req.deadlineMs) ||
        req.deadlineMs < 1 ||
        req.deadlineMs > OPENAI_MAX_DEADLINE_MS
      )
        return fail("invalid-request");

      const controller = new AbortController();
      let activeReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let response: Response | undefined;
      let expired = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<DirectOpenAIResult>((resolve) => {
        timer = setTimeout(() => {
          expired = true;
          controller.abort();
          try {
            if (activeReader) void activeReader.cancel().catch(() => {});
            else cancelBody(response);
          } catch {
            // The deadline resolves even if a stream ignores cancellation.
          }
          resolve(fail("timeout"));
        }, req.deadlineMs);
      });

      const operation = async (): Promise<DirectOpenAIResult> => {
        try {
          response = await doFetch(OPENAI_RESPONSES_URL, {
            method: "POST",
            redirect: "error",
            signal: controller.signal,
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: requestedModel,
              instructions: req.systemPolicy,
              input: [{ role: "user", content: req.groundedPayload }],
              max_output_tokens: req.maxOutputTokens,
              store: false,
              stream: false,
              service_tier: "default",
              prompt_cache_options: { mode: "explicit" },
              reasoning: { effort },
              text: { verbosity: "medium" },
            }),
          });
          if (expired) {
            cancelBody(response);
            return fail("timeout");
          }
          result.requestId = identifier(response.headers.get("x-request-id"), apiKey);
          if (response.redirected || (response.status >= 300 && response.status < 400)) {
            cancelBody(response);
            return fail("redirect");
          }
          if (!response.ok) {
            cancelBody(response);
            return fail(response.status === 429 ? "rate-limited" : "provider-failure");
          }
          const body = await readBounded(response, (reader) => {
            activeReader = reader;
            if (expired) void reader.cancel().catch(() => {});
          });
          if (expired) return fail("timeout");
          if (body.kind !== "text") {
            controller.abort();
            return fail(body.kind === "oversize" ? "response-too-large" : "invalid-response");
          }
          let parsed: Record<string, unknown> | null;
          try {
            parsed = object(JSON.parse(body.value));
          } catch {
            return fail("invalid-response");
          }
          if (!parsed) return fail("invalid-response");
          result.reportedModel = identifier(parsed.model, apiKey);
          result.responseId = identifier(parsed.id, apiKey);
          result.modelMismatch = result.reportedModel !== requestedModel;
          const usage = object(parsed.usage);
          const details = object(usage?.output_tokens_details);
          result.usage = {
            inputTokens: count(usage?.input_tokens),
            outputTokens: count(usage?.output_tokens),
            reasoningTokens: count(details?.reasoning_tokens),
            totalTokens: count(usage?.total_tokens),
          };
          if (parsed.error !== undefined && parsed.error !== null) return fail("provider-failure");
          if (parsed.status === "failed" || parsed.status === "cancelled")
            return fail("provider-failure");
          if (
            !["completed", "incomplete"].includes(parsed.status as string) ||
            !Array.isArray(parsed.output)
          )
            return fail("invalid-response");

          let text = "";
          let incompleteMessage = false;
          for (const rawItem of parsed.output) {
            const item = object(rawItem);
            if (!item) return fail("invalid-response");
            // No reasoning text, summaries or encrypted state leave this transport.
            if (item.type === "reasoning") continue;
            if (
              item.type !== "message" ||
              item.role !== "assistant" ||
              !Array.isArray(item.content)
            )
              return fail("invalid-response");
            if (item.status === "incomplete" || item.status === "in_progress")
              incompleteMessage = true;
            else if (item.status !== undefined && item.status !== "completed")
              return fail("invalid-response");
            for (const rawContent of item.content) {
              const content = object(rawContent);
              if (content?.type === "refusal") return fail("refused");
              if (content?.type !== "output_text" || typeof content.text !== "string")
                return fail("invalid-response");
              text += content.text;
              if (text.length > OPENAI_MAX_OUTPUT_CHARS) return fail("output-too-large");
            }
          }
          if (text.includes("\u0000") || text.includes(apiKey)) return fail("invalid-response");
          if (parsed.status === "incomplete" || incompleteMessage) {
            const reason = object(parsed.incomplete_details)?.reason;
            return {
              ...result,
              status: "incomplete",
              text: text.trim() ? text : null,
              incompleteReason:
                reason === "max_output_tokens" || reason === "content_filter" ? reason : "unknown",
            };
          }
          if (!text.trim() || parsed.incomplete_details != null) return fail("invalid-response");
          return { ...result, status: "complete", text };
        } catch {
          // Never return/log exceptions, headers, provider error bodies or secrets.
          return fail(expired ? "timeout" : "network");
        }
      };
      try {
        return await Promise.race([operation(), timeout]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
