// Inactive v2 cleanup mappings only. No client, credentials, Auth verifier,
// route, retry, migration/cutover, close or provider operation is installed.
import "@tanstack/react-start/server-only";
import { z } from "zod";
import type { VoiceAdmissionClaim } from "./voice-admission.server";

export type VoiceV2CleanupRpcName = "bfa_p5_v2_register_cleanup" | "bfa_p5_v2_read_cleanup";
export interface VoiceV2CleanupRpcClient {
  /** Protected service-role transport with exact invocation/reply association.
   * Disable transparent retry, credential replay and v1 fallback. This object
   * and service role cannot establish participant Auth or ownership. */
  rpc(name: VoiceV2CleanupRpcName, args: Readonly<Record<string, unknown>>): PromiseLike<unknown>;
}
export interface VoiceV2CleanupReadQuery {
  readonly cleanupId: string;
  readonly claim: VoiceAdmissionClaim;
  /** Actual independently verified Auth identity, not an invented episode ID. */
  readonly authSessionId: string;
  readonly parentVersion: number;
  readonly authorityFingerprint: string;
}
export interface VoiceV2CleanupRegistration extends VoiceV2CleanupReadQuery {
  /** Conservative current request-bound trusted Auth observation. */
  readonly verifiedAt: number;
  /** Independently established current Auth/policy ceiling, not parsed exp. */
  readonly authExpiresAt: number;
}
export interface VoiceV2CleanupReceipt extends VoiceV2CleanupReadQuery {
  readonly protocol: 2;
  readonly effectiveExpiresAt: number;
  readonly closedAt: number | null;
  readonly expiredAt: number | null;
  readonly invalidatedAt: number | null;
}
export type VoiceV2CleanupRegisteredReceipt = VoiceV2CleanupReceipt & {
  readonly closedAt: null;
  readonly expiredAt: null;
  readonly invalidatedAt: null;
};
export interface VoiceV2CleanupRpcPorts {
  readonly registerCleanup: (
    query: VoiceV2CleanupRegistration,
  ) => Promise<VoiceV2CleanupRegisteredReceipt | null>;
  readonly readCleanup: (query: VoiceV2CleanupReadQuery) => Promise<VoiceV2CleanupReceipt | null>;
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
const AssociationShape = {
  cleanupId: Id,
  claim: Claim,
  authSessionId: Id,
  parentVersion: Count,
  authorityFingerprint: Digest,
};
const ReadQuery = wireObject(AssociationShape);
const Registration = wireObject({
  ...AssociationShape,
  verifiedAt: Count,
  authExpiresAt: Expiry,
}).transform((value, context) => {
  // Successful own-data parsing precedes any cross-field access.
  if (value.authExpiresAt <= value.verifiedAt)
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid verification interval" });
  return value;
});
const ReceiptShape = {
  protocol: z.literal(2),
  ...AssociationShape,
  effectiveExpiresAt: Expiry,
};
function validCeiling<T extends { claim: VoiceAdmissionClaim; effectiveExpiresAt: number }>(
  value: T,
  context: z.RefinementCtx,
) {
  if (value.effectiveExpiresAt > value.claim.expiresAt)
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid cleanup interval" });
  return value;
}
const Receipt = wireObject({
  ...ReceiptShape,
  closedAt: Count.nullable(),
  expiredAt: Count.nullable(),
  invalidatedAt: Count.nullable(),
}).transform(validCeiling);
const RegisteredReceipt = wireObject({
  ...ReceiptShape,
  closedAt: z.null(),
  expiredAt: z.null(),
  invalidatedAt: z.null(),
}).transform(validCeiling);
function unavailable(): never {
  // Never propagate SQL details, raw replies, private identifiers or a cause.
  throw new Error("voice-v2-cleanup-rpc-unavailable");
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
function freezeAssociation<T extends VoiceV2CleanupReadQuery>(value: T): Readonly<T> {
  Object.freeze(value.claim.binding);
  Object.freeze(value.claim);
  return Object.freeze(value);
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
function sameAssociation(a: VoiceV2CleanupReadQuery, b: VoiceV2CleanupReadQuery): boolean {
  return (
    a.cleanupId === b.cleanupId &&
    sameClaim(a.claim, b.claim) &&
    a.authSessionId === b.authSessionId &&
    a.parentVersion === b.parentVersion &&
    a.authorityFingerprint === b.authorityFingerprint
  );
}
function associationArgs(query: VoiceV2CleanupReadQuery) {
  return {
    p_cleanup_id: query.cleanupId,
    p_claim: query.claim,
    p_auth_session_id: query.authSessionId,
    p_parent_version: query.parentVersion,
    p_fingerprint: query.authorityFingerprint,
  };
}

/** Exact inactive mappings, not Auth, proof, admission, capacity or dispatch.
 * A trusted host must retain the exact preallocated claim/cleanup identity and
 * establish its service ownership, current request-bound Auth/policy and newly
 * issued v2 fingerprint association. Shapes and a service role prove none of it.
 * SQL registration controls post-lock time and current eligibility; it never
 * adopts a legacy/unbound row, reopens terminal cleanup or extends its ceiling.
 * Verification time/Auth ceiling are not echoed, so exact invocation/reply
 * association remains a mandatory trusted nonretrying transport requirement.
 *
 * Read returns only the matching persisted v2 record, including terminal or
 * expired metadata after Auth revocation. It is nonmutating, uses no clock and
 * cannot establish current eligibility. Null never proves absence or rollback.
 * Every call captures detached frozen inputs and makes one request; lost,
 * malformed or late responses never retry, create another identity or release
 * holds. The host must retain uncertain request evidence before calling. No
 * returned record is a grant, close acknowledgment or provider-finality proof.
 * Full v2 proof/admission/capacity and quiesced no-fallback cutover remain open.
 */
export function createVoiceV2CleanupRpcPorts(
  client: VoiceV2CleanupRpcClient,
): VoiceV2CleanupRpcPorts {
  let invoke: VoiceV2CleanupRpcClient["rpc"];
  try {
    if (!client) return unavailable();
    const rpc = client.rpc;
    if (typeof rpc !== "function") return unavailable();
    invoke = rpc.bind(client);
  } catch {
    return unavailable();
  }
  async function call(name: VoiceV2CleanupRpcName, args: Record<string, unknown>) {
    return unwrap(await invoke(name, Object.freeze(args)));
  }
  return Object.freeze({
    registerCleanup(rawQuery: VoiceV2CleanupRegistration) {
      return guarded(async () => {
        const query = freezeAssociation(Registration.parse(rawQuery));
        const raw = await call("bfa_p5_v2_register_cleanup", {
          ...associationArgs(query),
          p_verified_ms: query.verifiedAt,
          p_auth_expires_ms: query.authExpiresAt,
        });
        if (raw === null) return null;
        const receipt = RegisteredReceipt.parse(raw);
        if (
          !sameAssociation(query, receipt) ||
          receipt.effectiveExpiresAt <= query.verifiedAt ||
          receipt.effectiveExpiresAt > query.authExpiresAt
        )
          return unavailable();
        return freezeAssociation(receipt);
      });
    },
    readCleanup(rawQuery: VoiceV2CleanupReadQuery) {
      return guarded(async () => {
        const query = freezeAssociation(ReadQuery.parse(rawQuery));
        const raw = await call("bfa_p5_v2_read_cleanup", associationArgs(query));
        if (raw === null) return null;
        const receipt = Receipt.parse(raw);
        if (!sameAssociation(query, receipt)) return unavailable();
        return freezeAssociation(receipt);
      });
    },
  });
}
