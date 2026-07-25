// Deterministic Day 1 content selector.
//
// Selects a ReflectionOutput from the approved Day 1 content pack based on
// the user's response choices. No AI, no free text echoed, no invention.
// Every ID returned is verified to exist in the content pack.

import { DAY_01_CONTENT_PACK } from "@/content/ai/day-01";
import { buildDay01Fallback } from "@/content/ai/fallback-day-01";
import type { ReflectionInput } from "@/lib/ai/schemas";
import type { EmotionId, EnergyId, ReflectionOutput, RoadTypeId } from "@/lib/ai/types";

export const SELECT_DAY_01_VERSION = "2026-07-25.1";

interface ScoreTags {
  road?: RoadTypeId[];
  emotion?: EmotionId[];
  energy?: EnergyId[];
}

interface Query {
  road: RoadTypeId;
  emotion: EmotionId;
  energy: EnergyId;
}

function score(tags: ScoreTags, q: Query): number {
  let s = 0;
  if (tags.road?.includes(q.road)) s += 3;
  if (tags.emotion?.includes(q.emotion)) s += 2;
  if (tags.energy?.includes(q.energy)) s += 2;
  return s;
}

function pickBest<T extends { id: string; tags?: ScoreTags }>(items: T[], q: Query, fallbackId?: string): T {
  let best = items[0];
  let bestScore = -1;
  for (const it of items) {
    const s = it.tags ? score(it.tags, q) : 0;
    if (s > bestScore) {
      bestScore = s;
      best = it;
    }
  }
  if (fallbackId && bestScore === 0) {
    const fb = items.find((i) => i.id === fallbackId);
    if (fb) return fb;
  }
  return best;
}

function pickTop<T extends { id: string; tags?: ScoreTags }>(items: T[], q: Query, n: number): T[] {
  const scored = items.map((it, i) => ({ it, s: it.tags ? score(it.tags, q) : 0, i }));
  scored.sort((a, b) => b.s - a.s || a.i - b.i);
  return scored.slice(0, n).map((x) => x.it);
}

const HEARING_BY_ROAD: Record<RoadTypeId, string> = {
  "difficult-conversation":
    "It sounds like there may be a conversation on your heart today — one that feels meaningful and also heavy. You do not have to have it today. Perhaps it is enough, for now, to acknowledge that the words are gathering, quietly, in you.",
  "grief-set-aside":
    "It sounds like there may be a grief you have been setting aside — quietly, faithfully, for reasons that made sense. Perhaps today it is asking only to be noticed, not resolved. You may not have to carry it into words yet.",
  "boundary-postponed":
    "It sounds like there may be a boundary you have been postponing — perhaps because kindness, safety or timing were not yet aligned. You do not have to draw it today. Naming it, gently, may be a step of its own.",
  "asking-for-help":
    "It sounds like asking for help may be on your heart — and that this itself is a heavy road for many honest reasons. You do not have to ask perfectly, or all at once. Perhaps today is about noticing where support could quietly begin.",
  "truth-about-self":
    "It sounds like there may be a truth about yourself that you have been slow to look at — perhaps because it feels tender, or costly. You do not have to face all of it today. Awareness, held with kindness, may be a beginning that is enough.",
  "meaningful-calling-or-decision":
    "It sounds like there may be a meaningful calling or decision quietly pressing on you. You do not have to resolve it today. Perhaps what is being asked is that you turn toward it gently, without demanding an answer yet.",
  "not-sure":
    "It sounds like something may be pressing on you that you cannot yet name — and that is a fair place to begin. You do not have to define it today. Perhaps it is enough to acknowledge that something is there, and that noticing counts.",
  "prefer-not-to-say":
    "It sounds like there may be a road on your heart that you are not ready to describe — even here, even to yourself. That may be wise. Perhaps today is simply about honouring what is real, without having to put it into words.",
};

const EMOTION_SENTENCE: Record<EmotionId, string> = {
  fear:
    "Fear may be close by today — not because you are weak, but because something meaningful is at stake.",
  shame:
    "Shame may be close by today — a heavy companion that often exaggerates and rarely tells the whole truth.",
  grief:
    "Grief may be close by today — and grief, in its own quiet way, is a form of love that has nowhere else to go.",
  anger:
    "Anger may be close by today — and anger, faithfully listened to, often has something honest to say.",
  numbness:
    "Numbness may be close by today — perhaps because a system inside you has been carrying more than it can hold.",
  uncertainty:
    "Uncertainty may be close by today — and uncertainty, held gently, is not the same as failure.",
  mixed:
    "It may be a mixture of things today — and a mixture is honest, not a sign that something is wrong with you.",
};

const ENERGY_SENTENCE: Record<EnergyId, string> = {
  "very-little":
    "You may have very little energy today, and that is real information — not weakness. Perhaps the honest step is the smallest one.",
  some:
    "You may have some energy today — enough for a small, honest movement, but nothing that has to prove anything.",
  "more-than-usual":
    "You may have a little more energy today than usual — enough to take one steady step, without needing to carry the whole road at once.",
};

function buildHearing(q: Query): string {
  const closing =
    "You do not need to name this perfectly, and you do not need to solve it today. Perhaps what may be asked of Day 1 is simply that you turn toward this road with a little more honesty and a little more kindness than yesterday. Awareness, held gently, may already be a form of faithful movement — a small, quiet way of walking toward hope, one honest step at a time.";
  return `${HEARING_BY_ROAD[q.road]} ${EMOTION_SENTENCE[q.emotion]} ${ENERGY_SENTENCE[q.energy]} ${closing}`;
}

// Ordered support reminder preference by emotion; falls back to first.
function pickSupportNote(q: Query): string {
  const reminders = DAY_01_CONTENT_PACK.supportReminders;
  if (q.emotion === "numbness" || q.emotion === "mixed") {
    return reminders.find((r) => r.id === "sr-pause-ground")?.text ?? reminders[0].text;
  }
  if (q.emotion === "grief" || q.emotion === "fear") {
    return reminders.find((r) => r.id === "sr-professional")?.text ?? reminders[0].text;
  }
  return reminders[0].text;
}

function pickPrayerId(q: Query): string {
  if (q.emotion === "fear" || q.emotion === "uncertainty") return "p-courage-and-wisdom";
  if (q.emotion === "shame" || q.emotion === "grief") return "p-honesty-without-despair";
  if (q.road === "boundary-postponed" || q.road === "difficult-conversation")
    return "p-safety-and-company";
  return "p-courage-and-wisdom";
}

/**
 * Build a curated, source-grounded ReflectionOutput from response choices.
 * Free text is intentionally NOT used. If the resulting structure cannot
 * pass the validator downstream, the caller is expected to fall back to the
 * generic human-authored fallback.
 */
export function selectDay01Reflection(input: ReflectionInput): ReflectionOutput {
  const q: Query = { road: input.roadType, emotion: input.emotion, energy: input.energy };

  const theme = pickBest(DAY_01_CONTENT_PACK.themeStatements, q, "t-awareness-is-a-beginning");

  // For very-little energy, prefer smaller steps by biasing to items tagged
  // very-little; the scorer already gives energy tags weight, and we cap
  // step count at 3.
  const nextStepsSource = pickTop(DAY_01_CONTENT_PACK.gentleSteps, q, 3);
  const nextSteps = nextStepsSource.map((s) => ({ id: s.id, text: s.text }));

  const ohs = pickBest(DAY_01_CONTENT_PACK.oneHonestSteps, q, "ohs-name-the-road");

  const scripture = pickBest(DAY_01_CONTENT_PACK.scriptures, q);
  const prayerId = pickPrayerId(q);

  const output: ReflectionOutput = {
    hearing: buildHearing(q),
    theme: { id: theme.id, gloss: theme.text },
    nextSteps,
    oneHonestStep: { id: ohs.id, text: ohs.text },
    spiritualReflection: input.spiritual
      ? { scriptureId: scripture.id, reflection: scripture.reflection, prayerId }
      : null,
    supportNote: pickSupportNote(q),
    totalWordsEstimate: 0,
  };
  output.totalWordsEstimate = wordCount(output);
  return output;
}

function wordCount(o: ReflectionOutput): number {
  return [
    o.hearing,
    o.theme.gloss,
    ...o.nextSteps.map((s) => s.text),
    o.oneHonestStep.text,
    o.spiritualReflection?.reflection ?? "",
    o.supportNote ?? "",
  ]
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

// Re-export the generic fallback builder so a caller has one entry point.
export { buildDay01Fallback };
