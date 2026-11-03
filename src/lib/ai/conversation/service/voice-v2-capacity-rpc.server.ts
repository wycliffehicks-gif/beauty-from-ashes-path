// Inactive v2 atomic capacity claim and existing-claim inspection mapping.
// No client, credentials, Auth verifier, route, marker or provider is installed.
import "@tanstack/react-start/server-only";
import { z } from "zod";
import type { VoiceAdmissionClaim } from "./voice-admission.server";
import type { VoiceV2ProofReceipt } from "./voice-v2-proof-rpc.server";

export type VoiceV2CapacityRpcName = "bfa_p5_v2_capacity_claim" | "bfa_p5_v2_voice_inspect";
export interface VoiceV2CapacityRpcClient {
  /** Protected service-role transport bound to the exact invocation. Disable
   * transparent retry, credential replay and legacy fallback. A service role
   * alone establishes neither participant Auth nor trusted service ownership. */
  rpc(name: VoiceV2CapacityRpcName, args: Readonly<Record<string, unknown>>): PromiseLike<unknown>;
}
export type VoiceV2CapacityStatus = "claimed" | "denied" | "closed";
export interface VoiceV2CapacityAck {
  readonly protocol: 2;
  readonly proof: VoiceV2ProofReceipt;
  readonly status: VoiceV2CapacityStatus;
}
export interface VoiceV2CapacityRpcPorts {
  readonly claim: (proof: VoiceV2ProofReceipt) => Promise<VoiceV2CapacityAck>;
  readonly inspect: (proof: VoiceV2ProofReceipt) => Promise<VoiceV2CapacityAck>;
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
  throw new Error("voice-v2-capacity-rpc-unavailable");
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
function freezeProof(proof: VoiceV2ProofReceipt): VoiceV2ProofReceipt {
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
function sameProof(a: VoiceV2ProofReceipt, b: VoiceV2ProofReceipt): boolean {
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

const Ack = wireObject({
  protocol: z.literal(2),
  proof: Proof,
  status: z.enum(["claimed", "denied", "closed"]),
});

/** One exact v2 proof-consuming SQL invocation per deliberate call. The host
 * must retain the original immutable request before invoking this mapping,
 * establish owned service/claim/cleanup and issuance provenance, and obtain
 * independently verified current request-bound Auth/policy. A well-shaped
 * registration receipt alone cannot establish those requirements.
 *
 * Claim performs combined admission and capacity allocation against shared
 * accounting; it never falls back to base-only admission or lazy attachment.
 * Inspect requires the exact existing claim and capacity allocation plus
 * current quota/route/pool; it creates no claim, allocation or new usage debit.
 * SQL consumes a matching unused proof even when later eligibility or capacity
 * checks deny. Different deliberate inspections require distinct receipts;
 * an uncertain response never justifies replacing an operation's identity.
 *
 * The full protocol-2 reply must echo every immutable request field, including
 * original verification/deadline metadata. A denial or lost/malformed response
 * can follow committed consumption, negative fences or capacity effects; it
 * does not prove rollback. This adapter neither samples time nor retries,
 * refreshes verification, reconciles holds or creates a new proof identity.
 *
 * Even claimed is an offline observation, not provider-dispatch permission or
 * proof of current Auth, genuine transport, closure or provider finality. A
 * closed result does not establish that a marked operation ended or its holds
 * were refunded. Capacity mark, host wiring and quiesced no-fallback cutover
 * remain separate unfinished dependencies. The v1 admission interface is not
 * structurally implemented here, and no active route composes this module.
 */
export function createVoiceV2CapacityRpcPorts(
  client: VoiceV2CapacityRpcClient,
): VoiceV2CapacityRpcPorts {
  let invoke: VoiceV2CapacityRpcClient["rpc"];
  try {
    if (!client) return unavailable();
    const rpc = client.rpc;
    if (typeof rpc !== "function") return unavailable();
    invoke = rpc.bind(client);
  } catch {
    return unavailable();
  }
  async function consume(
    operation: VoiceV2ProofReceipt["operation"],
    rawProof: VoiceV2ProofReceipt,
  ): Promise<VoiceV2CapacityAck> {
    return guarded(async () => {
      const proof = freezeProof(Proof.parse(rawProof));
      if (proof.operation !== operation) return unavailable();
      const name = operation === "claim" ? "bfa_p5_v2_capacity_claim" : "bfa_p5_v2_voice_inspect";
      const ack = Ack.parse(unwrap(await invoke(name, Object.freeze({ p_proof: proof }))));
      if (!sameProof(proof, ack.proof)) return unavailable();
      return Object.freeze({ protocol: 2, proof: freezeProof(ack.proof), status: ack.status });
    });
  }
  return Object.freeze({
    claim: (proof: VoiceV2ProofReceipt) => consume("claim", proof),
    inspect: (proof: VoiceV2ProofReceipt) => consume("inspect", proof),
  });
}
