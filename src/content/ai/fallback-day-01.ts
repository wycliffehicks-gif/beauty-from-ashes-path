// Human-authored Day 1 fallback response.
//
// This is what the app returns when the AI path is disabled, when validation
// fails twice, or during the current fallback-only phase of the pilot. It is
// generic enough to be safe for any benign Day 1 input, uses only IDs from
// the Day 1 content pack, and never echoes user text.
//
// The fallback deliberately reads as a warm, grounded Day 1 message. It does
// not tell the user that "an AI failed"; the surrounding server function
// marks `fallbackUsed: true` for internal metadata only.

import { DAY_01_CONTENT_PACK_VERSION } from "@/content/ai/day-01";
import type { ReflectionOutput } from "@/lib/ai/types";

export const DAY_01_FALLBACK_VERSION = "2026-07-25.1";

export function buildDay01Fallback(spiritual: boolean): ReflectionOutput {
  const spiritualReflection = spiritual
    ? {
        scriptureId: "sc-luke-9-51",
        reflection:
          "Luke 9:51 pictures Jesus quietly setting his face toward Jerusalem — a chosen, meaningful road, walked with steady resolve rather than force. It may be a gentle image for today: naming the road you have been avoiding, without demanding you walk the whole of it.",
        prayerId: "p-courage-and-wisdom",
      }
    : null;

  const output: ReflectionOutput = {
    hearing:
      "It sounds like there may be a road on your heart today — one that feels meaningful, and also heavy. You may not yet be sure what it is asking of you, and that is a fair place to begin. You do not have to name it perfectly or solve it today.",
    theme: {
      id: "t-awareness-is-a-beginning",
      gloss:
        "Day 1 does not ask you to walk the whole road. Awareness and acknowledgement may be enough for today — a quiet beginning is still a beginning.",
    },
    nextSteps: [
      {
        id: "s-private-sentence",
        text: "Write one private sentence, outside this app, beginning with: “The road I may be avoiding is…”. No one else needs to see it.",
      },
      {
        id: "s-five-quiet-minutes",
        text: "Take five quiet minutes to notice what you fear about this road, and what you quietly hope. Notice without deciding.",
      },
      {
        id: "s-ask-safe-person",
        text: "If it feels wise, ask one safe person to help you think through what a very small next step could look like.",
      },
    ],
    oneHonestStep: {
      id: "ohs-name-the-road",
      text: "In one private sentence today, name the road you may be avoiding. You do not need to walk it — only to acknowledge that it is there.",
    },
    spiritualReflection,
    supportNote:
      "If any of this begins to feel heavy, it may help to reach a trusted person or a qualified professional — you do not have to hold it alone.",
    totalWordsEstimate: 0, // filled in below
  };

  output.totalWordsEstimate = estimateWordCount(output);
  return output;
}

function estimateWordCount(o: ReflectionOutput): number {
  const parts: string[] = [
    o.hearing,
    o.theme.gloss,
    ...o.nextSteps.map((s) => s.text),
    o.oneHonestStep.text,
    o.spiritualReflection?.reflection ?? "",
    o.supportNote ?? "",
  ];
  return parts.join(" ").trim().split(/\s+/).filter(Boolean).length;
}

export const DAY_01_FALLBACK_META = {
  version: DAY_01_FALLBACK_VERSION,
  contentPackVersion: DAY_01_CONTENT_PACK_VERSION,
} as const;
