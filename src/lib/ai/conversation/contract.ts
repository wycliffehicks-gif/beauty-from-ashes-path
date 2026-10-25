// Conversation v1 — client request contract and server-owned state contracts.
//
// Isolated namespace: nothing outside src/lib/ai/conversation/ imports this,
// and the legacy four-field reflection contract (src/lib/ai/journey-contract.ts)
// is unchanged. No route, endpoint, store or provider uses this yet.
//
// Boundary rules (bfa-conversation-guide-v0.1 sections 5–6):
//   - The client supplies ONLY: its message, explicit excerpt REFERENCES, and
//     (for tests/fixtures) a scoped spiritual request grant.
//   - The server owns: principal identity, thread ownership, policy version,
//     source records, preferences, restrictions, usage state, delivery state.
//   - Unknown fields are rejected at EVERY nesting level (.strict()). A client
//     attempt to supply system instructions, owner identity, arbitrary source
//     cards, other-thread history, preferences or usage state fails validation
//     because no field exists to carry them.
//   - Submitted text is never silently repaired or normalized.
//   - Error codes are stable and never echo arbitrary private input.

import { z } from "zod";
import { SpiritualRestrictionSchema } from "./grants";

export const CONVERSATION_CONTRACT_VERSION = "bfa-conversation-contract-v1";
export const CONVERSATION_MESSAGE_MAX_CHARS = 4000;
export const CONVERSATION_MAX_EXCERPTS_PER_TURN = 4;

export const CONVERSATION_ERROR_CODES = [
  "invalid-contract-version",
  "invalid-request",
  "unknown-field",
  "message-empty",
  "message-too-long",
  "invalid-thread-id",
  "invalid-turn-id",
  "invalid-excerpt-reference",
  "invalid-spiritual-grant",
  "principal-not-verified",
  "owner-mismatch",
  "thread-mismatch",
  "stale-excerpt-preview",
  "follow-up-without-grant",
  "missing-source-id",
  "unknown-source-id",
  "test-only-source",
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

export const SpiritualRequestGrantSchema = z
  .object({
    kind: z.enum(["prayer", "passage"]),
    scope: z.literal("current-reply"),
    sourceId: ConversationSourceIdSchema.optional(),
  })
  .strict();

export type SpiritualRequestGrant = z.infer<typeof SpiritualRequestGrantSchema>;

/** The complete client turn payload. Strict: any extra key fails. */
export const ClientTurnRequestSchema = z
  .object({
    contractVersion: z.literal(CONVERSATION_CONTRACT_VERSION),
    turnId: TurnIdSchema,
    threadId: ThreadIdSchema,
    message: z.string().min(1).max(CONVERSATION_MESSAGE_MAX_CHARS),
    selectedExcerpts: z
      .array(SelectedExcerptReferenceSchema)
      .max(CONVERSATION_MAX_EXCERPTS_PER_TURN),
    spiritualRequestGrant: SpiritualRequestGrantSchema.nullable(),
    spiritualFollowUpOfTurnId: TurnIdSchema.nullable(),
  })
  .strict();

export type ClientTurnRequest = z.infer<typeof ClientTurnRequestSchema>;

/**
 * Server-owned identity. `principalVerified` / `threadOwnerVerified` are
 * literals: a fixture must explicitly claim verification, and real
 * authentication wiring is P3b — a TypeScript type is NOT authentication.
 */
export const TrustedPrincipalSchema = z
  .object({
    principalId: z.string().min(1),
    principalVerified: z.literal(true),
    threadOwnerId: z.string().min(1),
    threadOwnerVerified: z.literal(true),
  })
  .strict();

export type TrustedPrincipal = z.infer<typeof TrustedPrincipalSchema>;

/** Server-owned per-thread state the model may read but never supply. */
export const ServerContextSchema = z
  .object({
    contractVersion: z.literal(CONVERSATION_CONTRACT_VERSION),
    threadId: ThreadIdSchema,
    spiritualPreferenceOn: z.boolean(),
    restrictions: z.array(SpiritualRestrictionSchema),
    preferenceSource: z.literal("server"),
  })
  .strict();

export type ServerContext = z.infer<typeof ServerContextSchema>;

function firstCode(
  issues: readonly z.ZodIssue[],
  fallback: ConversationErrorCode,
): ConversationErrorCode {
  for (const issue of issues) {
    if (issue.code === "unrecognized_keys") return "unknown-field";
    const path = issue.path.join(".");
    if (path === "contractVersion") return "invalid-contract-version";
    if (path === "threadId") return "invalid-thread-id";
    if (path === "turnId" || path === "spiritualFollowUpOfTurnId") {
      return "invalid-turn-id";
    }
    if (path === "message") {
      if (issue.code === "too_big") return "message-too-long";
      return "message-empty";
    }
    if (path.startsWith("selectedExcerpts")) return "invalid-excerpt-reference";
    if (path.startsWith("spiritualRequestGrant")) return "invalid-spiritual-grant";
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
