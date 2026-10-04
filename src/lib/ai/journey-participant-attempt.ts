/**
 * DORMANT pure participant/attempt decisions. No login, key, clock, storage
 * implementation, provider or network lives here. Request handling NEVER creates
 * a missing pilot ledger, approves a roster entry, deletes or rotates an attempt.
 */
import {
  USAGE_LEDGER_VERSION,
  type UsageDecision,
  type UsageReservationResult,
} from "./journey-usage-reservation";

export const PILOT_CONTROL_VERSION = "bfa-pilot-control-v1" as const;

export interface PilotControlConfig {
  readonly pilotId: string;
  readonly hmacKeyId: string;
  /** Keyed continuity check: changing secret bytes must not reset lookup lineage. */
  readonly keyCheck: string;
}
export interface PilotRosterEntry {
  readonly identityKey: string;
  readonly participantKey: string;
  readonly status: "approved" | "revoked";
  /** Authoritative server expiry; no client timestamp is accepted. */
  readonly expiresAtMs: number;
}
export interface PilotAttemptRecord {
  readonly attemptId: string;
  readonly identityKey: string;
  readonly participantKey: string;
  readonly logicalRequestKey: string;
  readonly requestFingerprint: string;
  readonly budgetId: string;
  readonly currency: "CAD" | "USD";
  readonly pricingVersion: string;
  readonly reservedSpendMicros: number;
  /** Written in the SAME commit as usage. Null means no reservation yet. */
  readonly reservedUtcDay: string | null;
}
export interface PilotControlState extends PilotControlConfig {
  readonly version: typeof PILOT_CONTROL_VERSION;
  readonly roster: readonly PilotRosterEntry[];
  /** Retained indefinitely within this pilot; no automatic rotation or deletion. */
  readonly attempts: readonly PilotAttemptRecord[];
  /** Cross-index checked here; cap decisions remain in the existing usage module. */
  readonly usage: unknown;
}
export type PilotControlRefusal =
  | "pilot-control-invalid"
  | "pilot-key-mismatch"
  | "participant-not-approved"
  | "participant-expired"
  | "participant-binding-changed"
  | "attempt-binding-conflict"
  | "attempt-id-collision"
  | "attempt-not-found";
export type PilotApproval =
  | { ok: true; participantKey: string }
  | { ok: false; code: PilotControlRefusal };
export type PilotAttemptResolution =
  | { ok: true; attempt: PilotAttemptRecord; utcDay: string }
  | { ok: false; code: PilotControlRefusal };
export interface PilotControlDecision<T> {
  readonly result: T;
  readonly nextState?: PilotControlState;
}

/**
 * One authoritative, durable serializable transaction over roster, attempt index
 * and usage ledger, looked up ONLY by stable pilotId. The adapter supplies fresh
 * server time at each actual callback evaluation, including conflict retries.
 * Commit nextState BEFORE resolving; a lost acknowledgement must throw. The
 * callback is pure. No eventual consistency, per-process production memory,
 * independent roster/usage transactions, namespace reset or missing-state init.
 */
export interface AtomicPilotControlStore {
  transact<T>(
    pilotId: string,
    decide: (state: unknown, transactionTimeMs: unknown) => PilotControlDecision<T>,
  ): Promise<T>;
}

const TOKEN = /^[A-Za-z0-9_-]{16,128}$/;
const token = (v: unknown): v is string => typeof v === "string" && TOKEN.test(v);
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const exact = (v: Record<string, unknown>, fields: readonly string[]) =>
  Object.keys(v).length === fields.length && fields.every((k) => Object.hasOwn(v, k));
const positive = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const timestamp = (v: unknown): v is number => positive(v) && v <= 8_640_000_000_000_000;
const ATTEMPT_FIELDS = [
  "attemptId",
  "identityKey",
  "participantKey",
  "logicalRequestKey",
  "requestFingerprint",
  "budgetId",
  "currency",
  "pricingVersion",
  "reservedSpendMicros",
  "reservedUtcDay",
] as const;
const IMMUTABLE_ATTEMPT_FIELDS = ATTEMPT_FIELDS.filter((key) => key !== "reservedUtcDay");
function utcDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isPilotAttemptRecord(raw: unknown): raw is PilotAttemptRecord {
  return (
    record(raw) &&
    exact(raw, ATTEMPT_FIELDS) &&
    [
      raw.attemptId,
      raw.identityKey,
      raw.participantKey,
      raw.logicalRequestKey,
      raw.requestFingerprint,
      raw.budgetId,
      raw.pricingVersion,
    ].every(token) &&
    (raw.currency === "CAD" || raw.currency === "USD") &&
    positive(raw.reservedSpendMicros) &&
    (raw.reservedUtcDay === null || utcDay(raw.reservedUtcDay))
  );
}

function validConfig(raw: PilotControlConfig): boolean {
  return (
    record(raw) &&
    exact(raw, ["pilotId", "hmacKeyId", "keyCheck"]) &&
    token(raw.pilotId) &&
    token(raw.hmacKeyId) &&
    token(raw.keyCheck)
  );
}

function readState(
  raw: unknown,
  config: PilotControlConfig,
): { ok: true; state: PilotControlState } | { ok: false; code: PilotControlRefusal } {
  const invalid = { ok: false, code: "pilot-control-invalid" } as const;
  if (
    !validConfig(config) ||
    !record(raw) ||
    !exact(raw, ["version", "pilotId", "hmacKeyId", "keyCheck", "roster", "attempts", "usage"]) ||
    raw.version !== PILOT_CONTROL_VERSION ||
    raw.pilotId !== config.pilotId ||
    !Array.isArray(raw.roster) ||
    !Array.isArray(raw.attempts)
  )
    return invalid;
  if (raw.hmacKeyId !== config.hmacKeyId || raw.keyCheck !== config.keyCheck) {
    return { ok: false, code: "pilot-key-mismatch" };
  }
  const identities = new Set<string>();
  const participants = new Set<string>();
  for (const row of raw.roster) {
    if (
      !record(row) ||
      !exact(row, ["identityKey", "participantKey", "status", "expiresAtMs"]) ||
      !token(row.identityKey) ||
      !token(row.participantKey) ||
      !timestamp(row.expiresAtMs) ||
      !["approved", "revoked"].includes(row.status as string) ||
      identities.has(row.identityKey) ||
      participants.has(row.participantKey)
    )
      return invalid;
    identities.add(row.identityKey);
    participants.add(row.participantKey);
  }
  const ids = new Set<string>();
  const logical = new Set<string>();
  for (const row of raw.attempts) {
    if (
      !isPilotAttemptRecord(row) ||
      ids.has(row.attemptId) ||
      logical.has(row.logicalRequestKey) ||
      !raw.roster.some(
        (entry) =>
          entry.identityKey === row.identityKey && entry.participantKey === row.participantKey,
      )
    )
      return invalid;
    ids.add(row.attemptId);
    logical.add(row.logicalRequestKey);
  }
  // Two-way cross-index integrity: losing only an attempt or only its usage row
  // must never turn already-consumed work into a fresh dispatch. This cannot
  // detect a coherent rollback of BOTH records; durable recovery remains external.
  const usage = raw.usage;
  if (
    !record(usage) ||
    !exact(usage, ["version", "budgetId", "currency", "reservations"]) ||
    usage.version !== USAGE_LEDGER_VERSION ||
    !token(usage.budgetId) ||
    !["CAD", "USD"].includes(usage.currency as string) ||
    !Array.isArray(usage.reservations)
  )
    return invalid;
  const reserved = new Set<string>();
  for (const row of usage.reservations) {
    if (
      !record(row) ||
      !exact(row, [
        "attemptId",
        "participantKey",
        "requestFingerprint",
        "utcDay",
        "pricingVersion",
        "reservedSpendMicros",
      ]) ||
      !token(row.attemptId) ||
      reserved.has(row.attemptId) ||
      !utcDay(row.utcDay)
    )
      return invalid;
    const attempt = raw.attempts.find((entry) => entry.attemptId === row.attemptId);
    if (
      !attempt ||
      attempt.reservedUtcDay !== row.utcDay ||
      attempt.budgetId !== usage.budgetId ||
      attempt.currency !== usage.currency ||
      !["participantKey", "requestFingerprint", "pricingVersion", "reservedSpendMicros"].every(
        (key) => attempt[key] === row[key],
      )
    )
      return invalid;
    reserved.add(row.attemptId);
  }
  if (raw.attempts.some((row) => (row.reservedUtcDay !== null) !== reserved.has(row.attemptId)))
    return invalid;
  // Cross-index integrity is established above. The existing usage validator still
  // owns cap decisions and the complete reservation policy at the usage commit.
  return { ok: true, state: raw as unknown as PilotControlState };
}

export function approvePilotParticipant(
  raw: unknown,
  config: PilotControlConfig,
  identityKey: string,
  now: unknown,
): PilotApproval {
  if (!token(identityKey) || !timestamp(now)) return { ok: false, code: "pilot-control-invalid" };
  const checked = readState(raw, config);
  if (!checked.ok) return checked;
  const entry = checked.state.roster.find((row) => row.identityKey === identityKey);
  if (!entry || entry.status !== "approved") return { ok: false, code: "participant-not-approved" };
  if (now >= entry.expiresAtMs) return { ok: false, code: "participant-expired" };
  return { ok: true, participantKey: entry.participantKey };
}

export function decidePilotAttempt(
  raw: unknown,
  config: PilotControlConfig,
  proposal: PilotAttemptRecord,
  now: unknown,
): PilotControlDecision<PilotAttemptResolution> {
  if (!isPilotAttemptRecord(proposal) || proposal.reservedUtcDay !== null)
    return { result: { ok: false, code: "pilot-control-invalid" } };
  const approval = approvePilotParticipant(raw, config, proposal.identityKey, now);
  if (!approval.ok) return { result: approval };
  if (approval.participantKey !== proposal.participantKey)
    return { result: { ok: false, code: "participant-binding-changed" } };
  const checked = readState(raw, config);
  if (!checked.ok) return { result: checked };
  const { state } = checked;
  const existing = state.attempts.find(
    (row) => row.logicalRequestKey === proposal.logicalRequestKey,
  );
  if (existing) {
    if (
      !IMMUTABLE_ATTEMPT_FIELDS.filter((key) => key !== "attemptId").every(
        (key) => existing[key] === proposal[key],
      )
    ) {
      return { result: { ok: false, code: "attempt-binding-conflict" } };
    }
    return {
      result: {
        ok: true,
        attempt: { ...existing },
        utcDay: new Date(now as number).toISOString().slice(0, 10),
      },
    };
  }
  if (state.attempts.some((row) => row.attemptId === proposal.attemptId))
    return { result: { ok: false, code: "attempt-id-collision" } };
  const attempt = { ...proposal };
  return {
    result: { ok: true, attempt, utcDay: new Date(now as number).toISOString().slice(0, 10) },
    nextState: { ...state, attempts: [...state.attempts, attempt] },
  };
}

/** Approval and attempt binding are rechecked in the SAME usage commit. */
export function decideApprovedUsage(
  raw: unknown,
  config: PilotControlConfig,
  attempt: PilotAttemptRecord,
  utcDay: string,
  now: unknown,
  decideUsage: (usage: unknown) => UsageDecision,
): PilotControlDecision<UsageReservationResult> {
  const unavailable = { result: { ok: false, code: "usage-control-unavailable" } } as const;
  if (!isPilotAttemptRecord(attempt)) return unavailable;
  const approval = approvePilotParticipant(raw, config, attempt.identityKey, now);
  if (
    !approval.ok ||
    approval.participantKey !== attempt.participantKey ||
    new Date(now as number).toISOString().slice(0, 10) !== utcDay
  )
    return unavailable;
  const checked = readState(raw, config);
  if (!checked.ok) return unavailable;
  const stored = checked.state.attempts.find((row) => row.attemptId === attempt.attemptId);
  if (
    !stored ||
    !IMMUTABLE_ATTEMPT_FIELDS.every((key) => stored[key] === attempt[key]) ||
    (attempt.reservedUtcDay !== null && stored.reservedUtcDay !== attempt.reservedUtcDay)
  )
    return unavailable;
  const decision = decideUsage(checked.state.usage);
  return {
    result: decision.result,
    ...(decision.nextLedger
      ? {
          nextState: {
            ...checked.state,
            usage: decision.nextLedger,
            attempts: checked.state.attempts.map((row) =>
              row.attemptId === attempt.attemptId ? { ...row, reservedUtcDay: utcDay } : row,
            ),
          },
        }
      : {}),
  };
}
