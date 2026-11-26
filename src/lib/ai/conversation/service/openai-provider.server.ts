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
export const OPENAI_CONVERSATION_MAX_INPUT_BYTES = 64_000;
// Engineering allowance for provider-added role/framing tokens. The complete
// wire JSON (including schema and policy) is separately counted byte-for-byte.
// This is a conservative reservation policy, not a provider billing guarantee.
export const OPENAI_CONVERSATION_PROTOCOL_TOKEN_ALLOWANCE = 4_096;
export const OPENAI_CONVERSATION_MAX_OUTPUT_TOKENS = 4_096;
export const OPENAI_CONVERSATION_MAX_DEADLINE_MS = 45_000;

export type DirectConversationFailureCode =
  | "access-denied"
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
  /** SHA-256 of the complete exact UTF-8 POST body. */
  requestPayloadSha256: string | null;
  didDispatch: boolean;
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
    cacheWriteTokens: number | null;
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
  /** Hard allowance over the complete UTF-8 JSON POST body, including schema. */
  maxInputBytes?: number;
  /** Evidence hook: sanitized per-call metadata (no bodies, no credentials). */
  onExchange?: (meta: ConversationExchangeMeta) => void;
}

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

/** Inspect escaped layers without changing the user's/model's text. Nested
 * JSON can otherwise hide a credential behind repeated Unicode escapes. */
function containsSensitiveText(value: string, secret: string): boolean {
  let current = value;
  for (let layer = 0; layer < 8; layer++) {
    if (current.includes(secret) || current.includes("\0")) return true;
    const decoded = current.replace(/\\u([0-9a-f]{4})/gi,
      (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\\\/g, "\\");
    if (decoded === current) return false;
    current = decoded;
  }
  // Ambiguous deeper encodings are not needed by the reply contract.
  return true;
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
    containsSensitiveText(decodedText, secret) ||
    sourceIds.some((id) => containsSensitiveText(id, secret))
  ) {
    throw new ProviderRequestError("invalid-response");
  }
  if (sourceIds.some((id) => !admittedSourceKeys.has(id))) {
    throw new ProviderRequestError("invalid-sources");
  }
  return { text: decodedText, sourceIds };
}

function prepareWire(
  request: ConversationProviderRequest,
  requestedModel: string,
  maxOutputTokens: number,
) {
  const instructions = buildConversationInstructions(request);
  const groundedPayload = serializeConversationGroundedPayload(request);
  const wireBody = JSON.stringify({
    model: requestedModel,
    instructions,
    input: [{ role: "user", content: groundedPayload }],
    max_output_tokens: maxOutputTokens,
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
  });
  const inputBytes = new TextEncoder().encode(wireBody).byteLength;
  return {
    instructions,
    groundedPayload,
    wireBody,
    inputBytes,
    wireSha256: sha256HexSync(wireBody),
  };
}

type PrivateTypedLimits = Pick<
  DirectConversationProviderOptions,
  "model" | "maxOutputTokens" | "maxInputBytes" | "maxInputChars" | "deadlineMs"
>;

function withinWireLimits(wire: ReturnType<typeof prepareWire>, limits: PrivateTypedLimits) {
  const bytes = limits.maxInputBytes ?? OPENAI_CONVERSATION_MAX_INPUT_BYTES;
  const chars = limits.maxInputChars ?? OPENAI_CONVERSATION_MAX_INPUT_CHARS;
  const bounded = (n: number, ceiling: number) => Number.isSafeInteger(n) && n >= 1 && n <= ceiling;
  return (
    bounded(bytes, OPENAI_CONVERSATION_MAX_INPUT_BYTES) &&
    bounded(chars, OPENAI_CONVERSATION_MAX_INPUT_CHARS) &&
    bounded(limits.maxOutputTokens, OPENAI_CONVERSATION_MAX_OUTPUT_TOKENS) &&
    bounded(limits.deadlineMs, OPENAI_CONVERSATION_MAX_DEADLINE_MS) &&
    wire.inputBytes <= bytes &&
    wire.instructions.length + wire.groundedPayload.length <= chars
  );
}

/** Describe a service-built request for review before any credential or transport
 * is supplied. A matching description does not claim or authorize a send. */
export function describePrivateTypedWire(
  request: ConversationProviderRequest,
  limits: PrivateTypedLimits,
) {
  if (
    !identifier(request.requestId) ||
    !identifier(limits.model) ||
    limits.model === "invalid-model"
  )
    return null;
  const wire = prepareWire(request, limits.model, limits.maxOutputTokens);
  if (!withinWireLimits(wire, limits)) return null;
  return {
    serviceRequestId: request.requestId,
    model: limits.model,
    maxOutputTokens: limits.maxOutputTokens,
    maxInputBytes: limits.maxInputBytes ?? OPENAI_CONVERSATION_MAX_INPUT_BYTES,
    deadlineMs: limits.deadlineMs,
    wireBytes: wire.inputBytes,
    wireSha256: wire.wireSha256,
  };
}

/** Billing evidence is independent of reply acceptance. A completed envelope
 * can contain invalid reply text; this type makes no claim that text is usable. */
export interface PrivateTypedUsageReceipt {
  readonly kind: "private-typed-usage-v1";
  readonly requestId: string;
  readonly requestPayloadSha256: string;
  readonly requestedModel: string;
  readonly reportedModel: string;
  readonly serviceTier: "default";
  readonly responseId: string;
  readonly providerRequestId: string | null;
  readonly usage: Readonly<ConversationExchangeMeta["usage"]>;
  readonly didDispatch: true;
  readonly providerStatus: "completed";
}

export interface PrivateTypedSendOptions {
  readonly apiKey: string | undefined;
  readonly fetchImpl?: typeof fetch;
  /** Fresh request-bound access/approval check, after any credential waits. */
  readonly beforeDispatch: () => Promise<boolean>;
  /** Synchronous cancellation/deadline check after the last await. */
  readonly mayDispatchNow: () => boolean;
  /** Independent accounting; can run after foreground cancellation. */
  readonly onReceipt: (receipt: PrivateTypedUsageReceipt) => void | Promise<void>;
  readonly onExchange?: (exchange: ConversationExchangeMeta) => void;
}

function privateReceipt(
  body: string,
  headerId: string | null,
  key: string,
  requestId: string,
  wire: ReturnType<typeof prepareWire>,
  limits: PrivateTypedLimits,
): PrivateTypedUsageReceipt | null {
  try {
    const parsed = object(JSON.parse(body));
    if (
      !parsed ||
      parsed.status !== "completed" ||
      parsed.error != null ||
      parsed.model !== limits.model ||
      parsed.service_tier !== "default"
    )
      return null;
    const responseId = identifier(parsed.id, key);
    if (!responseId || !identifier(parsed.model, key)) return null;
    const raw = object(parsed.usage);
    const input = object(raw?.input_tokens_details),
      output = object(raw?.output_tokens_details);
    // Absence is conservative; malformed present metering/header fields are
    // contradictory evidence and cannot be promoted to a trusted receipt.
    if (
      (raw?.input_tokens_details !== undefined && !input) ||
      (raw?.output_tokens_details !== undefined && !output) ||
      (headerId !== null && identifier(headerId, key) === null)
    )
      return null;
    const usage = {
      inputTokens: count(raw?.input_tokens),
      outputTokens: count(raw?.output_tokens),
      totalTokens: count(raw?.total_tokens),
      reasoningTokens: count(output?.reasoning_tokens),
      cachedInputTokens: count(input?.cached_tokens),
      cacheWriteTokens: count(input?.cache_write_tokens),
    };
    if (
      usage.inputTokens === null ||
      usage.outputTokens === null ||
      usage.totalTokens === null ||
      usage.inputTokens + usage.outputTokens !== usage.totalTokens ||
      usage.inputTokens > wire.inputBytes + OPENAI_CONVERSATION_PROTOCOL_TOKEN_ALLOWANCE ||
      usage.outputTokens > limits.maxOutputTokens ||
      (output?.reasoning_tokens !== undefined && usage.reasoningTokens === null) ||
      (input?.cached_tokens !== undefined && usage.cachedInputTokens === null) ||
      (input?.cache_write_tokens !== undefined && usage.cacheWriteTokens === null) ||
      (usage.reasoningTokens !== null && usage.reasoningTokens > usage.outputTokens) ||
      (usage.cachedInputTokens !== null && usage.cachedInputTokens > usage.inputTokens) ||
      (usage.cacheWriteTokens !== null &&
        usage.cacheWriteTokens + (usage.cachedInputTokens ?? 0) > usage.inputTokens)
    )
      return null;
    return Object.freeze({
      kind: "private-typed-usage-v1",
      requestId,
      requestPayloadSha256: wire.wireSha256,
      requestedModel: limits.model,
      reportedModel: limits.model,
      serviceTier: "default",
      responseId,
      providerRequestId: identifier(headerId, key),
      usage: Object.freeze(usage),
      didDispatch: true,
      providerStatus: "completed",
    });
  } catch {
    return null;
  }
}

/** Server-owned one-send preparation. No credentials, fetch or authorization
 * occurs here. Keep wireBody in server memory; it is not an evidence/log field. */
export function preparePrivateTypedSender(
  request: ConversationProviderRequest,
  input: PrivateTypedLimits,
) {
  try {
    const limits = Object.freeze({ ...input });
    const requestId = request.requestId;
    if (!identifier(requestId) || !identifier(limits.model) || limits.model === "invalid-model")
      return null;
    const wire = Object.freeze(prepareWire(request, limits.model, limits.maxOutputTokens));
    if (!withinWireLimits(wire, limits)) return null;
    const sources = new Set(request.context.sources.map((s) => s.excerpt.sourceKey));
    const description = Object.freeze({
      serviceRequestId: requestId,
      model: limits.model,
      maxOutputTokens: limits.maxOutputTokens,
      maxInputBytes: limits.maxInputBytes ?? OPENAI_CONVERSATION_MAX_INPUT_BYTES,
      deadlineMs: limits.deadlineMs,
      wireBytes: wire.inputBytes,
      wireSha256: wire.wireSha256,
    });
    let attempted = false;
    return Object.freeze({
      description,
      wireBody: wire.wireBody,
      async send(
        options: PrivateTypedSendOptions,
        signal: AbortSignal,
      ): Promise<ConversationProviderResponse> {
        if (attempted) throw new ProviderRequestError("invalid-request");
        attempted = true;
        let clockHighWater = performance.now();
        if (!Number.isFinite(clockHighWater) || clockHighWater < 0)
          throw new ProviderRequestError("invalid-request");
        const foregroundDeadline = clockHighWater + limits.deadlineMs;
        const receiptDeadline = foregroundDeadline + 5_000;
        const sampleClock = () => {
          const at = performance.now();
          if (!Number.isFinite(at) || at < clockHighWater)
            throw new ProviderRequestError("timeout");
          clockHighWater = at;
          return at;
        };
        // Capture ports before any wait. Caller-owned options cannot swap the
        // final guard, recipient or receipt sink during an asynchronous check.
        const { apiKey, beforeDispatch, mayDispatchNow, onReceipt, onExchange } = options;
        const transport = options.fetchImpl ?? fetch;
        let didDispatch = false;
        const checkedFetch: typeof fetch = async (url, init) => {
          if (
            String(url) !== OPENAI_RESPONSES_URL ||
            init?.body !== wire.wireBody ||
            init.method !== "POST"
          )
            throw new ProviderRequestError("invalid-request");
          let allowed = false;
          try {
            allowed = await beforeDispatch();
          } catch {
            /* Fixed denial, no private exception. */
          }
          if (allowed !== true || signal.aborted || init.signal?.aborted)
            throw new ProviderRequestError("access-denied");
          // No await, serialization or user callback between this final sync
          // predicate and the one actual transport invocation.
          let current = false;
          try {
            current = mayDispatchNow();
          } catch {
            /* Deny. */
          }
          if (current !== true || signal.aborted || init.signal?.aborted)
            throw new ProviderRequestError("access-denied");
          if (sampleClock() >= foregroundDeadline) throw new ProviderRequestError("timeout");
          didDispatch = true;
          const responsePromise = transport(url, init);
          // The foreground parser retains its original cancellation/deadline.
          // A transport that ignores abort may still deliver billing evidence
          // for five additional seconds; never wait/read indefinitely.
          let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
          let response: Response | undefined;
          let ended = false;
          let timer: ReturnType<typeof setTimeout> | undefined;
          const deadline = new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => {
                ended = true;
                if (reader) void reader.cancel().catch(() => {});
                else cancelBody(response);
                reject(new ProviderRequestError("timeout"));
              },
              Math.max(0, receiptDeadline - performance.now()),
            );
          });
          try {
            const receive = async () => {
              response = await responsePromise;
              if (ended || sampleClock() >= receiptDeadline) {
                cancelBody(response);
                throw new ProviderRequestError("timeout");
              }
              if (
                !response.ok ||
                response.redirected ||
                (response.status >= 300 && response.status < 400)
              )
                return response;
              const body = await readBounded(response, (value) => {
                reader = value;
              });
              if (ended || sampleClock() >= receiptDeadline)
                throw new ProviderRequestError("timeout");
              if (body.kind !== "text")
                throw new ProviderRequestError(
                  body.kind === "oversize" ? "response-too-large" : "invalid-response",
                );
              return { response, text: body.value };
            };
            const received = await Promise.race([receive(), deadline]);
            clearTimeout(timer);
            if (received instanceof Response) return received;
            const receipt = privateReceipt(
              received.text,
              received.response.headers.get("x-request-id"),
              apiKey ?? "",
              requestId,
              wire,
              limits,
            );
            if (receipt) {
              try {
                await onReceipt(receipt);
              } catch {
                /* Accounting failure never permits a retry or exposes details. */
              }
            }
            // The unchanged parser validates the exact received text. A late
            // receipt never becomes a late foreground answer.
            return new Response(received.text, {
              status: received.response.status,
              headers: received.response.headers,
            });
          } catch (error) {
            if (reader) void reader.cancel().catch(() => {});
            else cancelBody(response);
            throw error;
          } finally {
            clearTimeout(timer);
          }
        };
        let exchange: ConversationExchangeMeta | undefined;
        let finalOutcome: ConversationExchangeMeta["outcome"] | undefined;
        try {
          const answer = await createConversationProvider(
            {
              ...limits,
              apiKey,
              fetchImpl: checkedFetch,
              onExchange: (meta) => {
                exchange = meta;
              },
            },
            { wire, requestId, sources },
          ).generate(request, signal);
          // A blocked event loop can delay timers. The synchronous monotonic
          // sample, not timer delivery, decides whether an answer is still fresh.
          if (signal.aborted) throw new ProviderRequestError("aborted");
          if (sampleClock() >= foregroundDeadline) throw new ProviderRequestError("timeout");
          return answer;
        } catch (error) {
          finalOutcome = error instanceof ProviderRequestError ? error.code : "network";
          throw new ProviderRequestError(finalOutcome);
        } finally {
          if (exchange) {
            try {
              onExchange?.(
                Object.freeze({
                  ...exchange,
                  didDispatch,
                  outcome: finalOutcome ?? exchange.outcome,
                  usage: Object.freeze({ ...exchange.usage }),
                }),
              );
            } catch {
              /* Content-free observer cannot alter the outcome. */
            }
          }
        }
      },
    });
  } catch {
    return null;
  }
}

export function createDirectOpenAIConversationProvider(
  options: DirectConversationProviderOptions,
): ConversationProvider {
  return createConversationProvider(options);
}

// Private preparation supplies the exact captured bytes and admitted source keys.
// The original exported factory always uses its unchanged serialization/parser path.
function createConversationProvider(
  options: DirectConversationProviderOptions,
  prepared?: {
    wire: ReturnType<typeof prepareWire>;
    requestId: string;
    sources: ReadonlySet<string>;
  },
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
        requestId:
          identifier(prepared?.requestId ?? request.requestId, apiKey) ?? "invalid-request-id",
        requestedModel,
        requestPayloadSha256: null,
        didDispatch: false,
        reportedModel: null,
        serviceTier: null,
        responseId: null,
        providerRequestId: null,
        usage: {
          inputTokens: null,
          outputTokens: null,
          reasoningTokens: null,
          cachedInputTokens: null,
          cacheWriteTokens: null,
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

      const wire = prepared?.wire ?? prepareWire(request, requestedModel, options.maxOutputTokens);
      const { wireBody, inputBytes } = wire;
      meta.requestPayloadSha256 = wire.wireSha256;
      const key = apiKey && apiKey.trim() ? apiKey : fail("missing-key");
      if (
        requestedModel === "invalid-model" ||
        /[\r\n]/.test(key) ||
        !withinWireLimits(wire, options) ||
        wire.instructions.includes(key) ||
        wire.groundedPayload.includes(key)
      )
        fail("invalid-request");

      const admittedSourceKeys =
        prepared?.sources ?? new Set(request.context.sources.map((s) => s.excerpt.sourceKey));

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
          if (signal.aborted) throw new ProviderRequestError("aborted");
          meta.didDispatch = true;
          response = await doFetch(OPENAI_RESPONSES_URL, {
            method: "POST",
            redirect: "error",
            signal: controller.signal,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${key}`,
            },
            body: wireBody,
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
            cacheWriteTokens: count(inputDetails?.cache_write_tokens),
            totalTokens: count(usage?.total_tokens),
          };
          // Reasoning tokens are a subset of output tokens: never double-count.
          meta.usageConsistent =
            meta.usage.inputTokens !== null &&
            meta.usage.outputTokens !== null &&
            meta.usage.totalTokens !== null &&
            meta.usage.inputTokens + meta.usage.outputTokens ===
              meta.usage.totalTokens &&
            meta.usage.inputTokens <= inputBytes + OPENAI_CONVERSATION_PROTOCOL_TOKEN_ALLOWANCE &&
            meta.usage.outputTokens <= options.maxOutputTokens &&
            (outputDetails?.reasoning_tokens === undefined || meta.usage.reasoningTokens !== null) &&
            (inputDetails?.cached_tokens === undefined || meta.usage.cachedInputTokens !== null) &&
            (inputDetails?.cache_write_tokens === undefined || meta.usage.cacheWriteTokens !== null) &&
            (meta.usage.reasoningTokens === null ||
              meta.usage.reasoningTokens <= meta.usage.outputTokens) &&
            (meta.usage.cachedInputTokens === null ||
              meta.usage.cachedInputTokens <= meta.usage.inputTokens) &&
            (meta.usage.cacheWriteTokens === null ||
              meta.usage.cacheWriteTokens + (meta.usage.cachedInputTokens ?? 0) <= meta.usage.inputTokens);
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
          const reply = parseReplyPayload(text, admittedSourceKeys, key);
          finish("complete");
          return { text: reply.text, sourceIds: reply.sourceIds, interpretation: null };
        } catch (err) {
          if (err instanceof ProviderRequestError) throw err;
          // Never return/log exceptions, headers, provider error bodies or secrets.
          throw new ProviderRequestError(
            callerAborted ? "aborted" : expired ? "timeout" : "network",
          );
        }
      };
      try {
        return await Promise.race([operation(), timeout, callerAbort]);
      } catch (err) {
        // Caller cancellation takes precedence in reporting: a late network
        // error caused by our own abort is still an aborted outcome.
        if (callerAborted && !expired) fail("aborted");
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
