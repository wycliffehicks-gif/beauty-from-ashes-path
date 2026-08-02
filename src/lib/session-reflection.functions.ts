// Server-function boundary for the Week 1 session reflection (stage 6).
//
// DORMANT. Nothing in the customer-facing First Journey imports or calls this
// module, and the shipped product makes no provider, gateway or network call.
//
// Nothing is persisted. The input is used for one response and discarded.
// The provider module is imported dynamically so no key or gateway code
// reaches the browser bundle.
//
// The LIVE_AI_ENABLED flag FAILS CLOSED: absence, a blank value or any
// unrecognized value stays disabled, and only the exact documented values
// "true" or "1" (case-insensitive, trimmed) may enable it.

import { createServerFn } from "@tanstack/react-start";
import { LIVE_AI_ENABLED_DEFAULT } from "@/lib/ai/compute";
import { LIVE_AI_ENABLED_VALUES } from "@/lib/ai-reflection.functions";
import type { SessionReflectionResult } from "@/lib/session/session-pipeline";

export type { SessionReflectionResult } from "@/lib/session/session-pipeline";

export function sessionLiveAiEnabled(): boolean {
  const raw = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.LIVE_AI_ENABLED;
  if (typeof raw !== "string") return LIVE_AI_ENABLED_DEFAULT;
  const normalized = raw.trim().toLowerCase();
  if (normalized.length === 0) return LIVE_AI_ENABLED_DEFAULT;
  return (LIVE_AI_ENABLED_VALUES as readonly string[]).includes(normalized);
}


export const generateSessionReflection = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as { input: unknown })
  .handler(async ({ data }): Promise<SessionReflectionResult> => {
    const [{ runSessionPipeline }, { createSessionAiProvider }] = await Promise.all([
      import("@/lib/session/session-pipeline"),
      import("@/lib/session/session-provider.server"),
    ]);

    const apiKey = (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env?.LOVABLE_API_KEY;

    const { result } = await runSessionPipeline({
      rawInput: data?.input,
      provider: createSessionAiProvider(apiKey),
      liveAiEnabled: sessionLiveAiEnabled(),
    });
    return result;
  });
