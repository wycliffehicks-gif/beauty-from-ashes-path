// Beauty from Ashes — Day 1 curated AI content pack.
//
// This module is human-authored, versioned, and the single source of truth
// for anything an AI-personalized reflection may reference on Day 1. It is
// server-readable but contains no secrets and imports nothing from a model
// provider.
//
// Governing rules for edits:
// - Every entry must be safe, tentative, and consistent with the Beauty from
//   Ashes teaching for Day 1: "The Walk You've Been Avoiding" → gentle
//   acknowledgement and one honest step.
// - Never add an item that would pressure a user to confront, reconcile,
//   disclose trauma, contact an abuser, leave professional care, or change
//   medication.
// - The Beauty from Ashes practice standard for every step is:
//   Specific, Small, Safe, Meaningful, Connected.
// - Bump `version` on any change so the validator can require a match.

import type { EmotionId, EnergyId, RoadTypeId } from "@/lib/ai/types";

export const DAY_01_CONTENT_PACK_VERSION = "2026-07-25.1";

export interface ThemeStatement {
  id: string;
  text: string;
  tags: {
    road?: RoadTypeId[];
    emotion?: EmotionId[];
    energy?: EnergyId[];
  };
}

export interface GentleStep {
  id: string;
  text: string;
  tags: {
    emotion?: EmotionId[];
    energy?: EnergyId[];
    road?: RoadTypeId[];
  };
}

export interface OneHonestStep extends GentleStep {}

export interface ScripturePassage {
  id: string;
  reference: string; // Reference only — no copyrighted verse text.
  reflection: string; // Founder-authored reflection, warm and tentative.
  tags: { emotion?: EmotionId[]; road?: RoadTypeId[] };
}

export interface PrayerFragment {
  id: string;
  text: string;
  themes: Array<
    | "courage-without-arrogance"
    | "humility-without-shame"
    | "honesty-without-despair"
    | "safety"
    | "faithful-pacing"
    | "companionship"
  >;
}

export interface SupportReminder {
  id: string;
  text: string;
}

export interface Day01ContentPack {
  dayId: "day-01";
  version: string;
  themeStatements: ThemeStatement[];
  gentleSteps: GentleStep[];
  oneHonestSteps: OneHonestStep[];
  scriptures: ScripturePassage[];
  prayers: PrayerFragment[];
  supportReminders: SupportReminder[];
  prohibitedClaims: string[];
  prohibitedActionCategories: string[];
}

// ---------- Theme statements ----------
const themeStatements: ThemeStatement[] = [
  {
    id: "t-road-toward-meaning",
    text: "The road you have been avoiding may also be a road toward meaning, truth, or faithful action — not only toward difficulty.",
    tags: { road: ["meaningful-calling-or-decision", "truth-about-self", "difficult-conversation"] },
  },
  {
    id: "t-awareness-is-a-beginning",
    text: "Day 1 does not ask you to walk the whole road. Awareness and acknowledgement may be enough for today.",
    tags: { emotion: ["fear", "numbness", "uncertainty"], energy: ["very-little", "some"] },
  },
  {
    id: "t-movement-not-performance",
    text: "The goal is intentional movement — not dramatic performance, and not fixing a whole life at once.",
    tags: { emotion: ["shame", "uncertainty"] },
  },
  {
    id: "t-preparation-counts",
    text: "A next step may be preparation, gathering information, writing privately, asking for help, or simply naming what feels unsafe.",
    tags: { energy: ["very-little", "some"] },
  },
  {
    id: "t-courage-and-wisdom",
    text: "Courage and wisdom belong together. A faithful step never asks you to enter an unsafe place alone.",
    tags: { road: ["boundary-postponed", "difficult-conversation"], emotion: ["fear"] },
  },
  {
    id: "t-you-carry-preparation",
    text: "You may already be carrying more preparation than you realise — in your resilience, your faith, your therapy, your friendships, or your prior acts of courage.",
    tags: { emotion: ["shame", "grief"], energy: ["very-little"] },
  },
];

// ---------- Gentle next steps ----------
const gentleSteps: GentleStep[] = [
  {
    id: "s-private-sentence",
    text: "Write one private sentence, outside this app, beginning with: “The road I may be avoiding is…”",
    tags: { energy: ["very-little", "some"] },
  },
  {
    id: "s-name-meaning-and-difficulty",
    text: "Name, in your own words, what makes this road meaningful — and what makes it difficult.",
    tags: { emotion: ["uncertainty", "mixed"] },
  },
  {
    id: "s-draft-without-sending",
    text: "Draft a message or conversation in a notes app, without sending it. Let the drafting itself be the step.",
    tags: { road: ["difficult-conversation"], energy: ["some", "more-than-usual"] },
  },
  {
    id: "s-ask-safe-person",
    text: "Ask one safe person to help you think through what a next step could look like.",
    tags: { emotion: ["fear", "uncertainty"] },
  },
  {
    id: "s-gather-information",
    text: "Gather one piece of information you would need before deciding — a fact, a resource, or a question worth asking.",
    tags: { road: ["meaningful-calling-or-decision", "asking-for-help"] },
  },
  {
    id: "s-prepare-appointment",
    text: "Make, or prepare to make, an appointment with a qualified professional who can walk part of this road with you.",
    tags: { road: ["asking-for-help"], emotion: ["grief", "fear"] },
  },
  {
    id: "s-five-quiet-minutes",
    text: "Set aside five quiet minutes to notice what you fear about this road — and what you quietly hope.",
    tags: { energy: ["very-little"], emotion: ["fear", "numbness"] },
  },
  {
    id: "s-identify-preconditions",
    text: "Identify what safety, support, or preparation would need to be in place before any outward step is wise.",
    tags: { road: ["boundary-postponed", "difficult-conversation"], emotion: ["fear"] },
  },
  {
    id: "s-no-action-today",
    text: "Decide that no interpersonal action will be taken today, because support or safety planning is needed first. That is a faithful step.",
    tags: { emotion: ["fear", "shame"], energy: ["very-little"] },
  },
  {
    id: "s-return-to-ground",
    text: "Return to Pause and Ground before choosing anything else. Steadiness is part of the step.",
    tags: { emotion: ["numbness", "mixed"], energy: ["very-little"] },
  },
];

// ---------- One Honest Steps ----------
const oneHonestSteps: OneHonestStep[] = [
  {
    id: "ohs-name-the-road",
    text: "In one private sentence, name the road you may be avoiding — no need to walk it today.",
    tags: { energy: ["very-little", "some"] },
  },
  {
    id: "ohs-tell-safe-person",
    text: "Tell one safe person, in your own words, that this road is on your heart — you do not need to solve it aloud.",
    tags: { emotion: ["grief", "fear"] },
  },
  {
    id: "ohs-five-minutes-honesty",
    text: "Give yourself five honest minutes with this road — noticing without deciding, listening without judging.",
    tags: { energy: ["very-little"] },
  },
  {
    id: "ohs-prepare-not-perform",
    text: "Take one preparation step — a note, a search, a question — that no one else has to see.",
    tags: { emotion: ["shame", "uncertainty"] },
  },
  {
    id: "ohs-consult-professional",
    text: "Reach out, or plan to reach out, to a professional who is qualified to walk this road with you.",
    tags: { road: ["asking-for-help", "meaningful-calling-or-decision"] },
  },
  {
    id: "ohs-safety-first",
    text: "Where safety is uncertain, choose safety-planning first — that is the honest step, not silence.",
    tags: { road: ["boundary-postponed"], emotion: ["fear"] },
  },
  {
    id: "ohs-return-to-ground",
    text: "Return to Pause and Ground once today. Let steadiness be the whole step.",
    tags: { energy: ["very-little"], emotion: ["numbness"] },
  },
];

// ---------- Scripture references (no verse text quoted) ----------
const scriptures: ScripturePassage[] = [
  {
    id: "sc-luke-9-51",
    reference: "Luke 9:51",
    reflection:
      "Luke describes Jesus quietly setting his face toward Jerusalem — a road he did not have to walk, chosen with steady resolve. It is not an image of forced suffering. It may be an image of gentle intentionality: naming the meaningful road, in your own time, in company that is safe.",
    tags: { road: ["meaningful-calling-or-decision", "difficult-conversation"] },
  },
  {
    id: "sc-isaiah-61-1-3",
    reference: "Isaiah 61:1–3",
    reflection:
      "Isaiah 61 speaks of good news for the brokenhearted, comfort for those who mourn, and beauty in place of ashes. It does not require you to arrive already whole. It suggests that dignity, comfort and beauty may come near a person on the road — not only at its end.",
    tags: { emotion: ["grief", "shame"] },
  },
];

// ---------- Prayer fragments (founder-voiced themes) ----------
const prayers: PrayerFragment[] = [
  {
    id: "p-courage-and-wisdom",
    text: "God, would you help me find courage that is not arrogant and wisdom that is not frozen. Show me one honest step for today.",
    themes: ["courage-without-arrogance", "faithful-pacing"],
  },
  {
    id: "p-honesty-without-despair",
    text: "God, help me be honest about this road without falling into despair, and hopeful about it without pretending. Keep me tender and steady.",
    themes: ["honesty-without-despair", "humility-without-shame"],
  },
  {
    id: "p-safety-and-company",
    text: "God, if this road is not safe for me to walk alone, please slow me down and send company. I do not need to arrive today.",
    themes: ["safety", "companionship", "faithful-pacing"],
  },
];

// ---------- Support reminders (no phone numbers here) ----------
const supportReminders: SupportReminder[] = [
  {
    id: "sr-safe-person",
    text: "If this begins to feel heavy, it may help to reach a trusted person or a qualified professional — you do not have to hold it alone.",
  },
  {
    id: "sr-professional",
    text: "A therapist, counsellor, physician, or pastor can walk part of this road with you, at a pace that honours your history.",
  },
  {
    id: "sr-pause-ground",
    text: "If the feelings become too much, please pause and use a grounding practice before choosing any next step.",
  },
];

// ---------- Prohibited claims and action categories ----------
const prohibitedClaims: string[] = [
  "diagnosis",
  "diagnostic certainty",
  "you have PTSD",
  "you have depression",
  "you have anxiety disorder",
  "prescription",
  "treatment plan",
  "medication advice",
  "stop taking",
  "start taking",
  "increase your dose",
  "decrease your dose",
  "guaranteed healing",
  "you will be healed",
  "God told me",
  "God is telling you",
  "God requires you to",
  "God demands",
  "God will punish",
  "you must forgive",
  "you must reconcile",
  "you should confront",
  "call your abuser",
  "return to him",
  "return to her",
  "return to them",
  "leave therapy",
  "you don't need a therapist",
  "quit your medication",
];

const prohibitedActionCategories: string[] = [
  "confront-unsafe-person",
  "reconcile-with-abuser",
  "disclose-trauma-immediately",
  "return-to-unsafe-situation",
  "leave-professional-care",
  "change-medication",
  "make-major-life-decision-today",
  "diagnose-user",
  "prescribe-treatment",
  "speak-for-God",
];

export const DAY_01_CONTENT_PACK: Day01ContentPack = {
  dayId: "day-01",
  version: DAY_01_CONTENT_PACK_VERSION,
  themeStatements,
  gentleSteps,
  oneHonestSteps,
  scriptures,
  prayers,
  supportReminders,
  prohibitedClaims,
  prohibitedActionCategories,
};

// Convenience ID sets for the validator.
export const DAY_01_VALID_IDS = {
  themes: new Set(themeStatements.map((t) => t.id)),
  gentleSteps: new Set(gentleSteps.map((s) => s.id)),
  oneHonestSteps: new Set(oneHonestSteps.map((s) => s.id)),
  scriptures: new Set(scriptures.map((s) => s.id)),
  prayers: new Set(prayers.map((p) => p.id)),
  supportReminders: new Set(supportReminders.map((r) => r.id)),
};
