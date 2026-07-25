// Deterministic safety gate.
//
// - Pure function, no I/O, no logging.
// - Runs client-side and server-side (must not import any browser or Node
//   modules).
// - Never records or returns the user's text — only a typed outcome and a
//   non-sensitive reason code.
// - Prefers false-positive routing to human support over letting an
//   ambiguous urgent case reach ordinary generation.
// - Explicitly NOT a clinical risk assessment.

import type {
  SafetyGateInput,
  SafetyGateOutcome,
  SafetyGateResult,
} from "@/lib/ai/types";

export const SAFETY_GATE_VERSION = "2026-07-25.1";

export const MAX_FREE_TEXT_LENGTH = 600;

// -- Trigger patterns -------------------------------------------------------
// Regexes are intentionally broad. False positives here route to a
// compassionate human-support screen; false negatives are the failure mode
// we must avoid. Word-boundary anchors are used to avoid matching innocuous
// substrings inside unrelated words (e.g. "assassin" inside "class").

const SELF_HARM_SUICIDE = [
  /\bsuicid(e|al|ally|ality)\b/i,
  /\bkill(ing)?\s+(myself|me)\b/i,
  /\bend(ing)?\s+(my|it)\s+(life|all)\b/i,
  /\btake\s+my\s+(own\s+)?life\b/i,
  /\bi\s+want\s+to\s+die\b/i,
  /\bi\s+can'?t\s+(stay\s+safe|keep\s+myself\s+safe)\b/i,
  /\b(self[-\s]?harm|cutting\s+myself|hurt(ing)?\s+myself)\b/i,
  /\boverdos(e|ing)\b/i,
  /\bhang(ing)?\s+myself\b/i,
  /\bjump(ing)?\s+off\b/i,
  /\bsuicide\s+note\b/i,
];

const HARM_TO_OTHERS = [
  /\bkill(ing)?\s+(him|her|them|someone|people)\b/i,
  /\bhurt(ing)?\s+(him|her|them|someone)\b/i,
  /\bshoot(ing)?\s+(him|her|them|someone|up)\b/i,
  /\bstab(bing)?\s+(him|her|them|someone)\b/i,
  /\bi\s+want\s+to\s+hurt\s+(him|her|them|someone)\b/i,
  /\bmake\s+(him|her|them)\s+pay\b/i,
];

const ABUSE_NOW = [
  /\b(he|she|they)('?s|\s+is|\s+are)\s+hitting\s+me\b/i,
  /\b(being\s+)?attacked\s+right\s+now\b/i,
  /\bhe'?s?\s+here\s+now\b.*\b(hurt|hitting|threaten)/i,
  /\b(abuse|abused|assault(ed|ing)?)\s+(right\s+now|happening\s+now)\b/i,
  /\bhelp\s+me\s+now\b/i,
];

const MEDICAL_EMERGENCY = [
  /\boverdos(e|ed|ing)\s+now\b/i,
  /\bcan'?t\s+breathe\b/i,
  /\bchest\s+pain\b/i,
  /\bunconscious\b/i,
  /\bbleeding\s+(a\s+lot|badly|out)\b/i,
];

const HARM_INSTRUCTIONS_REQUEST = [
  /\bwrite\s+(me\s+)?(a\s+)?suicide\s+note\b/i,
  /\bhow\s+(do|can)\s+i\s+(kill|hurt)\s+(myself|him|her|them|someone)\b/i,
  /\bhow\s+much\s+(is\s+lethal|would\s+kill)\b/i,
  /\bways\s+to\s+(kill|end)\s+(myself|my\s+life)\b/i,
];

interface PatternGroup {
  reason: SafetyGateOutcome["reasonCode"];
  patterns: RegExp[];
}

const TRIGGER_GROUPS: PatternGroup[] = [
  { reason: "harm-instructions-request", patterns: HARM_INSTRUCTIONS_REQUEST },
  { reason: "self-harm-suicide", patterns: SELF_HARM_SUICIDE },
  { reason: "harm-to-others", patterns: HARM_TO_OTHERS },
  { reason: "abuse-now", patterns: ABUSE_NOW },
  { reason: "medical-emergency", patterns: MEDICAL_EMERGENCY },
];

// -- Entry point ------------------------------------------------------------

export function runSafetyGate(input: SafetyGateInput): SafetyGateOutcome {
  // 1. Age gate is enforced up front; nothing else runs for a minor.
  if (!input.adultConfirmed) {
    return outcome("minor-not-eligible", "minor");
  }

  // 2. Length gate — deterministic rejection, no truncation.
  if (input.freeText !== undefined && input.freeText.length > MAX_FREE_TEXT_LENGTH) {
    return outcome("input-invalid", "text-too-long");
  }

  // 3. Explicit self-report of not-safe overrides everything else.
  if (input.notSafeNow) {
    return outcome("urgent-safety", "explicit-flag");
  }

  // 4. Pattern scan on optional text.
  const text = (input.freeText ?? "").trim();
  if (text.length > 0) {
    for (const group of TRIGGER_GROUPS) {
      for (const re of group.patterns) {
        if (re.test(text)) {
          return outcome("urgent-safety", group.reason);
        }
      }
    }
  }

  return outcome("clear", "ok");
}

function outcome(
  result: SafetyGateResult,
  reasonCode: SafetyGateOutcome["reasonCode"],
): SafetyGateOutcome {
  return { result, reasonCode };
}
