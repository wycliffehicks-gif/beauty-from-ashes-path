/** Separate, one-batch candidate-v2 developer command. Default is dry; no participant route. */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { loadBoundPackV2 } from "../offline-ai/candidate-v2";
import { sha256 } from "../offline-ai/comparison";
import {
  createResultTemplate,
  importResults,
  makeImportedReview,
  importedReviewMarkdown,
} from "../offline-ai/result-exchange";
import {
  freshDirectory,
  readBoundedUtf8,
  writeFresh,
  writeFreshJson,
} from "../offline-ai/exchange-io";
import { createDirectOpenAITransport } from "./transport";
import { runSmoke, SMOKE_MODEL, PRICE_SOURCE } from "./smoke";
import {
  prepareV2Smoke,
  parsePriorReconciliation,
  reconcileOldMarker,
  V2_ATTEMPT_GUARD,
  V2_POLICY,
  V2_INSTRUCTION_SHA256,
} from "./v2-preflight";

interface Options {
  live: boolean;
  destination: string;
  priorReceiptPath?: string;
}
interface Dependencies {
  env?: NodeJS.ProcessEnv;
  artifactRoot?: string;
  transportFactory?: typeof createDirectOpenAITransport;
}
function requirePrivatePath(artifactRoot: string, path: string) {
  const rel = relative(artifactRoot, resolve(path));
  if (!rel || rel.startsWith("..") || isAbsolute(rel))
    throw new Error("path-must-be-private-artifact-subdirectory");
}

export async function runCandidateV2(options: Options, dependencies: Dependencies = {}) {
  const env = dependencies.env ?? process.env;
  const artifactRoot = resolve(dependencies.artifactRoot ?? "artifacts/direct-openai-smoke");
  requirePrivatePath(artifactRoot, options.destination);
  for (const name of ["JOURNEY_AI_ENABLED", "JOURNEY_AI_RELEASE_READY", "LIVE_AI_ENABLED"])
    if (["true", "1"].includes((env[name] ?? "").trim().toLowerCase()))
      throw new Error("participant-ai-must-stay-off");
  const bound = loadBoundPackV2();
  const { prepared, budget } = prepareV2Smoke(bound);
  let receiptRaw: string | undefined;
  let oldMarkerStatus: ReturnType<typeof reconcileOldMarker> | "not-inspected-dry-run" =
    "not-inspected-dry-run";
  if (options.live) {
    if (!options.priorReceiptPath) throw new Error("prior-reconciliation-required");
    requirePrivatePath(artifactRoot, options.priorReceiptPath);
    receiptRaw = readBoundedUtf8(options.priorReceiptPath);
    parsePriorReconciliation(receiptRaw);
    const oldMarker = `${artifactRoot}/LIVE_ATTEMPTED.json`;
    oldMarkerStatus = reconcileOldMarker(existsSync(oldMarker) ? readBoundedUtf8(oldMarker) : null);
    if (existsSync(`${artifactRoot}/${V2_ATTEMPT_GUARD}`)) throw new Error("v2-already-attempted");
  }
  // A dry run must neither read the API key nor construct a transport.
  const key = options.live ? env.OPENAI_API_KEY : undefined;
  if (options.live && !key?.trim()) throw new Error("missing-secure-key");
  const root = freshDirectory(options.destination);
  mkdirSync(`${root}/private`, { mode: 0o700 });
  mkdirSync(`${root}/review`, { mode: 0o700 });
  writeFreshJson(`${root}/private/input-export.json`, prepared.exported);
  writeFreshJson(`${root}/private/preflight.json`, {
    mode: options.live ? "direct-openai-fictional-smoke-v2" : "dry-run-no-provider-calls",
    createdAt: new Date().toISOString(),
    model: SMOKE_MODEL,
    reasoning: "none",
    cases: 3,
    policyVersion: V2_POLICY,
    candidateInstructionSha256: V2_INSTRUCTION_SHA256,
    ...budget,
    oldMarkerStatus,
    priceCheckedOn: "2026-10-09",
    priceSource: PRICE_SOURCE,
    priorHistoryClaim: options.live
      ? "reported-history-not-reconstructed-raw-evidence"
      : "fixed-known-history-pending-receipt",
    note: "Reservations retained across two prior batches; not billed costs or an account-wide cap. Missing old markers never establish zero prior calls. No purchases, auto-reload or participant activation.",
  });
  if (!options.live) {
    writeFreshJson(`${root}/private/results.json`, createResultTemplate(prepared.exported));
    return {
      mode: "dry-run" as const,
      budget,
      attempts: 0,
      complete: 0,
      reviewDirectory: `${root}/review`,
    };
  }
  writeFresh(`${root}/private/prior-reconciliation.json`, receiptRaw!);
  // Exclusive fixed marker precedes construction and every dispatch. Never delete to retry.
  writeFileSync(
    `${artifactRoot}/${V2_ATTEMPT_GUARD}`,
    JSON.stringify({
      createdAt: new Date().toISOString(),
      directory: root,
      model: SMOKE_MODEL,
      policyVersion: V2_POLICY,
      candidateInstructionSha256: V2_INSTRUCTION_SHA256,
      priorReconciliationSha256: sha256(receiptRaw!),
      ...budget,
    }) + "\n",
    { flag: "wx", mode: 0o600 },
  );
  const provider = (dependencies.transportFactory ?? createDirectOpenAITransport)({
    apiKey: key,
    model: SMOKE_MODEL,
    reasoningEffort: "none",
  });
  const { results, evidence } = await runSmoke({
    prepared,
    generate: (input) => provider.generate(input),
    beforeAttempt: (index, caseId) =>
      writeFreshJson(`${root}/private/attempt-${index + 1}-started.json`, {
        caseId,
        reservedUsd: prepared.reservations[index],
        startedAt: new Date().toISOString(),
      }),
    afterAttempt: (index, results, evidence) =>
      writeFreshJson(`${root}/private/attempt-${index + 1}-settled.json`, { results, evidence }),
  });
  writeFreshJson(`${root}/private/results.json`, results);
  writeFreshJson(`${root}/private/transport-evidence.json`, evidence);
  const imported = importResults(bound, JSON.stringify(prepared.exported), JSON.stringify(results));
  const { blind, key: reviewKey } = makeImportedReview(
    bound,
    imported,
    "bfa-openai-candidate-v2-2026-10-09",
  );
  writeFreshJson(`${root}/private/imported-records.json`, imported);
  writeFreshJson(`${root}/private/unblinding-key.json`, reviewKey);
  writeFreshJson(`${root}/review/blind-review.json`, blind);
  writeFresh(`${root}/review/blind-review.md`, importedReviewMarkdown(blind));
  return {
    mode: "live" as const,
    budget,
    attempts: evidence.length,
    complete: results.results.filter((row) => row.status === "complete").length,
    modelMismatch: evidence.some((item) => item.modelMismatch),
    reviewDirectory: `${root}/review`,
  };
}

async function main() {
  let live = false;
  const values = new Map<string, string>();
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === "--run" && !live) live = true;
    else if (
      ["--out", "--prior-reconciliation"].includes(flag) &&
      !values.has(flag) &&
      args[i + 1] &&
      !args[i + 1].startsWith("--")
    )
      values.set(flag, args[++i]);
    else throw new Error("invalid-options");
  }
  const destination = values.get("--out");
  if (!destination) throw new Error("missing-output-directory");
  const result = await runCandidateV2({
    live,
    destination,
    priorReceiptPath: values.get("--prior-reconciliation"),
  });
  console.log(
    `${result.mode}: ${result.attempts} attempt(s), ${result.complete} complete. New reservation USD ${result.budget.newReservationUsd.toFixed(9)}; cumulative USD ${result.budget.cumulativeReservationUsd.toFixed(9)} of original USD 0.05. Billed cost unverified; participant AI stays off.`,
  );
  if (result.mode === "live" && (result.complete !== 3 || result.modelMismatch))
    process.exitCode = 3;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    console.error(
      "Candidate-v2 test stopped. Preserve all guards and attempt records; no automatic retry was made.",
    );
    process.exitCode = 1;
  });
}
