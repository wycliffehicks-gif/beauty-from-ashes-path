// Inactive service-only metadata read. No client, credentials, route, migration,
// generation/issuance write, token input or provider operation is installed here.
import "@tanstack/react-start/server-only";
import { z } from "zod";
import type { VoiceAuthorityIssuancePorts } from "./voice-issuance.server";

export type VoicePreissueReadRpcName = "bfa_p5_voice_read_current_thread";

/** A trusted server host supplies a protected service-role transport that makes
 * one request without transparent retry or credential refresh/replay. This
 * module cannot inspect those internals and initializes no SDK. Browser inputs
 * and transport objects are never Auth or service provenance.
 */
export interface VoicePreissueReadRpcClient {
  rpc(
    name: VoicePreissueReadRpcName,
    args: Readonly<Record<string, unknown>>,
  ): PromiseLike<unknown>;
}
export type VoicePreissueReadRpcPorts = Readonly<
  Pick<VoiceAuthorityIssuancePorts, "readCurrentThread">
>;

const Id = z
  .string()
  .uuid()
  .refine((value) => value === value.toLowerCase());
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

// SQL emits UTC Gregorian years 0001..9999 with all six microsecond digits.
// Validate the calendar without Date parsing/rounding: this opaque consistency
// string must survive unchanged. It is never an incarnation or freshness clock.
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
const Query = wireObject({ ownerId: Id, threadId: Id });
const Current = wireObject({
  ownerId: Id,
  threadId: Id,
  threadRevision: Count,
  sourceCreatedAt: z.string().refine(canonicalSourceCreatedAt),
  threadIncarnation: Id.nullable(),
  deleted: z.literal(false),
  allowlist: wireObject({ ownerId: Id, admitted: z.literal(true), expiresAt: Expiry }),
});

function unavailable(): never {
  // Do not attach a cause, response body, database detail or private identifier.
  throw new Error("voice-preissue-read-rpc-unavailable");
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

/** Supplies only the issuer's protected pre-issuance metadata read. SQL null is
 * denial, with no provisioning, retry, cache or fallback to the post-issuance
 * reader (which requires an existing issuance and approval). A null incarnation
 * means the protected SQL found no generation; it never authorizes backfill.
 *
 * Each invocation owns detached immutable query/result snapshots. These checks
 * do not authenticate callers or prove current time, service provenance or
 * transactional eligibility. SQL must check freshness under its locks, and the
 * issuer must recheck Auth, lifecycle and deadlines after each await. The read
 * cannot hold a lock across Auth or authorize a later claim/provider dispatch.
 */
export function createVoicePreissueReadRpcPorts(
  client: VoicePreissueReadRpcClient,
): VoicePreissueReadRpcPorts {
  let invoke: VoicePreissueReadRpcClient["rpc"];
  try {
    if (!client) return unavailable();
    const rpc = client.rpc;
    if (typeof rpc !== "function") return unavailable();
    invoke = rpc.bind(client);
  } catch {
    return unavailable();
  }
  return Object.freeze({
    readCurrentThread(rawQuery: Readonly<{ ownerId: string; threadId: string }>) {
      return guarded(async () => {
        const query = Object.freeze(Query.parse(rawQuery));
        const raw = unwrap(
          await invoke(
            "bfa_p5_voice_read_current_thread",
            Object.freeze({ p_owner_id: query.ownerId, p_thread_id: query.threadId }),
          ),
        );
        if (raw === null) return null;
        const current = Current.parse(raw);
        if (
          current.ownerId !== query.ownerId ||
          current.threadId !== query.threadId ||
          current.allowlist.ownerId !== query.ownerId
        )
          return unavailable();
        return Object.freeze({ ...current, allowlist: Object.freeze(current.allowlist) });
      });
    },
  });
}
