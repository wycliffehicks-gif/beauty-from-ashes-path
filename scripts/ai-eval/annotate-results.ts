// OFFLINE annotation of the historical evaluation run. Engineering only.
//
// Makes ZERO network calls and NO model calls. It regenerates nothing, invents
// no finish_reason and no reasoning-token statistics. Every original output,
// metadata field and original validation field is preserved exactly as the
// historical record; the review conclusion is added as a clearly labelled
// separate `offlineRevalidation` block.
//
// Usage: bun scripts/ai-eval/annotate-results.ts

import { readFileSync, writeFileSync } from "node:fs";
import {
  EVAL_VALIDATOR_VERSION,
  classifyEvalIssues,
  validateEvalOutput,
} from "@/lib/ai/eval/harness";

const RESULTS_PATH = "artifacts/ai-eval/results.json";

interface HistoricalRecord {
  fixtureId?: string;
  status?: string;
  output?: string;
  validationIssues?: string[];
  finishReason?: string;
  manifest?: { spiritualAuthorised?: boolean };
  offlineRevalidation?: unknown;
  [key: string]: unknown;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const records = JSON.parse(readFileSync(RESULTS_PATH, "utf8")) as HistoricalRecord[];

for (const record of records) {
  const output = typeof record.output === "string" ? record.output : "";
  const spiritualAuthorised = Boolean(record.manifest?.spiritualAuthorised);
  const validation = output
    ? validateEvalOutput(output, { spiritualAuthorised })
    : { ok: false, issues: ["empty-output"] };
  const classified = classifyEvalIssues(validation.issues);

  record.offlineRevalidation = {
    label:
      "OFFLINE revalidation of the historical run — no model call, no regeneration, no network request.",
    validatorVersion: EVAL_VALIDATOR_VERSION,
    historicalRecordPreserved: true,
    historicalStatus: record.status ?? null,
    historicalValidationIssues: record.validationIssues ?? [],
    historicalFinishReasonSaved: typeof record.finishReason === "string",
    accepted: false,
    reviewRequired: true,
    issues: validation.issues,
    outputWordCount: wordCount(output),
    summary: classified.summary,
    notes: [
      "This record was produced BEFORE post-run truncation detection existed, so its original validationIssues array is empty and no finish_reason was saved. It was never originally validated against the current checks.",
      "The saved output is a short unfinished fragment and is NOT acceptable as a finished reflection.",
      "It is reasonable to infer the 1200-token engineering output cap contributed to the incompleteness, but the saved usage has no reasoning-token breakdown and no finish_reason, so no exact internal-thinking allocation is directly verified here.",
      "The 1200-token cap was an engineering test limit for this bounded harness, not a founder refusal or a consent boundary.",
      "Structural flags do not establish emotional or clinical safety, and a flagged phrase is not necessarily harmful; a human reviewer reads the retained fictional output.",
    ],
  };
}

writeFileSync(RESULTS_PATH, JSON.stringify(records, null, 2) + "\n");
console.log(`Annotated ${records.length} historical records offline. No model calls.`);
