import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadBoundPack, sha256, SMOKE_IDS } from "../../../../scripts/offline-ai/comparison";
import {
  createInputExport,
  createResultTemplate,
  importResults,
  makeImportedReview,
  importedReviewMarkdown,
  parseExchangeJson,
  parseCandidates,
  MAX_EXCHANGE_BYTES,
} from "../../../../scripts/offline-ai/result-exchange";
import {
  freshDirectory,
  writeFresh,
  readBoundedUtf8,
} from "../../../../scripts/offline-ai/exchange-io";
const bound = loadBoundPack();
const exported = createInputExport(bound, [
  { candidateId: "alpha-candidate", requestedModelId: "model-requested-alpha" },
  { candidateId: "beta-candidate", requestedModelId: null },
]);
const exportRaw = JSON.stringify(exported, null, 2) + "\n";
const resultData = () => JSON.parse(JSON.stringify(createResultTemplate(exported)));
const imported = (data: unknown, raw = exportRaw) =>
  importResults(bound, raw, JSON.stringify(data));
const network = vi.fn(() => {
  throw new Error("network forbidden");
});
beforeEach(() => {
  network.mockClear();
  vi.stubGlobal("fetch", network);
});
afterEach(() => {
  const calls = network.mock.calls.length;
  vi.unstubAllGlobals();
  expect(calls).toBe(0);
});

describe("bounded offline external-result exchange", () => {
  it("exports only the three exact smoke inputs, declared caps and a full candidate matrix without reviewer notes", () => {
    expect(exported.cases.map((c) => c.caseId)).toEqual([...SMOKE_IDS]);
    expect(exported.expectedMatrix).toHaveLength(6);
    for (const c of exported.cases) {
      expect(Object.keys(c.input).sort()).toEqual([
        "deadlineMs",
        "groundedPayload",
        "maxOutputTokens",
        "systemPolicy",
      ]);
      expect(c.input).toEqual(bound.cases.find((b) => b.fixture.id === c.caseId)!.request);
      expect(c.input.maxOutputTokens).toBe(4096);
      expect(c.input.deadlineMs).toBe(45_000);
      expect(c.policySha256).toBe(sha256(c.input.systemPolicy));
      expect(c.groundedPayloadSha256).toBe(sha256(c.input.groundedPayload));
      expect(c.inputSha256).toBe(sha256(JSON.stringify(c.input)));
    }
    for (const secret of [
      "reviewChecks",
      "expectedCanonicalSource",
      "REVIEW NOTES — NOT MODEL INPUT",
      "reviewerNotes",
    ])
      expect(exportRaw).not.toContain(secret);
    expect(() =>
      parseCandidates([
        { candidateId: "same", requestedModelId: null },
        { candidateId: "same", requestedModelId: null },
      ]),
    ).toThrow("duplicate-candidate");
  });

  it("synthetic roundtrip preserves exact text and all statuses without upgrading unknown model/usage/historic costs", () => {
    const data = resultData();
    data.originClaim = "synthetic-demonstration";
    const exact = "  There is room to pause.\r\n\r\nNo more words are required.  ";
    data.results[0].status = "complete";
    data.results[0].text = exact;
    data.results[1].status = "failed";
    data.results[1].failureCode = "timeout";
    data.results[2].status = "incomplete";
    data.results[2].text = "Partial words";
    const bundle = imported(data);
    expect(bundle.records.map((r) => r.status)).toEqual([
      "complete",
      "failed",
      "incomplete",
      "not-run",
      "not-run",
      "not-run",
    ]);
    expect(bundle.records[0]).toMatchObject({
      text: exact,
      requestedModelId: "model-requested-alpha",
      reportedModelId: null,
      provenance: "imported-unverified",
      usage: { kind: "unknown" },
      historicalCost: { kind: "unknown", amount: null },
    });
    expect(bundle.records[0].textSha256).toBe(sha256(exact));
    expect(bundle.importOperation.actualProviderCost.amount).toBe(0);
    const { blind, key } = makeImportedReview(bound, bundle, "seed-roundtrip");
    expect(blind.notice).toContain("SYNTHETIC DEMONSTRATION");
    expect(blind.responses[0].text).toBe(exact);
    expect(blind.coverage).toEqual({
      expectedResponses: 6,
      completeForReview: 1,
      omittedNotComplete: 5,
    });
    expect(key.omitted).toHaveLength(5);
  });

  it("requires every expected slot exactly once and rejects unknown candidates/cases, source/hash drift and extra fields", () => {
    const missing = resultData();
    missing.results.pop();
    expect(() => imported(missing)).toThrow("matrix-incomplete");
    const duplicate = resultData();
    duplicate.results[1] = duplicate.results[0];
    expect(() => imported(duplicate)).toThrow("duplicate-result");
    const unknown = resultData();
    unknown.results[0].caseId = "unknown";
    expect(() => imported(unknown)).toThrow("unknown-case-or-candidate");
    const alteredHash = resultData();
    alteredHash.results[0].inputSha256 = "wrong";
    expect(() => imported(alteredHash)).toThrow("result-input-mismatch");
    const alteredModel = resultData();
    alteredModel.results[0].requestedModelId = "substitute";
    expect(() => imported(alteredModel)).toThrow("result-input-mismatch");
    const staleExport = JSON.parse(exportRaw);
    staleExport.cases[0].input.systemPolicy += "\nchanged";
    expect(() => imported(resultData(), JSON.stringify(staleExport))).toThrow(
      "export-source-or-hash-drift",
    );
    const rawError = resultData();
    rawError.results[0].providerErrorBody = "CANARY";
    expect(() => imported(rawError)).toThrow("result-row-shape");
    const pollution = resultData();
    pollution.results[0].usage = JSON.parse(
      '{"inputTokens":null,"outputTokens":null,"reasoningTokens":null,"totalTokens":null,"__proto__":{"safe":true}}',
    );
    expect(() => imported(pollution)).toThrow("usage-shape");
  });

  it("enforces bounded text, token numbers and coherent complete/failed/not-run states", () => {
    const empty = resultData();
    empty.results[0].status = "complete";
    empty.results[0].text = "  ";
    expect(() => imported(empty)).toThrow("complete-text-required");
    const large = resultData();
    large.results[0].status = "complete";
    large.results[0].text = "x".repeat(12001);
    expect(() => imported(large)).toThrow("result-text");
    const failed = resultData();
    failed.results[0].status = "failed";
    expect(() => imported(failed)).toThrow("failure-status-mismatch");
    const skipped = resultData();
    skipped.results[0].latencyMs = 1;
    expect(() => imported(skipped)).toThrow("not-run-has-results");
    const negative = resultData();
    negative.results[0].usage.inputTokens = -1;
    expect(() => imported(negative)).toThrow("usage-count");
    const fractional = resultData();
    fractional.results[0].usage.inputTokens = 1.5;
    expect(() => imported(fractional)).toThrow("usage-count");
    expect(() => parseExchangeJson(" ".repeat(MAX_EXCHANGE_BYTES + 1))).toThrow("file-too-large");
  });

  it("preserves reported usage/cost as unverified claims with basis and flags model mismatch/self-identification", () => {
    const data = resultData();
    data.originClaim = "provider-results";
    const row = data.results[0];
    row.status = "complete";
    row.text = "I am model-reported-beta. There is room to pause.";
    row.reportedModelId = "model-reported-beta";
    row.latencyMs = 250;
    row.usage = { inputTokens: 40, outputTokens: 10, reasoningTokens: null, totalTokens: null };
    row.historicalCost = {
      claim: "actual",
      amount: 0.01,
      currency: "CAD",
      basis: "operator-supplied billing entry; unverified",
    };
    const record = imported(data).records[0];
    expect(record.usage).toMatchObject({
      kind: "imported-unverified",
      counts: { inputTokens: 40 },
    });
    expect(record.historicalCost).toMatchObject({
      kind: "imported-unverified",
      claim: "actual",
      amount: 0.01,
    });
    expect(record.automaticFlags).toEqual(
      expect.arrayContaining(["reported-model-mismatch", "possible-self-identification"]),
    );
    row.historicalCost.basis = null;
    expect(() => imported(data)).toThrow("reported-cost-needs-basis");
    row.historicalCost = { claim: "unknown", amount: 0, currency: null, basis: null };
    expect(() => imported(data)).toThrow("unknown-cost-must-be-null");
  });

  it("seeds review labels reproducibly, keeps private identities/metrics out and leaves all judgments unreviewed", () => {
    const data = resultData();
    data.originClaim = "synthetic-demonstration";
    for (const row of data.results) {
      row.status = "complete";
      row.text = "A quiet pause is available without needing an explanation.";
    }
    const bundle = imported(data);
    const first = makeImportedReview(bound, bundle, "one-seed");
    expect(makeImportedReview(bound, bundle, "one-seed")).toEqual(first);
    expect(makeImportedReview(bound, bundle, "other-seed").key).not.toEqual(first.key);
    const reviewText = JSON.stringify(first.blind);
    for (const value of [
      "alpha-candidate",
      "beta-candidate",
      "model-requested-alpha",
      "one-seed",
      "latency",
      "historicalCost",
      "usage",
    ])
      expect(reviewText).not.toContain(value);
    expect(
      first.blind.responses.every(
        (r) =>
          r.carlDecision === "unreviewed" &&
          Object.values(r.scores).every((v) => v === null) &&
          Object.values(r.hardFailures).every((v) => v === null),
      ),
    ).toBe(true);
    expect(first.key.responses).toHaveLength(6);
  });

  it("flags unsafe prose without changing exact imported text and escapes active markup only in Markdown display", () => {
    const data = resultData();
    data.results[0].status = "complete";
    data.results[0].text =
      '<img src="https://example.invalid/pixel"> [click](https://example.invalid)';
    const bundle = imported(data);
    expect(bundle.records[0].automaticFlags).toContain("output-contains-markup");
    const review = makeImportedReview(bound, bundle, "display-seed").blind;
    expect(review.responses[0].text).toBe(data.results[0].text);
    const markdown = importedReviewMarkdown(review);
    expect(markdown).not.toContain("<img");
    expect(markdown).toContain("&lt;img");
    expect(markdown).toContain("\\[click\\]");
  });

  it("bounds file reads before parsing and preserves originals with exclusive writes and fresh directories", () => {
    const root = mkdtempSync(join(tmpdir(), "bfa-exchange-"));
    try {
      const output = freshDirectory(join(root, "new-review"));
      const original = '{"text":"café"}\r\n';
      const path = join(output, "original.json");
      writeFresh(path, original);
      expect(readBoundedUtf8(path)).toBe(original);
      expect(() => writeFresh(path, "replacement")).toThrow();
      expect(readFileSync(path, "utf8")).toBe(original);
      expect(() => freshDirectory(output)).toThrow();
      const huge = join(root, "huge.json");
      writeFileSync(huge, " ".repeat(MAX_EXCHANGE_BYTES + 1));
      expect(() => readBoundedUtf8(huge)).toThrow("file-type-or-size");
      const invalid = join(root, "invalid.json");
      writeFileSync(invalid, Buffer.from([0xc3, 0x28]));
      expect(() => readBoundedUtf8(invalid)).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
