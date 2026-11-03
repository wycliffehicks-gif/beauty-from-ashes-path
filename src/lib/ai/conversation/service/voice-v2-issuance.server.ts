// Inactive v2 trusted issuance only. No Auth/client, route, SQL migration,
// proof/admission/provider operation or compatibility cutover is installed.
import "@tanstack/react-start/server-only";
import { z } from "zod";
import { fingerprint, seal } from "../staging/seal.server";
import { ConversationService } from "./service";
import type {
  VoiceV2ParentQuery,
  VoiceV2ParentObservationQuery,
  VoiceV2ParentReceipt,
  VoiceV2IssuanceReadQuery,
  VoiceV2IssuanceRegistration,
  VoiceV2IssuanceReceipt,
} from "./voice-v2-parent-issuance-rpc.server";
import type {
  VoiceV2CurrentThreadQuery,
  VoiceV2CurrentThreadReceipt,
  VoiceV2GenerationRegistration,
  VoiceV2GenerationReceipt,
} from "./voice-v2-preissue-rpc.server";

const Id = z
  .string()
  .uuid()
  .refine(
    (value) => value === value.toLowerCase() && value !== "00000000-0000-0000-0000-000000000000",
  );
const Count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const Expiry = Count.positive();
const Digest = z.string().regex(/^[0-9a-f]{64}$/);
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
          return !!field && field.enumerable === true && Object.hasOwn(field, "value");
        })
      );
    })
    .pipe(z.object(shape).strict());
}
// Preserve all six UTC microsecond digits; never round through Date parsing.
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
const SourceCreatedAt = z.string().refine(canonicalSourceCreatedAt);
const Identity = wireObject({ ownerId: Id, sessionId: Id, expiresAt: Expiry });
const ParentShape = {
  protocol: z.literal(2),
  ownerId: Id,
  authSessionId: Id,
  parentVersion: Count,
};
const Parent = wireObject({ ...ParentShape, revoked: z.boolean() });
const ObservedParent = wireObject({ ...ParentShape, revoked: z.literal(false) });
const CurrentShape = {
  ...ParentShape,
  threadId: Id,
  threadRevision: Count,
  sourceCreatedAt: SourceCreatedAt,
  deleted: z.literal(false),
  allowlist: wireObject({ ownerId: Id, admitted: z.literal(true), expiresAt: Expiry }),
};
const Current = wireObject({ ...CurrentShape, threadIncarnation: Id.nullable() });
const Generation = wireObject({ ...CurrentShape, threadIncarnation: Id });
const Issuance = wireObject({
  ...ParentShape,
  threadId: Id,
  threadIncarnation: Id,
  threadRevision: Count,
  authorityFingerprint: Digest,
  issuedAt: Count,
  expiresAt: Expiry,
  revoked: z.literal(false),
}).transform((value, context) => {
  if (value.expiresAt <= value.issuedAt || value.expiresAt - value.issuedAt > 900_000)
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid authority interval" });
  return value;
});
const Input = wireObject({
  service: z.custom<ConversationService>((value) => value instanceof ConversationService),
  threadId: Id,
  threadRevision: Count,
  sourceCreatedAt: SourceCreatedAt,
});

export interface VoiceV2AuthorityIssuanceInput {
  readonly service: ConversationService;
  readonly threadId: string;
  readonly threadRevision: number;
  readonly sourceCreatedAt: string;
}
export interface VoiceV2AuthorityIssuancePorts {
  /** Explicit trusted configuration, integer 1..900000 milliseconds. */
  readonly maxAuthorityAgeMs: number;
  now(): number;
  /** Independently verify this same request's actual Auth identity/policy on
   * every call. Return only {ownerId,sessionId,expiresAt}; never parsed JWT,
   * browser metadata, saved receipts or a service-role client as identity. */
  authenticate(): Promise<unknown>;
  readParent(query: VoiceV2ParentQuery): Promise<unknown>;
  observeParent(query: VoiceV2ParentObservationQuery): Promise<unknown>;
  readCurrentThread(query: VoiceV2CurrentThreadQuery): Promise<unknown>;
  registerGeneration(query: VoiceV2GenerationRegistration): Promise<unknown>;
  registerIssuance(query: VoiceV2IssuanceRegistration): Promise<unknown>;
  readIssuance(query: VoiceV2IssuanceReadQuery): Promise<unknown>;
}
export interface VoiceV2AuthorityIssuanceResult {
  readonly protocol: 2;
  readonly activeAuthority: string;
  readonly ownerId: string;
  readonly authSessionId: string;
  readonly parentVersion: number;
  readonly threadId: string;
  readonly threadIncarnation: string;
  readonly threadRevision: number;
  readonly authorityFingerprint: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
}
export interface VoiceV2AuthorityIssuanceSnapshot {
  readonly state: "idle" | "pending" | "issued" | "unconfirmed" | "cancelled";
  readonly expectedParentVersion: number | null;
  readonly parentRequest: VoiceV2ParentObservationQuery | null;
  readonly parentAcknowledgment: VoiceV2ParentReceipt | null;
  readonly generationRequest: VoiceV2GenerationRegistration | null;
  readonly generationAcknowledgment: VoiceV2GenerationReceipt | null;
  readonly issuanceRequest: VoiceV2IssuanceRegistration | null;
  readonly issuanceAcknowledgment: VoiceV2IssuanceReceipt | null;
  readonly parentWriteAttempted: boolean;
  readonly generationWriteAttempted: boolean;
  readonly issuanceWriteAttempted: boolean;
}
export interface VoiceV2AuthorityIssuer {
  issue(input: VoiceV2AuthorityIssuanceInput): Promise<VoiceV2AuthorityIssuanceResult | null>;
  /** Synchronous local fence only; cannot undo SQL, revoke remote Auth, abort
   * an unresolved Promise, retract a released token or terminate a provider. */
  cancel(): void;
  /** Content-free server-only evidence, never a grant or a browser projection.
   * Retains no service snapshot, private writing or sealed activeAuthority. */
  snapshot(): VoiceV2AuthorityIssuanceSnapshot;
}
function unavailable(): never {
  throw new Error("voice-v2-issuance-unavailable");
}
function freezeCurrent<T extends VoiceV2CurrentThreadReceipt>(current: T): Readonly<T> {
  Object.freeze(current.allowlist);
  return Object.freeze(current);
}
function sameParent(a: VoiceV2ParentQuery, b: VoiceV2ParentQuery): boolean {
  return a.ownerId === b.ownerId && a.authSessionId === b.authSessionId;
}
function sameIssuance(a: VoiceV2IssuanceReceipt, b: VoiceV2IssuanceRegistration): boolean {
  return (
    sameParent(a, b) &&
    a.parentVersion === b.parentVersion &&
    a.threadId === b.threadId &&
    a.threadIncarnation === b.threadIncarnation &&
    a.threadRevision === b.threadRevision &&
    a.authorityFingerprint === b.authorityFingerprint &&
    a.issuedAt === b.issuedAt &&
    a.expiresAt === b.expiresAt
  );
}

/** One trusted server request owns one attempt. The host must bind this actual
 * service instance and exact protected revision/source metadata to the same
 * owned lifecycle. Shapes/instanceof do not establish that provenance. No old
 * token, caller Auth metadata or raw authority can be registered/backfilled.
 *
 * The original verification/issue time precedes the first Auth wait and never
 * resets. All waits remain within a monotonic <30-second age and shrink-only
 * Auth/allowlist/configured ceiling. A clear parent grants no lifetime. Null
 * parent reads may hide a tombstone: exact observe SQL remains authoritative.
 * Generation stays shared and permanent; only issuance persists its exact
 * protocol-2 parent/fingerprint association. No v1 fallback is supported.
 *
 * Each immutable request is retained before its sole possible invocation.
 * Matching acknowledgments survive cancellation/late arrival as evidence only.
 * Missing/malformed replies never prove rollback, clear holds or justify a new
 * local identity. A sealed token is released once only after exact registration
 * and final current checks; no token or plaintext enters the evidence snapshot.
 *
 * Supplied protected ports must bind replies to exact invocations and disable
 * transparent retry/credential replay. SQL does not echo verifiedAt/Auth ceiling.
 * Auth/SQL reads are not atomic, and a returned token is not admission or
 * provider dispatch permission. Full v2 proof/cleanup/admission/capacity, real
 * Auth policy/revocation and quiesced no-fallback cutover remain unfinished.
 */
export function createVoiceV2AuthorityIssuer(
  ports: VoiceV2AuthorityIssuancePorts,
): VoiceV2AuthorityIssuer {
  let maxAge: number;
  let bound: Omit<VoiceV2AuthorityIssuancePorts, "maxAuthorityAgeMs">;
  try {
    maxAge = z.number().int().min(1).max(900_000).parse(ports.maxAuthorityAgeMs);
    const names = [
      "now",
      "authenticate",
      "readParent",
      "observeParent",
      "readCurrentThread",
      "registerGeneration",
      "registerIssuance",
      "readIssuance",
    ] as const;
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
  let state: VoiceV2AuthorityIssuanceSnapshot["state"] = "idle";
  let expectedParentVersion: number | null = null;
  let parentRequest: VoiceV2ParentObservationQuery | null = null;
  let parentAcknowledgment: VoiceV2ParentReceipt | null = null;
  let generationRequest: VoiceV2GenerationRegistration | null = null;
  let generationAcknowledgment: VoiceV2GenerationReceipt | null = null;
  let issuanceRequest: VoiceV2IssuanceRegistration | null = null;
  let issuanceAcknowledgment: VoiceV2IssuanceReceipt | null = null;
  let parentWriteAttempted = false;
  let generationWriteAttempted = false;
  let issuanceWriteAttempted = false;
  return Object.freeze({
    snapshot: () =>
      Object.freeze({
        state,
        expectedParentVersion,
        parentRequest,
        parentAcknowledgment,
        generationRequest,
        generationAcknowledgment,
        issuanceRequest,
        issuanceAcknowledgment,
        parentWriteAttempted,
        generationWriteAttempted,
        issuanceWriteAttempted,
      }),
    cancel() {
      cancelled = true;
      state = "cancelled";
    },
    async issue(...callerArguments: unknown[]) {
      if (attempted || cancelled) return null;
      attempted = true;
      state = "pending";
      try {
        if (callerArguments.length !== 1) return unavailable();
        const input = Input.parse(callerArguments[0]);
        const { service, threadId, threadRevision, sourceCreatedAt } = input;
        const ownerId = Id.parse(service.ownerId);
        const lifecycle = service.getThreadLifecycleBinding(threadId);
        if (!lifecycle || lifecycle.threadId !== `bfa-thread-${threadId}`) return unavailable();
        const authority = service.exportAuthority(threadId);
        if (
          authority.record.ownerId !== ownerId ||
          authority.record.storeId !== threadId ||
          authority.record.threadId !== lifecycle.threadId
        )
          return unavailable();
        const snapshot = JSON.stringify(authority);
        const startedAt = Count.parse(bound.now());
        let lastNow = startedAt;
        let ceiling = startedAt + maxAge;
        if (!Number.isSafeInteger(ceiling)) return unavailable();
        let authCeiling = Number.MAX_SAFE_INTEGER;
        let sealedExpiresAt: number | null = null;
        let identity: z.infer<typeof Identity> | null = null;
        let originalIncarnation: string | null | undefined;
        function alive(): boolean {
          if (cancelled) return false;
          const n = Count.parse(bound.now());
          if (n < lastNow || n >= ceiling || n - startedAt >= 30_000) return false;
          lastNow = n;
          return (
            !cancelled &&
            (sealedExpiresAt === null || sealedExpiresAt <= ceiling) &&
            service.ownerId === ownerId &&
            lifecycle!.isCurrent() &&
            JSON.stringify(service.exportAuthority(threadId)) === snapshot
          );
        }
        function shorten(deadline: number): boolean {
          ceiling = Math.min(ceiling, deadline);
          return alive();
        }
        async function checkIdentity(): Promise<boolean> {
          if (!alive()) return false;
          const current = Identity.parse(await bound.authenticate());
          if (
            !alive() ||
            current.ownerId !== ownerId ||
            (identity && current.sessionId !== identity.sessionId)
          )
            return false;
          identity ??= Object.freeze(current);
          authCeiling = Math.min(authCeiling, current.expiresAt);
          return shorten(authCeiling);
        }
        if (!(await checkIdentity()) || !alive()) return unavailable();
        const authenticated = identity as z.infer<typeof Identity> | null;
        if (!authenticated) return unavailable();
        const pair = Object.freeze({ ownerId, authSessionId: authenticated.sessionId });
        if (!alive()) return unavailable();
        const initialRaw = await bound.readParent(pair);
        if (!alive()) return unavailable();
        if (initialRaw === null) {
          expectedParentVersion = 0;
        } else {
          const initial = Parent.parse(initialRaw);
          if (!sameParent(initial, pair) || initial.revoked) return unavailable();
          expectedParentVersion = initial.parentVersion;
        }
        if (!(await checkIdentity()) || !alive()) return unavailable();
        parentRequest = Object.freeze({
          ...pair,
          verifiedAt: startedAt,
          authExpiresAt: authCeiling,
        });
        if (!alive()) return unavailable();
        parentWriteAttempted = true;
        const parentAck = Object.freeze(
          ObservedParent.parse(await bound.observeParent(parentRequest)),
        );
        if (!sameParent(parentAck, pair)) return unavailable();
        parentAcknowledgment = parentAck;
        if (parentAck.parentVersion !== expectedParentVersion || !alive()) return unavailable();
        const parentVersion = expectedParentVersion;
        function currentQuery(): VoiceV2CurrentThreadQuery {
          return Object.freeze({
            ...pair,
            parentVersion,
            threadId,
            verifiedAt: startedAt,
            authExpiresAt: authCeiling,
          });
        }
        function matchesCurrent(
          current: VoiceV2CurrentThreadReceipt,
          incarnation?: string,
        ): boolean {
          return (
            sameParent(current, pair) &&
            current.parentVersion === parentVersion &&
            current.threadId === threadId &&
            current.threadRevision === threadRevision &&
            current.sourceCreatedAt === sourceCreatedAt &&
            current.allowlist.ownerId === ownerId &&
            (incarnation === undefined || current.threadIncarnation === incarnation)
          );
        }
        async function revalidate(incarnation?: string): Promise<boolean> {
          if (!(await checkIdentity()) || !alive()) return false;
          const parent = Parent.parse(await bound.readParent(pair));
          if (
            !alive() ||
            !sameParent(parent, pair) ||
            parent.revoked ||
            parent.parentVersion !== parentVersion
          )
            return false;
          if (!alive()) return false;
          const current = Current.parse(await bound.readCurrentThread(currentQuery()));
          if (!alive() || !matchesCurrent(current, incarnation)) return false;
          if (originalIncarnation === undefined) originalIncarnation = current.threadIncarnation;
          if (!shorten(current.allowlist.expiresAt)) return false;
          return checkIdentity();
        }
        if (!(await revalidate()) || !alive()) return unavailable();
        generationRequest = Object.freeze({ ...currentQuery(), threadRevision, sourceCreatedAt });
        if (!alive()) return unavailable();
        generationWriteAttempted = true;
        const generationAck = freezeCurrent(
          Generation.parse(await bound.registerGeneration(generationRequest)),
        );
        if (!matchesCurrent(generationAck)) return unavailable();
        generationAcknowledgment = generationAck;
        const incarnation = generationAck.threadIncarnation;
        if (
          (originalIncarnation !== null && originalIncarnation !== incarnation) ||
          !shorten(generationAck.allowlist.expiresAt)
        )
          return unavailable();
        if (!(await revalidate(incarnation)) || !alive()) return unavailable();
        sealedExpiresAt = ceiling;
        if (!alive()) return unavailable();
        const activeAuthority = await seal({
          owner: ownerId,
          thread: threadId,
          revision: threadRevision,
          expires: sealedExpiresAt,
          authority,
        });
        if (!alive() || activeAuthority.length > 350_000) return unavailable();
        const authorityFingerprint = Digest.parse(await fingerprint(activeAuthority));
        if (!alive() || !(await revalidate(incarnation)) || !alive()) return unavailable();
        issuanceRequest = Object.freeze({
          ...pair,
          parentVersion,
          threadId,
          threadIncarnation: incarnation,
          threadRevision,
          authorityFingerprint,
          verifiedAt: startedAt,
          authExpiresAt: authCeiling,
          issuedAt: startedAt,
          expiresAt: sealedExpiresAt,
        });
        if (!alive()) return unavailable();
        issuanceWriteAttempted = true;
        const issuanceAck = Object.freeze(
          Issuance.parse(await bound.registerIssuance(issuanceRequest)),
        );
        if (!sameIssuance(issuanceAck, issuanceRequest)) return unavailable();
        issuanceAcknowledgment = issuanceAck;
        if (!alive() || !(await revalidate(incarnation)) || !alive()) return unavailable();
        const observed = Issuance.parse(
          await bound.readIssuance(Object.freeze({ ...pair, parentVersion, authorityFingerprint })),
        );
        if (!alive() || !sameIssuance(observed, issuanceRequest)) return unavailable();
        // A final helper await can itself yield: recheck locally again before
        // releasing the only token. The downstream chain must revalidate too.
        if (!(await revalidate(incarnation)) || !alive()) return unavailable();
        state = "issued";
        return Object.freeze({
          protocol: 2 as const,
          activeAuthority,
          ...pair,
          parentVersion,
          threadId,
          threadIncarnation: incarnation,
          threadRevision,
          authorityFingerprint,
          issuedAt: startedAt,
          expiresAt: sealedExpiresAt,
        });
      } catch {
        if (!cancelled) state = "unconfirmed";
        return null;
      }
    },
  });
}
