// Inactive v2 pre-issuance mappings only. No client, credentials, Auth verifier,
// route, retry, migration/cutover, sealed authority or provider grant is installed.
import "@tanstack/react-start/server-only";
import { z } from "zod";

export type VoiceV2PreissueRpcName =
  | "bfa_p5_v2_read_current_thread"
  | "bfa_p5_v2_register_generation";

export interface VoiceV2PreissueRpcClient {
  /** Trusted service-role host transport, associated with each exact invocation.
   * It must disable transparent retry, credential refresh/replay and v1 fallback.
   * A transport object or service role does not establish participant Auth.
   */
  rpc(name: VoiceV2PreissueRpcName, args: Readonly<Record<string, unknown>>): PromiseLike<unknown>;
}
export interface VoiceV2CurrentThreadQuery {
  readonly ownerId: string;
  /** Independently verified actual Auth session, never an invented episode ID. */
  readonly authSessionId: string;
  readonly parentVersion: number;
  readonly threadId: string;
  /** Conservative trusted-host observation, not caller/JWT metadata. */
  readonly verifiedAt: number;
  /** Independently established current Auth/policy ceiling, not merely JWT exp. */
  readonly authExpiresAt: number;
}
export interface VoiceV2GenerationRegistration extends VoiceV2CurrentThreadQuery {
  readonly threadRevision: number;
  /** Exact protected metadata, retaining all six UTC microsecond digits. */
  readonly sourceCreatedAt: string;
}
export interface VoiceV2CurrentThreadReceipt {
  readonly protocol: 2;
  readonly ownerId: string;
  readonly authSessionId: string;
  readonly parentVersion: number;
  readonly threadId: string;
  readonly threadRevision: number;
  readonly sourceCreatedAt: string;
  readonly threadIncarnation: string | null;
  readonly deleted: false;
  readonly allowlist: Readonly<{ ownerId: string; admitted: true; expiresAt: number }>;
}
export interface VoiceV2GenerationReceipt extends VoiceV2CurrentThreadReceipt {
  readonly threadIncarnation: string;
}
export interface VoiceV2PreissueRpcPorts {
  readonly readCurrentThread: (
    query: VoiceV2CurrentThreadQuery,
  ) => Promise<VoiceV2CurrentThreadReceipt | null>;
  readonly registerGeneration: (
    query: VoiceV2GenerationRegistration,
  ) => Promise<VoiceV2GenerationReceipt | null>;
}

const Id = z
  .string()
  .uuid()
  .refine(
    (value) => value === value.toLowerCase() && value !== "00000000-0000-0000-0000-000000000000",
  );
const Count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const Expiry = Count.positive();
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
// Never parse through Date: JS milliseconds would discard the final three
// digits. This Gregorian UTC consistency metadata is not freshness/incarnation.
function canonicalSourceCreatedAt(value: string): boolean {
  if (value.length !== 27) return false;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.\d{6}Z$/.exec(value);
  if (!parts) return false;
  const [year, month, day, hour, minute, second] = parts.slice(1).map(Number);
  if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}
const SourceCreatedAt = z.string().refine(canonicalSourceCreatedAt);
const QueryShape = {
  ownerId: Id,
  authSessionId: Id,
  parentVersion: Count,
  threadId: Id,
  verifiedAt: Count,
  authExpiresAt: Expiry,
};
function validAuthInterval<T extends { verifiedAt: number; authExpiresAt: number }>(
  value: T,
  context: z.RefinementCtx,
) {
  if (value.authExpiresAt <= value.verifiedAt)
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid verification interval" });
  return value;
}
// Transforms run only after strict own-data parsing, never on rejected accessors.
const Query = wireObject(QueryShape).transform(validAuthInterval);
const Registration = wireObject({
  ...QueryShape,
  threadRevision: Count,
  sourceCreatedAt: SourceCreatedAt,
}).transform(validAuthInterval);
const CurrentShape = {
  protocol: z.literal(2),
  ownerId: Id,
  authSessionId: Id,
  parentVersion: Count,
  threadId: Id,
  threadRevision: Count,
  sourceCreatedAt: SourceCreatedAt,
  deleted: z.literal(false),
  allowlist: wireObject({ ownerId: Id, admitted: z.literal(true), expiresAt: Expiry }),
};
const Current = wireObject({ ...CurrentShape, threadIncarnation: Id.nullable() });
const Registered = wireObject({ ...CurrentShape, threadIncarnation: Id });
function unavailable(): never {
  // Raw responses, SQL errors, private identifiers and causes never escape.
  throw new Error("voice-v2-preissue-rpc-unavailable");
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
function matchesQuery(query: VoiceV2CurrentThreadQuery, current: VoiceV2CurrentThreadReceipt) {
  return (
    query.ownerId === current.ownerId &&
    query.authSessionId === current.authSessionId &&
    query.parentVersion === current.parentVersion &&
    query.threadId === current.threadId &&
    query.ownerId === current.allowlist.ownerId
  );
}
function baseArgs(query: VoiceV2CurrentThreadQuery) {
  return {
    p_owner_id: query.ownerId,
    p_auth_session_id: query.authSessionId,
    p_parent_version: query.parentVersion,
    p_thread_id: query.threadId,
  };
}
function authArgs(query: VoiceV2CurrentThreadQuery) {
  return { p_verified_ms: query.verifiedAt, p_auth_expires_ms: query.authExpiresAt };
}
function freezeCurrent<T extends VoiceV2CurrentThreadReceipt>(current: T): Readonly<T> {
  Object.freeze(current.allowlist);
  return Object.freeze(current);
}

/** Exact inactive v2 draft mappings, not a trusted issuer or Auth verifier.
 * The host must independently establish request-bound owner/session/policy and
 * protected thread/service provenance before invoking these ports. A clear
 * parent is only a terminal negative fence, not continuing eligibility.
 *
 * SQL controls fresh time after locks, exact parent/version, legacy exclusion,
 * current thread/allowlist and immutable generation. Both operations may retain
 * owner-clock high-water; registration may also insert the absent generation.
 * No issuance is required at this stage, and no other accounting is changed.
 * Registration returns the same retained valid generation or a newly allocated
 * database UUID. The host must separately compare any prior read incarnation;
 * raw metadata/receipts cannot establish a new service snapshot or authority.
 *
 * Each call owns detached frozen inputs/results and invokes one captured port.
 * Null is semantic denial, not proof of absence or permission to backfill.
 * Lost/malformed/late replies do not prove rollback and never cause automatic
 * retry or identity replacement. Verification time/Auth ceiling are not echoed;
 * exact invocation association is a trusted nonretrying transport precondition.
 * This adapter uses no local clock and cannot make Auth/SQL atomic. A returned
 * snapshot may already be stale and is not issuance/admission/dispatch authority.
 * Complete v2 issuer/proof/cleanup/capacity and quiesced cutover remain required.
 */
export function createVoiceV2PreissueRpcPorts(
  client: VoiceV2PreissueRpcClient,
): VoiceV2PreissueRpcPorts {
  let invoke: VoiceV2PreissueRpcClient["rpc"];
  try {
    if (!client) return unavailable();
    const rpc = client.rpc;
    if (typeof rpc !== "function") return unavailable();
    invoke = rpc.bind(client);
  } catch {
    return unavailable();
  }
  async function call(name: VoiceV2PreissueRpcName, args: Record<string, unknown>) {
    return unwrap(await invoke(name, Object.freeze(args)));
  }
  return Object.freeze({
    readCurrentThread(rawQuery: VoiceV2CurrentThreadQuery) {
      return guarded(async () => {
        const query = Object.freeze(Query.parse(rawQuery));
        const raw = await call("bfa_p5_v2_read_current_thread", {
          ...baseArgs(query),
          ...authArgs(query),
        });
        if (raw === null) return null;
        const current = Current.parse(raw);
        if (!matchesQuery(query, current)) return unavailable();
        return freezeCurrent(current);
      });
    },
    registerGeneration(rawQuery: VoiceV2GenerationRegistration) {
      return guarded(async () => {
        const query = Object.freeze(Registration.parse(rawQuery));
        const raw = await call("bfa_p5_v2_register_generation", {
          ...baseArgs(query),
          p_revision: query.threadRevision,
          p_source_created_at: query.sourceCreatedAt,
          ...authArgs(query),
        });
        if (raw === null) return null;
        const current = Registered.parse(raw);
        if (
          !matchesQuery(query, current) ||
          current.threadRevision !== query.threadRevision ||
          current.sourceCreatedAt !== query.sourceCreatedAt
        )
          return unavailable();
        return freezeCurrent(current);
      });
    },
  });
}
