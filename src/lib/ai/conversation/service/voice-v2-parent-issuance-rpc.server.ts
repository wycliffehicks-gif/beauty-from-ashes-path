// Inactive v2 SQL mappings only. No client, credentials, Auth verifier, route,
// retry, migration/cutover, provider operation or participant grant is installed.
import "@tanstack/react-start/server-only";
import { z } from "zod";

export type VoiceV2ParentIssuanceRpcName =
  | "bfa_p5_v2_observe_parent"
  | "bfa_p5_v2_revoke_parent"
  | "bfa_p5_v2_read_parent"
  | "bfa_p5_v2_register_issuance"
  | "bfa_p5_v2_read_issuance";

export interface VoiceV2ParentIssuanceRpcClient {
  /** Mandatory protected service-role transport supplied by a verified host.
   * It must associate each reply with this exact call and make no transparent
   * retry, credential refresh/replay or v1 fallback. This adapter cannot inspect
   * the transport's internals or establish its authentication/provenance.
   */
  rpc(
    name: VoiceV2ParentIssuanceRpcName,
    args: Readonly<Record<string, unknown>>,
  ): PromiseLike<unknown>;
}
export interface VoiceV2ParentQuery {
  readonly ownerId: string;
  /** The actual independently verified Auth session, never an episode ID. */
  readonly authSessionId: string;
}
export interface VoiceV2ParentObservationQuery extends VoiceV2ParentQuery {
  /** Conservative server verification time; never browser/JWT metadata. */
  readonly verifiedAt: number;
  /** Independently established current Auth/policy ceiling, not just parsed exp. */
  readonly authExpiresAt: number;
}
export interface VoiceV2ParentReceipt extends VoiceV2ParentQuery {
  readonly protocol: 2;
  readonly parentVersion: number;
  readonly revoked: boolean;
}
export interface VoiceV2IssuanceReadQuery extends VoiceV2ParentQuery {
  readonly parentVersion: number;
  readonly authorityFingerprint: string;
}
export interface VoiceV2IssuanceRegistration extends VoiceV2ParentObservationQuery {
  readonly parentVersion: number;
  readonly threadId: string;
  readonly threadIncarnation: string;
  readonly threadRevision: number;
  readonly authorityFingerprint: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
}
export interface VoiceV2IssuanceReceipt extends VoiceV2IssuanceReadQuery {
  readonly protocol: 2;
  readonly threadId: string;
  readonly threadIncarnation: string;
  readonly threadRevision: number;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly revoked: false;
}
export interface VoiceV2ParentIssuanceRpcPorts {
  readonly observeParent: (
    query: VoiceV2ParentObservationQuery,
  ) => Promise<(VoiceV2ParentReceipt & { readonly revoked: false }) | null>;
  readonly revokeParent: (
    query: VoiceV2ParentQuery,
  ) => Promise<(VoiceV2ParentReceipt & { readonly revoked: true }) | null>;
  readonly readParent: (query: VoiceV2ParentQuery) => Promise<VoiceV2ParentReceipt | null>;
  readonly registerIssuance: (
    query: VoiceV2IssuanceRegistration,
  ) => Promise<VoiceV2IssuanceReceipt | null>;
  readonly readIssuance: (
    query: VoiceV2IssuanceReadQuery,
  ) => Promise<VoiceV2IssuanceReceipt | null>;
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
const PairShape = { ownerId: Id, authSessionId: Id };
const ObservationShape = { ...PairShape, verifiedAt: Count, authExpiresAt: Expiry };
const AssociationShape = {
  ...PairShape,
  parentVersion: Count,
  authorityFingerprint: Digest,
};
const IssuanceShape = {
  ...AssociationShape,
  threadId: Id,
  threadIncarnation: Id,
  threadRevision: Count,
  issuedAt: Count,
  expiresAt: Expiry,
};
const Pair = wireObject(PairShape);
const Observation = wireObject(ObservationShape).transform((value, context) => {
  // Transforms run only after the own-data shape has parsed successfully.
  if (value.authExpiresAt <= value.verifiedAt)
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid verification interval" });
  return value;
});
const Registration = wireObject({
  ...IssuanceShape,
  verifiedAt: Count,
  authExpiresAt: Expiry,
}).transform((value, context) => {
  if (
    value.authExpiresAt <= value.verifiedAt ||
    value.expiresAt <= value.issuedAt ||
    value.expiresAt - value.issuedAt > 900_000 ||
    value.expiresAt > value.authExpiresAt
  )
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid authority interval" });
  return value;
});
const Association = wireObject(AssociationShape);
const ParentShape = { protocol: z.literal(2), ...PairShape, parentVersion: Count };
const ParentReceipt = wireObject({ ...ParentShape, revoked: z.boolean() });
const ObservedParentReceipt = wireObject({ ...ParentShape, revoked: z.literal(false) });
const RevokedParentReceipt = wireObject({ ...ParentShape, revoked: z.literal(true) });
const IssuanceReceipt = wireObject({
  protocol: z.literal(2),
  ...IssuanceShape,
  revoked: z.literal(false),
}).transform((value, context) => {
  if (value.expiresAt <= value.issuedAt || value.expiresAt - value.issuedAt > 900_000)
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid authority interval" });
  return value;
});
function unavailable(): never {
  // No raw response, body, identity, Auth material or cause escapes.
  throw new Error("voice-v2-parent-issuance-rpc-unavailable");
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
function sameParent(a: VoiceV2ParentQuery, b: VoiceV2ParentQuery) {
  return a.ownerId === b.ownerId && a.authSessionId === b.authSessionId;
}
function sameAssociation(a: VoiceV2IssuanceReadQuery, b: VoiceV2IssuanceReadQuery) {
  return (
    sameParent(a, b) &&
    a.parentVersion === b.parentVersion &&
    a.authorityFingerprint === b.authorityFingerprint
  );
}
function pairArgs(query: VoiceV2ParentQuery) {
  return { p_owner_id: query.ownerId, p_auth_session_id: query.authSessionId };
}

/** Exact inactive v2 draft mappings. The trusted host must independently verify
 * request-bound owner/session, current Auth/policy eligibility and new service
 * snapshot provenance before supplying metadata. Shape validation, a service
 * role, parent nonrevocation or a returned row establishes none of those facts.
 * Parent records have no eligibility expiry: they are terminal negative fences.
 *
 * SQL controls locked time/high-water and legacy-fence exclusion; this adapter
 * deliberately has no local clock. Parent reads can report revoked state and
 * issuance reads can already be stale on arrival. Neither is an authorization,
 * proof, approval, budget, admission or provider-dispatch grant. The issuance
 * read may retain only SQL's owner clock; the parent read is nonmutating.
 * Responses never justify renewal.
 *
 * Inputs/results are exact, detached and frozen. One invocation is made for
 * each call. Null is semantic denial, never proof that an absent/tombstoned or
 * uncertain record can be recreated. SQL does not echo verification time or
 * Auth deadline, so associating them with the reply remains a mandatory trusted
 * exact-call transport precondition. Lost/malformed/late replies do not prove
 * rollback, cause retry, or authorize a fresh fingerprint/identity replacement.
 *
 * This slice remains nondeployable while the complete v2 eligibility chain and
 * quiesced no-fallback cutover are unfinished. It changes no legacy RPC/grants.
 */
export function createVoiceV2ParentIssuanceRpcPorts(
  client: VoiceV2ParentIssuanceRpcClient,
): VoiceV2ParentIssuanceRpcPorts {
  let invoke: VoiceV2ParentIssuanceRpcClient["rpc"];
  try {
    if (!client) return unavailable();
    const rpc = client.rpc;
    if (typeof rpc !== "function") return unavailable();
    invoke = rpc.bind(client);
  } catch {
    return unavailable();
  }
  async function call(name: VoiceV2ParentIssuanceRpcName, args: Record<string, unknown>) {
    return unwrap(await invoke(name, Object.freeze(args)));
  }
  return Object.freeze({
    observeParent(rawQuery: VoiceV2ParentObservationQuery) {
      return guarded(async () => {
        const query = Object.freeze(Observation.parse(rawQuery));
        const raw = await call("bfa_p5_v2_observe_parent", {
          ...pairArgs(query),
          p_verified_ms: query.verifiedAt,
          p_auth_expires_ms: query.authExpiresAt,
        });
        if (raw === null) return null;
        const receipt = ObservedParentReceipt.parse(raw);
        if (!sameParent(query, receipt)) return unavailable();
        return Object.freeze(receipt);
      });
    },
    revokeParent(rawQuery: VoiceV2ParentQuery) {
      return guarded(async () => {
        const query = Object.freeze(Pair.parse(rawQuery));
        const raw = await call("bfa_p5_v2_revoke_parent", pairArgs(query));
        if (raw === null) return null;
        const receipt = RevokedParentReceipt.parse(raw);
        if (!sameParent(query, receipt)) return unavailable();
        return Object.freeze(receipt);
      });
    },
    readParent(rawQuery: VoiceV2ParentQuery) {
      return guarded(async () => {
        const query = Object.freeze(Pair.parse(rawQuery));
        const raw = await call("bfa_p5_v2_read_parent", pairArgs(query));
        if (raw === null) return null;
        const receipt = ParentReceipt.parse(raw);
        if (!sameParent(query, receipt)) return unavailable();
        return Object.freeze(receipt);
      });
    },
    registerIssuance(rawQuery: VoiceV2IssuanceRegistration) {
      return guarded(async () => {
        const query = Object.freeze(Registration.parse(rawQuery));
        const raw = await call("bfa_p5_v2_register_issuance", {
          ...pairArgs(query),
          p_parent_version: query.parentVersion,
          p_thread_id: query.threadId,
          p_incarnation: query.threadIncarnation,
          p_revision: query.threadRevision,
          p_fingerprint: query.authorityFingerprint,
          p_verified_ms: query.verifiedAt,
          p_auth_expires_ms: query.authExpiresAt,
          p_issued_ms: query.issuedAt,
          p_expires_ms: query.expiresAt,
        });
        if (raw === null) return null;
        const receipt = IssuanceReceipt.parse(raw);
        if (
          !sameAssociation(query, receipt) ||
          query.threadId !== receipt.threadId ||
          query.threadIncarnation !== receipt.threadIncarnation ||
          query.threadRevision !== receipt.threadRevision ||
          query.issuedAt !== receipt.issuedAt ||
          query.expiresAt !== receipt.expiresAt
        )
          return unavailable();
        return Object.freeze(receipt);
      });
    },
    readIssuance(rawQuery: VoiceV2IssuanceReadQuery) {
      return guarded(async () => {
        const query = Object.freeze(Association.parse(rawQuery));
        const raw = await call("bfa_p5_v2_read_issuance", {
          ...pairArgs(query),
          p_parent_version: query.parentVersion,
          p_fingerprint: query.authorityFingerprint,
        });
        if (raw === null) return null;
        const receipt = IssuanceReceipt.parse(raw);
        if (!sameAssociation(query, receipt)) return unavailable();
        return Object.freeze(receipt);
      });
    },
  });
}
