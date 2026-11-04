// Inactive v2 capacity-marker transport only. No client, credentials, Auth
// verifier, clock, route, provider call, retry or runtime cutover is installed.
import "@tanstack/react-start/server-only";
import { z } from "zod";
import type { VoiceAdmissionClaim } from "./voice-admission.server";
import type { VoiceV2ProofReceipt } from "./voice-v2-proof-rpc.server";

export type VoiceV2MarkRpcName = "bfa_p5_v2_capacity_mark";
export interface VoiceV2MarkRpcClient {
  /** Protected service-role transport bound to the exact invocation. Disable
   * transparent retry, credential replay and legacy fallback. A service role
   * alone establishes neither participant Auth nor trusted service ownership. */
  rpc(name: VoiceV2MarkRpcName, args: Readonly<Record<string, unknown>>): PromiseLike<unknown>;
}
export interface VoiceV2MarkRequest {
  readonly protocol: 2;
  /** A separate fresh exact inspect receipt; earlier inspect consumes its own. */
  readonly proof: VoiceV2ProofReceipt;
  /** Retain this immutable operation identity before invoking the transport. */
  readonly operationId: string;
  readonly expectedPoolVersion: number;
}
export type VoiceV2MarkStatus = "marked" | "already-marked" | "denied" | "quarantined" | "closed";
export interface VoiceV2MarkAck {
  readonly protocol: 2;
  readonly request: VoiceV2MarkRequest;
  readonly status: VoiceV2MarkStatus;
}
export interface VoiceV2MarkRpcPorts {
  readonly mark: (request: VoiceV2MarkRequest) => Promise<VoiceV2MarkAck>;
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
  operation: z.literal("inspect"),
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
  throw new Error("voice-v2-mark-rpc-unavailable");
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

const Request = wireObject({
  protocol: z.literal(2),
  proof: Proof,
  operationId: Id,
  expectedPoolVersion: Expiry,
});
const Ack = wireObject({
  protocol: z.literal(2),
  request: Request,
  status: z.enum(["marked", "already-marked", "denied", "quarantined", "closed"]),
});
function freezeRequest(request: VoiceV2MarkRequest): VoiceV2MarkRequest {
  freezeProof(request.proof);
  return Object.freeze(request);
}
function sameRequest(a: VoiceV2MarkRequest, b: VoiceV2MarkRequest): boolean {
  return (
    a.protocol === b.protocol &&
    a.operationId === b.operationId &&
    a.expectedPoolVersion === b.expectedPoolVersion &&
    sameProof(a.proof, b.proof)
  );
}

/** One exact v2 marker SQL invocation per deliberate call. The host must retain
 * this original immutable request before invocation and establish genuine
 * protected transport, owned service/claim/cleanup/issuance provenance and
 * independently verified current request-bound Auth/policy. Shape validation
 * and service-role access alone cannot establish these requirements.
 *
 * Mark requires a separate fresh inspect proof: the capacity inspect endpoint
 * consumes its own receipt and cannot supply an unused marker proof. SQL checks
 * the existing shared reservation and current policy after lock waits, consumes
 * an exact unused receipt once on semantic denial, and never refreshes original
 * verification or expiry. This adapter supplies no time, proof or operation ID.
 *
 * Every acknowledgment echoes the entire original request, including the full
 * proof, operation ID and expected pool version. A denial, unavailable reply or
 * malformed acknowledgment may follow committed proof consumption, fences or
 * marking. It proves neither rollback nor permission to retry, obtain a new
 * receipt or replace the operation identity. Exceptions may instead roll back;
 * callers must preserve uncertainty and the original accounting evidence.
 *
 * Even marked is an offline database observation, never a boolean provider
 * permit. Already-marked cannot authorize repeating an external create. Closed
 * does not establish provider termination, whole-operation finality or refunded
 * holds. Exact cleanup/reconciliation, trusted host orchestration and quiesced
 * no-fallback route/privilege cutover remain separate requirements. No active
 * route composes this module and the unchanged v1 interface is not implemented.
 */
export function createVoiceV2MarkRpcPorts(client: VoiceV2MarkRpcClient): VoiceV2MarkRpcPorts {
  let invoke: VoiceV2MarkRpcClient["rpc"];
  try {
    if (!client) return unavailable();
    const rpc = client.rpc;
    if (typeof rpc !== "function") return unavailable();
    invoke = rpc.bind(client);
  } catch {
    return unavailable();
  }
  return Object.freeze({
    mark(rawRequest: VoiceV2MarkRequest) {
      return guarded(async () => {
        const request = freezeRequest(Request.parse(rawRequest));
        const ack = Ack.parse(
          unwrap(await invoke("bfa_p5_v2_capacity_mark", Object.freeze({ p_request: request }))),
        );
        if (!sameRequest(request, ack.request)) return unavailable();
        return Object.freeze({
          protocol: 2,
          request: freezeRequest(ack.request),
          status: ack.status,
        });
      });
    },
  });
}
