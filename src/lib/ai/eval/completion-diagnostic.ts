// Pure helpers for the fixed completion-diagnostic profile.
//
// Engineering only. No network, no storage, no participant imports. Kept
// separate from the runner script so tests can exercise the logic without
// executing the script.

import type { EvalFixtureId } from "@/lib/ai/eval/fixtures";
import { classifyEvalIssues, EVAL_PROFILES, type EvalRunRecord } from "@/lib/ai/eval/harness";

/** Fixed output directory. Never the legacy artefact paths. */
export const DIAGNOSTIC_OUT_DIR = "artifacts/ai-eval/completion-diagnostic-v1";
export const DIAGNOSTIC_PROFILE_ID = "completion-diagnostic-v1" as const;

export const DIAGNOSTIC_PROFILE = EVAL_PROFILES[DIAGNOSTIC_PROFILE_ID];
export const DIAGNOSTIC_FIXTURE_ORDER =
  DIAGNOSTIC_PROFILE.fixtures as readonly EvalFixtureId[];

export interface DiagnosticEntry {
  fixtureId: EvalFixtureId;
  attempted: boolean;
  /** Set only when the fixture was never attempted. */
  notAttemptedReason?: string;
  /** Retained only when the provider returned a numeric count. */
  reasoningTokens?: number;
  reasoningTokensStatus: "returned" | "unavailable" | "n/a";
  wordCount?: number;
  record?: EvalRunRecord;
}

export function diagnosticWordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** True when this attempt must stop the whole diagnostic immediately. */
export function shouldStopAfter(record: EvalRunRecord): boolean {
  if (record.status === "failure" || record.status === "rejected") return true;
  if (record.validationIssues.length > 0) return true;
  if (classifyEvalIssues(record.validationIssues).seriousPolicyIssue) return true;
  if (record.requestedModel && record.returnedModel) {
    if (record.returnedModel !== record.requestedModel) return true;
  }

  return false;
}

export function summariseEntry(record: EvalRunRecord): DiagnosticEntry {
  const reasoning = record.usage?.reasoningTokens;
  return {
    fixtureId: record.fixtureId,
    attempted: true,
    ...(typeof reasoning === "number" ? { reasoningTokens: reasoning } : {}),
    reasoningTokensStatus: typeof reasoning === "number" ? "returned" : "unavailable",
    ...(record.output ? { wordCount: diagnosticWordCount(record.output) } : {}),
    record,
  };
}

export function diagnosticEnvelope(entries: DiagnosticEntry[]) {
  return {
    profileId: DIAGNOSTIC_PROFILE.id,
    profileVersion: DIAGNOSTIC_PROFILE.version,
    caps: {
      maxOutputTokens: DIAGNOSTIC_PROFILE.maxOutputTokens,
      maxCalls: DIAGNOSTIC_PROFILE.maxCalls,
      inputCharCap: DIAGNOSTIC_PROFILE.inputCharCap,
      timeoutMs: DIAGNOSTIC_PROFILE.timeoutMs,
    },
    fixtureOrder: DIAGNOSTIC_FIXTURE_ORDER,
    entries,
  };
}
