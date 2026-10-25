// Conversation v1 — spiritual preference, current restrictions, and scoped grants.
//
// Three DISTINCT concepts, per bfa-conversation-guide-v0.1 section 4:
//   1. The persistent spiritual preference (server-owned; an app action changes
//      it, never an AI sentence).
//   2. Current narrower restrictions ("no advice", "no questions",
//      "no exercises", "no Bible", "no prayer"). A narrower current restriction
//      ALWAYS wins over the persistent preference.
//   3. A specific, scoped grant: an explicit request for a prayer or passage,
//      valid for the exact current reply and its validated direct follow-ups
//      only. It never changes the persistent preference and never carries into
//      an unrelated later topic.
//
// There is deliberately NO keyword-based devotional-consent detection here.
// Mentioning God, church, doubt or religious hurt grants nothing. Resolving
// freeform intent into a grant is left to a later shared service; at P1 the
// grant contract is represented and tests supply explicit fixtures.

import { z } from "zod";

export const SPIRITUAL_RESTRICTIONS = [
  "no-advice",
  "no-questions",
  "no-exercises",
  "no-bible",
  "no-prayer",
] as const;

export type SpiritualRestriction = (typeof SPIRITUAL_RESTRICTIONS)[number];

export const SpiritualRestrictionSchema = z.enum(SPIRITUAL_RESTRICTIONS);

export const SPIRITUAL_GRANT_KINDS = ["prayer", "passage"] as const;
export type SpiritualGrantKind = (typeof SPIRITUAL_GRANT_KINDS)[number];

export interface SpiritualGrant {
  readonly kind: SpiritualGrantKind;
  /** P1 supports only the current reply; persistence would be a new scope. */
  readonly scope: "current-reply";
  /** Optional verified source record the request named (e.g. a passage). */
  readonly sourceId?: string;
}

export interface SpiritualAccessInput {
  /** Server-owned persistent preference. */
  readonly preferenceOn: boolean;
  /** Server-owned current restrictions for this thread/turn. */
  readonly restrictions: readonly SpiritualRestriction[];
  /**
   * The scoped grant for THIS turn, or null. On a validated direct follow-up
   * turn the server re-attaches the original grant; the client can never
   * attach one itself (see contract.ts).
   */
  readonly grant: SpiritualGrant | null;
  /**
   * True only when the current turn is a validated direct follow-up to the
   * turn that carried the grant. P1 cannot validate turn linkage itself;
   * context assembly requires the grant to be present on follow-up turns and
   * documents that real linkage validation is P3b server wiring.
   */
  readonly isDirectFollowUp: boolean;
}

export type SpiritualAccessReason =
  | "preference-on"
  | "preference-on-narrowed-by-current-restriction"
  | "preference-off-no-grant"
  | "scoped-grant-current-reply"
  | "scoped-grant-direct-follow-up";

export interface SpiritualAccess {
  readonly devotionalContentPermitted: boolean;
  readonly prayerPermitted: boolean;
  readonly scripturePermitted: boolean;
  readonly reason: SpiritualAccessReason;
}

/**
 * Resolve what devotional content this turn may contain. Pure and total:
 * every combination of preference, restrictions and grant maps to exactly one
 * result, and a narrower restriction always wins.
 */
export function resolveSpiritualAccess(input: SpiritualAccessInput): SpiritualAccess {
  const restrictions = new Set(input.restrictions);
  const noBible = restrictions.has("no-bible");
  const noPrayer = restrictions.has("no-prayer");

  if (input.preferenceOn) {
    const narrowed = noBible || noPrayer;
    return {
      devotionalContentPermitted: !(noBible && noPrayer),
      prayerPermitted: !noPrayer,
      scripturePermitted: !noBible,
      reason: narrowed
        ? "preference-on-narrowed-by-current-restriction"
        : "preference-on",
    };
  }

  // Preference off. Religious language alone is not a grant; only an explicit
  // scoped grant (or its validated direct follow-up) permits devotional
  // content, and only of the requested kind.
  if (!input.grant) {
    return {
      devotionalContentPermitted: false,
      prayerPermitted: false,
      scripturePermitted: false,
      reason: "preference-off-no-grant",
    };
  }

  const prayerPermitted = !noPrayer && input.grant.kind === "prayer";
  const scripturePermitted = !noBible && input.grant.kind === "passage";
  return {
    devotionalContentPermitted: prayerPermitted || scripturePermitted,
    prayerPermitted,
    scripturePermitted,
    reason: input.isDirectFollowUp
      ? "scoped-grant-direct-follow-up"
      : "scoped-grant-current-reply",
  };
}
