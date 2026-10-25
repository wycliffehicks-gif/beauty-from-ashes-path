// Conversation v1 — source registry and source cards.
//
// Every source the conversation may quote or cite is a validated RECORD with
// exact text, hashes, origin, review status, spiritual classification and
// limitations (bfa-conversation-guide-v0.1 section 5). Source cards are built
// ONLY from these records — never from model output or client text. There is
// no live web retrieval and no whole-day payload: a record carries the exact
// excerpt it was registered with, nothing adjacent.

import { z } from "zod";
import {
  ConversationSourceIdSchema,
  type ConversationErrorCode,
  type ConversationValidation,
} from "./contract";

export const SOURCE_KINDS = [
  "journey-day-teaching",
  "verified-scripture-test-excerpt",
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const SOURCE_REVIEW_STATUSES = [
  "approved-guided-content",
  "verified-test-fixture-only",
  "provisional-review-pending",
] as const;
export type SourceReviewStatus = (typeof SOURCE_REVIEW_STATUSES)[number];

export const SPIRITUAL_CLASSIFICATIONS = [
  "nonreligious-teaching",
  "christian-scripture",
  "christian-reflection",
] as const;
export type SpiritualClassification = (typeof SPIRITUAL_CLASSIFICATIONS)[number];

export const ConversationSourceRecordSchema = z
  .object({
    sourceKey: ConversationSourceIdSchema,
    kind: z.enum(SOURCE_KINDS),
    title: z.string().min(1),
    /** The exact excerpt text this record authorizes. Nothing more. */
    exactText: z.string().min(1),
    textSha256: z.string().regex(/^[0-9a-f]{64}$/),
    origin: z
      .object({
        file: z.string().min(1),
        day: z.number().int().min(1).max(10).optional(),
        reference: z.string().min(1).optional(),
        translation: z.string().min(1).optional(),
      })
      .strict(),
    sourceCommit: z.string().regex(/^[0-9a-f]{40}$/),
    reviewStatus: z.enum(SOURCE_REVIEW_STATUSES),
    spiritualClassification: z.enum(SPIRITUAL_CLASSIFICATIONS),
    limitations: z.array(z.string().min(1)),
    testOnly: z.boolean(),
  })
  .strict();

export type ConversationSourceRecord = z.infer<typeof ConversationSourceRecordSchema>;

/** SHA-256 of UTF-8 text, lowercase hex. Browser- and Node-safe. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * The one verified Scripture fixture (test catalog, verified 2026-10-17).
 * TEST-ONLY: it is not a production Bible source, and it must never be mixed
 * with other WEB editions or paraphrases in an exact-quote record.
 */
export const WEB_CLASSIC_PSA034_018_TEST_FIXTURE: ConversationSourceRecord = {
  sourceKey: "WEB-CLASSIC-PSA034-018-20261017",
  kind: "verified-scripture-test-excerpt",
  title: "Psalm 34:18",
  exactText:
    "Yahweh is near to those who have a broken heart, and saves those who have a crushed spirit.",
  textSha256:
    "90de249bb42fe65090a1b552003bc552fc378556dba75f4c5be6a914a450d4bc",
  origin: {
    file: "https://ebible.org/eng-web/PSA034.htm",
    reference: "Psalm 34:18",
    translation: "World English Bible Classic",
  },
  sourceCommit: "bbfe39181fbc4d0848931981df06d7835aec66a7",
  reviewStatus: "verified-test-fixture-only",
  spiritualClassification: "christian-scripture",
  limitations: [
    "Test fixture only; not a production Bible source or full Bible ingestion.",
    "Classic WEB wording only; never mix with updated WEB or paraphrase editions.",
    "Verification covers this verse and edition identity only.",
  ],
  testOnly: true,
};

export interface SourceRegistry {
  readonly records: readonly ConversationSourceRecord[];
  readonly byKey: ReadonlyMap<string, ConversationSourceRecord>;
}

export type RegistryBuildResult =
  | { readonly ok: true; readonly registry: SourceRegistry }
  | {
      readonly ok: false;
      readonly code: "duplicate-source-key" | "hash-mismatch" | "invalid-record";
      readonly sourceKey?: string;
    };

/**
 * Build a registry from validated records. Every record's declared hash must
 * match its exact text; duplicates and schema failures are rejected.
 */
export async function createSourceRegistry(
  records: readonly unknown[],
): Promise<RegistryBuildResult> {
  const byKey = new Map<string, ConversationSourceRecord>();
  const out: ConversationSourceRecord[] = [];
  for (const raw of records) {
    const parsed = ConversationSourceRecordSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, code: "invalid-record" };
    const record = parsed.data;
    if (byKey.has(record.sourceKey)) {
      return { ok: false, code: "duplicate-source-key", sourceKey: record.sourceKey };
    }
    if ((await sha256Hex(record.exactText)) !== record.textSha256) {
      return { ok: false, code: "hash-mismatch", sourceKey: record.sourceKey };
    }
    byKey.set(record.sourceKey, record);
    out.push(record);
  }
  return { ok: true, registry: { records: out, byKey } };
}

export type SourceResolution = ConversationValidation<ConversationSourceRecord>;

/** Resolve a source reference. Absent and unknown are distinct results. */
export function resolveSource(
  registry: SourceRegistry,
  sourceId: string | null | undefined,
): SourceResolution {
  if (sourceId === null || sourceId === undefined || sourceId === "") {
    return { ok: false, code: "missing-source-id" };
  }
  const record = registry.byKey.get(sourceId);
  if (!record) return { ok: false, code: "unknown-source-id" };
  return { ok: true, value: record };
}

/**
 * A source card shown with a response. Built ONLY from a registry record;
 * model or client text can never supply or amend one.
 */
export interface SourceCard {
  readonly sourceKey: string;
  readonly kind: SourceKind;
  readonly title: string;
  readonly reference: string | null;
  readonly translation: string | null;
  readonly reviewStatus: SourceReviewStatus;
  readonly spiritualClassification: SpiritualClassification;
  readonly limitations: readonly string[];
  readonly testOnly: boolean;
}

export function buildSourceCard(record: ConversationSourceRecord): SourceCard {
  return {
    sourceKey: record.sourceKey,
    kind: record.kind,
    title: record.title,
    reference: record.origin.reference ?? null,
    translation: record.origin.translation ?? null,
    reviewStatus: record.reviewStatus,
    spiritualClassification: record.spiritualClassification,
    limitations: record.limitations,
    testOnly: record.testOnly,
  };
}

export type SourceCardResult = ConversationValidation<SourceCard>;

/**
 * Resolve a source id to a card, enforcing test-only scope. Test fixtures
 * require an explicit allowTestSources flag from the caller.
 */
export function resolveSourceCard(
  registry: SourceRegistry,
  sourceId: string | null | undefined,
  allowTestSources: boolean,
): SourceCardResult {
  const resolved = resolveSource(registry, sourceId);
  if (!resolved.ok) return resolved;
  if (resolved.value.testOnly && !allowTestSources) {
    return { ok: false, code: "test-only-source" as ConversationErrorCode };
  }
  return { ok: true, value: buildSourceCard(resolved.value) };
}
