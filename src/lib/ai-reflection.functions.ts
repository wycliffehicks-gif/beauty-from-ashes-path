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
        fallbackUsed: true;
        contentPackVersion: string;
        fallbackVersion: string;
        policyVersion: string;
        validatorVersion: string;
        safetyGateVersion: string;
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

/**
 * Pure core, exported for tests. Contains all decision logic. Does no I/O,
 * takes no dependencies on the request or environment beyond an explicit
 * `killSwitch` argument.
 */
export function computeReflection(
  rawInput: unknown,
  killSwitch: boolean,
): ReflectionServerResult {
  const parsed = ReflectionInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    // Distinguish text-too-long for clearer client UX, without echoing text.
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

  // Kill switch applies only to the "would-generate" path.
  if (killSwitch) {
    return { kind: "kill-switch" };
  }

  // Build the system policy so its assembly is exercised, then discard it.
  // In the current phase we never send it anywhere.
  buildSystemPolicy({
    input,
    contentPackVersion: DAY_01_CONTENT_PACK.version,
  });

  const output = buildDay01Fallback(input.spiritual);
  const check = validateReflectionOutput({
    output,
    spiritualPreference: input.spiritual,
  });
  if (!check.ok) {
    // A validation failure on our own hand-authored fallback is a build-time
    // bug, not a runtime user error. Return input-invalid so no partial or
    // unsafe content ever reaches the caller.
    return { kind: "input-invalid", reason: "schema" };
  }

  return {
    kind: "reflection",
    output,
    meta: {
      fallbackUsed: true,
      contentPackVersion: DAY_01_CONTENT_PACK_VERSION,
      fallbackVersion: DAY_01_FALLBACK_VERSION,
      policyVersion: SYSTEM_POLICY_VERSION,
      validatorVersion: VALIDATOR_VERSION,
      safetyGateVersion: SAFETY_GATE_VERSION,
      aiEnabled: false,
    },
  };
}

/**
 * Server function boundary. Not wired to any route or component yet.
 * Kept exported so future UI can call it without another migration.
 */
export const generateDay01Reflection = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data)
  .handler(async ({ data }): Promise<ReflectionServerResult> => {
    return computeReflection(data, killSwitchEnabled());
  });
