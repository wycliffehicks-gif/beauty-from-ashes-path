// Inactive trusted issuance only; no route, client, migration or provider.
import "@tanstack/react-start/server-only";
import { z } from "zod";
import { fingerprint, seal } from "../staging/seal.server";
import { ConversationService } from "./service";
import type { VoiceIssuanceRpcPorts } from "./voice-issuance-rpc.server";

const Id = z
  .string()
  .uuid()
  .refine((value) => value === value.toLowerCase());
const Count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const Expiry = Count.positive();
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
const Identity = wireObject({ ownerId: Id, sessionId: Id, expiresAt: Expiry });
const Fence = wireObject({
  ownerId: Id,
  sessionId: Id,
  version: Count,
  expiresAt: Expiry,
  revoked: z.literal(false),
});
const Current = wireObject({
  ownerId: Id,
  threadId: Id,
  threadRevision: Count,
  sourceCreatedAt: z.string().min(1).max(128),
  threadIncarnation: Id.nullable(),
  deleted: z.literal(false),
  allowlist: wireObject({ ownerId: Id, admitted: z.literal(true), expiresAt: Expiry }),
});
const Input = wireObject({
  service: z.custom<ConversationService>((value) => value instanceof ConversationService),
  threadId: Id,
  threadRevision: Count,
  sourceCreatedAt: z.string().min(1).max(128),
});

export interface VoiceAuthorityIssuanceInput {
  readonly service: ConversationService;
  readonly threadId: string;
  readonly threadRevision: number;
  readonly sourceCreatedAt: string;
}
export interface VoiceAuthorityIssuanceResult {
  readonly activeAuthority: string;
  readonly threadId: string;
  readonly threadIncarnation: string;
  readonly threadRevision: number;
  readonly expiresAt: number;
}
export interface VoiceAuthorityIssuancePorts extends VoiceIssuanceRpcPorts {
  /** Explicit trusted server configuration, integer 1..900000 milliseconds. */
  readonly maxAuthorityAgeMs: number;
  now(): number;
  /** Verify the current request's real Auth session on every invocation. */
  authenticate(): Promise<unknown>;
  readSessionFence(query: Readonly<{ ownerId: string; sessionId: string }>): Promise<unknown>;
  /** Mandatory protected atomic metadata snapshot, not readCurrent (which needs
   * an already registered issuance/approval). Return the exact Current shape or
   * null. Initial incarnation may be null; after generation registration it must
   * equal that registered UUID. Never derive metadata from a presented token.
   * The trusted production implementation remains absent.
   */
  readCurrentThread(query: Readonly<{ ownerId: string; threadId: string }>): Promise<unknown>;
}

/** The host must bind an already trusted service instance and exact DB revision/
 * creation metadata to the same owned lifecycle. Shapes/instanceof cannot prove
 * that provenance. sourceCreatedAt is only a supplemental consistency check;
 * the permanent server-registered UUID is the incarnation. No raw authority or
 * existing token can be submitted, restored, registered or backfilled here.
 *
 * A call owns one detached snapshot and makes no registration retry. Only a new
 * local AES-GCM envelope whose exact HMAC registration returns true can escape.
 * Missing acknowledgments may leave dormant records; denial does not imply SQL
 * rollback and never deletes generation/issuance evidence. This is not session,
 * approval, quota or provider authorization. Production Auth/session writers,
 * a trusted host and later transactional eligibility checks remain mandatory.
 * Remote Auth and database reads are not one atomic transaction; later reads and
 * claim/dispatch checks still reject changes occurring after the final check.
 */
export function createVoiceAuthorityIssuer(ports: VoiceAuthorityIssuancePorts) {
  let maxAge: number;
  let bound: Omit<VoiceAuthorityIssuancePorts, "maxAuthorityAgeMs">;
  try {
    maxAge = z.number().int().min(1).max(900_000).parse(ports.maxAuthorityAgeMs);
    const names = [
      "now",
      "authenticate",
      "readSessionFence",
      "readCurrentThread",
      "registerGeneration",
      "registerIssuance",
    ] as const;
    bound = Object.fromEntries(
      names.map((name) => {
        const fn = ports[name];
        if (typeof fn !== "function") throw new Error();
        return [name, fn.bind(ports)];
      }),
    ) as typeof bound;
  } catch {
    throw new Error("voice-issuance-unavailable");
  }
  return Object.freeze({
    async issue(
      rawInput: VoiceAuthorityIssuanceInput,
    ): Promise<VoiceAuthorityIssuanceResult | null> {
      try {
        const input = Input.parse(rawInput);
        const { service, threadId, threadRevision, sourceCreatedAt } = input;
        const ownerId = Id.parse(service.ownerId);
        const lifecycle = service.getThreadLifecycleBinding(threadId);
        if (!lifecycle || lifecycle.threadId !== `bfa-thread-${threadId}`) return null;
        const authority = service.exportAuthority(threadId);
        if (
          authority.record.ownerId !== ownerId ||
          authority.record.storeId !== threadId ||
          authority.record.threadId !== lifecycle.threadId
        )
          return null;
        const snapshot = JSON.stringify(authority);
        const issuedAt = Count.parse(bound.now());
        let lastNow = issuedAt;
        let ceiling = issuedAt + maxAge;
        if (!Number.isSafeInteger(ceiling)) return null;
        let identity: z.infer<typeof Identity> | undefined;
        let version: number | undefined;
        let originalIncarnation: string | null | undefined;
        function alive() {
          const n = Count.parse(bound.now());
          if (n < lastNow || n >= ceiling || n - issuedAt >= 30_000) return false;
          lastNow = n;
          return (
            service.ownerId === ownerId &&
            lifecycle!.isCurrent() &&
            JSON.stringify(service.exportAuthority(threadId)) === snapshot
          );
        }
        function shorten(...deadlines: number[]) {
          ceiling = Math.min(ceiling, ...deadlines);
          return alive();
        }
        async function checkIdentity() {
          if (!alive()) return false;
          const current = Identity.parse(await bound.authenticate());
          if (
            !alive() ||
            current.ownerId !== ownerId ||
            (identity && current.sessionId !== identity.sessionId)
          )
            return false;
          identity ??= current;
          return shorten(current.expiresAt);
        }
        async function revalidate(incarnation?: string) {
          if (!(await checkIdentity())) return false;
          const query = Object.freeze({ ownerId, sessionId: identity!.sessionId });
          const fence = Fence.parse(await bound.readSessionFence(query));
          if (
            !alive() ||
            fence.ownerId !== ownerId ||
            fence.sessionId !== query.sessionId ||
            (version !== undefined && fence.version !== version)
          )
            return false;
          version ??= fence.version;
          if (!shorten(fence.expiresAt)) return false;
          const current = Current.parse(
            await bound.readCurrentThread(Object.freeze({ ownerId, threadId })),
          );
          if (
            !alive() ||
            current.ownerId !== ownerId ||
            current.threadId !== threadId ||
            current.threadRevision !== threadRevision ||
            current.sourceCreatedAt !== sourceCreatedAt ||
            current.allowlist.ownerId !== ownerId ||
            (incarnation !== undefined && current.threadIncarnation !== incarnation)
          )
            return false;
          if (originalIncarnation === undefined) originalIncarnation = current.threadIncarnation;
          if (!shorten(current.allowlist.expiresAt)) return false;
          // Repeat Auth after protected reads; this never claims atomicity across
          // the external authority and database (see the contract above).
          return checkIdentity();
        }
        if (!(await revalidate())) return null;
        const incarnation = Id.parse(
          await bound.registerGeneration(Object.freeze({ ownerId, threadId })),
        );
        if (
          !alive() ||
          (originalIncarnation !== null && originalIncarnation !== incarnation) ||
          !(await revalidate(incarnation))
        )
          return null;
        const expiresAt = ceiling;
        const activeAuthority = await seal({
          owner: ownerId,
          thread: threadId,
          revision: threadRevision,
          expires: expiresAt,
          authority,
        });
        if (!alive() || activeAuthority.length > 350_000) return null;
        const authorityFingerprint = await fingerprint(activeAuthority);
        if (!alive() || !(await revalidate(incarnation)) || expiresAt > ceiling) return null;
        const registration = Object.freeze({
          ownerId,
          threadId,
          threadIncarnation: incarnation,
          threadRevision,
          authorityFingerprint,
          issuedAt,
          expiresAt,
        });
        const registered = await bound.registerIssuance(registration);
        if (
          registered !== true ||
          !alive() ||
          !(await revalidate(incarnation)) ||
          expiresAt > ceiling
        )
          return null;
        return Object.freeze({
          activeAuthority,
          threadId,
          threadIncarnation: incarnation,
          threadRevision,
          expiresAt,
        });
      } catch {
        // No error cause, private body, token, fingerprint or Auth detail escapes.
        return null;
      }
    },
  });
}
