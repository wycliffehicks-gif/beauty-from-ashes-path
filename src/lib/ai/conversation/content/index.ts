// Conversation v1 — source records built from the canonical ten-day teaching.
//
// Each record carries ONLY the day's Understand teaching (heading + body) as
// its exact text. Questions, practices, reflections, answer semantics and any
// personal selections are excluded by construction. Records carry the recorded
// guided-content approval; they do NOT newly approve the whole SRT draft or
// every conversation use.

import type { ConversationSourceRecord } from "../sources";
import { sha256Hex } from "../sources";
import { CONVERSATION_TEACHING_RECORDS } from "./teaching";

/** The source snapshot these records were generated from (P1 baseline). */
export const CONVERSATION_SOURCE_SNAPSHOT_COMMIT =
  "4b218c45d021b4b9b3ee99f271d15e775db3576c";

export const TEACHING_RECORD_LIMITATIONS = [
  "Understand teaching only; questions, practices, reflections and personal answers are excluded.",
  "Carries the recorded guided-content approval; does not newly approve the whole SRT draft or all conversation uses.",
  "A day title or theme is never a fact about the person.",
] as const;

export async function buildTeachingSourceRecords(): Promise<
  ConversationSourceRecord[]
> {
  return Promise.all(
    CONVERSATION_TEACHING_RECORDS.map(async (record) => {
      const exactText = [record.understandHeading, ...record.understandBody].join(
        "\n\n",
      );
      return {
        sourceKey: record.key,
        kind: "journey-day-teaching" as const,
        title: record.title,
        exactText,
        textSha256: await sha256Hex(exactText),
        origin: { file: record.originFile, day: record.day },
        sourceCommit: CONVERSATION_SOURCE_SNAPSHOT_COMMIT,
        reviewStatus: "approved-guided-content" as const,
        spiritualClassification: "nonreligious-teaching" as const,
        limitations: [...TEACHING_RECORD_LIMITATIONS],
        testOnly: false,
      };
    }),
  );
}
