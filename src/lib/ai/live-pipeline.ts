// Live-AI pipeline for the Day 1 personalized reflection.
//
// Pure — takes a `LiveModelProvider` as an argument so tests can inject a
// mock. Never imports the concrete `.server.ts` provider. The server
// function is responsible for supplying the real provider.
//
// Order of operations, per Project Knowledge:
//   1. Schema check
//   2. Deterministic safety gate  (BEFORE any provider call)
//   3. Kill-switch → curated fallback
//   4. Build immutable, versioned system policy
//   5. Provider call
//   6. Deterministic post-generation validator
//   7. On failure, ONE corrective retry naming only the failed rule
//   8. On second failure, human-authored fallback
//
// User free text is never logged. Errors are surfaced as internal codes.

import { DAY_01_CONTENT_PACK, DAY_01_CONTENT_PACK_VERSION } from "@/content/ai/day-01";
import { buildDay01Fallback, DAY_01_FALLBACK_VERSION } from "@/content/ai/fallback-day-01";
import { getRegion } from "@/content/crisis-registry";
import type { ReflectionServerResult } from "@/lib/ai/compute";
import type { LiveModelProvider } from "@/lib/ai/live-provider";
import { ReflectionInputSchema } from "@/lib/ai/schemas";
import { runSafetyGate, SAFETY_GATE_VERSION } from "@/lib/ai/safety-gate";
import { buildSystemPolicy, SYSTEM_POLICY_VERSION } from "@/lib/ai/system-policy";
import type { ReflectionOutput } from "@/lib/ai/types";
import { validateReflectionOutput, VALIDATOR_VERSION } from "@/lib/ai/validator";

export const LIVE_PIPELINE_VERSION = "2026-07-25.1";

export interface LiveRunTelemetry {
  providerCalls: number;
  retried: boolean;
  fallbackUsed: boolean;
  validationFailure?: string;
  providerError?: string;
}

export interface RunLiveArgs {
  rawInput: unknown;
  provider: LiveModelProvider;
  /** true = call the provider; false = emergency switch, use curated fallback. */
  liveAiEnabled: boolean;
}

function buildPackPayload(): string {
  const p = DAY_01_CONTENT_PACK;
  return JSON.stringify({
    themes: p.themeStatements.map((t) => ({ id: t.id, text: t.text })),
    gentleSteps: p.gentleSteps.map((s) => ({ id: s.id, text: s.text })),
    oneHonestSteps: p.oneHonestSteps.map((s) => ({ id: s.id, text: s.text })),
    scriptures: p.scriptures.map((s) => ({
      id: s.id,
      reference: s.reference,
      reflection: s.reflection,
    })),
    prayers: p.prayers.map((pr) => ({ id: pr.id, text: pr.text })),
    supportReminders: p.supportReminders.map((r) => ({ id: r.id, text: r.text })),
  });
}

function baseMeta(aiEnabled: boolean, fallbackUsed: boolean) {
  return {
    fallbackUsed,
    curated: false,
    contentPackVersion: DAY_01_CONTENT_PACK_VERSION,
    fallbackVersion: DAY_01_FALLBACK_VERSION,
    policyVersion: SYSTEM_POLICY_VERSION,
    validatorVersion: VALIDATOR_VERSION,
    safetyGateVersion: SAFETY_GATE_VERSION,
    selectorVersion: LIVE_PIPELINE_VERSION,
    aiEnabled,
  };
}

export async function runLivePipeline(
  args: RunLiveArgs,
): Promise<{ result: ReflectionServerResult; telemetry: LiveRunTelemetry }> {
  const telemetry: LiveRunTelemetry = {
    providerCalls: 0,
    retried: false,
    fallbackUsed: false,
  };

  const parsed = ReflectionInputSchema.safeParse(args.rawInput);
  if (!parsed.success) {
    const tooLong = parsed.error.issues.some(
      (i) => i.path.join(".") === "freeText" && i.code === "too_big",
    );
    return {
      result: { kind: "input-invalid", reason: tooLong ? "text-too-long" : "schema" },
      telemetry,
    };
  }
  const input = parsed.data;

  const gate = runSafetyGate({
    roadType: input.roadType,
    emotion: input.emotion,
    energy: input.energy,
    notSafeNow: input.notSafeNow,
    adultConfirmed: input.adultConfirmed,
    freeText: input.freeText,
  });
  if (gate.result === "minor-not-eligible") {
    return { result: { kind: "minor-not-eligible" }, telemetry };
  }
  if (gate.result === "input-invalid") {
    return { result: { kind: "input-invalid", reason: "text-too-long" }, telemetry };
  }
  if (gate.result === "urgent-safety") {
    const region = getRegion(input.region);
    return {
      result: {
        kind: "urgent-safety",
        reasonCode: gate.reasonCode,
        region: {
          code: region.code,
          label: region.label,
          emergencyGuidance: region.emergencyGuidance,
        },
      },
      telemetry,
    };
  }

  // Emergency feature flag off — return curated fallback without any provider call.
  if (!args.liveAiEnabled) {
    telemetry.fallbackUsed = true;
    const output = buildDay01Fallback(input.spiritual);
    return {
      result: { kind: "reflection", output, meta: baseMeta(false, true) },
      telemetry,
    };
  }

  const { policy } = buildSystemPolicy({
    input,
    contentPackVersion: DAY_01_CONTENT_PACK_VERSION,
  });
  const packPayload = buildPackPayload();

  // Attempt 1
  let attempt = await args.provider.generate({ systemPolicy: policy, packPayload });
  telemetry.providerCalls += 1;

  let validation = attempt.ok
    ? validateReflectionOutput({
        output: attempt.raw,
        spiritualPreference: input.spiritual,
      })
    : ({ ok: false, failure: "schema-invalid" } as const);

  if (!attempt.ok) {
    telemetry.providerError = attempt.error;
  }

  // At most one corrective retry
  if (!validation.ok) {
    telemetry.retried = true;
    telemetry.validationFailure = validation.failure ?? "unknown";
    attempt = await args.provider.generate({
      systemPolicy: policy,
      packPayload,
      correctionNote: validation.failure ?? "unknown",
    });
    telemetry.providerCalls += 1;
    validation = attempt.ok
      ? validateReflectionOutput({
          output: attempt.raw,
          spiritualPreference: input.spiritual,
        })
      : ({ ok: false, failure: "schema-invalid" } as const);
    if (!attempt.ok && !telemetry.providerError) telemetry.providerError = attempt.error;
  }

  if (validation.ok && attempt.ok) {
    return {
      result: {
        kind: "reflection",
        output: attempt.raw as ReflectionOutput,
        meta: baseMeta(true, false),
      },
      telemetry,
    };
  }

  // Fall back to human-authored curated reflection
  telemetry.fallbackUsed = true;
  const output = buildDay01Fallback(input.spiritual);
  return {
    result: { kind: "reflection", output, meta: baseMeta(false, true) },
    telemetry,
  };
}
