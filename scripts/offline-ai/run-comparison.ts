/** Run from repo root using Node 24 and --import ./scripts/offline-ai/register.mjs */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import {
  loadBoundPack,
  runComparison,
  makeBlindReview,
  reviewMarkdown,
  COMPARISON_VERSION,
} from "./comparison";
import { simulatedAdapters } from "./simulated-adapters";

const argv = process.argv.slice(2);
let full = false;
let seed = "bfa-offline-v1";
let output = "artifacts/offline-ai";
const skipCaseIds: string[] = [];
for (let i = 0; i < argv.length; i++) {
  const flag = argv[i];
  if (flag === "--full") full = true;
  else if (flag === "--seed" && argv[i + 1]) seed = argv[++i];
  else if (flag === "--out" && argv[i + 1]) output = argv[++i];
  else if (flag === "--skip" && argv[i + 1]) skipCaseIds.push(argv[++i]);
  else
    throw new Error(
      "Allowed arguments: --full --seed VALUE --out DIRECTORY --skip FIXTURE_ID. There is no live mode.",
    );
}
if (seed.length > 256) throw new Error("Seed too long");
// A guard against accidental fetch. The built-in adapter imports no network or provider code.
let blockedFetchAttempts = 0;
globalThis.fetch = async () => {
  blockedFetchAttempts++;
  throw new Error("offline-network-disabled");
};
const bound = loadBoundPack();
const records = await runComparison({ bound, adapters: simulatedAdapters(), full, skipCaseIds });
if (blockedFetchAttempts) throw new Error("Offline invariant failed: fetch was attempted");
const { blind, key } = makeBlindReview(bound, records, seed);
const root = resolve(output);
// Never overwrite an earlier reviewer sheet, corrections or unblinding key.
mkdirSync(dirname(root), { recursive: true });
mkdirSync(root, { recursive: false });
mkdirSync(`${root}/review`);
mkdirSync(`${root}/private`, { mode: 0o700 });
function save(path: string, content: unknown) {
  writeFileSync(path, JSON.stringify(content, null, 2) + "\n", { flag: "wx", mode: 0o600 });
}
save(`${root}/review/blind-review.json`, blind);
writeFileSync(`${root}/review/blind-review.md`, reviewMarkdown(blind), { flag: "wx", mode: 0o600 });
save(`${root}/private/unblinding-key.json`, key);
save(`${root}/private/policy-and-source-manifest.json`, bound.manifest);
save(`${root}/private/results.json`, records);
save(`${root}/private/run-summary.json`, {
  version: COMPARISON_VERSION,
  mode: full ? "full-simulation" : "smoke-simulation",
  createdAt: new Date().toISOString(),
  offlineOnly: true,
  providerCalls: 0,
  fetchAttempts: blockedFetchAttempts,
  simulatedAdapterCalls: records.filter((r) => r.adapterCalled).length,
  skipped: records.filter((r) => !r.adapterCalled).length,
  failed: records.filter((r) => r.status === "failed").length,
  flagged: records.filter((r) => r.status === "validation-flagged").length,
  actualProviderCost: { kind: "actual", amount: 0, currency: "USD", basis: "no provider requests" },
  hypotheticalModelCost: { kind: "unknown", amount: null },
  usage: "unknown; no provider token reports",
  latency: "local stub wall-time only; not provider performance",
});
console.log(
  `OFFLINE SIMULATION: ${records.filter((r) => r.adapterCalled).length} stub calls; 0 provider calls; USD 0 provider cost.\nReview: ${root}/review\nKeep ${root}/private separate until review is complete. No model quality conclusions are supported.`,
);
