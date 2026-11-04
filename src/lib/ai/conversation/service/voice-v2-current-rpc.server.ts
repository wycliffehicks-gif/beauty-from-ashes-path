// Inactive v2 post-issuance current-state transport only. No Auth client,
// clock, credentials, admission, provider call, route or cutover is installed.
import "@tanstack/react-start/server-only";
import { z } from "zod";

export type VoiceV2CurrentRpcName = "bfa_p5_v2_read_current";
export interface VoiceV2CurrentRpcClient {
  /** Protected service-role transport associated with this exact invocation.
   * Disable transparent retry, credential replay and legacy fallback. A service
   * role does not establish participant Auth or owned service provenance. */
  rpc(name: VoiceV2CurrentRpcName, args: Readonly<Record<string, unknown>>): PromiseLike<unknown>;
}
export interface VoiceV2CurrentQuery {
  readonly protocol: 2;
  readonly ownerId: string;
  /** Independently verified actual Auth session, never an invented episode. */
  readonly authSessionId: string;
  readonly parentVersion: number;
  readonly threadId: string;
  readonly attemptId: string;
  /** Exact keyed fingerprint of the owned, already-registered sealed authority. */
  readonly authorityFingerprint: string;
  /** Original conservative request-bound verification start; never refreshed. */
  readonly verifiedAt: number;
  /** Independently verified current Auth/policy ceiling, not merely JWT exp. */
  readonly identityExpiresAt: number;
}
interface OwnedThread {
  readonly ownerId: string;
  readonly threadId: string;
  readonly threadIncarnation: string;
  readonly threadRevision: number;
}
export interface VoiceV2CurrentSnapshot extends OwnedThread {
  readonly deleted: false;
  readonly allowlist: Readonly<{ ownerId: string; admitted: true; expiresAt: number }>;
  readonly authority: Readonly<
    OwnedThread & {
      fingerprint: string;
      issuedAt: number;
      expiresAt: number;
      revoked: false;
    }
  >;
  readonly approval: Readonly<
    OwnedThread & {
      id: string;
      digest: string;
      scope: "developer-voice-session";
      attemptId: string;
      expiresAt: number;
      revoked: false;
    }
  >;
}
export interface VoiceV2CurrentReceipt {
  readonly protocol: 2;
  readonly request: VoiceV2CurrentQuery;
  readonly current: VoiceV2CurrentSnapshot;
}
export interface VoiceV2CurrentRpcPorts {
  readonly readCurrent: (query: VoiceV2CurrentQuery) => Promise<VoiceV2CurrentReceipt | null>;
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
const Query = wireObject({
  protocol: z.literal(2),
  ownerId: Id,
  authSessionId: Id,
  parentVersion: Count,
  threadId: Id,
  attemptId: Id,
  authorityFingerprint: Digest,
  verifiedAt: Count,
  identityExpiresAt: Expiry,
}).transform((query, context) => {
  // Cross-field access occurs only after successful own-data parsing.
  if (query.identityExpiresAt <= query.verifiedAt)
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid verification interval" });
  return query;
});
const ThreadShape = {
  ownerId: Id,
  threadId: Id,
  threadIncarnation: Id,
  threadRevision: Count,
};
const Authority = wireObject({
  ...ThreadShape,
  fingerprint: Digest,
  issuedAt: Count,
  expiresAt: Expiry,
  revoked: z.literal(false),
}).transform((authority, context) => {
  if (
    authority.expiresAt <= authority.issuedAt ||
    authority.expiresAt - authority.issuedAt > 900_000
  )
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid authority interval" });
  return authority;
});
const Current = wireObject({
  ...ThreadShape,
  deleted: z.literal(false),
  allowlist: wireObject({ ownerId: Id, admitted: z.literal(true), expiresAt: Expiry }),
  authority: Authority,
  approval: wireObject({
    ...ThreadShape,
    id: Id,
    digest: Digest,
    scope: z.literal("developer-voice-session"),
    attemptId: Id,
    expiresAt: Expiry,
    revoked: z.literal(false),
  }),
});
const Receipt = wireObject({ protocol: z.literal(2), request: Query, current: Current });

function unavailable(): never {
  // Do not expose SQL bodies, identifiers, fingerprints, tokens or error causes.
  throw new Error("voice-v2-current-rpc-unavailable");
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
function sameQuery(a: VoiceV2CurrentQuery, b: VoiceV2CurrentQuery): boolean {
  return (
    a.protocol === b.protocol &&
    a.ownerId === b.ownerId &&
    a.authSessionId === b.authSessionId &&
    a.parentVersion === b.parentVersion &&
    a.threadId === b.threadId &&
    a.attemptId === b.attemptId &&
    a.authorityFingerprint === b.authorityFingerprint &&
    a.verifiedAt === b.verifiedAt &&
    a.identityExpiresAt === b.identityExpiresAt
  );
}
function sameThread(a: OwnedThread, b: OwnedThread): boolean {
  return (
    a.ownerId === b.ownerId &&
    a.threadId === b.threadId &&
    a.threadIncarnation === b.threadIncarnation &&
    a.threadRevision === b.threadRevision
  );
}
function freezeReceipt(receipt: VoiceV2CurrentReceipt): VoiceV2CurrentReceipt {
  Object.freeze(receipt.request);
  Object.freeze(receipt.current.allowlist);
  Object.freeze(receipt.current.authority);
  Object.freeze(receipt.current.approval);
  Object.freeze(receipt.current);
  return Object.freeze(receipt);
}

/** One exact versioned post-issuance current observation, before any claim is
 * required. The trusted host must establish independently verified current
 * request-bound Auth, owned service/issuance provenance, and a genuine protected
 * nonretrying transport. A clear parent, service role or echoed record cannot
 * establish those facts. No browser-supplied metadata is accepted as authority.
 *
 * SQL binds the exact retained Auth parent/session/version and immutable v2
 * issuance to current thread/generation, allowlist and exact attempt approval,
 * excluding every retained legacy fence. Fresh original verification and current
 * deadlines are checked after all locks. Only owner-clock high-water may advance;
 * this reader creates no claim/proof and changes no lifetime/accounting/revocation.
 * Null denies and is not proof of absence, a backfill instruction or permission
 * to manufacture permanent revocation. Lost/malformed replies can follow a
 * committed high-water observation; failures never imply automatic retry.
 *
 * Every original query field, including both time fields, is echoed and matched.
 * This adapter validates static intervals and exact cross-record identity only.
 * It has no clock and cannot prove that a returned snapshot remains current.
 * Original issuance expiry may exceed a fresh shorter Auth ceiling; a future
 * verifier must use the minimum and recheck time/Auth after waits. Do not renew
 * the issuance, alter the query or infer a fresh time from this response.
 *
 * The returned envelope is neither admission nor provider permission and does
 * not implement the unchanged v1 current-reader interface. V2 verifier/owned
 * orchestration and quiesced no-fallback route/privilege cutover remain required.
 */
export function createVoiceV2CurrentRpcPorts(
  client: VoiceV2CurrentRpcClient,
): VoiceV2CurrentRpcPorts {
  let invoke: VoiceV2CurrentRpcClient["rpc"];
  try {
    if (!client) return unavailable();
    const rpc = client.rpc;
    if (typeof rpc !== "function") return unavailable();
    invoke = rpc.bind(client);
  } catch {
    return unavailable();
  }
  return Object.freeze({
    readCurrent(rawQuery: VoiceV2CurrentQuery) {
      return guarded(async () => {
        const query = Object.freeze(Query.parse(rawQuery));
        const raw = unwrap(
          await invoke("bfa_p5_v2_read_current", Object.freeze({ p_request: query })),
        );
        if (raw === null) return null;
        const receipt = Receipt.parse(raw);
        const current = receipt.current;
        if (
          !sameQuery(query, receipt.request) ||
          current.ownerId !== query.ownerId ||
          current.threadId !== query.threadId ||
          current.allowlist.ownerId !== query.ownerId ||
          current.authority.fingerprint !== query.authorityFingerprint ||
          current.approval.attemptId !== query.attemptId ||
          !sameThread(current, current.authority) ||
          !sameThread(current, current.approval) ||
          current.allowlist.expiresAt <= query.verifiedAt ||
          current.authority.expiresAt <= query.verifiedAt ||
          current.approval.expiresAt <= query.verifiedAt
        )
          return unavailable();
        return freezeReceipt(receipt);
      });
    },
  });
}
