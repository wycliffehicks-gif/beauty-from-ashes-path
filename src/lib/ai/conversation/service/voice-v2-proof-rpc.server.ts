// Inactive v2 proof registration mapping only. No client, credentials, Auth
// verifier, route, clock, consumption, retry, cutover or provider is installed.
import "@tanstack/react-start/server-only";
import { z } from "zod";
import type { VoiceAdmissionClaim } from "./voice-admission.server";

export type VoiceV2ProofRpcName = "bfa_p5_v2_register_proof";
export interface VoiceV2ProofRpcClient {
  /** Protected service-role transport bound to the exact invocation. Disable
   * transparent retry, credential replay and v1 fallback. Neither this client
   * nor its service role establishes participant Auth or service provenance. */
  rpc(name: VoiceV2ProofRpcName, args: Readonly<Record<string, unknown>>): PromiseLike<unknown>;
}
export interface VoiceV2ProofRegistration {
  readonly protocol: 2;
  readonly receiptId: string;
  readonly operation: "claim" | "inspect";
  readonly claim: VoiceAdmissionClaim;
  readonly cleanupId: string;
  readonly authSessionId: string;
  readonly parentVersion: number;
  readonly authorityFingerprint: string;
  /** Independently established current request-bound Auth/policy ceiling. */
  readonly identityExpiresAt: number;
  /** Conservative original verification start, never refreshed after waits. */
  readonly verifiedAt: number;
  /** Positive receipt interval of at most 30000 ms from verifiedAt. */
  readonly expiresAt: number;
  /** Shrink-only eligibility ceiling, bounded by claim and current Auth. */
  readonly effectiveExpiresAt: number;
}
/** A registration acknowledgment carries the exact full immutable request.
 * It is not consumed proof, admission, capacity or provider permission. */
export type VoiceV2ProofReceipt = VoiceV2ProofRegistration;
export interface VoiceV2ProofRpcPorts {
  readonly registerProof: (proof: VoiceV2ProofRegistration) => Promise<VoiceV2ProofReceipt | null>;
}

const Id = z
  .string()
  .uuid()
  .refine(
    (value) => value === value.toLowerCase() && value !== "00000000-0000-0000-0000-000000000000",
  );
const Count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const Expiry = Count.positive();
const Digest = z.string().regex(/^[0-9a-f]{64}$/);
function plainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function dataField(record: Record<string, unknown>, key: string): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return !!descriptor && Object.hasOwn(descriptor, "value") && descriptor.enumerable === true;
}
function wireObject<Shape extends z.ZodRawShape>(shape: Shape) {
  const keys = Object.keys(shape);
  return z
    .unknown()
    .refine(
      (value) =>
        plainRecord(value) &&
        Reflect.ownKeys(value).length === keys.length &&
        keys.every((key) => dataField(value, key)),
    )
    .pipe(z.object(shape).strict());
}
const Binding = wireObject({
  ownerId: Id,
  threadId: Id,
  threadIncarnation: Id,
  threadRevision: Count,
  attemptId: Id,
  approvalId: Id,
  approvalDigest: Digest,
  scope: z.literal("developer-voice-session"),
});
const Claim = wireObject({ claimId: Id, binding: Binding, expiresAt: Expiry });
const Proof = wireObject({
  protocol: z.literal(2),
  receiptId: Id,
  operation: z.enum(["claim", "inspect"]),
  claim: Claim,
  cleanupId: Id,
  authSessionId: Id,
  parentVersion: Count,
  authorityFingerprint: Digest,
  identityExpiresAt: Expiry,
  verifiedAt: Count,
  expiresAt: Expiry,
  effectiveExpiresAt: Expiry,
}).transform((proof, context) => {
  // Access cross-fields only after successful own-data parsing, so rejected
  // accessors cannot be evaluated by a later refinement.
  if (
    proof.identityExpiresAt <= proof.verifiedAt ||
    proof.effectiveExpiresAt > proof.claim.expiresAt ||
    proof.effectiveExpiresAt > proof.identityExpiresAt ||
    proof.expiresAt > proof.effectiveExpiresAt ||
    proof.expiresAt <= proof.verifiedAt ||
    proof.expiresAt - proof.verifiedAt > 30_000
  )
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid proof interval" });
  return proof;
});
function unavailable(): never {
  // Do not propagate SQL errors, identifiers, raw proof data or an error cause.
  throw new Error("voice-v2-proof-rpc-unavailable");
}
async function guarded<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    return unavailable();
  }
}
function unwrap(raw: unknown): unknown {
  if (!plainRecord(raw) || !dataField(raw, "data") || !dataField(raw, "error"))
    return unavailable();
  if (raw.error !== null) return unavailable();
  if (
    Object.hasOwn(raw, "status") &&
    (!dataField(raw, "status") ||
      typeof raw.status !== "number" ||
      !Number.isInteger(raw.status) ||
      raw.status < 200 ||
      raw.status >= 300)
  )
    return unavailable();
  return raw.data;
}
function freezeProof(proof: VoiceV2ProofRegistration): VoiceV2ProofRegistration {
  Object.freeze(proof.claim.binding);
  Object.freeze(proof.claim);
  return Object.freeze(proof);
}
function sameClaim(a: VoiceAdmissionClaim, b: VoiceAdmissionClaim): boolean {
  return (
    a.claimId === b.claimId &&
    a.expiresAt === b.expiresAt &&
    a.binding.ownerId === b.binding.ownerId &&
    a.binding.threadId === b.binding.threadId &&
    a.binding.threadIncarnation === b.binding.threadIncarnation &&
    a.binding.threadRevision === b.binding.threadRevision &&
    a.binding.attemptId === b.binding.attemptId &&
    a.binding.approvalId === b.binding.approvalId &&
    a.binding.approvalDigest === b.binding.approvalDigest &&
    a.binding.scope === b.binding.scope
  );
}
function sameProof(a: VoiceV2ProofRegistration, b: VoiceV2ProofReceipt): boolean {
  return (
    a.protocol === b.protocol &&
    a.receiptId === b.receiptId &&
    a.operation === b.operation &&
    sameClaim(a.claim, b.claim) &&
    a.cleanupId === b.cleanupId &&
    a.authSessionId === b.authSessionId &&
    a.parentVersion === b.parentVersion &&
    a.authorityFingerprint === b.authorityFingerprint &&
    a.identityExpiresAt === b.identityExpiresAt &&
    a.verifiedAt === b.verifiedAt &&
    a.expiresAt === b.expiresAt &&
    a.effectiveExpiresAt === b.effectiveExpiresAt
  );
}

/** Exact inactive v2 registration, not proof consumption or an Auth verifier.
 * The trusted host must retain the preallocated immutable request before the
 * call, establish owned service/claim/cleanup and v2 issuance provenance, and
 * independently verify current request-bound Auth and policy. Shapes cannot
 * establish these guarantees. SQL checks current protected state and post-lock
 * time. This mapping has no local clock or allowance to refresh verification.
 *
 * The full protocol-2 acknowledgment must match every identity and time field.
 * A SQL null may follow a committed shorter deadline or terminal fence. Lost or
 * malformed replies likewise never prove rollback or justify another receipt
 * identity. No automatic retry, observation backfill or v1 fallback occurs.
 * Exact existing receipt IDs are denied by SQL, even for identical replay;
 * deliberately calling again cannot reattest or renew a registered proof.
 *
 * Future v2 consumption/admission/capacity, current Auth policy/revocation and
 * quiesced no-fallback cutover remain required. A stored receipt does not grant
 * provider permission and is not proof of closure, finality or refunded holds.
 */
export function createVoiceV2ProofRpcPorts(client: VoiceV2ProofRpcClient): VoiceV2ProofRpcPorts {
  let invoke: VoiceV2ProofRpcClient["rpc"];
  try {
    if (!client) return unavailable();
    const rpc = client.rpc;
    if (typeof rpc !== "function") return unavailable();
    invoke = rpc.bind(client);
  } catch {
    return unavailable();
  }
  return Object.freeze({
    registerProof(rawProof: VoiceV2ProofRegistration) {
      return guarded(async () => {
        const proof = freezeProof(Proof.parse(rawProof));
        const raw = unwrap(
          await invoke("bfa_p5_v2_register_proof", Object.freeze({ p_proof: proof })),
        );
        if (raw === null) return null;
        const receipt = Proof.parse(raw);
        if (!sameProof(proof, receipt)) return unavailable();
        return freezeProof(receipt);
      });
    },
  });
}
