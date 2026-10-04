/**
 * DORMANT provider-neutral usage preparation. No route imports this module.
 * No database, credentials, clock, provider or in-memory production store lives
 * here. The decision must execute inside ONE durable serializable transaction.
 * Missing/unreadable ledgers fail closed; request handling never creates one.
 *
 * Reservations are conservatively charged at their reviewed worst-case amount
 * forever within a pilot budget. Timeouts/errors never automatically refund or
 * expire them. Idempotent retries cannot gain another dispatch permission.
 */

export const USAGE_LEDGER_VERSION = "bfa-usage-reservations-v1" as const;

export interface UsageCap {
  readonly requests: number;
  /** Integer millionths of the explicitly configured billing currency. */
  readonly spendMicros: number;
}

/** Trusted server configuration, not values supplied by the participant. */
export interface UsagePolicy {
  readonly budgetId: string;
  readonly currency: "CAD" | "USD";
  readonly participantDay: UsageCap;
  readonly participantTotal: UsageCap;
  readonly globalDay: UsageCap;
  readonly globalTotal: UsageCap;
}

/**
 * Produced by the authenticated SERVER after consent/request/admission checks.
 * Tokens are random opaque IDs or secret-key HMACs; no free text or raw answers.
 * A client retry reuses the same server-issued attemptId and bound fingerprint.
 */
export interface UsageReservation {
  readonly attemptId: string;
  readonly participantKey: string;
  readonly requestFingerprint: string;
  /** Authoritative server UTC calendar date; never browser or caller time. */
  readonly utcDay: string;
  /** Version of a reviewed maximum charge for the selected provider/model. */
  readonly pricingVersion: string;
  readonly reservedSpendMicros: number;
}

export interface UsageLedger {
  readonly version: typeof USAGE_LEDGER_VERSION;
  readonly budgetId: string;
  readonly currency: "CAD" | "USD";
  readonly reservations: readonly UsageReservation[];
}

export type UsageRefusal =
  | "usage-control-unavailable"
  | "usage-configuration-invalid"
  | "usage-ledger-invalid"
  | "usage-attempt-already-reserved"
  | "usage-attempt-conflict"
  | "usage-participant-day-limit"
  | "usage-participant-total-limit"
  | "usage-global-day-limit"
  | "usage-global-total-limit";

export type UsageReservationResult =
  | { ok: true; code: "usage-reserved" }
  | { ok: false; code: UsageRefusal };

export interface UsageDecision {
  readonly result: UsageReservationResult;
  /** Present only for a newly accepted reservation, written before returning. */
  readonly nextLedger?: UsageLedger;
}

/**
 * Deployment adapter obligation, NOT an implementation or a durability claim.
 * Atomically read/lock the ENTIRE budget's shared ledger/counters and attempt
 * uniqueness, evaluate the pure callback and commit its nextLedger before
 * resolving. Concurrent hosts must serialize; callback retries must be pure.
 * A committed-but-acknowledgement-lost transaction must throw, never grant twice.
 * NEVER implement this port as per-process memory, browser storage, eventually
 * consistent read/then-write or independent participant/global counter updates.
 */
export interface AtomicUsageStore {
  transact(
    budgetId: string,
    decide: (ledger: unknown) => UsageDecision,
  ): Promise<UsageReservationResult>;
}

const TOKEN = /^[A-Za-z0-9_-]{16,128}$/;
const token = (value: unknown): value is string => typeof value === "string" && TOKEN.test(value);
const positiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function utcDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validReservation(raw: unknown): raw is UsageReservation {
  if (!record(raw)) return false;
  return (
    Object.keys(raw).length === 6 &&
    token(raw.attemptId) &&
    token(raw.participantKey) &&
    token(raw.requestFingerprint) &&
    utcDay(raw.utcDay) &&
    token(raw.pricingVersion) &&
    positiveInteger(raw.reservedSpendMicros)
  );
}

function validPolicy(raw: unknown): raw is UsagePolicy {
  if (!record(raw) || !token(raw.budgetId) || (raw.currency !== "CAD" && raw.currency !== "USD")) {
    return false;
  }
  return [raw.participantDay, raw.participantTotal, raw.globalDay, raw.globalTotal].every(
    (cap) => record(cap) && positiveInteger(cap.requests) && positiveInteger(cap.spendMicros),
  );
}

function validLedger(raw: unknown, policy: UsagePolicy): raw is UsageLedger {
  if (
    !record(raw) ||
    Object.keys(raw).length !== 4 ||
    raw.version !== USAGE_LEDGER_VERSION ||
    raw.budgetId !== policy.budgetId ||
    raw.currency !== policy.currency ||
    !Array.isArray(raw.reservations)
  )
    return false;
  const ids = new Set<string>();
  for (const reservation of raw.reservations) {
    if (!validReservation(reservation) || ids.has(reservation.attemptId)) return false;
    ids.add(reservation.attemptId);
  }
  return true;
}

function exceeds(
  rows: readonly UsageReservation[],
  next: UsageReservation,
  cap: UsageCap,
): boolean {
  if (rows.length >= cap.requests) return true;
  // BigInt prevents an overflow of many valid individual amounts from allowing
  // a reservation. Only accounting sums use it; the serialized ledger is JSON.
  const reserved = rows.reduce((sum, row) => sum + BigInt(row.reservedSpendMicros), 0n);
  return reserved + BigInt(next.reservedSpendMicros) > BigInt(cap.spendMicros);
}

/** Pure transaction decision. It never invokes a provider or mutates the input. */
export function decideUsageReservation(
  ledger: unknown,
  reservation: UsageReservation,
  policy: UsagePolicy,
): UsageDecision {
  const refuse = (code: UsageRefusal): UsageDecision => ({ result: { ok: false, code } });
  if (!validPolicy(policy) || !validReservation(reservation)) {
    return refuse("usage-configuration-invalid");
  }
  if (!validLedger(ledger, policy)) return refuse("usage-ledger-invalid");
  const duplicate = ledger.reservations.find((row) => row.attemptId === reservation.attemptId);
  if (duplicate) {
    // A retry on a later UTC day still cannot dispatch again. Pricing/version
    // changes are not grounds to reuse the same attempt for another request.
    const same =
      duplicate.participantKey === reservation.participantKey &&
      duplicate.requestFingerprint === reservation.requestFingerprint &&
      duplicate.pricingVersion === reservation.pricingVersion &&
      duplicate.reservedSpendMicros === reservation.reservedSpendMicros;
    return refuse(same ? "usage-attempt-already-reserved" : "usage-attempt-conflict");
  }
  const participant = ledger.reservations.filter(
    (row) => row.participantKey === reservation.participantKey,
  );
  const day = ledger.reservations.filter((row) => row.utcDay === reservation.utcDay);
  const participantDay = participant.filter((row) => row.utcDay === reservation.utcDay);
  const scopes = [
    [participantDay, policy.participantDay, "usage-participant-day-limit"],
    [participant, policy.participantTotal, "usage-participant-total-limit"],
    [day, policy.globalDay, "usage-global-day-limit"],
    [ledger.reservations, policy.globalTotal, "usage-global-total-limit"],
  ] as const;
  for (const [rows, cap, code] of scopes) {
    if (exceeds(rows, reservation, cap)) return refuse(code);
  }
  return {
    result: { ok: true, code: "usage-reserved" },
    nextLedger: {
      version: USAGE_LEDGER_VERSION,
      budgetId: policy.budgetId,
      currency: policy.currency,
      reservations: [...ledger.reservations, { ...reservation }],
    },
  };
}

const REFUSALS: readonly UsageRefusal[] = [
  "usage-control-unavailable",
  "usage-configuration-invalid",
  "usage-ledger-invalid",
  "usage-attempt-already-reserved",
  "usage-attempt-conflict",
  "usage-participant-day-limit",
  "usage-participant-total-limit",
  "usage-global-day-limit",
  "usage-global-total-limit",
];

/**
 * A future boundary calls this AFTER all existing checks and BEFORE creating a
 * provider. Only ok:true permits one dispatch. A rejection, exception, malformed
 * reply or uncertain commit permits none; never automatically retry a provider.
 */
export async function reserveJourneyUsage(
  store: AtomicUsageStore | undefined,
  reservation: UsageReservation,
  policy: UsagePolicy,
): Promise<UsageReservationResult> {
  if (!store) return { ok: false, code: "usage-control-unavailable" };
  if (!validPolicy(policy) || !validReservation(reservation)) {
    return { ok: false, code: "usage-configuration-invalid" };
  }
  try {
    const result: unknown = await store.transact(policy.budgetId, (ledger) =>
      decideUsageReservation(ledger, reservation, policy),
    );
    if (record(result) && Object.keys(result).length === 2) {
      if (result.ok === true && result.code === "usage-reserved")
        return { ok: true, code: "usage-reserved" };
      if (result.ok === false && REFUSALS.includes(result.code as UsageRefusal)) {
        return { ok: false, code: result.code as UsageRefusal };
      }
    }
  } catch {
    // Storage errors can contain credentials, schema data or request metadata.
    // Never return, log or refund from an exception or uncertain commit.
  }
  return { ok: false, code: "usage-control-unavailable" };
}
