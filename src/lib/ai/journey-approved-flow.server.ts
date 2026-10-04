/**
 * DORMANT Node orchestration. No app route imports this module. Authentication,
 * enrollment/revocation operations and a durable store are deliberately absent.
 * A real adapter must verify the principal; issuer/subject client claims are NOT
 * accepted. This module never reads cookies, passwords, credentials or env vars.
 */
import { runReservedJourneyBoundary, type ReservedJourneyResult } from "./journey-reserved-flow";
import type { JourneyBoundaryDeps, PilotAdmission } from "./journey-boundary";
import {
  approvePilotParticipant,
  decideApprovedUsage,
  decidePilotAttempt,
  isPilotAttemptRecord,
  type AtomicPilotControlStore,
  type PilotAttemptRecord,
} from "./journey-participant-attempt";
import {
  canonicalJourneyRequest,
  createJourneyBindingTools,
  createServerAttemptCandidate,
  isVerifiedPrincipalShape,
  type JourneyHmacConfiguration,
  type JourneyPricing,
} from "./journey-request-binding.server";
import type { UsagePolicy } from "./journey-usage-reservation";

export interface ApprovedJourneyDeps extends Pick<JourneyBoundaryDeps, "env" | "createProvider"> {
  /** Real authentication verification belongs to the eventual server adapter. */
  readonly verifyPrincipal: () => Promise<unknown>;
  readonly expectedIssuer: string;
  readonly hmac: JourneyHmacConfiguration;
  readonly policy: UsagePolicy;
  readonly pricing: JourneyPricing;
  readonly controlStore: AtomicPilotControlStore | undefined;
}

const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const TOKEN = /^[A-Za-z0-9_-]{16,128}$/;
function unavailable(): never {
  throw new Error("JOURNEY_PARTICIPANT_CONTROL_UNAVAILABLE");
}
function freezeCopy<T>(value: T): T {
  const copy = structuredClone(value);
  const freeze = (item: unknown) => {
    if (item && typeof item === "object") {
      Object.values(item).forEach(freeze);
      Object.freeze(item);
    }
  };
  freeze(copy);
  return copy;
}

/** Preserve invalid envelope/consent refusal precedence; never repair input. */
function canonicalEnvelope(input: unknown): unknown {
  try {
    if (
      !record(input) ||
      Object.keys(input).length !== 2 ||
      !Object.hasOwn(input, "request") ||
      !Object.hasOwn(input, "consent")
    )
      return input;
    const request = canonicalJourneyRequest(input.request);
    return request ? { request, consent: input.consent } : input;
  } catch {
    return input;
  }
}

export async function runApprovedJourneyBoundary(
  input: unknown,
  deps: ApprovedJourneyDeps,
): Promise<ReservedJourneyResult> {
  const { verifyPrincipal, expectedIssuer, createProvider } = deps;
  // No auth, crypto, storage, candidate generation or configuration access occurs
  // unless the existing boundary has already checked activation/consent/request.
  let ready:
    | {
        tools: ReturnType<typeof createJourneyBindingTools>;
        policy: UsagePolicy;
        pricing: JourneyPricing;
        store: AtomicPilotControlStore;
        identityKey: string;
        participantKey: string;
      }
    | undefined;

  const verifyPilotAdmission = async (): Promise<PilotAdmission> => {
    try {
      const tools = createJourneyBindingTools(deps.hmac);
      const policy = freezeCopy(deps.policy);
      const pricing = freezeCopy(deps.pricing);
      const sourceStore = deps.controlStore;
      const transact = sourceStore?.transact?.bind(sourceStore);
      if (typeof transact !== "function") return { ok: false, reason: "unavailable" };
      const store: AtomicPilotControlStore = { transact };
      const principal: unknown = await verifyPrincipal();
      if (!isVerifiedPrincipalShape(principal) || principal.issuer !== expectedIssuer) {
        return { ok: false, reason: "not-verified" };
      }
      const identityKey = tools.identityKey({
        issuer: principal.issuer,
        subject: principal.subject,
      });
      const approval = await store.transact(tools.config.pilotId, (state, now) => ({
        result: approvePilotParticipant(state, tools.config, identityKey, now),
      }));
      if (!record(approval) || Object.keys(approval).length !== 2)
        return { ok: false, reason: "unavailable" };
      if (approval.ok === false) {
        return {
          ok: false,
          reason:
            approval.code === "participant-not-approved" || approval.code === "participant-expired"
              ? "not-verified"
              : "unavailable",
        };
      }
      if (
        approval.ok !== true ||
        typeof approval.participantKey !== "string" ||
        !TOKEN.test(approval.participantKey)
      )
        return { ok: false, reason: "unavailable" };
      ready = {
        tools,
        policy,
        pricing,
        store,
        identityKey,
        participantKey: approval.participantKey,
      };
      return { ok: true };
    } catch {
      return { ok: false, reason: "unavailable" };
    }
  };

  return runReservedJourneyBoundary(canonicalEnvelope(input), {
    env: deps.env,
    verifyPilotAdmission,
    createProvider,
    resolveUsageContext: async (binding) => {
      if (!ready) unavailable();
      const { tools, policy, pricing, store, identityKey, participantKey } = ready;
      const proposal: PilotAttemptRecord = Object.freeze({
        attemptId: createServerAttemptCandidate(),
        identityKey,
        participantKey,
        logicalRequestKey: tools.logicalRequestKey(participantKey, binding.request),
        requestFingerprint: tools.dispatchFingerprint(binding, pricing, policy),
        budgetId: policy.budgetId,
        currency: policy.currency,
        pricingVersion: pricing.pricingVersion,
        reservedSpendMicros: pricing.reservedSpendMicros,
        reservedUtcDay: null,
      });
      // Candidate randomness happens once OUTSIDE the retriable pure callback.
      // Existing logical requests retain the original ID regardless of candidate.
      const resolved = await store.transact(tools.config.pilotId, (state, now) =>
        decidePilotAttempt(state, tools.config, proposal, now),
      );
      if (
        !record(resolved) ||
        Object.keys(resolved).length !== 3 ||
        resolved.ok !== true ||
        !isPilotAttemptRecord(resolved.attempt) ||
        typeof resolved.utcDay !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(resolved.utcDay)
      )
        unavailable();
      const attempt = freezeCopy(resolved.attempt);
      if (
        !Object.keys(proposal)
          .filter((key) => key !== "attemptId" && key !== "reservedUtcDay")
          .every(
            (key) =>
              attempt[key as keyof PilotAttemptRecord] ===
              proposal[key as keyof PilotAttemptRecord],
          )
      )
        unavailable();
      const utcDay = resolved.utcDay;
      return {
        binding,
        policy,
        reservation: {
          attemptId: attempt.attemptId,
          participantKey: attempt.participantKey,
          requestFingerprint: attempt.requestFingerprint,
          utcDay,
          pricingVersion: attempt.pricingVersion,
          reservedSpendMicros: attempt.reservedSpendMicros,
        },
        store: {
          transact: async (budgetId, decideUsage) => {
            if (budgetId !== attempt.budgetId)
              return { ok: false, code: "usage-control-unavailable" };
            return store.transact(tools.config.pilotId, (state, now) =>
              decideApprovedUsage(state, tools.config, attempt, utcDay, now, decideUsage),
            );
          },
        },
      };
    },
  });
}
