// Shared types for the Day 1 AI safety foundation.
// This module is intentionally free of any provider or transport code.
// Nothing here calls, imports, or references an AI model or gateway.

export type RoadTypeId =
  | "difficult-conversation"
  | "grief-set-aside"
  | "boundary-postponed"
  | "asking-for-help"
  | "truth-about-self"
  | "meaningful-calling-or-decision"
  | "not-sure"
  | "prefer-not-to-say";

export type EmotionId =
  | "fear"
  | "shame"
  | "grief"
  | "anger"
  | "numbness"
  | "uncertainty"
  | "mixed";

export type EnergyId = "very-little" | "some" | "more-than-usual";

export type RegionCode = "CA" | "GLOBAL";

export type SafetyGateResult =
  | "clear"
  | "urgent-safety"
  | "minor-not-eligible"
  | "input-invalid";

export interface SafetyGateInput {
  roadType: RoadTypeId;
  emotion: EmotionId;
  energy: EnergyId;
  /** User has explicitly signalled they are not safe right now. */
  notSafeNow: boolean;
  /** User has confirmed they are 18 or older. */
  adultConfirmed: boolean;
  /** Optional free-text answer (never logged). Max 600 characters. */
  freeText?: string;
}

export interface SafetyGateOutcome {
  result: SafetyGateResult;
  /**
   * Non-sensitive reason code for internal routing only. Never contains any
   * portion of user text. Used to pick a deterministic response screen.
   */
  reasonCode:
    | "ok"
    | "explicit-flag"
    | "self-harm-suicide"
    | "harm-to-others"
    | "abuse-now"
    | "medical-emergency"
    | "harm-instructions-request"
    | "minor"
    | "text-too-long"
    | "invalid-input";
}

// Six-section response shape used by both the model output schema and the
// human-authored fallback. This shape is server-only content; it is never
// used to auto-render UI until the pilot ships.
export interface ReflectionOutput {
  hearing: string;
  theme: { id: string; gloss: string };
  nextSteps: Array<{ id: string; text: string }>;
  oneHonestStep: { id: string; text: string };
  spiritualReflection: {
    scriptureId: string;
    reflection: string;
    prayerId?: string;
  } | null;
  supportNote: string | null;
  totalWordsEstimate: number;
}

/**
 * Non-sensitive metadata used for future aggregate operations only.
 * No free text, no output content, no personal identifiers.
 * Defined here as a type contract; it is NOT persisted in this phase.
 */
export interface AggregateAuditRecord {
  timestamp: string; // ISO
  region: RegionCode;
  dayId: "day-01";
  contentPackVersion: string;
  policyVersion: string;
  validatorVersion: string;
  safetyGateResult: SafetyGateResult;
  fallbackUsed: boolean;
  retryCount: number;
  liveAiDisabled: boolean;
}
