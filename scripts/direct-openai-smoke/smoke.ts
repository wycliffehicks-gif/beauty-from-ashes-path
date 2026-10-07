/** Private fictional evaluation only. No participant route imports this module. */
import {
  createInputExport,
  createResultTemplate,
  type ImportedRecord,
} from "../offline-ai/result-exchange";
import { SMOKE_IDS, type BoundPack } from "../offline-ai/comparison";
import type { DirectOpenAIResult } from "./transport";

export const SMOKE_MODEL = "gpt-6-luna";
export const SMOKE_BUDGET_USD = 0.05;
export const PRICE_CHECKED_ON = "2026-10-07";
export const PRICE_SOURCE = "https://developers.openai.com/api/docs/models/gpt-6-luna";
// Standard input .10, cache write .125, output .50 per million USD.
// Reserve at the higher input rate even though explicit cache mode has no breakpoints.
const INPUT_RESERVE_RATE = 0.125;
const OUTPUT_RATE = 0.5;

export function prepareSmoke(bound: BoundPack) {
  const exported = createInputExport(bound, [
    { candidateId: "direct-openai-luna", requestedModelId: SMOKE_MODEL },
  ]);
  if (exported.cases.length !== 3 || exported.cases.some((c, i) => c.caseId !== SMOKE_IDS[i]))
    throw new Error("smoke-case-mismatch");
  const reservations = exported.cases.map((c) => {
    const bytes = Buffer.byteLength(c.input.systemPolicy + c.input.groundedPayload, "utf8");
    if (bytes > 80_000 || c.input.maxOutputTokens !== 4096 || c.input.deadlineMs !== 45_000)
      throw new Error("smoke-limits-mismatch");
    return (
      ((bytes + 1024) * INPUT_RESERVE_RATE + c.input.maxOutputTokens * OUTPUT_RATE) / 1_000_000
    );
  });
  const reservedUsd = reservations.reduce((a, b) => a + b, 0);
  if (reservedUsd > SMOKE_BUDGET_USD) throw new Error("smoke-budget-exceeded");
  return { exported, reservations, reservedUsd };
}

type Row = ReturnType<typeof createResultTemplate>["results"][number];
export type SmokeRow = Omit<
  Row,
  "status" | "text" | "failureCode" | "reportedModelId" | "latencyMs" | "usage" | "historicalCost"
> & {
  status: "complete" | "failed" | "incomplete" | "not-run";
  text: string | null;
  failureCode: ImportedRecord["failureCode"];
  reportedModelId: string | null;
  latencyMs: number | null;
  usage: DirectOpenAIResult["usage"];
  historicalCost: {
    claim: "unknown" | "estimated";
    amount: number | null;
    currency: string | null;
    basis: string | null;
  };
};
export type SmokeEnvelope = Omit<ReturnType<typeof createResultTemplate>, "results"> & {
  results: SmokeRow[];
};
export type SmokeEvidence = {
  caseId: string;
  reservedUsd: number;
  responseId: string | null;
  requestId: string | null;
  modelMismatch: boolean;
  incompleteReason: string | null;
  failureCode: string | null;
};

export async function runSmoke(options: {
  prepared: ReturnType<typeof prepareSmoke>;
  generate: (
    input: ReturnType<typeof prepareSmoke>["exported"]["cases"][number]["input"],
  ) => Promise<DirectOpenAIResult>;
  // Persist start BEFORE a dispatch; a failed write must prevent that dispatch.
  beforeAttempt: (index: number, caseId: string) => void;
  afterAttempt: (index: number, results: SmokeEnvelope, evidence: SmokeEvidence[]) => void;
}) {
  const { prepared } = options;
  const template = createResultTemplate(prepared.exported);
  const results: SmokeEnvelope = {
    ...template,
    results: template.results.map((row) => ({
      ...row,
      historicalCost: { claim: "unknown", amount: null, currency: null, basis: null },
    })),
  };
  results.originClaim = "provider-results";
  const evidence: SmokeEvidence[] = [];
  for (let i = 0; i < prepared.exported.cases.length; i++) {
    const item = prepared.exported.cases[i];
    options.beforeAttempt(i, item.caseId);
    const start = performance.now();
    const response = await options.generate(item.input);
    const failure =
      response.status !== "failed"
        ? null
        : response.failureCode === "timeout"
          ? "timeout"
          : response.failureCode === "rate-limited"
            ? "rate-limited"
            : response.failureCode === "refused"
              ? "refused"
              : "provider-failure";
    const { inputTokens, outputTokens } = response.usage;
    const estimated =
      inputTokens !== null && outputTokens !== null
        ? (inputTokens * INPUT_RESERVE_RATE + outputTokens * OUTPUT_RATE) / 1_000_000
        : null;
    results.results[i] = {
      ...results.results[i],
      status: response.status,
      text: response.text,
      reportedModelId: response.reportedModel,
      failureCode: failure,
      latencyMs: performance.now() - start,
      usage: response.usage,
      historicalCost:
        estimated === null
          ? { claim: "unknown", amount: null, currency: null, basis: null }
          : {
              claim: "estimated",
              amount: estimated,
              currency: "USD",
              basis:
                "Reported token counts x conservative standard rates checked 2026-10-07; input priced at cache-write rate. Not a bill.",
            },
    };
    evidence.push({
      caseId: item.caseId,
      reservedUsd: prepared.reservations[i],
      responseId: response.responseId,
      requestId: response.requestId,
      modelMismatch: response.modelMismatch,
      incompleteReason: response.incompleteReason,
      failureCode: response.failureCode,
    });
    options.afterAttempt(i, results, evidence);
    // A failure, partial answer or model uncertainty never triggers another paid attempt.
    if (response.status !== "complete" || response.modelMismatch || !response.reportedModel) break;
  }
  return { results, evidence };
}
