/** Node 24: node --import ./scripts/offline-ai/register.mjs scripts/offline-ai/exchange-results.ts ... */
import { mkdirSync } from "node:fs";
import { loadBoundPack } from "./comparison";
import { loadBoundPackV2 } from "./candidate-v2";
import { loadBoundPackV3 } from "./candidate-v3";
import { loadBoundPackV4 } from "./candidate-v4";
import {
  createInputExport,
  createResultTemplate,
  importResults,
  makeImportedReview,
  importedReviewMarkdown,
  type ExchangeCandidate,
} from "./result-exchange";
import { readBoundedUtf8, freshDirectory, writeFresh, writeFreshJson } from "./exchange-io";

const [command, ...args] = process.argv.slice(2);
if (command !== "export" && command !== "import")
  throw new Error("Use export or import; no live mode exists.");
const options = new Map<string, string>();
const candidates: ExchangeCandidate[] = [];
for (let i = 0; i < args.length; i += 2) {
  const flag = args[i];
  const value = args[i + 1];
  if (!value || value.startsWith("--")) throw new Error("Every option needs a value.");
  if (command === "export" && flag === "--candidate") {
    const split = value.indexOf("=");
    if (split <= 0 || split === value.length - 1)
      throw new Error("Candidate format: local-id=exact-requested-model-id");
    candidates.push({
      candidateId: value.slice(0, split),
      requestedModelId: value.slice(split + 1),
    });
  } else if (
    (command === "export"
      ? ["--out", "--policy"]
      : ["--out", "--export", "--results", "--seed", "--policy"]
    ).includes(flag) &&
    !options.has(flag)
  )
    options.set(flag, value);
  else throw new Error("Unknown or duplicate option.");
}
if (
  !options.get("--out") ||
  (command === "import" && (!options.get("--export") || !options.get("--results")))
)
  throw new Error("Supply --out; import also needs --export and --results.");
const policy = options.get("--policy") ?? "v1";
if (policy !== "v1" && policy !== "v2" && policy !== "v3" && policy !== "v4")
  throw new Error("Policy must be v1, v2, v3 or v4.");
globalThis.fetch = async () => {
  throw new Error("offline-network-disabled");
};
const bound =
  policy === "v4"
    ? loadBoundPackV4()
    : policy === "v3"
      ? loadBoundPackV3()
      : policy === "v2"
        ? loadBoundPackV2()
        : loadBoundPack();
if (command === "export") {
  const exported = createInputExport(bound, candidates.length ? candidates : undefined);
  const root = freshDirectory(options.get("--out")!);
  writeFreshJson(`${root}/input-export.json`, exported);
  writeFreshJson(`${root}/result-template.json`, createResultTemplate(exported));
  console.log(
    `Prepared ${exported.expectedMatrix.length} fictional slots in ${root}. Zero provider calls. This export authorises no calls or spending.`,
  );
} else {
  const exportRaw = readBoundedUtf8(options.get("--export")!);
  const resultsRaw = readBoundedUtf8(options.get("--results")!);
  const imported = importResults(bound, exportRaw, resultsRaw);
  const { blind, key } = makeImportedReview(
    bound,
    imported,
    options.get("--seed") ?? "bfa-import-review-v1",
  );
  const root = freshDirectory(options.get("--out")!);
  mkdirSync(`${root}/private`, { mode: 0o700 });
  mkdirSync(`${root}/review`, { mode: 0o700 });
  writeFresh(`${root}/private/original-export.json`, exportRaw);
  writeFresh(`${root}/private/original-results.json`, resultsRaw);
  writeFreshJson(`${root}/private/imported-records.json`, imported);
  writeFreshJson(`${root}/private/unblinding-key.json`, key);
  writeFreshJson(`${root}/review/blind-review.json`, blind);
  writeFresh(`${root}/review/blind-review.md`, importedReviewMarkdown(blind));
  console.log(
    `Imported ${imported.records.length} unverified records; ${blind.responses.length} complete texts for review in ${root}/review. Zero NEW provider calls/cost. Historical generation costs and provenance remain unverified. Keep ${root}/private separate.`,
  );
}
