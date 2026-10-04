/** Bounded local file exchange. No adapters, SDKs, environment reads or provider calls. */
import { isDeepStrictEqual } from "node:util";
import {
  type BoundPack,
  COMBINED_POLICY_VERSION,
  SMOKE_IDS,
  sha256,
  DIMENSIONS,
  DIMENSION_GUIDANCE,
  HARD_FAILURES,
} from "./comparison";
import {
  MAX_JOURNEY_OUTPUT_CHARS,
  validateJourneyReflection,
} from "../../src/lib/ai/journey-response";

export const EXCHANGE_VERSION = "bfa-offline-result-exchange-1";
export const MAX_EXCHANGE_BYTES = 512_000;
const MAX_CANDIDATES = 4;
const MAX_ID_CHARS = 200;
const FAILURE_CODES = [
  "provider-failure",
  "timeout",
  "rate-limited",
  "refused",
  "budget-limit",
  "other",
  "unknown",
] as const;
export interface ExchangeCandidate {
  candidateId: string;
  requestedModelId: string | null;
}
function fail(code: string): never {
  throw new Error(`exchange:${code}`);
}
function object(value: unknown, keys: readonly string[], code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const result = value as Record<string, unknown>;
  if (!isDeepStrictEqual(Object.keys(result).sort(), [...keys].sort())) fail(code);
  return result;
}
function boundedString(value: unknown, max: number, code: string, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    fail(code);
  return value;
}
function finiteNumber(value: unknown, max: number, code: string, nullable = false): number | null {
  if (nullable && value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max) fail(code);
  return value;
}
export function parseExchangeJson(raw: string): unknown {
  if (Buffer.byteLength(raw, "utf8") > MAX_EXCHANGE_BYTES) fail("file-too-large");
  try {
    return JSON.parse(raw);
  } catch {
    return fail("invalid-json");
  }
}
export function parseCandidates(value: unknown): ExchangeCandidate[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_CANDIDATES)
    fail("candidate-count");
  const candidates = value.map((item) => {
    const row = object(item, ["candidateId", "requestedModelId"], "candidate-shape");
    if (typeof row.candidateId !== "string" || !/^[a-z][a-z0-9-]{0,47}$/.test(row.candidateId))
      fail("candidate-id");
    return {
      candidateId: row.candidateId,
      requestedModelId: boundedString(
        row.requestedModelId,
        MAX_ID_CHARS,
        "requested-model-id",
        true,
      ),
    };
  });
  if (new Set(candidates.map((c) => c.candidateId)).size !== candidates.length)
    fail("duplicate-candidate");
  return candidates;
}
export function createInputExport(
  bound: BoundPack,
  rawCandidates: unknown = [
    { candidateId: "candidate-a", requestedModelId: null },
    { candidateId: "candidate-b", requestedModelId: null },
  ],
) {
  const candidates = parseCandidates(rawCandidates);
  const cases = SMOKE_IDS.map((id) => {
    const item = bound.cases.find((c) => c.fixture.id === id);
    if (!item) return fail("missing-smoke-case");
    return {
      caseId: id,
      inputSha256: sha256(JSON.stringify(item.request)),
      policySha256: sha256(item.request.systemPolicy),
      groundedPayloadSha256: sha256(item.request.groundedPayload),
      input: { ...item.request },
    };
  });
  return {
    schemaVersion: EXCHANGE_VERSION,
    kind: "fictional-smoke-input-export",
    authorisation:
      "Preparation only; no permission for calls, spending or app activation is conveyed.",
    policyVersion: COMBINED_POLICY_VERSION,
    source: {
      commit: bound.manifest.sourceCommit,
      fixtureFileSha256: bound.manifest.fixtureFileSha256,
      candidateFileSha256: bound.manifest.candidateFileSha256,
      candidateInstructionSha256: bound.manifest.candidateInstructionSha256,
    },
    candidates,
    cases,
    expectedMatrix: cases.flatMap((c) =>
      candidates.map((candidate) => ({
        caseId: c.caseId,
        candidateId: candidate.candidateId,
        requestedModelId: candidate.requestedModelId,
        inputSha256: c.inputSha256,
      })),
    ),
  };
}
export type InputExport = ReturnType<typeof createInputExport>;
export function createResultTemplate(exported: InputExport) {
  return {
    schemaVersion: EXCHANGE_VERSION,
    exportSha256: sha256(JSON.stringify(exported)),
    originClaim: "unspecified",
    results: exported.expectedMatrix.map((row) => ({
      ...row,
      status: "not-run" as const,
      reportedModelId: null,
      text: null,
      failureCode: null,
      latencyMs: null,
      usage: { inputTokens: null, outputTokens: null, reasoningTokens: null, totalTokens: null },
      historicalCost: { claim: "unknown", amount: null, currency: null, basis: null },
    })),
  };
}
export interface ImportedRecord {
  caseId: string;
  candidateId: string;
  requestedModelId: string | null;
  reportedModelId: string | null;
  inputSha256: string;
  status: "complete" | "failed" | "incomplete" | "not-run";
  provenance: "imported-unverified";
  text: string | null;
  textSha256: string | null;
  failureCode: string | null;
  latency: { kind: "unknown" | "imported-unverified"; valueMs: number | null };
  usage: { kind: "unknown" | "imported-unverified"; counts: Record<string, number | null> };
  historicalCost: {
    kind: "unknown" | "imported-unverified";
    claim: "unknown" | "actual" | "estimated";
    amount: number | null;
    currency: string | null;
    basis: string | null;
  };
  automaticFlags: string[];
}
export function importResults(bound: BoundPack, exportRaw: string, resultsRaw: string) {
  const exportValue = parseExchangeJson(exportRaw);
  const exportObject = object(
    exportValue,
    [
      "schemaVersion",
      "kind",
      "authorisation",
      "policyVersion",
      "source",
      "candidates",
      "cases",
      "expectedMatrix",
    ],
    "export-shape",
  );
  const exported = createInputExport(bound, exportObject.candidates);
  if (!isDeepStrictEqual(exportValue, exported)) fail("export-source-or-hash-drift");
  const envelope = object(
    parseExchangeJson(resultsRaw),
    ["schemaVersion", "exportSha256", "originClaim", "results"],
    "result-envelope",
  );
  if (
    envelope.schemaVersion !== EXCHANGE_VERSION ||
    envelope.exportSha256 !== sha256(JSON.stringify(exported))
  )
    fail("result-export-mismatch");
  if (
    !["unspecified", "synthetic-demonstration", "provider-results"].includes(
      envelope.originClaim as string,
    )
  )
    fail("origin-claim");
  if (
    !Array.isArray(envelope.results) ||
    envelope.results.length !== exported.expectedMatrix.length
  )
    fail("matrix-incomplete");
  const seen = new Set<string>();
  const records: ImportedRecord[] = envelope.results.map((raw) => {
    const row = object(
      raw,
      [
        "caseId",
        "candidateId",
        "requestedModelId",
        "inputSha256",
        "status",
        "reportedModelId",
        "text",
        "failureCode",
        "latencyMs",
        "usage",
        "historicalCost",
      ],
      "result-row-shape",
    );
    const expected = exported.expectedMatrix.find(
      (r) => r.caseId === row.caseId && r.candidateId === row.candidateId,
    );
    if (!expected) return fail("unknown-case-or-candidate");
    const pair = `${expected.caseId}/${expected.candidateId}`;
    if (seen.has(pair)) return fail("duplicate-result");
    seen.add(pair);
    if (
      row.requestedModelId !== expected.requestedModelId ||
      row.inputSha256 !== expected.inputSha256
    )
      fail("result-input-mismatch");
    if (!["complete", "failed", "incomplete", "not-run"].includes(row.status as string))
      fail("result-status");
    const status = row.status as ImportedRecord["status"];
    const reportedModelId = boundedString(
      row.reportedModelId,
      MAX_ID_CHARS,
      "reported-model-id",
      true,
    );
    if (
      row.text !== null &&
      (typeof row.text !== "string" ||
        row.text.length > MAX_JOURNEY_OUTPUT_CHARS ||
        /\u0000/.test(row.text))
    )
      fail("result-text");
    const text = row.text as string | null;
    if (status === "complete" && (text === null || !text.trim())) fail("complete-text-required");
    if (
      row.failureCode !== null &&
      !FAILURE_CODES.includes(row.failureCode as (typeof FAILURE_CODES)[number])
    )
      fail("failure-code");
    if (
      (status === "failed" && row.failureCode === null) ||
      (status !== "failed" && row.failureCode !== null)
    )
      fail("failure-status-mismatch");
    const latencyMs = finiteNumber(row.latencyMs, 86_400_000, "latency", true);
    const usageSource = object(
      row.usage,
      ["inputTokens", "outputTokens", "reasoningTokens", "totalTokens"],
      "usage-shape",
    );
    const counts = Object.fromEntries(
      Object.entries(usageSource).map(([key, value]) => {
        const count = finiteNumber(value, 10_000_000, "usage-count", true);
        if (count !== null && !Number.isSafeInteger(count)) fail("usage-count");
        return [key, count];
      }),
    );
    const cost = object(row.historicalCost, ["claim", "amount", "currency", "basis"], "cost-shape");
    if (!["unknown", "actual", "estimated"].includes(cost.claim as string)) fail("cost-claim");
    const amount = finiteNumber(cost.amount, 1_000_000, "cost-amount", true);
    const currency = boundedString(cost.currency, 3, "cost-currency", true);
    const basis = boundedString(cost.basis, 500, "cost-basis", true);
    if (cost.claim === "unknown") {
      if (amount !== null || currency !== null || basis !== null) fail("unknown-cost-must-be-null");
    } else if (
      amount === null ||
      currency === null ||
      !/^[A-Z]{3}$/.test(currency) ||
      basis === null
    )
      fail("reported-cost-needs-basis");
    if (
      status === "not-run" &&
      (reportedModelId !== null ||
        text !== null ||
        row.failureCode !== null ||
        latencyMs !== null ||
        Object.values(counts).some((v) => v !== null) ||
        cost.claim !== "unknown")
    )
      fail("not-run-has-results");
    const automaticFlags: string[] = [];
    if (status === "complete") {
      const source = bound.cases.find((c) => c.fixture.id === expected.caseId)!.prepared.grounding;
      const checked = validateJourneyReflection({ text, source });
      if (!checked.ok) automaticFlags.push(checked.code);
    }
    if (
      text &&
      ([expected.candidateId, expected.requestedModelId, reportedModelId].some(
        (id) => id && id.length >= 4 && text.toLowerCase().includes(id.toLowerCase()),
      ) ||
        /\b(?:i am|i'm|as)\s+(?:an?\s+)?(?:ai|model|gpt|claude|gemini|chatgpt)\b/i.test(text))
    )
      automaticFlags.push("possible-self-identification");
    if (
      expected.requestedModelId &&
      reportedModelId &&
      expected.requestedModelId !== reportedModelId
    )
      automaticFlags.push("reported-model-mismatch");
    return {
      ...expected,
      reportedModelId,
      status,
      provenance: "imported-unverified",
      text,
      textSha256: text === null ? null : sha256(text),
      failureCode: row.failureCode as string | null,
      latency: { kind: latencyMs === null ? "unknown" : "imported-unverified", valueMs: latencyMs },
      usage: {
        kind: Object.values(counts).every((v) => v === null) ? "unknown" : "imported-unverified",
        counts,
      },
      historicalCost: {
        kind: cost.claim === "unknown" ? "unknown" : "imported-unverified",
        claim: cost.claim as "unknown" | "actual" | "estimated",
        amount,
        currency,
        basis,
      },
      automaticFlags,
    };
  });
  return {
    schemaVersion: EXCHANGE_VERSION,
    originClaim: envelope.originClaim as
      | "unspecified"
      | "synthetic-demonstration"
      | "provider-results",
    exported,
    records,
    originalExportFileSha256: sha256(exportRaw),
    originalResultsFileSha256: sha256(resultsRaw),
    importOperation: {
      providerCalls: 0,
      actualProviderCost: {
        amount: 0,
        currency: "USD",
        basis: "local import only; historical generation spending is separate and unverified",
      },
    },
  };
}
export type ImportedBundle = ReturnType<typeof importResults>;
function ordered<T>(items: T[], seed: string, key: (item: T) => string) {
  return [...items].sort((a, b) => {
    const ah = sha256(`${seed}\n${key(a)}`);
    const bh = sha256(`${seed}\n${key(b)}`);
    return ah < bh ? -1 : ah > bh ? 1 : 0;
  });
}
export function makeImportedReview(bound: BoundPack, bundle: ImportedBundle, seed: string) {
  boundedString(seed, 256, "review-seed");
  const cases = ordered(bundle.exported.cases, `${seed}/case`, (c) => c.caseId);
  const aliases = new Map<string, string>(
    cases.map((c, i) => [c.caseId, `C-${String(i + 1).padStart(3, "0")}`]),
  );
  const ready = ordered(
    bundle.records.filter((r) => r.status === "complete"),
    `${seed}/order`,
    (r) => `${r.caseId}/${r.candidateId}`,
  );
  const labels = ordered(
    ready.map((_, i) => `R-${String(i + 1).padStart(3, "0")}`),
    `${seed}/label`,
    (id) => id,
  );
  const responses = ready.map((r, i) => ({
    responseId: labels[i],
    caseId: aliases.get(r.caseId)!,
    text: r.text,
    scores: Object.fromEntries(DIMENSIONS.map((name) => [name, null])),
    hardFailures: Object.fromEntries(HARD_FAILURES.map((name) => [name, null])),
    reviewerNotes: "",
    carlExactCorrection: "",
    correctionReason: "",
    carlDecision: "unreviewed",
  }));
  return {
    blind: {
      version: EXCHANGE_VERSION,
      notice:
        (bundle.originClaim === "synthetic-demonstration"
          ? "SYNTHETIC DEMONSTRATION — no real model-quality evidence. "
          : "") +
        "IMPORTED, UNVERIFIED OUTPUTS. The importer cannot verify how these texts were generated, what model answered or whether billing claims are accurate. No ranking or approval is assigned.",
      rubric: {
        dimensions: DIMENSIONS,
        dimensionGuidance: DIMENSION_GUIDANCE,
        hardFailures: HARD_FAILURES,
        scoreMeaning:
          "0 problematic/absent; 1 partial; 2 strong. Suitable restraint earns expression-clarity credit.",
        threshold:
          "Proposed internal convention: at least 10/12, no zero dimension, no hard failure. Not a clinical scale or launch approval.",
      },
      coverage: {
        expectedResponses: bundle.records.length,
        completeForReview: ready.length,
        omittedNotComplete: bundle.records.length - ready.length,
      },
      cases: cases.map((c) => {
        const source = bound.cases.find((x) => x.fixture.id === c.caseId)!;
        return {
          caseId: aliases.get(c.caseId)!,
          source: source.prepared.grounding,
          reviewChecks: source.fixture.reviewChecks,
        };
      }),
      responses,
    },
    key: {
      seed,
      exportSha256: sha256(JSON.stringify(bundle.exported)),
      caseMap: Object.fromEntries(aliases),
      responses: ready.map((r, i) => ({
        responseId: labels[i],
        fixtureId: r.caseId,
        candidateId: r.candidateId,
        requestedModelId: r.requestedModelId,
        reportedModelId: r.reportedModelId,
        textSha256: r.textSha256,
        provenance: r.provenance,
        automaticFlags: r.automaticFlags,
      })),
      omitted: bundle.records
        .filter((r) => r.status !== "complete")
        .map((r) => ({
          fixtureId: r.caseId,
          candidateId: r.candidateId,
          status: r.status,
          failureCode: r.failureCode,
        })),
    },
  };
}
/** Display escaping only. Original text remains byte-exact in the input copy and JSON. */
function escapeMarkdown(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[\\`*_{}[\]()#+.!|~-]/g, "\\$&");
}
export function importedReviewMarkdown(review: ReturnType<typeof makeImportedReview>["blind"]) {
  const out = [
    "# Beauty from Ashes — blind review of imported outputs",
    "",
    review.notice,
    "",
    review.rubric.threshold,
    "",
    review.rubric.scoreMeaning,
    "",
    `Expected responses: ${review.coverage.expectedResponses}. Complete for review: ${review.coverage.completeForReview}. Omitted as failed, incomplete or not run: ${review.coverage.omittedNotComplete}.`,
    "",
  ];
  for (const c of review.cases) {
    out.push(
      `## ${c.caseId} — Day ${c.source.day}: ${c.source.title}`,
      "",
      "Canonical current-day context:",
      "",
      "```json",
      JSON.stringify(c.source, null, 2),
      "```",
      "",
      "Case checks:",
      ...c.reviewChecks.map((line) => `- ${line}`),
      "",
    );
    for (const r of review.responses.filter((x) => x.caseId === c.caseId)) {
      out.push(
        `### ${r.responseId}`,
        "",
        ...r.text!.split(/\r?\n/).map((line) => `> ${escapeMarkdown(line)}`),
        "",
        "| Dimension | Score 0–2 |",
        "| --- | --- |",
        ...DIMENSIONS.map((name) => `| ${name}: ${DIMENSION_GUIDANCE[name]} | |`),
        "",
        "Hard failures (Yes/No for each):",
        ...HARD_FAILURES.map((name) => `- ${name}:`),
        "",
        "Reviewer notes:",
        "",
        "Carl’s exact correction:",
        "",
        "Reason for correction:",
        "",
        "Carl’s decision: unreviewed",
        "",
      );
    }
  }
  return out.join("\n");
}
