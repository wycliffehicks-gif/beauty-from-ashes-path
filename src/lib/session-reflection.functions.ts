// Server-function boundary for the Week 1 session reflection (stage 6).
//
// Nothing is persisted. The input is used for one response and discarded.
// The provider module is imported dynamically so no key or gateway code
// reaches the browser bundle.

import { createServerFn } from "@tanstack/react-start";
import { LIVE_AI_ENABLED_DEFAULT } from "@/lib/ai/compute";
import type { SessionReflectionResult } from "@/lib/session/session-pipeline";

export type { SessionReflectionResult } from "@/lib/session/session-pipeline";

export function sessionLiveAiEnabled(): boolean {
  const raw = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.LIVE_AI_ENABLED;
  if (raw === undefined) return LIVE_AI_ENABLED_DEFAULT;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "false" || normalized === "0") return false;
  return true;
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
