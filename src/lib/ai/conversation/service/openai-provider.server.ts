// Conversation P4 — SERVER-ONLY direct OpenAI Responses API provider.
//
// Selectable dependency of the shared conversation service. The service stays
// the sole authority for policy/context/history/grants; this adapter only
// serializes the immutable request it is given (see serialize.ts) and
// validates what comes back. It never sees credentials at module scope: the
// key is supplied by the caller per construction and is never logged,
// returned, or embedded in errors.
//
// Wire profile (verified against the official Responses schema, Oct 2026):
//   POST https://api.openai.com/v1/responses, raw fetch (no SDK defaults, so
//   no implicit retries), strict JSON schema under text.format, baseline
//   reasoning.effort "none", explicit service_tier "default", store:false,
//   background:false, stream:false, truncation "disabled". NO conversation/
//   previous_response_id/provider memory, NO tools/search, NO retry/fallback,
//   NO prompt-cache prewarm.
//
// HONEST LIMITS:
//   - store:false is NOT a zero-retention guarantee; provider response storage
//     is distinct from abuse-monitoring/host logging, which may still apply.
//   - Aborting the foreground fetch does NOT prove unpaid provider
//     cancellation: accounting above this adapter must retain the reservation
//     as uncertain until reliable reconciliation.
//   - A source ID in the reply does not prove quote accuracy; the service
//     only checks the ID was admitted.

import {
  buildConversationInstructions,
  serializeConversationGroundedPayload,
} from "./serialize";
import { sha256HexSync } from "./sha256-sync";
import type {
  ConversationProvider,
  ConversationProviderRequest,
  ConversationProviderResponse,
} from "./provider";

export const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
export const OPENAI_CONVERSATION_MAX_RESPONSE_BYTES = 256 * 1024;
export const OPENAI_CONVERSATION_MAX_OUTPUT_CHARS = 12_000;
export const OPENAI_CONVERSATION_MAX_INPUT_CHARS = 64_000;
export const OPENAI_CONVERSATION_MAX_OUTPUT_TOKENS = 4_096;
export const OPENAI_CONVERSATION_MAX_DEADLINE_MS = 45_000;

export type DirectConversationFailureCode =
  | "missing-key"
  | "invalid-request"
  | "pre-aborted"
  | "aborted"
  | "timeout"
  | "network"
  | "redirect"
  | "rate-limited"
  | "provider-failure"
  | "invalid-response"
  | "response-too-large"
  | "output-too-large"
  | "refused"
  | "incomplete"
  | "unexpected-output"
  | "model-mismatch"
  | "tier-mismatch"
  | "invalid-sources";

/** Coded error. The message is the bare code only — never provider bodies,
 * headers, request content or credentials. */
export class ProviderRequestError extends Error {
  readonly code: DirectConversationFailureCode;
  constructor(code: DirectConversationFailureCode) {
    super(code);
    this.name = "ProviderRequestError";
    this.code = code;
  }
}

export interface ConversationExchangeMeta {
  readonly requestId: string;
  requestedModel: string;
  /** SHA-256 of the exact serialized instructions + grounded payload bytes. */
  requestPayloadSha256: string | null;
  reportedModel: string | null;
  /** Actual service tier reported by the provider response; success REQUIRES
   * exactly "default" — absent, null or malformed tiers are rejected. */
  serviceTier: string | null;
  responseId: string | null;
  providerRequestId: string | null;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    reasoningTokens: number | null;
    cachedInputTokens: number | null;
    totalTokens: number | null;
  };
  /** False when usage counts were invalid or internally inconsistent. */
  usageConsistent: boolean;
  latencyMs: number;
  outcome: "complete" | DirectConversationFailureCode;
}

export interface DirectConversationProviderOptions {
  /** Explicit server-side key supplied by the caller; never read from env here. */
  apiKey: string | undefined;
  model: string;
  fetchImpl?: typeof fetch;
  maxOutputTokens: number;
  deadlineMs: number;
  /** Actual input allowance in characters, enforced on the exact serialized
   * instructions + payload BEFORE any dispatch. Defaults to the hard cap. */
  maxInputChars?: number;
  /** Evidence hook: sanitized per-call metadata (no bodies, no credentials). */
  onExchange?: (meta: ConversationExchangeMeta) => void;
}

const REASONING_EFFORTS = ["none", "low", "medium", "high"] as const;

/** Strict output schema: an ordinary valid answer may cite no source. */
const REPLY_SCHEMA = {
  type: "object",
  properties: {
    text: { type: "string" },
    sourceIds: { type: "array", items: { type: "string" } },
  },
  required: ["text", "sourceIds"],
  additionalProperties: false,
} as const;

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
      if (bytes > OPENAI_CONVERSATION_MAX_RESPONSE_BYTES) return { kind: "oversize" };
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

/** Strict local check of the model's JSON reply against {text, sourceIds}.
 * Leakage screening runs on the DECODED layer too: a JSON string can hide the
 * credential behind Unicode escapes that pre-parse scanning cannot see. */
function parseReplyPayload(
  raw: string,
  admittedSourceKeys: ReadonlySet<string>,
  secret: string,
): { text: string; sourceIds: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ProviderRequestError("invalid-response");
  }
  const reply = object(parsed);
  if (!reply) throw new ProviderRequestError("invalid-response");
  const keys = Object.keys(reply).sort();
  if (keys.length !== 2 || keys[0] !== "sourceIds" || keys[1] !== "text") {
    throw new ProviderRequestError("invalid-response");
  }
  if (
    typeof reply.text !== "string" ||
    !reply.text.trim() ||
    reply.text.length > OPENAI_CONVERSATION_MAX_OUTPUT_CHARS ||
    !Array.isArray(reply.sourceIds) ||
    reply.sourceIds.length > 16 ||
    reply.sourceIds.some((id) => typeof id !== "string" || !id)
  ) {
    throw new ProviderRequestError("invalid-response");
  }
  const decodedText = reply.text as string;
  const sourceIds = [...new Set(reply.sourceIds as string[])];
  // Post-decode screening: decoded text, every decoded source ID and any
  // structured nesting inside the text must not carry the credential or NUL.
  if (
    decodedText.includes(String.fromCharCode(0)) ||
    decodedText.includes(secret) ||
    sourceIds.some(
      (id) => id.includes(String.fromCharCode(0)) || id.includes(secret),
    )
  ) {
    throw new ProviderRequestError("invalid-response");
  }
  if (sourceIds.some((id) => !admittedSourceKeys.has(id))) {
    throw new ProviderRequestError("invalid-sources");
  }
  return { text: decodedText, sourceIds };
}

export function createDirectOpenAIConversationProvider(
  options: DirectConversationProviderOptions,
): ConversationProvider {
  // Capture only the explicit server-side key supplied by the caller.
  const apiKey = options.apiKey;
  const requestedModel = identifier(options.model, apiKey) ?? "invalid-model";
  const doFetch = options.fetchImpl ?? fetch;

  return {
    async generate(
      request: ConversationProviderRequest,
      signal: AbortSignal,
    ): Promise<ConversationProviderResponse> {
      const startedAt = Date.now();
      const meta: ConversationExchangeMeta = {
        requestId: request.requestId,
        requestedModel,
        requestPayloadSha256: null,
        reportedModel: null,
        serviceTier: null,
        responseId: null,
        providerRequestId: null,
        usage: {
          inputTokens: null,
          outputTokens: null,
          reasoningTokens: null,
          cachedInputTokens: null,
          totalTokens: null,
        },
        usageConsistent: false,
        latencyMs: 0,
        outcome: "complete",
      };
      const finish = (outcome: ConversationExchangeMeta["outcome"]) => {
        meta.outcome = outcome;
        meta.latencyMs = Math.max(0, Date.now() - startedAt);
        try {
          options.onExchange?.(meta);
        } catch {
          // Evidence hooks must never change the outcome.
        }
      };
      const fail = (code: DirectConversationFailureCode): never => {
        finish(code);
        throw new ProviderRequestError(code);
      };

      // A pre-aborted request is never dispatched: zero provider calls.
      if (signal.aborted) fail("pre-aborted");

      const instructions = buildConversationInstructions(request);
      const groundedPayload = serializeConversationGroundedPayload(request);
      // The exact serialized wire payload is hashed for evidence BEFORE any
      // dispatch decision, so every attempt carries a verifiable request hash.
      meta.requestPayloadSha256 = sha256HexSync(`${instructions}\n${groundedPayload}`);
      const key = apiKey && apiKey.trim() ? apiKey : fail("missing-key");
      const maxInputChars = options.maxInputChars ?? OPENAI_CONVERSATION_MAX_INPUT_CHARS;
      if (
        requestedModel === "invalid-model" ||
        /[\r\n]/.test(key) ||
        !Number.isSafeInteger(maxInputChars) ||
        maxInputChars < 1 ||
        maxInputChars > OPENAI_CONVERSATION_MAX_INPUT_CHARS ||
        instructions.length + groundedPayload.length > maxInputChars ||
        instructions.includes(key) ||
        groundedPayload.includes(key) ||
        !Number.isSafeInteger(options.maxOutputTokens) ||
        options.maxOutputTokens < 1 ||
        options.maxOutputTokens > OPENAI_CONVERSATION_MAX_OUTPUT_TOKENS ||
        !Number.isSafeInteger(options.deadlineMs) ||
        options.deadlineMs < 1 ||
        options.deadlineMs > OPENAI_CONVERSATION_MAX_DEADLINE_MS
      )
        fail("invalid-request");

      const admittedSourceKeys = new Set(
        request.context.sources.map((s) => s.excerpt.sourceKey),
      );

      const controller = new AbortController();
      let activeReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let response: Response | undefined;
      let expired = false;
      let callerAborted = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let rejectCallerAbort: ((err: ProviderRequestError) => void) | undefined;
      // Caller cancellation races the operation INDEPENDENTLY: an abort-
      // ignoring fetch can never deliver a late "complete" result, because
      // this promise settles the race first and operation() re-checks the
      // flag after headers and after the body.
      const callerAbort = new Promise<never>((_, reject) => {
        rejectCallerAbort = reject;
      });
      const onOuterAbort = () => {
        callerAborted = true;
        controller.abort();
        try {
          if (activeReader) void activeReader.cancel().catch(() => {});
          else cancelBody(response);
        } catch {
          // The abort outcome resolves even if a stream ignores cancellation.
        }
        rejectCallerAbort?.(new ProviderRequestError("aborted"));
      };
      signal.addEventListener("abort", onOuterAbort, { once: true });
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          expired = true;
          controller.abort();
          try {
            if (activeReader) void activeReader.cancel().catch(() => {});
            else cancelBody(response);
          } catch {
            // The deadline resolves even if a stream ignores cancellation.
          }
          reject(new ProviderRequestError("timeout"));
        }, options.deadlineMs);
      });

      const operation = async (): Promise<ConversationProviderResponse> => {
        try {
          response = await doFetch(OPENAI_RESPONSES_URL, {
            method: "POST",
            redirect: "error",
            signal: controller.signal,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({
              model: requestedModel,
              instructions,
              input: [{ role: "user", content: groundedPayload }],
              max_output_tokens: options.maxOutputTokens,
              store: false,
              background: false,
              stream: false,
              service_tier: "default",
              truncation: "disabled",
              reasoning: { effort: "none" },
              text: {
                format: {
                  type: "json_schema",
                  name: "bfa_conversation_reply",
                  strict: true,
                  schema: REPLY_SCHEMA,
                },
              },
            }),
          });
          if (callerAborted) {
            cancelBody(response);
            throw new ProviderRequestError("aborted");
          }
          if (expired) {
            cancelBody(response);
            throw new ProviderRequestError("timeout");
          }
          meta.providerRequestId = identifier(
            response.headers.get("x-request-id"),
            key,
          );
          if (response.redirected || (response.status >= 300 && response.status < 400)) {
            cancelBody(response);
            throw new ProviderRequestError("redirect");
          }
          if (!response.ok) {
            cancelBody(response);
            throw new ProviderRequestError(
              response.status === 429 ? "rate-limited" : "provider-failure",
            );
          }
          const body = await readBounded(response, (reader) => {
            activeReader = reader;
            if (expired || callerAborted) void reader.cancel().catch(() => {});
          });
          if (callerAborted) throw new ProviderRequestError("aborted");
          if (expired) throw new ProviderRequestError("timeout");
          if (body.kind !== "text") {
            controller.abort();
            throw new ProviderRequestError(
              body.kind === "oversize" ? "response-too-large" : "invalid-response",
            );
          }
          let parsed: Record<string, unknown> | null;
          try {
            parsed = object(JSON.parse(body.value));
          } catch {
            throw new ProviderRequestError("invalid-response");
          }
          if (!parsed) throw new ProviderRequestError("invalid-response");
          meta.reportedModel = identifier(parsed.model, key);
          meta.responseId = identifier(parsed.id, key);
          meta.serviceTier = identifier(parsed.service_tier, key);
          const usage = object(parsed.usage);
          const outputDetails = object(usage?.output_tokens_details);
          const inputDetails = object(usage?.input_tokens_details);
          meta.usage = {
            inputTokens: count(usage?.input_tokens),
            outputTokens: count(usage?.output_tokens),
            reasoningTokens: count(outputDetails?.reasoning_tokens),
            cachedInputTokens: count(inputDetails?.cached_tokens),
            totalTokens: count(usage?.total_tokens),
          };
          // Reasoning tokens are a subset of output tokens: never double-count.
          meta.usageConsistent =
            meta.usage.inputTokens !== null &&
            meta.usage.outputTokens !== null &&
            meta.usage.totalTokens !== null &&
            meta.usage.inputTokens + meta.usage.outputTokens ===
              meta.usage.totalTokens &&
            (meta.usage.reasoningTokens === null ||
              meta.usage.reasoningTokens <= meta.usage.outputTokens) &&
            (meta.usage.cachedInputTokens === null ||
              meta.usage.cachedInputTokens <= meta.usage.inputTokens);
          if (parsed.error !== undefined && parsed.error !== null) {
            throw new ProviderRequestError("provider-failure");
          }
          if (parsed.status === "failed" || parsed.status === "cancelled") {
            throw new ProviderRequestError("provider-failure");
          }
          if (
            !["completed", "incomplete"].includes(parsed.status as string) ||
            !Array.isArray(parsed.output)
          ) {
            throw new ProviderRequestError("invalid-response");
          }
          if (meta.reportedModel !== requestedModel) {
            throw new ProviderRequestError("model-mismatch");
          }
          // The reported tier must be explicitly present and EXACTLY the
          // requested tier: absent, null or malformed values are rejected.
          if (meta.serviceTier !== "default") {
            throw new ProviderRequestError("tier-mismatch");
          }

          let text = "";
          let incompleteMessage = false;
          for (const rawItem of parsed.output) {
            const item = object(rawItem);
            if (!item) throw new ProviderRequestError("invalid-response");
            // No reasoning text, summaries or encrypted state leave this adapter.
            if (item.type === "reasoning") continue;
            if (item.type !== "message") {
              // Tool calls or any unexpected output item are refused wholesale.
              throw new ProviderRequestError("unexpected-output");
            }
            if (item.role !== "assistant" || !Array.isArray(item.content)) {
              throw new ProviderRequestError("invalid-response");
            }
            if (item.status === "incomplete" || item.status === "in_progress") {
              incompleteMessage = true;
            } else if (item.status !== undefined && item.status !== "completed") {
              throw new ProviderRequestError("invalid-response");
            }
            for (const rawContent of item.content) {
              const content = object(rawContent);
              if (content?.type === "refusal") {
                throw new ProviderRequestError("refused");
              }
              if (content?.type !== "output_text" || typeof content.text !== "string") {
                throw new ProviderRequestError("invalid-response");
              }
              text += content.text;
              if (text.length > OPENAI_CONVERSATION_MAX_OUTPUT_CHARS) {
                throw new ProviderRequestError("output-too-large");
              }
            }
          }
          if (text.includes(String.fromCharCode(0)) || text.includes(key)) {
            throw new ProviderRequestError("invalid-response");
          }
          if (parsed.status === "incomplete" || incompleteMessage) {
            throw new ProviderRequestError("incomplete");
          }
          if (!text.trim() || parsed.incomplete_details != null) {
            throw new ProviderRequestError("invalid-response");
          }
          const reply = parseReplyPayload(text, admittedSourceKeys);
          finish("complete");
          return { text: reply.text, sourceIds: reply.sourceIds, interpretation: null };
        } catch (err) {
          if (err instanceof ProviderRequestError) throw err;
          // Never return/log exceptions, headers, provider error bodies or secrets.
          throw new ProviderRequestError(expired ? "timeout" : "network");
        }
      };
      try {
        return await Promise.race([operation(), timeout]);
      } catch (err) {
        if (err instanceof ProviderRequestError) fail(err.code);
        fail("network");
        throw new ProviderRequestError("network"); // unreachable; satisfies TS
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", onOuterAbort);
      }
    },
  };
}
