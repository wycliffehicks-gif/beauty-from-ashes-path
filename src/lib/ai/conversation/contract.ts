// Conversation v1 — client request contract and server-owned state contracts.
//
// Isolated namespace: nothing outside src/lib/ai/conversation/ imports this,
// and the legacy four-field reflection contract (src/lib/ai/journey-contract.ts)
// is unchanged. No route, endpoint, store or provider uses this yet.
//
// Boundary rules (bfa-conversation-guide-v0.1 sections 5–6):
//   - The client supplies ONLY: its message and explicit excerpt REFERENCES.
//     It carries NO spiritual grant, NO follow-up linkage, NO owner identity,
//     NO system instructions, NO history, NO preferences, NO usage state and
//     NO source data — no field exists to carry them, and unknown fields are
//     rejected at EVERY nesting level (.strict()).
//   - The server owns: principal identity, authorized thread, thread ownership,
//     policy version, source records, preferences, restrictions, grants,
//     preview records, usage state, delivery state.
//   - Submitted text is never silently repaired or normalized.
//   - Error codes are stable and never echo arbitrary private input.

import { z } from "zod";
import { SpiritualRestrictionSchema } from "./grants";

export const CONVERSATION_CONTRACT_VERSION = "bfa-conversation-contract-v1";
export const CONVERSATION_MESSAGE_MAX_CHARS = 4000;
export const CONVERSATION_MAX_EXCERPTS_PER_TURN = 4;
export const CONVERSATION_MAX_SOURCES_PER_TURN = 4;

export const CONVERSATION_ERROR_CODES = [
  "invalid-contract-version",
  "invalid-request",
  "unknown-field",
  "message-empty",
  "message-too-long",
  "invalid-thread-id",
  "invalid-turn-id",
  "invalid-excerpt-reference",
  "principal-not-verified",
  "owner-mismatch",
  "unauthorized-thread",
  "thread-mismatch",
  "duplicate-excerpt",
  "stale-excerpt-preview",
  "grant-not-bound",
  "missing-source-id",
  "unknown-source-id",
  "test-only-source",
  "pending-review-source",
  "source-not-permitted",
] as const;

export type ConversationErrorCode = (typeof CONVERSATION_ERROR_CODES)[number];

export type ConversationValidation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: ConversationErrorCode };

const ThreadIdSchema = z
  .string()
  .regex(/^bfa-thread-[a-z0-9][a-z0-9-]{0,62}$/);

const TurnIdSchema = z.string().regex(/^bfa-turn-[a-z0-9][a-z0-9-]{0,62}$/);

const PreviewIdSchema = z
  .string()
  .regex(/^bfa-preview-[a-z0-9][a-z0-9-]{0,62}$/);

const GrantIdSchema = z
  .string()
  .regex(/^bfa-grant-[a-z0-9][a-z0-9-]{0,62}$/);

const Sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const ConversationSourceIdSchema = z
  .string()
  .regex(/^[A-Z0-9][A-Z0-9-]{0,63}$/);

/**
 * A REFERENCE to an exact-previewed excerpt — never the excerpt text itself.
 * The previewed bytes stay in the server-owned preview store; the client can
 * only point at a preview it was shown. `sourceKey` is a literal: the only
 * shareable private material at P1 is a deliberately selected private-note
 * excerpt. Weekly notes, journals-as-whole-documents, Day 10 hidden material
 * and other threads have no representable source key.
 */
export const SelectedExcerptReferenceSchema = z
  .object({
    previewId: PreviewIdSchema,
    sourceKey: z.literal("private-note"),
    excerptSha256: Sha256HexSchema,
    previewedAtIso: z.string().min(1),
  })
  .strict();

export type SelectedExcerptReference = z.infer<typeof SelectedExcerptReferenceSchema>;

/**
 * The complete client turn payload. Strict: any extra key fails. Note the
 * deliberate ABSENCE of spiritualRequestGrant and spiritualFollowUpOfTurnId —
// granting devotional content is server-owned authority, never client input.
 */
export const ClientTurnRequestSchema = z
  .object({
    contractVersion: z.literal(CONVERSATION_CONTRACT_VERSION),
    turnId: TurnIdSchema,
    threadId: ThreadIdSchema,
    message: z.string().min(1).max(CONVERSATION_MESSAGE_MAX_CHARS),
    selectedExcerpts: z
      .array(SelectedExcerptReferenceSchema)
      .max(CONVERSATION_MAX_EXCERPTS_PER_TURN),
  })
  .strict();

export type ClientTurnRequest = z.infer<typeof ClientTurnRequestSchema>;

/**
 * Server-owned identity. `principalVerified` / `threadOwnerVerified` are
 * literals: a fixture must explicitly claim verification, and real
 * authentication wiring is P3b — a TypeScript type is NOT authentication.
 * `authorizedThreadId` ties the ownership proof to the exact thread, so a
 * valid principal cannot be recombined with another thread's state.
 */
export const TrustedPrincipalSchema = z
  .object({
    principalId: z.string().min(1),
    principalVerified: z.literal(true),
    threadOwnerId: z.string().min(1),
    threadOwnerVerified: z.literal(true),
    authorizedThreadId: ThreadIdSchema,
  })
  .strict();

export type TrustedPrincipal = z.infer<typeof TrustedPrincipalSchema>;

/** Server-owned per-thread state the model may read but never supply. */
export const ServerContextSchema = z
  .object({
    contractVersion: z.literal(CONVERSATION_CONTRACT_VERSION),
    threadId: ThreadIdSchema,
    ownerId: z.string().min(1),
    spiritualPreferenceOn: z.boolean(),
    restrictions: z.array(SpiritualRestrictionSchema),
    preferenceSource: z.literal("server"),
  })
  .strict();

export type ServerContext = z.infer<typeof ServerContextSchema>;

/**
 * Server-owned scoped spiritual grant. Binds owner, authorized thread, the
 * EXACT current turn, the original request kind and the exact permitted
 * source ids. `followUpOfTurnId` records a server-validated direct-follow-up
 * lineage; the grant's own turnId must still be the current turn (the server
 * issues a fresh bound grant for the follow-up turn). A grant replayed in a
 * new or unrelated turn fails binding in context assembly.
 */
export const ServerGrantSchema = z
  .object({
    grantId: GrantIdSchema,
    kind: z.enum(["prayer", "passage"]),
    ownerId: z.string().min(1),
    threadId: ThreadIdSchema,
    turnId: TurnIdSchema,
    sourceIds: z.array(ConversationSourceIdSchema).max(4),
    followUpOfTurnId: TurnIdSchema.nullable(),
  })
  .strict();

export type ServerGrant = z.infer<typeof ServerGrantSchema>;

/**
 * Server-owned record of an exact excerpt preview. Carries the validated
 * exact text and its hash, owner/thread/current-turn binding, preview/source
 * identity, timestamps, optional expiry, and the source revision current at
 * preview time. The client reference may only select these exact bytes.
 */
export const ExcerptPreviewRecordSchema = z
  .object({
    previewId: PreviewIdSchema,
    sourceKey: z.literal("private-note"),
    exactText: z.string().min(1).max(CONVERSATION_MESSAGE_MAX_CHARS),
    textSha256: Sha256HexSchema,
    ownerId: z.string().min(1),
    threadId: ThreadIdSchema,
    turnId: TurnIdSchema,
    previewedAtIso: z.string().min(1),
    expiresAtIso: z.string().min(1).nullable(),
    sourceRevision: z.string().min(1),
  })
  .strict();

export type ExcerptPreviewRecord = z.infer<typeof ExcerptPreviewRecordSchema>;

function firstCode(
  issues: readonly z.ZodIssue[],
  fallback: ConversationErrorCode,
): ConversationErrorCode {
  for (const issue of issues) {
    if (issue.code === "unrecognized_keys") return "unknown-field";
    const path = issue.path.join(".");
    if (path === "contractVersion") return "invalid-contract-version";
    if (path === "threadId" || path === "authorizedThreadId") {
      return "invalid-thread-id";
    }
    if (path === "turnId") return "invalid-turn-id";
    if (path === "message") {
      if (issue.code === "too_big") return "message-too-long";
      return "message-empty";
    }
    if (path.startsWith("selectedExcerpts")) return "invalid-excerpt-reference";
  }
  return fallback;
}

export function validateClientTurnRequest(
  data: unknown,
): ConversationValidation<ClientTurnRequest> {
  const parsed = ClientTurnRequestSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, code: firstCode(parsed.error.issues, "invalid-request") };
  }
  return { ok: true, value: parsed.data };
}

export function validateTrustedPrincipal(
  data: unknown,
): ConversationValidation<TrustedPrincipal> {
  const parsed = TrustedPrincipalSchema.safeParse(data);
  if (!parsed.success) return { ok: false, code: "principal-not-verified" };
  return { ok: true, value: parsed.data };
}

export function validateServerContext(
  data: unknown,
): ConversationValidation<ServerContext> {
  const parsed = ServerContextSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, code: firstCode(parsed.error.issues, "invalid-request") };
  }
  return { ok: true, value: parsed.data };
}

export function validateServerGrant(
  data: unknown,
): ConversationValidation<ServerGrant> {
  const parsed = ServerGrantSchema.safeParse(data);
  if (!parsed.success) return { ok: false, code: "grant-not-bound" };
  return { ok: true, value: parsed.data };
}

export function validateExcerptPreviewRecord(
  data: unknown,
): ConversationValidation<ExcerptPreviewRecord> {
  const parsed = ExcerptPreviewRecordSchema.safeParse(data);
  if (!parsed.success) return { ok: false, code: "stale-excerpt-preview" };
  return { ok: true, value: parsed.data };
}
