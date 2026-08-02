// Deterministic personalized-reflection engine for The First Journey.
//
// Every reflection is assembled from founder-approved content already present
// in the day's `reflection.sections`, combined with the person's structured
// low-sensitivity choice IDs. No network call, no model, no free text.
//
// Rules encoded here:
//  - it must produce something substantive for every day, including when the
//    person continued without answering (each section carries a fallback);
//  - language stays tentative — the content supplies the wording, this file
//    never invents sentences;
//  - only option positions are read, never anything a person typed.

import type { JourneyDayContent } from "@/content/journey-types";
import { optionIdsFor } from "./answers";


export interface ReflectionParagraphs {
  id: string;
  title: string;
  paragraphs: string[];
}

export interface BuiltReflection {
  intro: string;
  sections: ReflectionParagraphs[];
  closing: string;
}

/**
 * Storage key for a question's answers. Questions are stored under `q.<id>`;
 * One Honest Step is stored under `step`, matching its screen key.
 */
export function answerKeyFor(day: JourneyDayContent, questionId: string): string {
  return questionId === day.step.id ? "step" : `q.${questionId}`;
}

function questionById(day: JourneyDayContent, id: string) {
  if (day.step.id === id) return day.step;
  return day.questions.find((q) => q.id === id);
}

/** Option IDs the person selected for a question, in stored order. */
export function selectedOptionIds(
  day: JourneyDayContent,
  questionId: string,
  answerIds: string[] | undefined,
): string[] {
  const question = questionById(day, questionId);
  if (!question) return [];
  return optionIdsFor(answerIds, answerKeyFor(day, questionId), question.options);
}


export function buildReflection(
  day: JourneyDayContent,
  answerIds: string[] | undefined,
): BuiltReflection {
  const sections: ReflectionParagraphs[] = day.reflection.sections.map((section) => {
    const paragraphs: string[] = [];
    if (section.opening) paragraphs.push(section.opening);

    if (section.from && section.lines) {
      const chosen = selectedOptionIds(day, section.from, answerIds);
      const lines = chosen
        .map((id) => section.lines?.[id])
        .filter((line): line is string => Boolean(line));
      if (lines.length > 0) paragraphs.push(...lines);
      else paragraphs.push(section.unanswered);
    } else if (paragraphs.length === 0) {
      paragraphs.push(section.unanswered);
    }

    return { id: section.id, title: section.title, paragraphs };
  });

  return { intro: day.reflection.intro, sections, closing: day.reflection.closing };
}

/** Plain text of a built reflection, saved locally only so a person can resume. */
export function reflectionToText(built: BuiltReflection): string {
  return [
    built.intro,
    ...built.sections.flatMap((s) => [s.title, ...s.paragraphs]),
    built.closing,
  ].join("\n\n");
}
