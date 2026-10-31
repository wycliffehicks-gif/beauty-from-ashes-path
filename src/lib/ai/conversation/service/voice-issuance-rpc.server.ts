// Inactive trusted registration mapping. No client, credentials, route, Auth
// verification, provider operation or existing-token backfill is installed.
import "@tanstack/react-start/server-only";
import { z } from "zod";

export type VoiceIssuanceRpcName =
  | "bfa_p5_voice_register_generation"
  | "bfa_p5_voice_register_issuance";

/** Supply a protected service-role transport only from a trusted server host.
 * It must make one request without transparent retry or credential refresh/
 * replay; this adapter cannot inspect the transport's internal behavior.
 * Never expose these methods to browser-supplied registration records.
 */
export interface VoiceIssuanceRpcClient {
  rpc(name: VoiceIssuanceRpcName, args: Readonly<Record<string, unknown>>): PromiseLike<unknown>;
}
export interface VoiceGenerationRegistration {
  readonly ownerId: string;
  readonly threadId: string;
}
export interface VoiceIssuanceRegistration extends VoiceGenerationRegistration {
  readonly threadIncarnation: string;
  readonly threadRevision: number;
  readonly authorityFingerprint: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
}
export interface VoiceIssuanceRpcPorts {
  readonly registerGeneration: (query: VoiceGenerationRegistration) => Promise<string>;
  readonly registerIssuance: (registration: VoiceIssuanceRegistration) => Promise<boolean>;
}

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
const Generation = wireObject({ ownerId: Id, threadId: Id });
const Issuance = wireObject({
  ownerId: Id,
  threadId: Id,
  threadIncarnation: Id,
  threadRevision: Count,
  authorityFingerprint: Digest,
  issuedAt: Count,
  expiresAt: Expiry,
}).refine(
  (value) => value.expiresAt > value.issuedAt && value.expiresAt - value.issuedAt <= 900_000,
);

function unavailable(): never {
  // Do not attach a cause, SQL body, registration record or private identity.
  throw new Error("voice-issuance-rpc-unavailable");
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

/** Exact existing SQL mappings only. Every invocation owns immutable arguments;
 * no shared last-generation or last-issuance state can cross concurrent calls.
 * A false issuance result is semantic denial. Missing/malformed responses or
 * thrown transport failures do not establish rollback and never trigger retry.
 *
 * The SQL generation reply contains only its UUID; issuance replies only a
 * boolean. The trusted transport must associate each reply with its exact call.
 * A validated true means that SQL acknowledged this exact registration, not
 * that Auth, current session, service authority or dispatch was established.
 * The trusted issuer must independently validate those boundaries and release
 * its newly sealed token only after registration and final eligibility checks.
 * No token/envelope is accepted here; legacy tokens must never backfill rows.
 */
export function createVoiceIssuanceRpcPorts(client: VoiceIssuanceRpcClient): VoiceIssuanceRpcPorts {
  let invoke: VoiceIssuanceRpcClient["rpc"];
  try {
    if (!client) return unavailable();
    const rpc = client.rpc;
    if (typeof rpc !== "function") return unavailable();
    invoke = rpc.bind(client);
  } catch {
    return unavailable();
  }
  async function call(name: VoiceIssuanceRpcName, args: Record<string, unknown>) {
    return unwrap(await invoke(name, Object.freeze(args)));
  }
  return Object.freeze({
    registerGeneration(rawQuery: VoiceGenerationRegistration) {
      return guarded(async () => {
        const query = Object.freeze(Generation.parse(rawQuery));
        return Id.parse(
          await call("bfa_p5_voice_register_generation", {
            p_owner: query.ownerId,
            p_thread: query.threadId,
          }),
        );
      });
    },
    registerIssuance(rawRegistration: VoiceIssuanceRegistration) {
      return guarded(async () => {
        const registration = Object.freeze(Issuance.parse(rawRegistration));
        return z.boolean().parse(
          await call("bfa_p5_voice_register_issuance", {
            p_owner: registration.ownerId,
            p_thread: registration.threadId,
            p_incarnation: registration.threadIncarnation,
            p_revision: registration.threadRevision,
            p_fingerprint: registration.authorityFingerprint,
            p_issued_ms: registration.issuedAt,
            p_expires_ms: registration.expiresAt,
          }),
        );
      });
    },
  });
}
