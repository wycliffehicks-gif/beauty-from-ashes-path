// Conversation P4 evaluator — live-run manifest schema and validation.
//
// A manifest is the ONLY admission ticket for a paid live evaluation. The
// default validate mode checks structure, catalog binding, hashes, limits and
// the conservative cost bound WITHOUT touching credentials or the network.
// Live mode additionally requires an explicit approval record and an
// unexpired manifest, and every check must pass BEFORE any key is read or any
// dispatch is attempted. This evaluator never self-authorizes: the shipped
// draft has approval null and only offline validation has been executed.

import { z } from "zod";
import { EVAL_CATALOG, EVAL_TOTAL_TURNS } from "./catalog";
import { worstCaseDispatchCostMicros, type PriceBasis } from "./pricing";

export const EVAL_MANIFEST_VERSION = "bfa-conversation-eval-manifest-v1";

const Hex64 = z.string().regex(/^[0-9a-f]{64}$/);
const Micros = z.number().int().nonnegative().max(1_000_000_000_000);
const Iso = z.string().refine((v) => Number.isFinite(Date.parse(v)), "invalid timestamp");

export const EvalManifestSchema = z
  .object({
    manifestVersion: z.literal(EVAL_MANIFEST_VERSION),
    label: z.string().min(1).max(200),
    /** Null until a named approver authorizes a specific run. */
    approval: z
      .object({
        reference: z.string().min(1).max(200),
        approvedBy: z.string().min(1).max(200),
        approvedAtIso: Iso,
      })
      .strict()
      .nullable(),
    expiresAtIso: Iso,
    provider: z
      .object({
        name: z.literal("openai-direct"),
        model: z.literal("gpt-6-luna"),
        reasoningEffort: z.literal("none"),
        serviceTier: z.literal("default"),
      })
      .strict(),
    policySha256: Hex64,
    sourceSnapshotSha256: Hex64,
    cases: z
      .array(
        z
          .object({
            caseId: z.enum(["C04", "C05", "C07", "C08"]),
            turns: z.array(z.string().min(1).max(4000)).min(1).max(8),
          })
          .strict(),
      )
      .min(1)
      .max(EVAL_CATALOG.length),
    limits: z
      .object({
        maxInputChars: z.number().int().min(1).max(64_000),
        maxOutputTokens: z.number().int().min(1).max(4_096),
        deadlineMs: z.number().int().min(1).max(45_000),
        maxDispatchAttempts: z.number().int().min(1).max(EVAL_TOTAL_TURNS),
        maxUsdMicros: Micros,
      })
      .strict(),
    rules: z
      .object({
        noRetry: z.literal(true),
        noFallback: z.literal(true),
        freshThreadPerCase: z.literal(true),
        spiritualPreference: z.literal("off"),
      })
      .strict(),
    priceBasis: z
      .object({
        source: z.string().min(1).max(500),
        retrievedOn: z.string().min(4).max(40),
        model: z.string().min(1).max(100),
        tier: z.string().min(1).max(100),
        inputPerMillionUsdMicros: Micros,
        cachedInputPerMillionUsdMicros: Micros,
        cacheWritePerMillionUsdMicros: Micros,
        outputPerMillionUsdMicros: Micros,
      })
      .strict(),
    accounting: z
      .object({
        ledgerPath: z.string().min(1).max(500),
        evidenceDir: z.string().min(1).max(500),
      })
      .strict(),
    stopConditions: z.array(z.string().min(1).max(500)).min(1).max(20),
  })
  .strict();

export type EvalManifest = z.infer<typeof EvalManifestSchema>;

export type ManifestValidationCode =
  | "invalid-manifest"
  | "unknown-case"
  | "case-turns-mismatch"
  | "attempt-count-mismatch"
  | "policy-hash-mismatch"
  | "source-hash-mismatch"
  | "cost-bound-exceeded"
  | "price-basis-mismatch"
  | "manifest-expired"
  | "manifest-unapproved";

export type ManifestValidation =
  | { readonly ok: true; readonly manifest: EvalManifest; readonly costBound: CostBound }
  | { readonly ok: false; readonly code: ManifestValidationCode; readonly detail: string };

export interface CostBound {
  readonly worstCasePerDispatchMicros: number;
  readonly maxDispatchAttempts: number;
  readonly worstCaseTotalMicros: number;
  readonly maxUsdMicros: number;
  readonly fits: boolean;
}

export function computeCostBound(manifest: EvalManifest): CostBound {
  const per = worstCaseDispatchCostMicros(
    manifest.limits.maxInputChars,
    manifest.limits.maxOutputTokens,
    manifest.priceBasis,
  );
  const total = per * manifest.limits.maxDispatchAttempts;
  return {
    worstCasePerDispatchMicros: per,
    maxDispatchAttempts: manifest.limits.maxDispatchAttempts,
    worstCaseTotalMicros: total,
    maxUsdMicros: manifest.limits.maxUsdMicros,
    fits: total <= manifest.limits.maxUsdMicros,
  };
}

export interface ManifestContext {
  readonly nowIso: string;
  readonly expectedPolicySha256: string;
  readonly expectedSourceSnapshotSha256: string;
}

/**
 * Structural validation shared by both modes: schema, exact catalog binding
 * (case IDs AND verbatim turns), snapshot hashes, attempt count, price basis
 * and the conservative cost bound. Never reads credentials or the network.
 */
export function validateEvalManifest(
  raw: unknown,
  context: ManifestContext,
): ManifestValidation {
  const parsed = EvalManifestSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, code: "invalid-manifest", detail: "schema validation failed" };
  }
  const manifest = parsed.data;

  const seen = new Set<string>();
  let turns = 0;
  for (const c of manifest.cases) {
    if (seen.has(c.caseId)) {
      return { ok: false, code: "unknown-case", detail: `duplicate case ${c.caseId}` };
    }
    seen.add(c.caseId);
    const catalogCase = EVAL_CATALOG.find((x) => x.caseId === c.caseId);
    if (!catalogCase) {
      return { ok: false, code: "unknown-case", detail: c.caseId };
    }
    if (
      c.turns.length !== catalogCase.turns.length ||
      c.turns.some((t, i) => t !== catalogCase.turns[i])
    ) {
      return { ok: false, code: "case-turns-mismatch", detail: c.caseId };
    }
    turns += c.turns.length;
  }
  if (manifest.limits.maxDispatchAttempts !== turns) {
    return {
      ok: false,
      code: "attempt-count-mismatch",
      detail: `maxDispatchAttempts ${manifest.limits.maxDispatchAttempts} !== ${turns} catalog turns`,
    };
  }
  if (manifest.policySha256 !== context.expectedPolicySha256) {
    return { ok: false, code: "policy-hash-mismatch", detail: "policy body changed" };
  }
  if (manifest.sourceSnapshotSha256 !== context.expectedSourceSnapshotSha256) {
    return { ok: false, code: "source-hash-mismatch", detail: "source registry changed" };
  }
  if (
    manifest.priceBasis.model !== manifest.provider.model ||
    manifest.priceBasis.tier !== manifest.provider.serviceTier
  ) {
    return { ok: false, code: "price-basis-mismatch", detail: "price basis not for this model/tier" };
  }
  const costBound = computeCostBound(manifest);
  if (!costBound.fits) {
    return {
      ok: false,
      code: "cost-bound-exceeded",
      detail: `worst case ${costBound.worstCaseTotalMicros} micros > cap ${costBound.maxUsdMicros}`,
    };
  }
  return { ok: true, manifest, costBound };
}

/**
 * Live admission: everything structural PLUS explicit approval and expiry.
 * Runs BEFORE any credential read or dispatch attempt.
 */
export function validateManifestForLive(
  raw: unknown,
  context: ManifestContext,
): ManifestValidation {
  const base = validateEvalManifest(raw, context);
  if (!base.ok) return base;
  const { manifest } = base;
  if (!manifest.approval) {
    return { ok: false, code: "manifest-unapproved", detail: "approval is null" };
  }
  const nowMs = Date.parse(context.nowIso);
  const expiresMs = Date.parse(manifest.expiresAtIso);
  const approvedMs = Date.parse(manifest.approval.approvedAtIso);
  if (!Number.isFinite(nowMs) || expiresMs <= nowMs) {
    return { ok: false, code: "manifest-expired", detail: manifest.expiresAtIso };
  }
  if (approvedMs > expiresMs) {
    return { ok: false, code: "manifest-expired", detail: "approval after expiry" };
  }
  return base;
}

export type { PriceBasis };
