// Engineering-only runner for the isolated AI evaluation harness.
//
// NOT part of the app. Not imported by any route, client module, or server
// function. It lives outside public/ and writes its artifacts outside public/.
//
// The ONLY accepted arguments are allowlisted fixture ids and --dry-run.
// No free text, no file paths, no model parameters, no answer arrays.
//
// Usage:
//   bun scripts/ai-eval/run-eval.ts --dry-run
//   bun scripts/ai-eval/run-eval.ts fx-day3-grief-sleep

import { mkdirSync, writeFileSync } from "node:fs";
import { EVAL_FIXTURE_IDS, isEvalFixtureId, type EvalFixtureId } from "@/lib/ai/eval/fixtures";
import {
  buildEvalPayload,
  runEvalFixture,
  EVAL_MAX_CALLS_PER_BATCH,
  type EvalProvider,
} from "@/lib/ai/eval/harness";
import { createEvalGatewayProvider } from "@/lib/ai/eval/gateway-provider.server";

const OUT_DIR = "artifacts/ai-eval";

function parseArgs(argv: string[]): { dryRun: boolean; ids: EvalFixtureId[] } {
  let dryRun = false;
  const ids: EvalFixtureId[] = [];
  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (!isEvalFixtureId(arg)) {
      throw new Error(
        `Refused argument. Only allowlisted fixture ids are accepted: ${EVAL_FIXTURE_IDS.join(", ")}`,
      );
    }
    ids.push(arg);
  }
  return { dryRun, ids: ids.length > 0 ? ids : [...EVAL_FIXTURE_IDS] };
}

async function main() {
  const { dryRun, ids } = parseArgs(process.argv.slice(2));
  if (ids.length > EVAL_MAX_CALLS_PER_BATCH) {
    throw new Error(`Call cap is ${EVAL_MAX_CALLS_PER_BATCH}.`);
  }

  mkdirSync(OUT_DIR, { recursive: true });

  // Manifest inspection first — always, including live runs.
  const manifests = ids.map((id) => {
    const built = buildEvalPayload(id);
    if (!built.ok) throw new Error(`payload build failed for ${id}: ${built.error}`);
    return built.manifest;
  });
  writeFileSync(`${OUT_DIR}/payload-manifests.json`, JSON.stringify(manifests, null, 2));
  for (const m of manifests) {
    console.log(
      `${m.fixtureId} | day ${m.day} | ${m.fingerprint} | spiritual=${m.spiritualAuthorised} | chars=${m.totalChars} | spiritualPractice=${m.spiritualPracticeIncluded}`,
    );
  }

  if (dryRun) {
    console.log("\nDRY RUN — no model calls attempted.");
    return;
  }

  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    console.log("\nSTOPPED: no configured LOVABLE_API_KEY in this server environment.");
    console.log("No calls attempted. No workaround or substitute provider used.");
    return;
  }

  const provider: EvalProvider = createEvalGatewayProvider(apiKey);
  const records = [];
  for (const id of ids) {
    // Sequential, one call per fixture, no retries.
    const record = await runEvalFixture(id, provider);
    records.push(record);
    if ("status" in record) {
      console.log(
        `\n=== ${record.fixtureId} [${record.status}] ${record.durationMs}ms model=${record.returnedModel ?? record.requestedModel ?? "n/a"} usage=${JSON.stringify(record.usage ?? {})}`,
      );
      console.log(record.output ?? `error: ${record.error}`);
      if (record.status === "failure") {
        console.log("Stopping the batch after a failure.");
        break;
      }
    } else {
      console.log(`\n=== ${id} refused: ${record.error}`);
      break;
    }
  }
  writeFileSync(`${OUT_DIR}/results.json`, JSON.stringify(records, null, 2));
  console.log(`\nWrote ${OUT_DIR}/results.json`);
}

await main();
