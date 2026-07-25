// Server function boundary for the Day 1 personalized reflection.
// The pure decision logic lives in `@/lib/ai/compute` so the browser and
// tests can call it without pulling the server-fn RPC wrapper.

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

export const generateDay01Reflection = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data)
  .handler(async ({ data }): Promise<ReflectionServerResult> => {
    return computeReflection(data, killSwitchEnabled(), "curated");
  });
