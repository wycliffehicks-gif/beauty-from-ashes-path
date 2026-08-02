// Pure Day 1 reflection compute logic.
//
// Client-safe: imports no server-only modules and no TanStack server-fn
// helpers. Kept separate from `ai-reflection.functions.ts` so the browser
// can call it directly in the current no-provider phase without pulling
// the server-fn RPC wrapper into the client bundle.

import { DAY_01_CONTENT_PACK, DAY_01_CONTENT_PACK_VERSION } from "@/content/ai/day-01";
import { buildDay01Fallback, DAY_01_FALLBACK_VERSION } from "@/content/ai/fallback-day-01";
import { getRegion } from "@/content/crisis-registry";
import { ReflectionInputSchema, type ReflectionInput } from "@/lib/ai/schemas";
import { runSafetyGate, SAFETY_GATE_VERSION } from "@/lib/ai/safety-gate";
import { selectDay01Reflection, SELECT_DAY_01_VERSION } from "@/lib/ai/select-day-01";
import { buildSystemPolicy, SYSTEM_POLICY_VERSION } from "@/lib/ai/system-policy";
import { validateReflectionOutput, VALIDATOR_VERSION } from "@/lib/ai/validator";
import type { ReflectionOutput } from "@/lib/ai/types";

// Dormant-module feature flag default. These AI modules are NOT wired into the
// app: nothing in the customer-facing journey imports or calls them, and there
// is no provider, gateway, endpoint or network call in the shipped product.
//
// The default is `false` so the flag FAILS CLOSED. Absence, a blank value or any
// unrecognized value must stay disabled; only the exact documented values
// "true" or "1" (case-insensitively) may ever enable it. Accidental activation
// is therefore impossible without a deliberate, documented env change.
export const LIVE_AI_ENABLED_DEFAULT = false;


export type ReflectionServerResult =
  | { kind: "input-invalid"; reason: "schema" | "text-too-long" }
  | { kind: "minor-not-eligible" }
  | {
      kind: "urgent-safety";
      reasonCode: string;
      region: { code: "CA" | "GLOBAL"; label: string; emergencyGuidance: string };
    }
  | { kind: "live-ai-disabled" }
  | {
      kind: "reflection";
      output: ReflectionOutput;
      meta: {
        fallbackUsed: boolean;
        curated: boolean;
        contentPackVersion: string;
        fallbackVersion: string;
        policyVersion: string;
        validatorVersion: string;
        safetyGateVersion: string;
        selectorVersion: string;
        aiEnabled: boolean;
      };

    };

export type ReflectionMode = "auto" | "curated";

export function computeReflection(
  rawInput: unknown,
  liveAiEnabled: boolean,
  mode: ReflectionMode = "auto",
): ReflectionServerResult {
  const parsed = ReflectionInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const tooLong = parsed.error.issues.some(
      (i) => i.path.join(".") === "freeText" && i.code === "too_big",
    );
    return { kind: "input-invalid", reason: tooLong ? "text-too-long" : "schema" };
  }
  const input: ReflectionInput = parsed.data;

  const gate = runSafetyGate({
    roadType: input.roadType,
    emotion: input.emotion,
    energy: input.energy,
    notSafeNow: input.notSafeNow,
    adultConfirmed: input.adultConfirmed,
    freeText: input.freeText,
  });

  if (gate.result === "minor-not-eligible") return { kind: "minor-not-eligible" };
  if (gate.result === "input-invalid") return { kind: "input-invalid", reason: "text-too-long" };
  if (gate.result === "urgent-safety") {
    const region = getRegion(input.region);
    return {
      kind: "urgent-safety",
      reasonCode: gate.reasonCode,
      region: {
        code: region.code,
        label: region.label,
        emergencyGuidance: region.emergencyGuidance,
      },
    };
  }

  if (!liveAiEnabled && mode === "auto") return { kind: "live-ai-disabled" };

  buildSystemPolicy({ input, contentPackVersion: DAY_01_CONTENT_PACK.version });

  let output: ReflectionOutput;
  let curated = false;
  let fallbackUsed = true;

  if (mode === "curated") {
    const selected = selectDay01Reflection(input);
    const check = validateReflectionOutput({
      output: selected,
      spiritualPreference: input.spiritual,
    });
    if (check.ok) {
      output = selected;
      curated = true;
      fallbackUsed = false;
    } else {
      output = buildDay01Fallback(input.spiritual);
    }
  } else {
    output = buildDay01Fallback(input.spiritual);
  }

  const finalCheck = validateReflectionOutput({
    output,
    spiritualPreference: input.spiritual,
  });
  if (!finalCheck.ok) return { kind: "input-invalid", reason: "schema" };

  return {
    kind: "reflection",
    output,
    meta: {
      fallbackUsed,
      curated,
      contentPackVersion: DAY_01_CONTENT_PACK_VERSION,
      fallbackVersion: DAY_01_FALLBACK_VERSION,
      policyVersion: SYSTEM_POLICY_VERSION,
      validatorVersion: VALIDATOR_VERSION,
      safetyGateVersion: SAFETY_GATE_VERSION,
      selectorVersion: SELECT_DAY_01_VERSION,
      aiEnabled: false,
    },
  };
}
