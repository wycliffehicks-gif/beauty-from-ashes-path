// Engineering-only COMPLETION DIAGNOSTIC runner (profile: completion-diagnostic-v1).
//
// NOT part of the app. Not imported by any route, client module, or server
// function. Fixed in every respect: fixed profile, fixed fixture order, fixed
// output directory. It accepts NO arguments other than --dry-run — no fixture
// ids, no paths, no model, no limit overrides.
//
// Usage:
//   bun scripts/ai-eval/run-completion-diagnostic.ts --dry-run
//   bun scripts/ai-eval/run-completion-diagnostic.ts

import { mkdirSync, writeFileSync } from "node:fs";
import { buildEvalPayload, runEvalFixture, type EvalProvider } from "@/lib/ai/eval/harness";
import { createEvalGatewayProvider } from "@/lib/ai/eval/gateway-provider.server";
import {
  DIAGNOSTIC_FIXTURE_ORDER,
  DIAGNOSTIC_OUT_DIR,
  DIAGNOSTIC_PROFILE,
  DIAGNOSTIC_PROFILE_ID,
  diagnosticEnvelope,
  shouldStopAfter,
  summariseEntry,
  type DiagnosticEntry,
} from "@/lib/ai/eval/completion-diagnostic";

function persist(entries: DiagnosticEntry[]) {
  writeFileSync(
    `${DIAGNOSTIC_OUT_DIR}/results.json`,
    JSON.stringify(diagnosticEnvelope(entries), null, 2),
  );
}

async function main() {
  const args = process.argv.slice(2);
  for (const arg of args) {
    if (arg !== "--dry-run") {
      throw new Error("Refused argument. This runner accepts only --dry-run.");
    }
  }
  const dryRun = args.includes("--dry-run");

  mkdirSync(DIAGNOSTIC_OUT_DIR, { recursive: true });

  // Manifest inspection first, always.
  const manifests = DIAGNOSTIC_FIXTURE_ORDER.map((id) => {
    const built = buildEvalPayload(id, DIAGNOSTIC_PROFILE_ID);
    if (!built.ok) throw new Error(`payload build failed for ${id}: ${built.error}`);
    return built.manifest;
  });
  writeFileSync(
    `${DIAGNOSTIC_OUT_DIR}/payload-manifests.json`,
    JSON.stringify(manifests, null, 2),
  );
  for (const m of manifests) {
    console.log(
      `${m.fixtureId} | day ${m.day} | ${m.fingerprint} | profile=${m.profileId} | maxOut=${m.maxOutputTokens} | chars=${m.totalChars}/${m.inputCharCap} | spiritual=${m.spiritualAuthorised}`,
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
  const entries: DiagnosticEntry[] = [];
  let stopped = false;

  for (const id of DIAGNOSTIC_FIXTURE_ORDER) {
    if (stopped) {
      entries.push({
        fixtureId: id,
        attempted: false,
        notAttemptedReason: "diagnostic stopped after an earlier failure or rejection",
        reasoningTokensStatus: "n/a",
      });
      persist(entries);
      continue;
    }
    if (entries.filter((e) => e.attempted).length >= DIAGNOSTIC_PROFILE.maxCalls) break;

    const record = await runEvalFixture(id, provider, { profileId: DIAGNOSTIC_PROFILE_ID });
    if (!("status" in record)) {
      entries.push({
        fixtureId: id,
        attempted: false,
        notAttemptedReason: `refused: ${record.error}`,
        reasoningTokensStatus: "n/a",
      });
      persist(entries);
      stopped = true;
      continue;
    }

    const entry = summariseEntry(record);
    entries.push(entry);
    persist(entries); // persisted immediately, before any further work

    console.log(
      `\n=== ${record.fixtureId} [${record.status}] ${record.durationMs}ms finish=${record.finishReason ?? "n/a"} model=${record.returnedModel ?? record.requestedModel ?? "n/a"} words=${entry.wordCount ?? 0} usage=${JSON.stringify(record.usage ?? {})} reasoningTokens=${entry.reasoningTokensStatus === "returned" ? entry.reasoningTokens : "unavailable"}`,
    );
    console.log(record.output ?? `error: ${record.error}`);

    if (shouldStopAfter(record)) {
      stopped = true;
      console.log(
        "\nSTOPPING the diagnostic now. No retry, no cap increase, no automatic rerun.",
      );
    }
  }

  persist(entries);
  console.log(`\nWrote ${DIAGNOSTIC_OUT_DIR}/results.json`);
}

await main();
