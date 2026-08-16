// Answer-meaning firewall for The First Journey.
//
// A day's coded selections only mean something inside the wording and option
// set they were made under. This module names that meaning explicitly so a
// future revision of a day's questions can never silently re-interpret choices
// a person made under the older wording.
//
// Nothing here reads storage, calls a network, or handles labels or free text:
// only version identifiers and coded option tokens.

import type { AnswerMeaningVersion } from "@/content/journey-types";

/** At most eight coded answer meanings are ever retained for one day. */
export const MAX_MEANING_VERSIONS_PER_DAY = 8;

/**
 * FROZEN: the answer meaning every day carried in stores written BEFORE the
 * versioned architecture (store version 4) existed.
 *
 * This map must never be derived from current content, and never edited when a
 * day is later revised. It is the only truthful statement about what an old
 * record meant, and it always says v1.
 */
export const PRE_V4_MEANING_VERSION: Readonly<Record<string, AnswerMeaningVersion>> =
  Object.freeze({
    "day-01": "v1",
    "day-02": "v1",
    "day-03": "v1",
    "day-04": "v1",
    "day-05": "v1",
    "day-06": "v1",
    "day-07": "v1",
    "day-08": "v1",
    "day-09": "v1",
    "day-10": "v1",
  });

const SAFE_MEANING_VERSION = /^v[1-8]$/;

/** True only for a bounded, storage-safe meaning-version identifier. */
export function isSafeMeaningVersion(value: unknown): value is AnswerMeaningVersion {
  return typeof value === "string" && SAFE_MEANING_VERSION.test(value);
}

/** The meaning a pre-v4 record for this day carried, or null when unknown. */
export function preV4MeaningVersion(dayId: string): AnswerMeaningVersion | null {
  return PRE_V4_MEANING_VERSION[dayId] ?? null;
}
