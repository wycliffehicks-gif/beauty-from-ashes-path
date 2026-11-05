// Inactive protocol-2 verification only. No Auth client, route, registration,
// proof, admission, provider operation, retry or compatibility cutover exists here.
import "@tanstack/react-start/server-only";
import { z } from "zod";
import { fingerprint, unseal } from "../staging/seal.server";
import { parseVoiceAdmissionRequest, type VoiceAdmissionBinding } from "./voice-admission.server";
import type { VoiceV2ParentQuery } from "./voice-v2-parent-issuance-rpc.server";
import type { VoiceV2CurrentQuery } from "./voice-v2-current-rpc.server";

const Id = z
  .string()
  .uuid()
  .refine(
    (value) => value === value.toLowerCase() && value !== "00000000-0000-0000-0000-000000000000",
  );
const Count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const Expiry = Count.positive();
const Digest = z.string().regex(/^[0-9a-f]{64}$/);
function plainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function wireObject<Shape extends z.ZodRawShape>(shape: Shape) {
  const keys = Object.keys(shape);
  return z
    .unknown()
    .refine(
      (value) =>
        plainRecord(value) &&
        Reflect.ownKeys(value).length === keys.length &&
        keys.every((key) => {
          const field = Object.getOwnPropertyDescriptor(value, key);
          return !!field && field.enumerable === true && Object.hasOwn(field, "value");
        }),
    )
    .pipe(z.object(shape).strict());
}
const Request = wireObject({
  threadId: Id,
  threadIncarnation: Id,
  threadRevision: Count,
  attemptId: Id,
  activeAuthority: z.string().min(1).max(350_000),
});
const Identity = wireObject({ ownerId: Id, sessionId: Id, expiresAt: Expiry });
const Parent = wireObject({
  protocol: z.literal(2),
  ownerId: Id,
  authSessionId: Id,
  parentVersion: Count,
  revoked: z.literal(false),
});
const Query = wireObject({
  protocol: z.literal(2),
  ownerId: Id,
  authSessionId: Id,
  parentVersion: Count,
  threadId: Id,
  attemptId: Id,
  authorityFingerprint: Digest,
  verifiedAt: Count,
  identityExpiresAt: Expiry,
});
const ThreadShape = {
  ownerId: Id,
  threadId: Id,
  threadIncarnation: Id,
  threadRevision: Count,
};
const Current = wireObject({
  ...ThreadShape,
  deleted: z.literal(false),
  allowlist: wireObject({ ownerId: Id, admitted: z.literal(true), expiresAt: Expiry }),
  authority: wireObject({
    ...ThreadShape,
    fingerprint: Digest,
    issuedAt: Count,
    expiresAt: Expiry,
    revoked: z.literal(false),
  }),
  approval: wireObject({
    ...ThreadShape,
    id: Id,
    digest: Digest,
    scope: z.literal("developer-voice-session"),
    attemptId: Id,
    expiresAt: Expiry,
    revoked: z.literal(false),
  }),
});
const Receipt = wireObject({ protocol: z.literal(2), request: Query, current: Current });
const Envelope = wireObject({
  owner: Id,
  thread: Id,
  revision: Count,
  expires: Expiry,
  // Authenticate the outer envelope only. Do not traverse, restore, inspect or
  // return authority content; later service/P1 restoration remains separate.
  authority: z.unknown().refine(plainRecord),
});

export interface VoiceV2AuthorityVerificationPorts {
  /** Trusted integer Unix milliseconds. Unsafe or backwards movement denies. */
  now(): number;
  /** Independently verify this same request's actual current Auth/policy on
   * EVERY invocation. Return only {ownerId,sessionId,expiresAt}, never browser
   * metadata, a parsed JWT/getSession-only result or a service-role identity.
   * The host owns request association; parsing cannot authenticate these values. */
  authenticate(): Promise<unknown>;
  /** Existing protected protocol-2 parent read; never observe/create/revoke. */
  readParent(query: VoiceV2ParentQuery): Promise<unknown>;
  /** Completed protected full protocol-2 current receipt. Every query field
   * must echo this exact invocation. No retry, credential replay or v1 fallback.
   * The host must establish genuine service transport and issuance provenance. */
  readCurrent(query: VoiceV2CurrentQuery): Promise<unknown>;
}
export interface VoiceV2AuthorityVerificationEvidence {
  readonly protocol: 2;
  readonly binding: VoiceAdmissionBinding;
  readonly authSessionId: string;
  readonly parentVersion: number;
  readonly authorityFingerprint: string;
  /** Immutable original issuance facts, distinct from effective eligibility. */
  readonly issuedAt: number;
  readonly issuanceExpiresAt: number;
  readonly envelopeExpiresAt: number;
  /** Conservative local start before the first Auth wait; never refreshed. */
  readonly verifiedAt: number;
  readonly verificationExpiresAt: number;
  readonly identityExpiresAt: number;
  readonly allowlistExpiresAt: number;
  readonly authorityExpiresAt: number;
  readonly approvalExpiresAt: number;
  readonly effectiveExpiresAt: number;
}
export interface VoiceV2AuthorityVerifier {
  verifyCurrent(raw: unknown): Promise<VoiceV2AuthorityVerificationEvidence | null>;
}
function unavailable(): never {
  throw new Error("voice-v2-authority-verification-unavailable");
}
function sameQuery(a: VoiceV2CurrentQuery, b: VoiceV2CurrentQuery): boolean {
  return (
    a.protocol === b.protocol &&
    a.ownerId === b.ownerId &&
    a.authSessionId === b.authSessionId &&
    a.parentVersion === b.parentVersion &&
    a.threadId === b.threadId &&
    a.attemptId === b.attemptId &&
    a.authorityFingerprint === b.authorityFingerprint &&
    a.verifiedAt === b.verifiedAt &&
    a.identityExpiresAt === b.identityExpiresAt
  );
}

/** Verify only an already-issued exact P3b AES-GCM envelope and keyed HMAC under
 * fresh request-bound Auth and current immutable v2 association. No caller
 * identity, parent, approval, time or issuance metadata is accepted as authority.
 *
 * All observations belong to one call. The original verification start precedes
 * Auth; every wait is followed by a monotonic local clock check and age must stay
 * strictly below 30000 ms. Auth/allowlist/approval ceilings only shrink, even if
 * later observations grow. Original issuance facts never change. A shorter fresh
 * Auth ceiling does not rewrite the longer original issuance/envelope expiry.
 *
 * Repeated Auth, parent and full current reads reject changes across waits. They
 * cannot create a lock spanning remote Auth and SQL or prove future eligibility.
 * This content-free evidence is neither a durable proof nor an admission or
 * provider capability. Future owned orchestration must independently revalidate
 * at registration/claim/inspect/mark and preserve original timing/association.
 * Missing evidence denies without inferring permanent revocation or rollback.
 * No envelope, private content, credential or per-call record survives in this
 * factory; concurrent calls share only captured trusted methods, not state.
 */
export function createVoiceV2AuthorityVerifier(
  ports: VoiceV2AuthorityVerificationPorts,
): VoiceV2AuthorityVerifier {
  let bound: VoiceV2AuthorityVerificationPorts;
  try {
    const names = ["now", "authenticate", "readParent", "readCurrent"] as const;
    bound = Object.fromEntries(
      names.map((name) => {
        const method = ports[name];
        if (typeof method !== "function") return unavailable();
        return [name, method.bind(ports)];
      }),
    ) as unknown as VoiceV2AuthorityVerificationPorts;
  } catch {
    return unavailable();
  }
  return Object.freeze({
    async verifyCurrent(...args: unknown[]) {
      try {
        if (args.length !== 1) return null;
        // Gate own-data descriptors before the preserved legacy request parser.
        const request = parseVoiceAdmissionRequest(Request.parse(args[0]));
        if (!request) return null;
        const verifiedAt = Count.parse(bound.now());
        const verificationExpiresAt = verifiedAt + 30_000;
        if (!Number.isSafeInteger(verificationExpiresAt)) return null;
        let lastNow = verifiedAt;
        let ceiling = verificationExpiresAt;
        let identity: z.infer<typeof Identity> | null = null;
        let identityExpiresAt = Number.MAX_SAFE_INTEGER;
        let allowlistExpiresAt = Number.MAX_SAFE_INTEGER;
        let approvalExpiresAt = Number.MAX_SAFE_INTEGER;
        function alive(): boolean {
          const now = Count.parse(bound.now());
          if (now < lastNow || now - verifiedAt >= 30_000 || now >= ceiling) return false;
          lastNow = now;
          return true;
        }
        function shorten(...deadlines: number[]): boolean {
          ceiling = Math.min(ceiling, ...deadlines);
          return alive();
        }
        async function checkIdentity(): Promise<boolean> {
          if (!alive()) return false;
          const current = Identity.parse(await bound.authenticate());
          if (
            !alive() ||
            (identity &&
              (current.ownerId !== identity.ownerId || current.sessionId !== identity.sessionId))
          )
            return false;
          identity ??= Object.freeze(current);
          identityExpiresAt = Math.min(identityExpiresAt, current.expiresAt);
          return shorten(identityExpiresAt);
        }
        if (!(await checkIdentity()) || !alive()) return null;
        const firstIdentity = identity as z.infer<typeof Identity> | null;
        if (!firstIdentity) return null;
        const pair = Object.freeze({
          ownerId: firstIdentity.ownerId,
          authSessionId: firstIdentity.sessionId,
        });
        let parentVersion: number | null = null;
        async function checkParent(): Promise<boolean> {
          if (!alive()) return false;
          const parent = Parent.parse(await bound.readParent(pair));
          if (
            !alive() ||
            parent.ownerId !== pair.ownerId ||
            parent.authSessionId !== pair.authSessionId ||
            (parentVersion !== null && parent.parentVersion !== parentVersion)
          )
            return false;
          parentVersion ??= parent.parentVersion;
          return true;
        }
        if (!(await checkParent()) || !alive()) return null;
        const opened = Envelope.parse(
          await unseal(
            request.activeAuthority,
            pair.ownerId,
            request.threadId,
            request.threadRevision,
          ),
        );
        if (
          !alive() ||
          opened.owner !== pair.ownerId ||
          opened.thread !== request.threadId ||
          opened.revision !== request.threadRevision ||
          !shorten(opened.expires)
        )
          return null;
        const envelopeExpiresAt = opened.expires;
        const authorityFingerprint = Digest.parse(await fingerprint(request.activeAuthority));
        if (!alive()) return null;
        let first: z.infer<typeof Current> | null = null;
        function matchesThread(value: {
          ownerId: string;
          threadId: string;
          threadIncarnation: string;
          threadRevision: number;
        }) {
          return (
            value.ownerId === pair.ownerId &&
            value.threadId === request!.threadId &&
            value.threadIncarnation === request!.threadIncarnation &&
            value.threadRevision === request!.threadRevision
          );
        }
        async function checkCurrent(): Promise<boolean> {
          if (!alive() || parentVersion === null) return false;
          const query: VoiceV2CurrentQuery = Object.freeze({
            protocol: 2,
            ...pair,
            parentVersion,
            threadId: request!.threadId,
            attemptId: request!.attemptId,
            authorityFingerprint,
            verifiedAt,
            identityExpiresAt,
          });
          const receipt = Receipt.parse(await bound.readCurrent(query));
          if (!alive() || !sameQuery(query, receipt.request)) return false;
          const current = receipt.current;
          const authority = current.authority;
          if (
            !matchesThread(current) ||
            !matchesThread(authority) ||
            !matchesThread(current.approval) ||
            current.allowlist.ownerId !== pair.ownerId ||
            authority.fingerprint !== authorityFingerprint ||
            authority.issuedAt > verifiedAt ||
            authority.expiresAt <= authority.issuedAt ||
            authority.expiresAt - authority.issuedAt > 900_000 ||
            authority.expiresAt > envelopeExpiresAt ||
            current.approval.attemptId !== request!.attemptId ||
            (first &&
              (authority.issuedAt !== first.authority.issuedAt ||
                authority.expiresAt !== first.authority.expiresAt ||
                current.approval.id !== first.approval.id ||
                current.approval.digest !== first.approval.digest))
          )
            return false;
          first ??= current;
          allowlistExpiresAt = Math.min(allowlistExpiresAt, current.allowlist.expiresAt);
          approvalExpiresAt = Math.min(approvalExpiresAt, current.approval.expiresAt);
          return shorten(allowlistExpiresAt, approvalExpiresAt, authority.expiresAt);
        }
        // Each full receipt independently repeats the protected parent/issuance
        // association. Same-Auth checks bracket both current observations.
        for (let round = 0; round < 2; round++) {
          if (
            !(await checkIdentity()) ||
            !alive() ||
            !(await checkParent()) ||
            !alive() ||
            !(await checkCurrent()) ||
            !alive()
          )
            return null;
        }
        // Final Auth itself can wait while the protected parent or current
        // approval changes. Finish with protected reads under the same pinned
        // Auth association; no further Auth wait follows that last snapshot.
        if (
          !(await checkIdentity()) ||
          !alive() ||
          !(await checkParent()) ||
          !alive() ||
          !(await checkCurrent()) ||
          !alive()
        )
          return null;
        const original = first as z.infer<typeof Current> | null;
        if (!original || parentVersion === null) return null;
        return Object.freeze({
          protocol: 2 as const,
          binding: Object.freeze({
            ownerId: pair.ownerId,
            threadId: request.threadId,
            threadIncarnation: request.threadIncarnation,
            threadRevision: request.threadRevision,
            attemptId: request.attemptId,
            approvalId: original.approval.id,
            approvalDigest: original.approval.digest,
            scope: original.approval.scope,
          }),
          authSessionId: pair.authSessionId,
          parentVersion,
          authorityFingerprint,
          issuedAt: original.authority.issuedAt,
          issuanceExpiresAt: original.authority.expiresAt,
          envelopeExpiresAt,
          verifiedAt,
          verificationExpiresAt,
          identityExpiresAt,
          allowlistExpiresAt,
          authorityExpiresAt: Math.min(envelopeExpiresAt, original.authority.expiresAt),
          approvalExpiresAt,
          effectiveExpiresAt: ceiling,
        });
      } catch {
        // No raw error, envelope, credentials, identifiers or private text escapes.
        return null;
      }
    },
  });
}
