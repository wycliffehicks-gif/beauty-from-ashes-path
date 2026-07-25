// Server function skeleton for the Day 1 personalized reflection.
//
// PHASE: fallback-only. No AI provider is connected. No model is called.
// This function exists so the input schema, safety gate, policy builder,
// validator, and fallback are wired end-to-end and testable.
//
// Behaviour:
//   1. Validate input with the strict Zod schema.
//   2. Run the deterministic safety gate.
//   3. If urgent/minor/invalid, return a typed deterministic result.
//   4. If clear, build the system policy (constructed and discarded — never
//      sent anywhere in this phase), then return the human-authored Day 1
//      fallback through the strict output schema and validator.
//   5. Never log free text or output content.
//   6. Honour a hard kill switch that defaults to AI disabled.
//
// This function is NOT called from any route yet.

import { createServerFn } from "@tanstack/react-start";
import { DAY_01_CONTENT_PACK, DAY_01_CONTENT_PACK_VERSION } from "@/content/ai/day-01";
import { buildDay01Fallback, DAY_01_FALLBACK_VERSION } from "@/content/ai/fallback-day-01";
import { getRegion } from "@/content/crisis-registry";
import { ReflectionInputSchema, type ReflectionInput } from "@/lib/ai/schemas";
import { runSafetyGate, SAFETY_GATE_VERSION } from "@/lib/ai/safety-gate";
import { selectDay01Reflection, SELECT_DAY_01_VERSION } from "@/lib/ai/select-day-01";
import { buildSystemPolicy, SYSTEM_POLICY_VERSION } from "@/lib/ai/system-policy";
import { validateReflectionOutput, VALIDATOR_VERSION } from "@/lib/ai/validator";
import type { ReflectionOutput } from "@/lib/ai/types";

export const AI_REFLECTION_KILL_SWITCH_DEFAULT = true; // AI disabled by default.

export type ReflectionServerResult =
  | {
      kind: "input-invalid";
      reason: "schema" | "text-too-long";
    }
  | {
      kind: "minor-not-eligible";
    }
  | {
      kind: "urgent-safety";
      reasonCode: string;
      region: {
        code: "CA" | "GLOBAL";
        label: string;
        emergencyGuidance: string;
      };
    }
  | {
      kind: "kill-switch";
    }
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
        aiEnabled: false;
      };
    };

function killSwitchEnabled(): boolean {
  // Reading inside the handler is intentional: process.env is per-request on
  // Workers, and reading it lazily lets tests stub via globalThis.process.
  const raw = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.AI_KILL_SWITCH;
  if (raw === undefined) return AI_REFLECTION_KILL_SWITCH_DEFAULT;
  return raw !== "false" && raw !== "0";
}

export type ReflectionMode = "auto" | "curated";

/**
 * Pure core, exported for tests. Contains all decision logic. Does no I/O.
 *
 * @param killSwitch  When true and mode is "auto", blocks the would-generate
 *                    path (kill-switch result). "curated" bypasses this gate
 *                    because it never calls a model — it only selects from
 *                    the approved content pack.
 * @param mode        "auto" (default): use the human-authored fallback.
 *                    "curated": run the deterministic selector over the
 *                    Day 1 content pack, then validate; fall back if the
 *                    validator rejects the result.
 */
export function computeReflection(
  rawInput: unknown,
  killSwitch: boolean,
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
  if (gate.result === "input-invalid") {
    return { kind: "input-invalid", reason: "text-too-long" };
  }
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

  // Kill switch only gates the AI/would-generate path (mode "auto"). The
  // curated deterministic selector calls no model and is always allowed.
  if (killSwitch && mode === "auto") {
    return { kind: "kill-switch" };
  }

  // Assemble the system policy so its construction stays exercised; it is
  // discarded — never sent anywhere in this phase.
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
  if (!finalCheck.ok) {
    return { kind: "input-invalid", reason: "schema" };
  }

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

/**
 * Server function boundary. Callable from the Day 1 reflection preview.
 */
export const generateDay01Reflection = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data)
  .handler(async ({ data }): Promise<ReflectionServerResult> => {
    // Curated deterministic mode for the private preview. Live model path
    // remains disabled by the kill switch until provider approval.
    return computeReflection(data, killSwitchEnabled(), "curated");
  });
