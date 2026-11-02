// Inactive trusted orchestration only. No production Auth/client, route,
// migration, session renewal, revocation or provider operation is installed.
import "@tanstack/react-start/server-only";
import { z } from "zod";
import type {
  VoiceSessionProvisioningQuery,
  VoiceSessionProvisioningReceipt,
} from "./voice-session-provision-rpc.server";

const Id = z
  .string()
  .uuid()
  .refine((value) => value === value.toLowerCase());
const Count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
function wireObject<Shape extends z.ZodRawShape>(shape: Shape) {
  const keys = Object.keys(shape);
  return z
    .unknown()
    .refine((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return false;
      const prototype = Object.getPrototypeOf(value);
      return (
        (prototype === Object.prototype || prototype === null) &&
        Reflect.ownKeys(value).length === keys.length &&
        keys.every((key) => {
          const field = Object.getOwnPropertyDescriptor(value, key);
          return !!field && Object.hasOwn(field, "value") && field.enumerable === true;
        })
      );
    })
    .pipe(z.object(shape).strict());
}
const Identity = wireObject({ ownerId: Id, sessionId: Id, expiresAt: Count.positive() });
const Fence = wireObject({
  ownerId: Id,
  sessionId: Id,
  version: Count,
  expiresAt: Count.positive(),
  revoked: z.literal(false),
});

export interface VoiceSessionInitializerPorts {
  /** Mandatory trusted configuration, integer 1..900000 ms. This bounds only
   * the local P5 fence; it does not change general app/Auth-provider sessions. */
  readonly maxFenceAgeMs: number;
  now(): number;
  /** Independently verify the current request with Auth on EVERY invocation.
   * Return only {ownerId,sessionId,expiresAt}. Parsed JWT/browser metadata or a
   * previous provisioning receipt is not Auth. Production wiring is absent. */
  authenticate(): Promise<unknown>;
  readSessionFence(query: Readonly<{ ownerId: string; sessionId: string }>): Promise<unknown>;
  /** Mandatory protected, exact-request-associated, nonretrying server port.
   * The existing SQL remains authoritative when a null read hides a tombstone. */
  provisionSession(query: VoiceSessionProvisioningQuery): Promise<unknown>;
}
export interface VoiceSessionInitializationObservation {
  readonly state: "observed";
  readonly fence: VoiceSessionProvisioningReceipt;
}
export interface VoiceSessionInitializationSnapshot {
  readonly state: "idle" | "pending" | "observed" | "unconfirmed" | "cancelled";
  readonly request: VoiceSessionProvisioningQuery | null;
  readonly expectedVersion: number | null;
  readonly acknowledgment: VoiceSessionProvisioningReceipt | null;
  readonly writeAttempted: boolean;
}
export interface VoiceSessionInitializer {
  initialize(): Promise<VoiceSessionInitializationObservation | null>;
  /** Local synchronous fence only. It cannot revoke Auth, undo a committed
   * provision, abort an unresolved Promise or establish provider termination. */
  cancel(): void;
  /** Content-free server-only evidence. Never serialize this handle/snapshot
   * to the browser or treat it as authority for a new initialization attempt. */
  snapshot(): VoiceSessionInitializationSnapshot;
}

function sameIdentity(
  a: { ownerId: string; sessionId: string },
  b: { ownerId: string; sessionId: string },
) {
  return a.ownerId === b.ownerId && a.sessionId === b.sessionId;
}
function unavailable(): never {
  throw new Error("voice-session-initializer-unavailable");
}

/** Create one initializer inside one trusted server request context. There is
 * no caller query, token decoder, shared cache or default Auth implementation.
 * Every asynchronous check is bounded by a monotonic clock, a shrinking Auth
 * ceiling and a conservative total age strictly below 30 seconds. verifiedAt
 * is sampled before the first Auth wait, never reset to disguise a slow check.
 *
 * Existing active fences retain their exact expiry/version; they are denied if
 * their expiry exceeds current Auth/configured eligibility. Null reads do not
 * prove absence: SQL decides whether a retained tombstone forbids provisioning.
 * One immutable request is retained before the only possible write invocation.
 * A failed/lost/late reply never proves rollback, renews expiry or retries with
 * another identity. Callers retain the request for deliberate reconciliation.
 *
 * Even the final Auth/read/Auth sequence is not atomic with remote Auth or SQL.
 * The returned observation is not a token, admission or dispatch grant. Future
 * issuance/admission must still perform their own current checks. SQL does not
 * echo verifiedAt; exact response association remains a trusted port contract.
 */
export function createVoiceSessionInitializer(
  ports: VoiceSessionInitializerPorts,
): VoiceSessionInitializer {
  let maxAge: number;
  let bound: Omit<VoiceSessionInitializerPorts, "maxFenceAgeMs">;
  try {
    maxAge = z.number().int().min(1).max(900_000).parse(ports.maxFenceAgeMs);
    const names = ["now", "authenticate", "readSessionFence", "provisionSession"] as const;
    bound = Object.fromEntries(
      names.map((name) => {
        const fn = ports[name];
        if (typeof fn !== "function") return unavailable();
        return [name, fn.bind(ports)];
      }),
    ) as typeof bound;
  } catch {
    return unavailable();
  }
  let attempted = false;
  let cancelled = false;
  let state: VoiceSessionInitializationSnapshot["state"] = "idle";
  let request: VoiceSessionProvisioningQuery | null = null;
  let expectedVersion: number | null = null;
  let acknowledgment: VoiceSessionProvisioningReceipt | null = null;
  let writeAttempted = false;
  return Object.freeze({
    snapshot: () =>
      Object.freeze({ state, request, expectedVersion, acknowledgment, writeAttempted }),
    cancel() {
      cancelled = true;
      state = "cancelled";
    },
    async initialize(...callerArguments: unknown[]) {
      if (attempted || cancelled) return null;
      attempted = true;
      state = "pending";
      try {
        // The public method accepts no caller metadata, including extra JS args.
        if (callerArguments.length !== 0) return unavailable();
        const startedAt = Count.parse(bound.now());
        let lastNow = startedAt;
        let ceiling = startedAt + maxAge;
        if (!Number.isSafeInteger(ceiling)) return unavailable();
        let identity: z.infer<typeof Identity> | null = null;
        function alive() {
          if (cancelled) return false;
          const n = Count.parse(bound.now());
          if (n < lastNow || n >= ceiling || n - startedAt >= 30_000) return false;
          lastNow = n;
          return request === null || request.expiresAt <= ceiling;
        }
        async function checkIdentity() {
          if (!alive()) return false;
          const current = Identity.parse(await bound.authenticate());
          if (!alive() || (identity && !sameIdentity(identity, current))) return false;
          identity ??= Object.freeze(current);
          ceiling = Math.min(ceiling, current.expiresAt);
          return alive();
        }
        if (!(await checkIdentity())) return unavailable();
        const authenticated = identity as z.infer<typeof Identity> | null;
        if (!authenticated) return unavailable();
        const query = Object.freeze({
          ownerId: authenticated.ownerId,
          sessionId: authenticated.sessionId,
        });
        if (!alive()) return unavailable();
        const rawInitial = await bound.readSessionFence(query);
        if (!alive()) return unavailable();
        let existing: VoiceSessionProvisioningReceipt | null = null;
        if (rawInitial !== null) {
          existing = Object.freeze(Fence.parse(rawInitial));
          if (!sameIdentity(existing, query) || existing.expiresAt > ceiling) return unavailable();
          ceiling = Math.min(ceiling, existing.expiresAt);
          if (!alive()) return unavailable();
        }
        expectedVersion = existing?.version ?? 0;
        // Recheck Auth after the protected read; do not extend an earlier bound.
        if (!(await checkIdentity())) return unavailable();
        const expiresAt = existing?.expiresAt ?? ceiling;
        if (expiresAt > ceiling || !alive()) return unavailable();
        request = Object.freeze({ ...query, verifiedAt: startedAt, expiresAt });
        if (!alive()) return unavailable();
        // Retain this exact request and mark the invocation before entering the
        // port, including synchronous throws and lost committed acknowledgments.
        writeAttempted = true;
        const rawAck = await bound.provisionSession(request);
        if (rawAck === null) return unavailable();
        const received = Object.freeze(Fence.parse(rawAck));
        if (!sameIdentity(received, request) || received.expiresAt !== request.expiresAt)
          return unavailable();
        // Preserve an exact late/cancelled acknowledgment as evidence, without
        // converting its existence into a new local success or rollback claim.
        acknowledgment = received;
        if (received.version !== expectedVersion || !alive()) return unavailable();
        if (!(await checkIdentity())) return unavailable();
        if (!alive()) return unavailable();
        const final = Object.freeze(Fence.parse(await bound.readSessionFence(query)));
        if (
          !alive() ||
          !sameIdentity(final, query) ||
          final.version !== expectedVersion ||
          final.expiresAt !== request.expiresAt
        )
          return unavailable();
        if (!(await checkIdentity()) || !alive()) return unavailable();
        state = "observed";
        return Object.freeze({ state: "observed" as const, fence: final });
      } catch {
        if (!cancelled) state = "unconfirmed";
        return null;
      }
    },
  });
}
