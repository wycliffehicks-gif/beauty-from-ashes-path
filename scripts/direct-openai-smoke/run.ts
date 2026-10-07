/** Node 24: node --import ./scripts/direct-openai-smoke/register.mjs scripts/direct-openai-smoke/run.ts --out artifacts/direct-openai-smoke/RUN_NAME [--run] */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { loadBoundPack } from "../offline-ai/comparison";
import {
  createResultTemplate,
  importResults,
  makeImportedReview,
  importedReviewMarkdown,
} from "../offline-ai/result-exchange";
import { freshDirectory, writeFresh, writeFreshJson } from "../offline-ai/exchange-io";
import { createDirectOpenAITransport } from "./transport";
import {
  prepareSmoke,
  runSmoke,
  SMOKE_MODEL,
  SMOKE_BUDGET_USD,
  PRICE_CHECKED_ON,
  PRICE_SOURCE,
} from "./smoke";

async function main() {
  let live = false;
  let destination: string | undefined;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--run" && !live) live = true;
    else if (args[i] === "--out" && !destination && args[i + 1] && !args[i + 1].startsWith("--"))
      destination = args[++i];
    else throw new Error("invalid-options");
  }
  if (!destination) throw new Error("missing-output-directory");
  const artifactRoot = resolve("artifacts/direct-openai-smoke");
  const relativePath = relative(artifactRoot, resolve(destination));
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath))
    throw new Error("output-must-be-private-artifact-subdirectory");
  for (const name of ["JOURNEY_AI_ENABLED", "JOURNEY_AI_RELEASE_READY", "LIVE_AI_ENABLED"])
    if (["true", "1"].includes((process.env[name] ?? "").trim().toLowerCase()))
      throw new Error("participant-ai-must-stay-off");
  const bound = loadBoundPack();
  const prepared = prepareSmoke(bound);
  // Dry-run never reads a credential or constructs a live transport.
  const key = live ? process.env.OPENAI_API_KEY : undefined;
  if (live && !key?.trim()) {
    console.error(
      "OPENAI_API_KEY is missing. Add it through Lovable's secure Secrets form, never chat.",
    );
    process.exitCode = 2;
    return;
  }
  const root = freshDirectory(destination);
  mkdirSync(`${root}/private`, { mode: 0o700 });
  mkdirSync(`${root}/review`, { mode: 0o700 });
  writeFreshJson(`${root}/private/input-export.json`, prepared.exported);
  writeFreshJson(`${root}/private/preflight.json`, {
    mode: live ? "direct-openai-fictional-smoke" : "dry-run-no-provider-calls",
    createdAt: new Date().toISOString(),
    model: SMOKE_MODEL,
    cases: 3,
    estimatedReservationUsd: prepared.reservedUsd,
    engineeringAllowanceUsd: SMOKE_BUDGET_USD,
    priceCheckedOn: PRICE_CHECKED_ON,
    priceSource: PRICE_SOURCE,
    note: "Engineering estimate, not a provider-enforced or account-wide cap. No purchases or auto-reload. A timeout may still be billed. This is not participant activation.",
  });
  if (!live) {
    writeFreshJson(`${root}/private/results.json`, createResultTemplate(prepared.exported));
    console.log(
      `Dry run passed: 3 source-bound fictional cases; 0 provider calls. Estimated total reservation USD ${prepared.reservedUsd.toFixed(6)}. Model access remains unverified.`,
    );
    return;
  }
  // Persistent local one-batch guard. Never delete to retry an uncertain/failed request.
  // This is not distributed participant usage accounting; workspace loss needs reconciliation.
  writeFileSync(
    `${artifactRoot}/LIVE_ATTEMPTED.json`,
    JSON.stringify({ createdAt: new Date().toISOString(), directory: root, model: SMOKE_MODEL }) +
      "\n",
    { flag: "wx", mode: 0o600 },
  );
  const provider = createDirectOpenAITransport({
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
    "bfa-openai-smoke-2026-10-07",
  );
  writeFreshJson(`${root}/private/imported-records.json`, imported);
  writeFreshJson(`${root}/private/unblinding-key.json`, reviewKey);
  writeFreshJson(`${root}/review/blind-review.json`, blind);
  writeFresh(`${root}/review/blind-review.md`, importedReviewMarkdown(blind));
  const complete = results.results.filter((r) => r.status === "complete").length;
  console.log(
    `Direct OpenAI test: ${evidence.length} attempt(s), ${complete} complete response(s). Review files: ${root}/review. Billed cost remains unverified. Participant AI stays off.`,
  );
  if (complete !== 3 || evidence.some((e) => e.modelMismatch)) process.exitCode = 3;
}
main().catch(() => {
  // Never print exception text, environment contents or raw provider errors.
  console.error(
    "Direct OpenAI test stopped. Check the documented prerequisites and local attempt records; no automatic retry was made.",
  );
  process.exitCode = 1;
});
