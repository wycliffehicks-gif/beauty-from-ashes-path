import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bindFixturePack,
  loadBoundPack,
  runComparison,
  makeBlindReview,
  reviewMarkdown,
  normaliseCost,
  normaliseUsage,
  SMOKE_IDS,
  HARD_FAILURES,
  type OfflineAdapter,
} from "../../../../scripts/offline-ai/comparison";
import { simulatedAdapters } from "../../../../scripts/offline-ai/simulated-adapters";

const fixtureText = readFileSync("docs/pilot/fictional-ai-fixtures.v1.json", "utf8");
const instructionText = readFileSync("docs/pilot/SRT_RESPONSE_INSTRUCTIONS_v1.txt", "utf8");
const network = vi.fn(() => {
  throw new Error("network forbidden");
});
beforeEach(() => {
  network.mockClear();
  vi.stubGlobal("fetch", network);
});
afterEach(() => {
  const count = network.mock.calls.length;
  vi.unstubAllGlobals();
  vi.useRealTimers();
  expect(count).toBe(0);
});
function adapter(generate: OfflineAdapter["generate"], suffix = ""): OfflineAdapter {
  return {
    id: `PRIVATE_CANDIDATE${suffix}`,
    provenance: "offline-simulation",
    version: "PRIVATE_VERSION",
    modelLabel: "PRIVATE_MODEL",
    generate,
  };
}

describe("offline fictional comparison", () => {
  it("binds all 22 source-matched cases and 12 local rejection probes before simulation", () => {
    const bound = loadBoundPack();
    expect(bound.cases).toHaveLength(22);
    expect(bound.manifest.invalidProbes).toHaveLength(12);
    expect(
      bound.manifest.invalidProbes.every(
        (p) => p.adapterCalls === 0 && p.status === "rejected-locally",
      ),
    ).toBe(true);
    expect(bound.manifest.cases.every((c) => c.preparedCharacters <= 24_000)).toBe(true);
    expect(new Set(bound.manifest.cases.map((c) => c.combinedPolicySha256)).size).toBe(2); // faith on/off
  });

  it("fails closed on source, candidate or rejection expectation drift", () => {
    const pack = JSON.parse(fixtureText);
    pack.validCases[0].baseline.groundedPayloadSha256 = "wrong";
    expect(() => bindFixturePack(JSON.stringify(pack), instructionText)).toThrow(
      "fixture-source-mismatch",
    );
    expect(() =>
      bindFixturePack(
        fixtureText,
        instructionText.replace("Your reflection should", "Your reflection must"),
      ),
    ).toThrow("candidate-hash-mismatch");
    const rejectPack = JSON.parse(fixtureText);
    rejectPack.rejectionCases[0].expected.error = "wrong";
    expect(() => bindFixturePack(JSON.stringify(rejectPack), instructionText)).toThrow(
      "rejection-probe-mismatch",
    );
  });

  it("never sends metadata, reviewer notes, IDs, candidate identity or past responses to adapters", async () => {
    const pack = JSON.parse(fixtureText);
    pack.validCases.forEach((c: { reviewChecks: string[]; priorResponse?: string }) => {
      c.reviewChecks.push("REVIEWER_CANARY");
      c.priorResponse = "PRIOR_RESPONSE_CANARY";
    });
    const bound = bindFixturePack(JSON.stringify(pack), instructionText + "\nREVIEW_NOTES_CANARY");
    const call = vi.fn(async (request) => {
      expect(Object.keys(request).sort()).toEqual([
        "deadlineMs",
        "groundedPayload",
        "maxOutputTokens",
        "systemPolicy",
      ]);
      const serialised = JSON.stringify(request);
      for (const forbidden of [
        "REVIEWER_CANARY",
        "PRIOR_RESPONSE_CANARY",
        "REVIEW_NOTES_CANARY",
        "PRIVATE_CANDIDATE",
        "PRIVATE_MODEL",
        "REVIEW NOTES — NOT MODEL INPUT",
        ...pack.validCases.map((c: { id: string }) => c.id),
      ])
        expect(serialised).not.toContain(forbidden);
      expect(request.systemPolicy).toContain("GROUNDING");
      expect(request.systemPolicy).toContain("meaningful acknowledgment");
      expect(request.systemPolicy).toContain("AT MOST ONE");
      return { text: "There is room to leave this unfinished.", finishReason: "complete" as const };
    });
    const records = await runComparison({ bound, adapters: [adapter(call)] });
    expect(call).toHaveBeenCalledTimes(3);
    expect(records.filter((r) => r.status === "skipped")).toHaveLength(19);
  });

  it("uses the same immutable requests for both simulated candidates and defaults to 3 by 2 smoke", async () => {
    const bound = loadBoundPack();
    const left: unknown[] = [];
    const right: unknown[] = [];
    const make =
      (target: unknown[]) => async (request: Parameters<OfflineAdapter["generate"]>[0]) => {
        target.push(request);
        expect(Object.isFrozen(request)).toBe(true);
        return { text: "Nothing further is required here.", finishReason: "complete" as const };
      };
    const records = await runComparison({
      bound,
      adapters: [adapter(make(left)), adapter(make(right), "-2")],
    });
    expect(left).toEqual(right);
    expect(left).toHaveLength(3);
    expect(new Set(records.filter((r) => r.adapterCalled).map((r) => r.caseId))).toEqual(
      new Set(SMOKE_IDS),
    );
    expect(records.filter((r) => r.adapterCalled)).toHaveLength(6);
    expect(records.filter((r) => !r.adapterCalled)).toHaveLength(38);
  });

  it("full matrix covers all cases including contract-valid empty-answer days", async () => {
    const records = await runComparison({
      bound: loadBoundPack(),
      adapters: simulatedAdapters(),
      full: true,
    });
    expect(records).toHaveLength(44);
    expect(records.every((r) => r.adapterCalled && r.status === "simulated-output")).toBe(true);
    expect(
      records.filter((r) => r.caseId.includes("all-skipped")).every((r) => r.adapterCalled),
    ).toBe(true);
    // Here skipped answers are deliberate fictional input; not automatic app generation or consent.
  });

  it("explicitly skipped cases and disabled candidates make zero calls, usage and latency remain unknown", async () => {
    const bound = loadBoundPack();
    const call = vi.fn(async () => {
      throw new Error("must never call");
    });
    const records = await runComparison({
      bound,
      adapters: [adapter(call)],
      full: true,
      skipCaseIds: bound.cases.map((c) => c.fixture.id),
    });
    const disabled = await runComparison({
      bound,
      adapters: [{ ...adapter(call), enabled: false }],
      full: true,
    });
    expect(call).not.toHaveBeenCalled();
    for (const record of [...records, ...disabled]) {
      expect(record.adapterCalled).toBe(false);
      expect(record.latency).toEqual({ kind: "not-measured", valueMs: null });
      expect(record.usage).toEqual({ kind: "unknown", counts: null });
      expect(record.cost.incurred.amount).toBe(0);
    }
    await expect(
      runComparison({ bound, adapters: [adapter(call)], skipCaseIds: ["unknown"] }),
    ).rejects.toThrow("unknown-skip-case");
  });

  it("records exceptions/incomplete output once, discards raw errors and never retries", async () => {
    const call = vi.fn(async () => {
      throw new Error("SECRET_ERROR_CANARY");
    });
    const records = await runComparison({ bound: loadBoundPack(), adapters: [adapter(call)] });
    expect(call).toHaveBeenCalledTimes(3);
    expect(
      records
        .filter((r) => r.adapterCalled)
        .every((r) => r.status === "failed" && r.error === "adapter-failed-or-timed-out"),
    ).toBe(true);
    expect(JSON.stringify(records)).not.toContain("SECRET_ERROR_CANARY");
    const incomplete = await runComparison({
      bound: loadBoundPack(),
      adapters: [
        adapter(async () => ({
          text: "TRUNCATED_CANARY",
          finishReason: "incomplete",
          usage: { inputTokens: 10 },
        })),
      ],
    });
    expect(
      incomplete
        .filter((r) => r.adapterCalled)
        .every(
          (r) =>
            r.error === "response-incomplete" &&
            r.output === null &&
            r.usage.counts?.inputTokens === 10,
        ),
    ).toBe(true);
  });

  it("bounds stuck callbacks by a deadline without a retry", async () => {
    vi.useFakeTimers();
    const call = vi.fn(() => new Promise<never>(() => {}));
    const pending = runComparison({
      bound: loadBoundPack(),
      adapters: [adapter(call)],
      skipCaseIds: [SMOKE_IDS[1], SMOKE_IDS[2]],
    });
    await vi.advanceTimersByTimeAsync(45_001);
    const records = await pending;
    expect(call).toHaveBeenCalledTimes(1);
    expect(records.find((r) => r.adapterCalled)?.error).toBe("adapter-failed-or-timed-out");
  });

  it("flags narrow output violations while leaving every human hard-failure assessment unreviewed", async () => {
    const records = await runComparison({
      bound: loadBoundPack(),
      adapters: [adapter(async () => ({ text: "God will guide you.", finishReason: "complete" }))],
    });
    for (const record of records.filter((r) => r.adapterCalled)) {
      expect(record.status).toBe("validation-flagged");
      expect(record.automaticFlags).toContain("devotional-leakage");
      expect(Object.keys(record.humanHardFailures)).toEqual([...HARD_FAILURES]);
      expect(Object.values(record.humanHardFailures).every((v) => v === null)).toBe(true);
    }
  });

  it("distinguishes actual zero provider spending, hypothetical estimates and unknown token/cost evidence", () => {
    expect(normaliseCost(undefined, true)).toMatchObject({
      incurred: { kind: "actual", amount: 0 },
      hypotheticalModelCost: { kind: "unknown", amount: null },
    });
    expect(
      normaliseCost({ amount: 0.05, currency: "USD", basis: "fictional test estimate" }, true),
    ).toMatchObject({
      incurred: { amount: 0 },
      hypotheticalModelCost: { kind: "estimated", amount: 0.05 },
    });
    expect(
      normaliseCost({ amount: -1, currency: "USD", basis: "bad" }, true).hypotheticalModelCost.kind,
    ).toBe("unknown");
    expect(normaliseCost({ amount: 0, currency: "USD" }, true).hypotheticalModelCost.kind).toBe(
      "unknown",
    );
    expect(normaliseUsage({ inputTokens: -1, totalTokens: Infinity, outputTokens: 1.5 })).toEqual({
      kind: "unknown",
      counts: null,
    });
    expect(normaliseUsage({ inputTokens: 40, outputTokens: 2, secret: "CANARY" })).toEqual({
      kind: "simulated",
      counts: { inputTokens: 40, outputTokens: 2 },
    });
  });

  it("randomises stable blind IDs/order per seed and isolates identities and performance data", async () => {
    const bound = loadBoundPack();
    const records = await runComparison({ bound, adapters: simulatedAdapters() });
    const first = makeBlindReview(bound, records, "review-seed-1");
    expect(makeBlindReview(bound, records, "review-seed-1")).toEqual(first);
    expect(makeBlindReview(bound, records, "review-seed-2").key.responses).not.toEqual(
      first.key.responses,
    );
    expect(new Set(first.blind.responses.map((r) => r.responseId)).size).toBe(6);
    expect(first.key.responses).toHaveLength(6);
    const reviewer = JSON.stringify(first.blind) + reviewMarkdown(first.blind);
    for (const privateField of [
      "simulation-1",
      "simulation-2",
      "handwritten-stub-v1",
      "NO MODEL —",
      "latency",
      "hypotheticalModelCost",
      "usage",
      "review-seed-1",
    ])
      expect(reviewer).not.toContain(privateField);
    expect(first.blind.cases[0].source.teaching.length).toBeGreaterThan(0);
    expect(first.blind.rubric.expressionClarity).toContain("suitable restraint");
    expect(
      first.blind.responses.every(
        (r) => r.carlDecision === "unreviewed" && Object.values(r.scores).every((s) => s === null),
      ),
    ).toBe(true);
  });

  it("rejects attempts to supply a live adapter before any invocation", async () => {
    const call = vi.fn();
    const live = { ...adapter(call), provenance: "live-model" } as unknown as OfflineAdapter;
    await expect(runComparison({ bound: loadBoundPack(), adapters: [live] })).rejects.toThrow(
      "offline-adapters-required",
    );
    expect(call).not.toHaveBeenCalled();
  });
});
