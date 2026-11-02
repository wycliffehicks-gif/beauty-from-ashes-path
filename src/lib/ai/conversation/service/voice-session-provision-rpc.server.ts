// Inactive service-only first-session fence provisioning. No client, credentials,
// Auth verifier, route, renewal, migration or provider operation is installed.
import "@tanstack/react-start/server-only";
import { z } from "zod";

export type VoiceSessionProvisionRpcName = "bfa_p5_voice_provision_session";
export interface VoiceSessionProvisionRpcClient {
  /** Mandatory protected, request-associated service transport. It must make
   * one request without transparent retry or credential refresh/replay. This
   * adapter cannot authenticate the supplied client or inspect those internals.
   */
  rpc(
    name: VoiceSessionProvisionRpcName,
    args: Readonly<Record<string, unknown>>,
  ): PromiseLike<unknown>;
}
export interface VoiceSessionProvisioningQuery {
  readonly ownerId: string;
  readonly sessionId: string;
  /** Trusted server Auth verification time, never a browser/JWT assertion. */
  readonly verifiedAt: number;
  /** One immutable P5 fence expiry chosen by the trusted host, no later than
   * the actually verified Auth expiry and at most 15 minutes after verifiedAt.
   * This does not change the remote Auth session's lifetime or allow renewal.
   */
  readonly expiresAt: number;
}
export interface VoiceSessionProvisioningReceipt {
  readonly ownerId: string;
  readonly sessionId: string;
  readonly version: number;
  readonly expiresAt: number;
  readonly revoked: false;
}
export interface VoiceSessionProvisionRpcPorts {
  readonly provisionSession: (
    query: VoiceSessionProvisioningQuery,
  ) => Promise<VoiceSessionProvisioningReceipt | null>;
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
const Query = wireObject({
  ownerId: Id,
  sessionId: Id,
  verifiedAt: Count,
  expiresAt: Count.positive(),
}).transform((value, context) => {
  // Run only after successful shape parsing; never evaluate rejected getters.
  if (value.expiresAt <= value.verifiedAt || value.expiresAt - value.verifiedAt > 900_000)
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid lifetime" });
  return value;
});
const Receipt = wireObject({
  ownerId: Id,
  sessionId: Id,
  version: Count,
  expiresAt: Count.positive(),
  revoked: z.literal(false),
});
function unavailable(): never {
  // No cause, response body, session identity, Auth material or private detail.
  throw new Error("voice-session-provision-rpc-unavailable");
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

/** Supply metadata only from an independently verified Auth host. Parsing UUIDs,
 * timestamps or a successful receipt does not establish that provenance. The
 * host must choose one bounded expiry no later than verified Auth eligibility;
 * no presented token, browser owner or lease can provision a fence here.
 *
 * SQL rechecks current time after locks, limits verification age to 30 seconds,
 * and permanently respects revoked tombstones. It inserts an absent pair once
 * or acknowledges an exact active expiry without resetting version/renewing.
 * Null is semantic denial; valid denials may advance the protected clock but
 * never enable an absent denied session. Missing/malformed/lost replies are
 * errors and do not establish rollback or trigger retry/cache/fallback.
 *
 * Every call owns detached immutable arguments. SQL does not echo verifiedAt;
 * its association with the response requires the trusted nonretrying transport.
 * This adapter deliberately uses no local clock and returns a SQL observation,
 * not current Auth/eligibility, approval, admission or provider permission.
 * Subsequent issuance/admission checks still need fresh Auth and protected reads.
 */
export function createVoiceSessionProvisionRpcPorts(
  client: VoiceSessionProvisionRpcClient,
): VoiceSessionProvisionRpcPorts {
  let invoke: VoiceSessionProvisionRpcClient["rpc"];
  try {
    if (!client) return unavailable();
    const rpc = client.rpc;
    if (typeof rpc !== "function") return unavailable();
    invoke = rpc.bind(client);
  } catch {
    return unavailable();
  }
  return Object.freeze({
    provisionSession(rawQuery: VoiceSessionProvisioningQuery) {
      return guarded(async () => {
        const query = Object.freeze(Query.parse(rawQuery));
        const rawReceipt = unwrap(
          await invoke(
            "bfa_p5_voice_provision_session",
            Object.freeze({
              p_owner_id: query.ownerId,
              p_session_id: query.sessionId,
              p_verified_ms: query.verifiedAt,
              p_expires_ms: query.expiresAt,
            }),
          ),
        );
        if (rawReceipt === null) return null;
        const receipt = Receipt.parse(rawReceipt);
        if (
          receipt.ownerId !== query.ownerId ||
          receipt.sessionId !== query.sessionId ||
          receipt.expiresAt !== query.expiresAt
        )
          return unavailable();
        return Object.freeze(receipt);
      });
    },
  });
}
