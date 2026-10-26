/** Conversation P4 evaluator CLI.
 * Run from repo root: bun scripts/conversation-eval/run.ts
 * (bun, like the P3b scripts: the service graph uses TS parameter properties,
 * which Node 22 strip-only mode cannot load.)
 * DEFAULT IS VALIDATE (offline): no credentials are read and fetch is disabled.
 * --live requires a manifest with explicit approval; anything else fails closed.
 */
import { runConversationEvaluation } from "./runner";

const argv = process.argv.slice(2);
let live = false;
let manifestPath = "scripts/conversation-eval/draft-manifest.v1.json";
let outDir = "artifacts/conversation-eval/offline-validation-v1";
for (let i = 0; i < argv.length; i++) {
  const flag = argv[i];
  if (flag === "--live") live = true;
  else if (flag === "--manifest" && argv[i + 1]) manifestPath = argv[++i];
  else if (flag === "--out" && argv[i + 1]) outDir = argv[++i];
  else throw new Error("Allowed arguments: --live --manifest PATH --out DIRECTORY");
}

if (!live) {
  // Guard against accidental network use in validate mode.
  let fetchAttempts = 0;
  globalThis.fetch = async () => {
    fetchAttempts++;
    throw new Error("validate-mode-network-disabled");
  };
  const summary = await runConversationEvaluation(
    { mode: "validate", manifestPath, outDir },
    {},
  );
  if (fetchAttempts) throw new Error("Validate invariant failed: fetch was attempted");
  console.log(
    `OFFLINE VALIDATION: structural=${summary.structural}; approval=${summary.approval}; ` +
      `0 credential reads; 0 provider calls; USD 0. Summary: ${outDir}/run-summary.json\n` +
      `This is not model output and not quality evidence. Live mode requires an approved manifest.`,
  );
} else {
  const summary = await runConversationEvaluation(
    { mode: "live", manifestPath, outDir },
    { env: process.env },
  );
  console.log(
    `LIVE RUN: ${summary.dispatchAttempts} dispatches; charged micro-USD ${summary.actualProviderCostMicros}. Evidence: ${summary.evidence}`,
  );
}
