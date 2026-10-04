/**
 * DORMANT server orchestration preparation. No participant route imports this.
 * Dependencies supply verified identity, an already server-issued stable attempt,
 * a keyed fingerprint and reviewed pricing. None is implemented or invented here.
 * There is no database, provider adapter, clock, identifier generator or network.
 */
import {
  dispatchJourneyBoundary,
  preflightJourneyBoundary,
  type JourneyBoundaryDeps,
  type JourneyBoundaryRequest,
  type JourneyBoundaryResult,
} from "./journey-boundary";
import {
  generatePreparedJourneyReflection,
  prepareJourneyReflection,
  JOURNEY_DEADLINE_MS,
  JOURNEY_GENERATION_VERSION,
  JOURNEY_MAX_OUTPUT_TOKENS,
  JOURNEY_MODEL_ID,
} from "./journey-generation";
import { JOURNEY_OUTPUT_VERSION, JOURNEY_VALIDATOR_VERSION } from "./journey-response";
import type { JourneyPreparationIdentity } from "./journey-policy";
import {
  reserveJourneyUsage,
  type AtomicUsageStore,
  type UsagePolicy,
  type UsageRefusal,
  type UsageReservation,
} from "./journey-usage-reservation";

/** Ephemeral trusted-port input. Contains source/choices: NEVER a ledger field. */
export interface JourneyDispatchBinding {
  readonly request: JourneyBoundaryRequest;
  readonly preparationIdentity: Readonly<JourneyPreparationIdentity>;
  readonly systemPolicy: string;
  readonly groundedPayload: string;
  readonly generationVersion: string;
  readonly outputVersion: string;
  readonly validatorVersion: string;
  readonly model: string;
  readonly maxOutputTokens: number;
  readonly deadlineMs: number;
}

export interface TrustedJourneyUsageContext {
  /** Exact echoed binding, checked before storage. Not proof of authentication. */
  readonly binding: JourneyDispatchBinding;
  readonly reservation: UsageReservation;
  readonly policy: UsagePolicy;
  readonly store: AtomicUsageStore | undefined;
}

export interface ReservedJourneyDeps extends JourneyBoundaryDeps {
  /**
   * Trusted SERVER port, called only after existing consent/admission/request
   * checks and preparation limits. Must verify the participant and existing
   * server-issued attempt, bind a secret-key fingerprint to this exact dispatch,
   * and supply a reviewed maximum charge and authoritative server UTC day.
   * A shared gate cookie alone cannot establish that identity. A retry must reuse
   * its original attempt; this port must not mint IDs on every HTTP request.
   */
  resolveUsageContext: (binding: JourneyDispatchBinding) => Promise<TrustedJourneyUsageContext>;
}

export type ReservedJourneyResult = JourneyBoundaryResult | { ok: false; code: UsageRefusal };

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Used only on newly allocated/cloned plain data, never authored content. */
function freezeOwned<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeOwned(child);
    Object.freeze(value);
  }
  return value;
}

// Traverse only the bounded expected shape, never arbitrary untrusted depth.
function sameBinding(raw: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    return (
      Array.isArray(raw) &&
      raw.length === expected.length &&
      expected.every((value, index) => sameBinding(raw[index], value))
    );
  }
  if (record(expected)) {
    return (
      record(raw) &&
      Object.keys(raw).length === Object.keys(expected).length &&
      Object.keys(expected).every(
        (key) => Object.hasOwn(raw, key) && sameBinding(raw[key], expected[key]),
      )
    );
  }
  return raw === expected;
}

export async function runReservedJourneyBoundary(
  input: unknown,
  deps: ReservedJourneyDeps,
): Promise<ReservedJourneyResult> {
  // Capture ports once; later mutation of the supplied dependency record cannot
  // substitute a different provider factory after a reservation commits.
  const { createProvider, resolveUsageContext } = deps;
  let checked;
  try {
    checked = await preflightJourneyBoundary(input, deps);
  } catch {
    return { ok: false, code: "invalid-request" };
  }
  if (!checked.ok) return checked;

  let prepared;
  try {
    const preparation = prepareJourneyReflection(checked.request);
    if (!preparation.ok) return preparation;
    // Retain the exact bounded payload and validation source across every await.
    // Copy first so no shared authored object or test dependency is frozen.
    prepared = freezeOwned(structuredClone(preparation.prepared));
  } catch {
    return { ok: false, code: "provider-unavailable" };
  }
  const binding: JourneyDispatchBinding = freezeOwned({
    request: checked.request,
    preparationIdentity: { ...prepared.identity },
    systemPolicy: prepared.policy,
    groundedPayload: prepared.groundedPayload,
    generationVersion: JOURNEY_GENERATION_VERSION,
    outputVersion: JOURNEY_OUTPUT_VERSION,
    validatorVersion: JOURNEY_VALIDATOR_VERSION,
    model: JOURNEY_MODEL_ID,
    maxOutputTokens: JOURNEY_MAX_OUTPUT_TOKENS,
    deadlineMs: JOURNEY_DEADLINE_MS,
  });

  let allowance;
  try {
    const context = await resolveUsageContext(binding);
    if (
      !record(context) ||
      Object.keys(context).length !== 4 ||
      !Object.hasOwn(context, "store") ||
      !record(context.reservation) ||
      !record(context.policy)
    ) {
      return { ok: false, code: "usage-control-unavailable" };
    }
    if (!sameBinding(context.binding, binding))
      return { ok: false, code: "usage-attempt-conflict" };
    // Transaction adapters may suspend or rerun the pure callback. Only detached
    // values may be captured by it; mutating the context cannot raise an allowance
    // or change an attempt's binding after this point.
    const reservation = freezeOwned(structuredClone(context.reservation));
    const policy = freezeOwned(structuredClone(context.policy));
    const store = context.store;
    const transact = store?.transact;
    allowance = await reserveJourneyUsage(
      typeof transact === "function"
        ? { transact: (budgetId, decide) => transact.call(store, budgetId, decide) }
        : undefined,
      reservation,
      policy,
    );
  } catch {
    return { ok: false, code: "usage-control-unavailable" };
  }
  if (!allowance.ok) return allowance;

  // A committed reservation remains consumed on factory failure, rejected output,
  // timeout or unknown dispatch outcome. No automatic refund, expiry or retry.
  // Only opaque reservation fields went to storage; the binding stays ephemeral.
  return dispatchJourneyBoundary(createProvider, (provider) =>
    generatePreparedJourneyReflection(prepared, provider),
  );
}
