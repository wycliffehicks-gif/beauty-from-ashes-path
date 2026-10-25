// Conversation v1 — source registry, source excerpts and source cards.
//
// Every source the conversation may quote or cite is a validated RECORD with
// exact text, hashes, origin, review status, spiritual classification and
// limitations (bfa-conversation-guide-v0.1 section 5). Source excerpts and
// cards resolve ONLY through the validated registry — never from model output,
// client text, or a caller-constructed record. There is no live web retrieval
// and no whole-day payload: a record carries the exact excerpt it was
// registered with, nothing adjacent.
//
// Semantic invariants enforced at registry build:
//   - verified-scripture-test-excerpt records are ALWAYS test-only and carry
//     review status verified-test-fixture-only, with exact reference and
//     translation provenance;
//   - verified-test-fixture-only records are ALWAYS test-only;
//   - provisional-review-pending records are NOT admitted;
//   - a record's hash verifies the supplied bytes only — it never verifies
//     biblical attribution, which comes from the recorded provenance;
//   - records are deep-frozen after validation so text, classification and
//     status cannot be mutated afterwards.

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
  .strict()
  .superRefine((record, ctx) => {
    if (record.kind === "verified-scripture-test-excerpt") {
      if (!record.origin.reference || !record.origin.translation) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Verified Scripture requires exact reference and translation.",
        });
      }
      if (record.reviewStatus !== "verified-test-fixture-only") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Scripture test excerpts must be verified-test-fixture-only.",
        });
      }
    }
    if (record.reviewStatus === "verified-test-fixture-only" && !record.testOnly) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "verified-test-fixture-only records are always test-only.",
      });
    }
  });

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

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/**
 * The one verified Scripture fixture (test catalog, verified 2026-10-17).
 * TEST-ONLY: it is not a production Bible source, and it must never be mixed
 * with other WEB editions or paraphrases in an exact-quote record. Its hash
 * verifies these exact bytes; its biblical attribution rests on the recorded
 * eBible.org provenance, not on the hash.
 */
export const WEB_CLASSIC_PSA034_018_TEST_FIXTURE: ConversationSourceRecord =
  deepFreeze({
    sourceKey: "WEB-CLASSIC-PSA034-018-20261017",
    kind: "verified-scripture-test-excerpt" as const,
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
    reviewStatus: "verified-test-fixture-only" as const,
    spiritualClassification: "christian-scripture" as const,
    limitations: [
      "Test fixture only; not a production Bible source or full Bible ingestion.",
      "Classic WEB wording only; never mix with updated WEB or paraphrase editions.",
      "Verification covers this verse and edition identity only.",
    ],
    testOnly: true as const,
  });

/**
 * Validated, immutable registry. The record map is encapsulated behind
 * `getRecord`; callers cannot inject forged records or mutate validated ones.
 */
export interface SourceRegistry {
  readonly records: readonly ConversationSourceRecord[];
  getRecord(sourceKey: string): ConversationSourceRecord | undefined;
}

export type RegistryBuildResult =
  | { readonly ok: true; readonly registry: SourceRegistry }
  | {
      readonly ok: false;
      readonly code:
        | "duplicate-source-key"
        | "hash-mismatch"
        | "invalid-record"
        | "pending-review-not-admissible";
      readonly sourceKey?: string;
    };

/**
 * Build a registry from candidate records. Every record is schema-validated
 * (including the test-only and Scripture-provenance invariants), its declared
 * hash must match its exact text, duplicates are rejected, pending-review
 * records are not admitted, and admitted records are deep-frozen.
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
    if (record.reviewStatus === "provisional-review-pending") {
      return {
        ok: false,
        code: "pending-review-not-admissible",
        sourceKey: record.sourceKey,
      };
    }
    if ((await sha256Hex(record.exactText)) !== record.textSha256) {
      return { ok: false, code: "hash-mismatch", sourceKey: record.sourceKey };
    }
    const frozen = deepFreeze(record);
    byKey.set(frozen.sourceKey, frozen);
    out.push(frozen);
  }
  const frozenRecords = deepFreeze(out.slice());
  return {
    ok: true,
    registry: Object.freeze({
      records: frozenRecords,
      getRecord: (sourceKey: string) => byKey.get(sourceKey),
    }),
  };
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
  const record = registry.getRecord(sourceId);
  if (!record) return { ok: false, code: "unknown-source-id" };
  return { ok: true, value: record };
}

/**
 * The bounded, validated source excerpt that may enter a context: exact text,
 * hash and full provenance. Separate from the display-card projection.
 */
export interface SourceExcerpt {
  readonly sourceKey: string;
  readonly kind: SourceKind;
  readonly title: string;
  readonly exactText: string;
  readonly textSha256: string;
  readonly origin: ConversationSourceRecord["origin"];
  readonly sourceCommit: string;
  readonly reviewStatus: SourceReviewStatus;
  readonly spiritualClassification: SpiritualClassification;
  readonly limitations: readonly string[];
  readonly testOnly: boolean;
}

/** A display-card projection shown with a response. No exact text. */
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

function toExcerpt(record: ConversationSourceRecord): SourceExcerpt {
  return {
    sourceKey: record.sourceKey,
    kind: record.kind,
    title: record.title,
    exactText: record.exactText,
    textSha256: record.textSha256,
    origin: record.origin,
    sourceCommit: record.sourceCommit,
    reviewStatus: record.reviewStatus,
    spiritualClassification: record.spiritualClassification,
    limitations: record.limitations,
    testOnly: record.testOnly,
  };
}

function toCard(record: ConversationSourceRecord): SourceCard {
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

export interface ResolvedSource {
  readonly excerpt: SourceExcerpt;
  readonly card: SourceCard;
}

export type ResolvedSourceResult = ConversationValidation<ResolvedSource>;

/**
 * The ONLY way to obtain a source excerpt or card: resolve a source id
 * through the validated registry. Test-only records require an explicit
 * allowTestSources flag. There is no exported record-to-card helper, so a
 * caller-constructed record cannot bypass registry validation.
 */
export function resolveRegistrySource(
  registry: SourceRegistry,
  sourceId: string | null | undefined,
  allowTestSources: boolean,
): ResolvedSourceResult {
  const resolved = resolveSource(registry, sourceId);
  if (!resolved.ok) return resolved;
  if (resolved.value.testOnly && !allowTestSources) {
    return { ok: false, code: "test-only-source" as ConversationErrorCode };
  }
  return {
    ok: true,
    value: { excerpt: toExcerpt(resolved.value), card: toCard(resolved.value) },
  };
}
