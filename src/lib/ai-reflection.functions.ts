// Server function boundary for the Day 1 personalized reflection.
//
// Two modes:
//   - "curated": deterministic client-safe selection (no provider call).
//   - "live":    calls Lovable AI Gateway through the injected provider,
//                validates the response, retries once, then falls back.
//
// The live provider (`live-provider.server.ts`) is imported dynamically
// inside the handler so its module is never bundled for the browser and
// no API key reaches the client.

import { createServerFn } from "@tanstack/react-start";
import {
  AI_REFLECTION_KILL_SWITCH_DEFAULT,
  computeReflection,
  type ReflectionServerResult,
} from "@/lib/ai/compute";

export {
  AI_REFLECTION_KILL_SWITCH_DEFAULT,
  computeReflection,
  type ReflectionServerResult,
  type ReflectionMode,
} from "@/lib/ai/compute";

function killSwitchEnabled(): boolean {
  const raw = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.AI_KILL_SWITCH;
  if (raw === undefined) return AI_REFLECTION_KILL_SWITCH_DEFAULT;
  return raw !== "false" && raw !== "0";
}

type CallShape = { input: unknown; mode?: "curated" | "live" };

export const generateDay01Reflection = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as CallShape)
  .handler(async ({ data }): Promise<ReflectionServerResult> => {
    const mode = data?.mode === "live" ? "live" : "curated";

    if (mode === "curated") {
      return computeReflection(data?.input, killSwitchEnabled(), "curated");
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
      killSwitch: killSwitchEnabled(),
    });
    return result;
  });
