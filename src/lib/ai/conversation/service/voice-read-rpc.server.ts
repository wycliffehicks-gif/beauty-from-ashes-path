// Inactive service-only readers. No client, credentials, route, Auth verifier,
// issuance/revocation writer, migration or provider operation is installed here.
import "@tanstack/react-start/server-only";
import { z } from "zod";
import type { VoiceStoreAdapterPorts } from "./voice-store-adapter.server";
import type { VoiceVerificationQuery } from "./voice-verification.server";

export type VoiceReadRpcName = "bfa_p5_voice_read_session_fence" | "bfa_p5_voice_read_current";

/** A trusted server host supplies a protected service-role transport that makes
 * one request without transparent retry or credential refresh/replay. This
 * module cannot inspect that transport's internals. Never accept it or its
 * queries from the browser as authority. No SDK is initialized by this module.
 */
export interface VoiceReadRpcClient {
  rpc(name: VoiceReadRpcName, args: Readonly<Record<string, unknown>>): PromiseLike<unknown>;
}
export type VoiceReadRpcPorts = Readonly<
  Pick<VoiceStoreAdapterPorts, "readSessionFence" | "readCurrent">
>;

const Id = z
  .string()
  .uuid()
  .refine((value) => value === value.toLowerCase());
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
// Wire JSON has exact own enumerable data fields, never accessors or inherited
// identity. Parsing creates detached records before the first asynchronous call.
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
const SessionQuery = wireObject({ ownerId: Id, sessionId: Id });
const CurrentQuery = wireObject({
  ownerId: Id,
  threadId: Id,
  attemptId: Id,
  authorityFingerprint: Digest,
});
const Fence = wireObject({
  ownerId: Id,
  sessionId: Id,
  version: Count,
  expiresAt: Expiry,
  revoked: z.literal(false),
});
const OwnedThread = {
  ownerId: Id,
  threadId: Id,
  threadIncarnation: Id,
  threadRevision: Count,
};
const Current = wireObject({
  ...OwnedThread,
  deleted: z.literal(false),
  allowlist: wireObject({ ownerId: Id, admitted: z.literal(true), expiresAt: Expiry }),
  authority: wireObject({
    ...OwnedThread,
    fingerprint: Digest,
    expiresAt: Expiry,
    revoked: z.literal(false),
  }),
  approval: wireObject({
    ...OwnedThread,
    id: Id,
    digest: Digest,
    scope: z.literal("developer-voice-session"),
    attemptId: Id,
    expiresAt: Expiry,
    revoked: z.literal(false),
  }),
});

function unavailable(): never {
  // Do not attach a cause, response body, token, fingerprint or database error.
  throw new Error("voice-read-rpc-unavailable");
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
function matchesThread(
  a: z.infer<typeof Current>,
  b: z.infer<typeof Current>["authority"] | z.infer<typeof Current>["approval"],
) {
  return (
    a.ownerId === b.ownerId &&
    a.threadId === b.threadId &&
    a.threadIncarnation === b.threadIncarnation &&
    a.threadRevision === b.threadRevision
  );
}

/** Supplies only the two protected read ports of the existing bridge. Each
 * invocation owns its immutable query/result; there is no shared snapshot or
 * last-verified identity. SQL null remains denial and causes no fallback/write.
 *
 * These shape/binding checks do not authenticate callers or establish current
 * time. Verified request-bound Auth, trusted now(), session revocation writers
 * and exact issuance orchestration remain mandatory independent boundaries.
 * SQL must check freshness under its owner/row locks; the existing verifier
 * checks deadlines again after await. A read snapshot is not a lock spanning
 * Auth, a capacity reservation or permission to dispatch. Claim/inspect/create
 * still require their own current transaction-bound checks.
 */
export function createVoiceReadRpcPorts(client: VoiceReadRpcClient): VoiceReadRpcPorts {
  let invoke: VoiceReadRpcClient["rpc"];
  try {
    if (!client) return unavailable();
    const rpc = client.rpc;
    if (typeof rpc !== "function") return unavailable();
    invoke = rpc.bind(client);
  } catch {
    return unavailable();
  }
  async function call(name: VoiceReadRpcName, args: Record<string, unknown>) {
    return unwrap(await invoke(name, Object.freeze(args)));
  }
  return Object.freeze({
    readSessionFence(rawQuery: Readonly<{ ownerId: string; sessionId: string }>) {
      return guarded(async () => {
        const query = Object.freeze(SessionQuery.parse(rawQuery));
        const raw = await call("bfa_p5_voice_read_session_fence", {
          p_owner_id: query.ownerId,
          p_session_id: query.sessionId,
        });
        if (raw === null) return null;
        const fence = Fence.parse(raw);
        if (fence.ownerId !== query.ownerId || fence.sessionId !== query.sessionId)
          return unavailable();
        return Object.freeze(fence);
      });
    },
    readCurrent(rawQuery: VoiceVerificationQuery) {
      return guarded(async () => {
        const query = Object.freeze(CurrentQuery.parse(rawQuery));
        const raw = await call("bfa_p5_voice_read_current", {
          p_owner_id: query.ownerId,
          p_thread_id: query.threadId,
          p_attempt_id: query.attemptId,
          p_authority_fingerprint: query.authorityFingerprint,
        });
        if (raw === null) return null;
        const current = Current.parse(raw);
        if (
          current.ownerId !== query.ownerId ||
          current.threadId !== query.threadId ||
          current.approval.attemptId !== query.attemptId ||
          current.authority.fingerprint !== query.authorityFingerprint ||
          current.allowlist.ownerId !== query.ownerId ||
          !matchesThread(current, current.authority) ||
          !matchesThread(current, current.approval)
        )
          return unavailable();
        return Object.freeze({
          ...current,
          allowlist: Object.freeze(current.allowlist),
          authority: Object.freeze(current.authority),
          approval: Object.freeze(current.approval),
        });
      });
    },
  });
}
