// Inactive service-only terminal revocation. No client, credentials, route,
// Auth verifier, session enabling/renewal or provider operation is installed.
import "@tanstack/react-start/server-only";
import { z } from "zod";

export type VoiceSessionRevokeRpcName = "bfa_p5_voice_revoke_session";

/** The future trusted Auth/revocation host must verify exact owner/session
 * identity and supply a protected service-role transport. It must make one
 * request without transparent retry or credential refresh/replay. This module
 * cannot inspect those internals or authenticate a browser-supplied session.
 */
export interface VoiceSessionRevokeRpcClient {
  rpc(
    name: VoiceSessionRevokeRpcName,
    args: Readonly<Record<string, unknown>>,
  ): PromiseLike<unknown>;
}
export interface VoiceSessionRevocationQuery {
  readonly ownerId: string;
  readonly sessionId: string;
}
export interface VoiceSessionRevocationReceipt extends VoiceSessionRevocationQuery {
  readonly version: number;
  readonly expiresAt: number;
  readonly revoked: true;
}
export interface VoiceSessionRevokeRpcPorts {
  readonly revokeSession: (
    query: VoiceSessionRevocationQuery,
  ) => Promise<VoiceSessionRevocationReceipt>;
}

const Id = z
  .string()
  .uuid()
  .refine((value) => value === value.toLowerCase());
const Count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

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
const Query = wireObject({ ownerId: Id, sessionId: Id });
const Receipt = wireObject({
  ownerId: Id,
  sessionId: Id,
  version: Count,
  expiresAt: Count.positive(),
  revoked: z.literal(true),
});

function unavailable(): never {
  // Never attach a cause, raw SQL reply, private identity or Auth material.
  throw new Error("voice-session-revoke-rpc-unavailable");
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

/** One exact terminal mutation with detached immutable arguments and receipt.
 * No current clock, active allowlist or live Auth lookup can prevent sending a
 * trusted revocation after expiry/deletion. SQL may create only a revoked
 * tombstone for an absent pair; this never provisions an enabled session.
 * Session identities must never be reused, and future enabling writers must
 * respect every retained tombstone. No such enabling writer exists here.
 *
 * A committed revocation can have a lost/malformed acknowledgment: failure
 * never establishes rollback, triggers a retry or authorizes renewal. The
 * caller must retain the exact identity for deliberate reconciliation. A valid
 * receipt confirms only the matching protected database fence; it does not
 * prove external Auth revocation propagation or provider-session termination.
 */
export function createVoiceSessionRevokeRpcPorts(
  client: VoiceSessionRevokeRpcClient,
): VoiceSessionRevokeRpcPorts {
  let invoke: VoiceSessionRevokeRpcClient["rpc"];
  try {
    if (!client) return unavailable();
    const rpc = client.rpc;
    if (typeof rpc !== "function") return unavailable();
    invoke = rpc.bind(client);
  } catch {
    return unavailable();
  }
  return Object.freeze({
    revokeSession(rawQuery: VoiceSessionRevocationQuery) {
      return guarded(async () => {
        const query = Object.freeze(Query.parse(rawQuery));
        const receipt = Receipt.parse(
          unwrap(
            await invoke(
              "bfa_p5_voice_revoke_session",
              Object.freeze({ p_owner_id: query.ownerId, p_session_id: query.sessionId }),
            ),
          ),
        );
        if (receipt.ownerId !== query.ownerId || receipt.sessionId !== query.sessionId)
          return unavailable();
        return Object.freeze(receipt);
      });
    },
  });
}
