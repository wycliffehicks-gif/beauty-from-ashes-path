// Live-AI pipeline for the Week 1 session reflection (stage 6).
//
// Pure — the provider is injected so tests can supply a mock. Never imports
// the concrete `.server.ts` provider.
//
// Order of operations:
//   1. Strict schema check on input.
//   2. Deterministic safety precheck — BEFORE any provider call.
//   3. Feature flag off -> curated reflection, no provider call.
//   4. Immutable versioned policy + approved content pack.
//   5. Provider call.
//   6. Deterministic validator.
//   7. At most ONE corrective retry naming only the failed rule.
//   8. On second failure -> curated reflection (never an error page).
//
// The user's note is never logged and never persisted here.

import {
  SESSION_W1_CONTENT_PACK,
  SESSION_W1_PACK_VERSION,
} from "@/content/ai/session-week-01";
import { getRegion } from "@/content/crisis-registry";
import type { LiveModelProvider } from "@/lib/ai/live-provider";
import { runSafetyGate, SAFETY_GATE_VERSION } from "@/lib/ai/safety-gate";
import {
  buildCuratedReflection,
  CURATED_SELECTOR_VERSION,
  type SessionReflectionOutput,
} from "@/lib/session/curated-reflection";
import { buildSessionPolicy, SESSION_POLICY_VERSION } from "@/lib/session/session-policy";
import { SessionReflectionInputSchema } from "@/lib/session/session-schemas";
import {
  SESSION_VALIDATOR_VERSION,
  validateSessionReflection,
} from "@/lib/session/session-validator";

export const SESSION_PIPELINE_VERSION = "2026-07-30.1";

export interface SessionReflectionMeta {
  source: "ai" | "curated";
  fallbackUsed: boolean;
  packVersion: string;
  policyVersion: string;
  validatorVersion: string;
  safetyGateVersion: string;
  selectorVersion: string;
  pipelineVersion: string;
}

export type SessionReflectionResult =
  | { kind: "reflection"; output: SessionReflectionOutput; meta: SessionReflectionMeta }
  | { kind: "input-invalid"; reason: string }
  | {
      kind: "urgent-safety";
      reasonCode: string;
      region: { code: string; label: string; emergencyGuidance: string };
    };

export interface SessionRunTelemetry {
  providerCalls: number;
  retried: boolean;
  fallbackUsed: boolean;
  validationFailure?: string;
  providerError?: string;
}

export interface RunSessionArgs {
  rawInput: unknown;
  provider: LiveModelProvider;
  /** false = emergency switch; return the curated reflection with no call. */
  liveAiEnabled: boolean;
}

function buildPackPayload(): string {
  const p = SESSION_W1_CONTENT_PACK;
  const strip = (list: Array<{ id: string; text: string }>) =>
    list.map((i) => ({ id: i.id, approvedMeaning: i.text }));
  return JSON.stringify({
    hearing: strip(p.hearing),
    pulls: strip(p.pulls),
    protection: strip(p.protection),
    cost: strip(p.cost),
    holding: strip(p.holding),
    support: strip(p.supportReminders),
  });
}

function meta(source: "ai" | "curated"): SessionReflectionMeta {
  return {
    source,
    fallbackUsed: source === "curated",
    packVersion: SESSION_W1_PACK_VERSION,
    policyVersion: SESSION_POLICY_VERSION,
    validatorVersion: SESSION_VALIDATOR_VERSION,
    safetyGateVersion: SAFETY_GATE_VERSION,
    selectorVersion: CURATED_SELECTOR_VERSION,
    pipelineVersion: SESSION_PIPELINE_VERSION,
  };
}

export async function runSessionPipeline(args: RunSessionArgs): Promise<{
  result: SessionReflectionResult;
  telemetry: SessionRunTelemetry;
}> {
  const telemetry: SessionRunTelemetry = {
    providerCalls: 0,
    retried: false,
    fallbackUsed: false,
  };

  const parsed = SessionReflectionInputSchema.safeParse(args.rawInput);
  if (!parsed.success) {
    return { result: { kind: "input-invalid", reason: "schema" }, telemetry };
  }
  const input = parsed.data;

  // 2. Deterministic safety precheck, before any provider call. Reuses the
  //    Day 1 gate unchanged — the gate is a pure function with no Day 1
  //    coupling beyond its input shape.
  const gate = runSafetyGate({
    roadType: "not-sure",
    emotion: "uncertainty",
    energy: "some",
    notSafeNow: input.notSafeNow,
    adultConfirmed: input.adultConfirmed,
    freeText: input.note,
  });
  if (gate.result === "urgent-safety" || gate.result === "minor-not-eligible") {
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
  if (gate.result === "input-invalid") {
    return { result: { kind: "input-invalid", reason: "text-too-long" }, telemetry };
  }

  const curated = () =>
    buildCuratedReflection({
      naming: input.naming,
      exploration: input.exploration,
      meaning: input.meaning,
      noticing: input.noticing,
      hasNote: Boolean(input.note),
    });

  if (!args.liveAiEnabled) {
    telemetry.fallbackUsed = true;
    return {
      result: { kind: "reflection", output: curated(), meta: meta("curated") },
      telemetry,
    };
  }

  const { policy } = buildSessionPolicy({
    input,
    contentPackVersion: SESSION_W1_PACK_VERSION,
  });
  const packPayload = buildPackPayload();

  let attempt = await args.provider.generate({ systemPolicy: policy, packPayload });
  telemetry.providerCalls += 1;
  if (!attempt.ok) telemetry.providerError = attempt.error;

  let validation = attempt.ok
    ? validateSessionReflection(attempt.raw)
    : ({ ok: false, failure: "schema-invalid" } as const);

  if (!validation.ok) {
    telemetry.retried = true;
    telemetry.validationFailure = validation.failure ?? "unknown";
    attempt = await args.provider.generate({
      systemPolicy: policy,
      packPayload,
      correctionNote: validation.failure ?? "unknown",
    });
    telemetry.providerCalls += 1;
    if (!attempt.ok && !telemetry.providerError) telemetry.providerError = attempt.error;
    validation = attempt.ok
      ? validateSessionReflection(attempt.raw)
      : ({ ok: false, failure: "schema-invalid" } as const);
  }

  if (validation.ok && attempt.ok) {
    return {
      result: {
        kind: "reflection",
        output: attempt.raw as SessionReflectionOutput,
        meta: meta("ai"),
      },
      telemetry,
    };
  }

  telemetry.fallbackUsed = true;
  return {
    result: { kind: "reflection", output: curated(), meta: meta("curated") },
    telemetry,
  };
}
