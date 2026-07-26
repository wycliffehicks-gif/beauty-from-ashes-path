// Server function boundary for the Day 1 personalized reflection.
//
// Two modes:
//   - "curated": deterministic client-safe selection (no provider call).
//   - "live":    calls Lovable AI Gateway through the injected provider,
//                validates the response, retries once, then falls back.
//
// Feature flag: LIVE_AI_ENABLED (server-side env var).
//   - Absent  -> defaults to enabled (private founder test).
//   - "false" or "0" -> disables provider calls; live mode returns the
//     curated/founder-approved fallback. Curated mode is unaffected.
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

export function liveAiEnabled(): boolean {
  const raw = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.LIVE_AI_ENABLED;
  if (raw === undefined) return LIVE_AI_ENABLED_DEFAULT;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "false" || normalized === "0") return false;
  return true;
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
