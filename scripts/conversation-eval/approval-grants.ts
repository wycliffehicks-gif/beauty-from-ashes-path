// Conversation P4 evaluator — server-controlled approval grants.
//
// A manifest's own approval strings NEVER grant execution by themselves.
// Live dispatch requires a SEPARATE grant recorded in the server-controlled
// registry (approval-grants.json, shipped EMPTY) whose manifestSha256 matches
// the exact bytes of the manifest file being run and whose bound scope
// (model/tier, policy and source hashes, attempt and spend limits, price
// basis digest, run label) equals the manifest's. Tampering with any bound
// field changes the digest or fails the scope comparison; replaying a grant
// against a different manifest fails the digest. This is trusted
// isolated-operator scope, not a public identity system.
//
// Test-only grant injection (deps.grants) is accepted ONLY together with an
// injected simulated transport (deps.fetchImpl): an injected grant can never
// authorize the real network.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import type { EvalManifest } from "./manifest";
import { GPT6_LUNA_STANDARD_PRICE_BASIS } from "./pricing";

export const APPROVAL_GRANTS_VERSION = "bfa-approval-grants-v1";
export const DEFAULT_GRANTS_PATH = "scripts/conversation-eval/approval-grants.json";

const Hex64 = z.string().regex(/^[0-9a-f]{64}$/);
const Iso = z.string().refine((v) => Number.isFinite(Date.parse(v)), "invalid timestamp");

export const ApprovalGrantSchema = z
  .object({
    grantId: z.string().min(1).max(200),
    /** SHA-256 of the EXACT manifest file bytes this grant authorizes. */
    manifestSha256: Hex64,
    runLabel: z.string().min(1).max(200),
    approvedBy: z.string().min(1).max(200),
    reference: z.string().min(1).max(200),
    approvedAtIso: Iso,
    expiresAtIso: Iso,
    scope: z
      .object({
        model: z.literal("gpt-6-luna"),
        serviceTier: z.literal("default"),
        policySha256: Hex64,
        sourceSnapshotSha256: Hex64,
        maxDispatchAttempts: z.number().int().min(1).max(9),
        maxUsdMicros: z.number().int().positive().max(1_000_000_000_000),
        priceBasisSha256: Hex64,
      })
      .strict(),
  })
  .strict();

export type ApprovalGrant = z.infer<typeof ApprovalGrantSchema>;

const GrantsFileSchema = z
  .object({
    grantVersion: z.literal(APPROVAL_GRANTS_VERSION),
    grants: z.array(ApprovalGrantSchema).max(100),
  })
  .strict();

export const sha256Hex = (text: string) =>
  createHash("sha256").update(text).digest("hex");

/** Digest of the reviewed server-controlled price snapshot. */
export const PRICE_BASIS_SHA256 = sha256Hex(
  JSON.stringify(GPT6_LUNA_STANDARD_PRICE_BASIS),
);

/** Load the grant registry. A missing or empty registry means UNAPPROVED. */
export function loadApprovalGrants(path: string = DEFAULT_GRANTS_PATH): ApprovalGrant[] {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  try {
    const parsed = GrantsFileSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.grants : [];
  } catch { return []; }
}

export type GrantRefusal =
  | "grant-absent"
  | "grant-scope-mismatch"
  | "grant-not-yet-valid"
  | "grant-expired";

export type GrantAdmission =
  | { readonly ok: true; readonly grant: ApprovalGrant }
  | { readonly ok: false; readonly code: GrantRefusal; readonly detail: string };

/**
 * Admit a live run against the grant registry. `manifestBytes` is the exact
 * file content read from disk; the digest binds the grant to THAT manifest.
 * Checked before any credential read, and re-checked before each dispatch.
 */
export function admitLiveGrant(
  manifestBytes: string,
  manifest: EvalManifest,
  grants: readonly ApprovalGrant[],
  nowIso: string,
): GrantAdmission {
  const digest = sha256Hex(manifestBytes);
  const candidates = grants.filter((g) => g.manifestSha256 === digest);
  if (candidates.length === 0) {
    return { ok: false, code: "grant-absent", detail: "no grant binds this exact manifest" };
  }
  const checked = ApprovalGrantSchema.safeParse(candidates[0]);
  if (!checked.success) return { ok: false, code: "grant-scope-mismatch", detail: "invalid grant" };
  const grant = checked.data;
  const s = grant.scope;
  if (
    s.model !== manifest.provider.model ||
    s.serviceTier !== manifest.provider.serviceTier ||
    s.policySha256 !== manifest.policySha256 ||
    s.sourceSnapshotSha256 !== manifest.sourceSnapshotSha256 ||
    s.maxDispatchAttempts !== manifest.limits.maxDispatchAttempts ||
    s.maxUsdMicros !== manifest.limits.maxUsdMicros ||
    s.priceBasisSha256 !== PRICE_BASIS_SHA256 ||
    grant.runLabel !== manifest.label ||
    grant.expiresAtIso !== manifest.expiresAtIso ||
    !manifest.approval ||
    manifest.approval.reference !== grant.reference ||
    manifest.approval.approvedBy !== grant.approvedBy ||
    manifest.approval.approvedAtIso !== grant.approvedAtIso
  ) {
    return { ok: false, code: "grant-scope-mismatch", detail: grant.grantId };
  }
  const nowMs = Date.parse(nowIso);
  const approvedMs = Date.parse(grant.approvedAtIso);
  const expiresMs = Date.parse(grant.expiresAtIso);
  if (!Number.isFinite(nowMs) || nowMs < approvedMs || approvedMs >= expiresMs) {
    return { ok: false, code: "grant-not-yet-valid", detail: grant.grantId };
  }
  if (expiresMs <= nowMs) {
    return { ok: false, code: "grant-expired", detail: grant.grantId };
  }
  return { ok: true, grant };
}
