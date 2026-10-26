// Conversation P4 evaluator — price basis and conservative receipts.
//
// All money is integer micro-USD (1 USD = 1_000_000 micros); no floats.
// The documented gpt-6-luna standard prices below are a PRICE BASIS TO
// REVALIDATE before any paid use — they grant no budget by themselves.
//
// Conservative receipt rules:
//   - uncached input is billed at the HIGHER of the input and cache-write
//     rates (a write may have occurred even when not reported);
//   - cached input is billed at the cached rate;
//   - output is billed at the output rate; reasoning tokens are a SUBSET of
//     output tokens and are never added again;
//   - unknown, invalid or internally inconsistent usage returns null, and the
//     caller MUST retain the reservation (no automatic refund).

export interface PriceBasis {
  readonly source: string;
  readonly retrievedOn: string;
  readonly model: string;
  readonly tier: string;
  readonly inputPerMillionUsdMicros: number;
  readonly cachedInputPerMillionUsdMicros: number;
  readonly cacheWritePerMillionUsdMicros: number;
  readonly outputPerMillionUsdMicros: number;
}

export const GPT6_LUNA_STANDARD_PRICE_BASIS: PriceBasis = {
  source: "https://developers.openai.com/api/docs/models/gpt-6-luna",
  retrievedOn: "2026-10-26",
  model: "gpt-6-luna",
  tier: "default",
  inputPerMillionUsdMicros: 100_000, // USD 0.10 / 1M
  cachedInputPerMillionUsdMicros: 10_000, // USD 0.01 / 1M
  cacheWritePerMillionUsdMicros: 125_000, // USD 0.125 / 1M
  outputPerMillionUsdMicros: 500_000, // USD 0.50 / 1M
};

export interface ReportedUsage {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly reasoningTokens: number | null;
  readonly cachedInputTokens: number | null;
  readonly totalTokens: number | null;
}

const validCount = (n: number | null): n is number =>
  n !== null && Number.isSafeInteger(n) && n >= 0 && n <= 10_000_000;

const ceilDiv = (a: number, b: number) => Math.ceil(a / b);

/** Conservative charge in micro-USD, or null when usage cannot be trusted. */
export function computeConservativeChargeMicros(
  usage: ReportedUsage,
  basis: PriceBasis,
): number | null {
  const { inputTokens, outputTokens, reasoningTokens, cachedInputTokens, totalTokens } = usage;
  if (!validCount(inputTokens) || !validCount(outputTokens) || !validCount(totalTokens)) {
    return null;
  }
  if (inputTokens + outputTokens !== totalTokens) return null;
  if (reasoningTokens !== null && (!validCount(reasoningTokens) || reasoningTokens > outputTokens)) {
    return null;
  }
  if (cachedInputTokens !== null && (!validCount(cachedInputTokens) || cachedInputTokens > inputTokens)) {
    return null;
  }
  const cached = cachedInputTokens ?? 0;
  const uncached = inputTokens - cached;
  const uncachedRate = Math.max(
    basis.inputPerMillionUsdMicros,
    basis.cacheWritePerMillionUsdMicros,
  );
  return (
    ceilDiv(uncached * uncachedRate, 1_000_000) +
    ceilDiv(cached * basis.cachedInputPerMillionUsdMicros, 1_000_000) +
    ceilDiv(outputTokens * basis.outputPerMillionUsdMicros, 1_000_000)
  );
}

/**
 * Worst-case cost of one dispatch in micro-USD. Input tokens are estimated
 * conservatively at 2 characters per token (JSON overhead included) and billed
 * at the higher of input/cache-write rates; output at the full token cap.
 */
export function worstCaseDispatchCostMicros(
  maxInputChars: number,
  maxOutputTokens: number,
  basis: PriceBasis,
): number {
  const worstInputTokens = ceilDiv(maxInputChars, 2);
  const uncachedRate = Math.max(
    basis.inputPerMillionUsdMicros,
    basis.cacheWritePerMillionUsdMicros,
  );
  return (
    ceilDiv(worstInputTokens * uncachedRate, 1_000_000) +
    ceilDiv(maxOutputTokens * basis.outputPerMillionUsdMicros, 1_000_000)
  );
}
