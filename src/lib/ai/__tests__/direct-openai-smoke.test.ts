import { describe, expect, it, vi } from "vitest";
import { loadBoundPack, SMOKE_IDS } from "../../../../scripts/offline-ai/comparison";
import { importResults } from "../../../../scripts/offline-ai/result-exchange";
import {
  prepareSmoke,
  runSmoke,
  SMOKE_BUDGET_USD,
  SMOKE_MODEL,
} from "../../../../scripts/direct-openai-smoke/smoke";
import type { DirectOpenAIResult } from "../../../../scripts/direct-openai-smoke/transport";

function response(overrides: Partial<DirectOpenAIResult> = {}): DirectOpenAIResult {
  return {
    status: "complete",
    text: "These are fictional test words for a technical check.",
    failureCode: null,
    requestedModel: SMOKE_MODEL,
    reportedModel: SMOKE_MODEL,
    responseId: "resp_test",
    requestId: "req_test",
    modelMismatch: false,
    incompleteReason: null,
    usage: { inputTokens: 1000, outputTokens: 100, reasoningTokens: 0, totalTokens: 1100 },
    ...overrides,
  };
}
describe("direct OpenAI fictional smoke orchestration", () => {
  it("binds exactly the existing three fictional cases and keeps their estimated reservation under five cents", () => {
    const prepared = prepareSmoke(loadBoundPack());
    expect(prepared.exported.cases.map((c) => c.caseId)).toEqual([...SMOKE_IDS]);
    expect(prepared.reservedUsd).toBeLessThan(SMOKE_BUDGET_USD);
    expect(prepared.exported.candidates).toEqual([
      { candidateId: "direct-openai-luna", requestedModelId: SMOKE_MODEL },
    ]);
  });
  it("makes one sequential attempt per case, checkpoints first, and produces importer-compatible evidence", async () => {
    const bound = loadBoundPack();
    const prepared = prepareSmoke(bound);
    const order: string[] = [];
    const generate = vi.fn(async () => {
      order.push("generate");
      return response();
    });
    const result = await runSmoke({
      prepared,
      generate,
      beforeAttempt: () => {
        order.push("start");
      },
      afterAttempt: () => {
        order.push("settled");
      },
    });
    expect(order).toEqual(Array.from({ length: 3 }, () => ["start", "generate", "settled"]).flat());
    expect(generate).toHaveBeenCalledTimes(3);
    expect(generate).toHaveBeenNthCalledWith(1, prepared.exported.cases[0].input);
    expect(Object.keys(prepared.exported.cases[0].input).sort()).toEqual([
      "deadlineMs",
      "groundedPayload",
      "maxOutputTokens",
      "systemPolicy",
    ]);
    const imported = importResults(
      bound,
      JSON.stringify(prepared.exported),
      JSON.stringify(result.results),
    );
    expect(imported.records).toHaveLength(3);
    expect(imported.records.every((r) => r.historicalCost.claim === "estimated")).toBe(true);
  });
  it.each([
    response({ status: "failed", text: null, failureCode: "timeout" }),
    response({ status: "incomplete", incompleteReason: "max_output_tokens" }),
    response({ reportedModel: "unexpected-model", modelMismatch: true }),
    response({ reportedModel: null }),
  ])(
    "stops after a failed, partial or uncertain model response, leaving remaining cases not-run",
    async (first) => {
      const prepared = prepareSmoke(loadBoundPack());
      const generate = vi.fn(async () => first);
      const result = await runSmoke({
        prepared,
        generate,
        beforeAttempt: () => {},
        afterAttempt: () => {},
      });
      expect(generate).toHaveBeenCalledTimes(1);
      expect(result.results.results.slice(1).map((r) => r.status)).toEqual(["not-run", "not-run"]);
      expect(result.evidence).toHaveLength(1);
    },
  );
  it("does not dispatch if the attempt marker cannot be persisted", async () => {
    const generate = vi.fn(async () => response());
    await expect(
      runSmoke({
        prepared: prepareSmoke(loadBoundPack()),
        generate,
        beforeAttempt: () => {
          throw new Error("write-failed");
        },
        afterAttempt: () => {},
      }),
    ).rejects.toThrow();
    expect(generate).not.toHaveBeenCalled();
  });
  it("does not continue after losing a result checkpoint", async () => {
    const generate = vi.fn(async () => response());
    await expect(
      runSmoke({
        prepared: prepareSmoke(loadBoundPack()),
        generate,
        beforeAttempt: () => {},
        afterAttempt: () => {
          throw new Error("write-failed");
        },
      }),
    ).rejects.toThrow();
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
