// Server function boundary for the Day 1 personalized reflection.
//
// DORMANT. Nothing in the customer-facing First Journey imports or calls this
// module, and the shipped product makes no provider, gateway or network call.
//
// Two modes:
//   - "curated": deterministic client-safe selection (no provider call).
//   - "live":    calls Lovable AI Gateway through the injected provider,
//                validates the response, retries once, then falls back.
//
// Feature flag: LIVE_AI_ENABLED (server-side env var). It FAILS CLOSED.
//   - Absent, blank or any unrecognized value -> disabled.
//   - Exactly "true" or "1" (case-insensitive, trimmed) -> enabled.
// Anything else, including "false", "0", "yes", "on" or a typo, stays disabled,
// so accidental activation is not possible.
//
// The live provider (`live-provider.server.ts`) is imported dynamically
// inside the handler so its module is never bundled for the browser and
// no API key reaches the client.

import { createServerFn } from "@tanstack/react-start";
import {
  LIVE_AI_ENABLED_DEFAULT,
  computeReflection,
  type ReflectionServerResult,
} from "@/lib/ai/compute";

export {
  LIVE_AI_ENABLED_DEFAULT,
  computeReflection,
  type ReflectionServerResult,
  type ReflectionMode,
} from "@/lib/ai/compute";

/** The single documented set of values that may enable a dormant AI module. */
export const LIVE_AI_ENABLED_VALUES = ["true", "1"] as const;

export function liveAiEnabled(): boolean {
  const raw = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.LIVE_AI_ENABLED;
  if (typeof raw !== "string") return LIVE_AI_ENABLED_DEFAULT;
  const normalized = raw.trim().toLowerCase();
  if (normalized.length === 0) return LIVE_AI_ENABLED_DEFAULT;
  return (LIVE_AI_ENABLED_VALUES as readonly string[]).includes(normalized);
}


type CallShape = { input: unknown; mode?: "curated" | "live" };

export const generateDay01Reflection = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as CallShape)
  .handler(async ({ data }): Promise<ReflectionServerResult> => {
    const mode = data?.mode === "live" ? "live" : "curated";

    if (mode === "curated") {
      // Curated mode is unaffected by the live-AI feature flag; pass `true`
      // so `computeReflection` never returns `live-ai-disabled` for curated.
      return computeReflection(data?.input, true, "curated");
    }

    // Live mode — dynamic import so the .server module never enters the
    // client bundle. The provider owns all network I/O; the pipeline owns
    // safety, validation, retry, and fallback.
    const [{ runLivePipeline }, { createLovableAiProvider }] = await Promise.all([
      import("@/lib/ai/live-pipeline"),
      import("@/lib/ai/live-provider.server"),
    ]);

    const apiKey = (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env?.LOVABLE_API_KEY;

    const provider = createLovableAiProvider(apiKey);
    const { result } = await runLivePipeline({
      rawInput: data?.input,
      provider,
      liveAiEnabled: liveAiEnabled(),
    });
    return result;
  });
