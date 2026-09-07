// SERVER-ONLY transport for the current ten-day reflection.
//
// It speaks to the EXISTING Lovable AI Gateway with the EXISTING model id and
// nothing else: no new service, no new model, no database, no authentication.
//
// Rules this adapter keeps:
//  - one attempt, no automatic retry, no corrective second call;
//  - a single 45-second deadline that covers reading the whole response body;
//  - a finite bounded body, no redirects;
//  - only whitelisted failure codes leave here — no provider error body, no
//    exception text, no request payload is ever returned or logged.

import type {
  JourneyModelProvider,
  JourneyProviderRequest,
  JourneyProviderResponse,
} from "@/lib/ai/journey-generation";

export const JOURNEY_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

/** Hard ceiling on the response bytes read before the transport gives up. */
export const JOURNEY_MAX_RESPONSE_BYTES = 256 * 1024;

export interface JourneyTransportOptions {
  apiKey: string | undefined;
  /** Injected for tests. Defaults to the platform fetch. */
  fetchImpl?: typeof fetch;
}

async function readBounded(response: Response, limit: number): Promise<string | null> {
  const body = response.body;
  if (!body) return await response.text();
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value?.byteLength ?? 0;
      if (size > limit) return null;
      out += decoder.decode(chunk.value, { stream: true });
    }
    out += decoder.decode();
    return out;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}

function statusToCode(status: number): JourneyProviderResponse {
  if (status === 429) return { ok: false, error: "provider-rate-limited" };
  if (status === 402 || status === 403) return { ok: false, error: "provider-budget-exhausted" };
  return { ok: false, error: "provider-unavailable" };
}

/**
 * Create the live transport. It is constructed LAZILY by the caller, only after
 * every activation, readiness, admission, consent and request check has passed,
 * so a refused request makes zero gateway calls.
 */
export function createJourneyLiveTransport(
  options: JourneyTransportOptions,
): JourneyModelProvider {
  const doFetch = options.fetchImpl ?? fetch;

  return {
    provenance: "live-model",
    async generate(request: JourneyProviderRequest): Promise<JourneyProviderResponse> {
      if (!options.apiKey) return { ok: false, error: "provider-unavailable" };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), request.deadlineMs);

      try {
        const response = await doFetch(JOURNEY_GATEWAY_URL, {
          method: "POST",
          redirect: "error",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            "Lovable-API-Key": options.apiKey,
          },
          body: JSON.stringify({
            model: request.model,
            max_completion_tokens: request.maxOutputTokens,
            messages: [
              { role: "system", content: request.systemPolicy },
              { role: "user", content: request.groundedPayload },
            ],
          }),
        });

        if (!response.ok) return statusToCode(response.status);

        // The same deadline still applies: the timer is cleared only in finally.
        const text = await readBounded(response, JOURNEY_MAX_RESPONSE_BYTES);
        if (text === null) return { ok: false, error: "provider-invalid-output" };

        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          return { ok: false, error: "provider-invalid-output" };
        }
        if (typeof parsed !== "object" || parsed === null) {
          return { ok: false, error: "provider-invalid-output" };
        }
        const choices = (parsed as { choices?: unknown }).choices;
        const first = Array.isArray(choices) ? (choices[0] as unknown) : undefined;
        if (typeof first !== "object" || first === null) {
          return { ok: false, error: "provider-invalid-output" };
        }
        const message = (first as { message?: unknown }).message;
        const content =
          typeof message === "object" && message !== null
            ? (message as { content?: unknown }).content
            : undefined;

        return {
          ok: true,
          text: content,
          model: (parsed as { model?: unknown }).model,
          finishReason: (first as { finish_reason?: unknown }).finish_reason,
          usage: normalizeUsage((parsed as { usage?: unknown }).usage),
        };
      } catch (error) {
        // The thrown value is deliberately discarded, never logged or returned.
        const aborted =
          typeof error === "object" &&
          error !== null &&
          (error as { name?: unknown }).name === "AbortError";
        return { ok: false, error: aborted ? "provider-timeout" : "provider-network" };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Map only the numeric usage fields the core will accept. Invents nothing. */
function normalizeUsage(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const details = r.completion_tokens_details;
  const reasoning =
    typeof details === "object" && details !== null
      ? (details as Record<string, unknown>).reasoning_tokens
      : undefined;
  return {
    inputTokens: r.prompt_tokens,
    outputTokens: r.completion_tokens,
    reasoningTokens: reasoning,
    totalTokens: r.total_tokens,
  };
}
