// Export a person's own reflections and answers to a plain-text file.
//
// PRIVACY RULES
//  - Only runs in the browser, triggered by the person.
//  - Only reads localStorage; nothing is sent to a server.
//  - The export does NOT include free-text notes or any sessionStorage content.
//  - Coded selections are mapped back to their canonical labels for the person's
//    own readability, but the exported file is still their own data.

import { getFirstJourneyDay } from "@/content/first-journey";
import { answerKeyFor } from "@/content/journey-types";
import { optionIdsFor } from "@/lib/journey/answers";

import { answersForDay, dayNumberFromId, type JourneyProgress } from "./progress";

export interface ExportSummary {
  dayCount: number;
  reflectionCount: number;
  answerCount: number;
}

function countSelections(
  progress: JourneyProgress,
): { answerCount: number; reflectionCount: number } {
  let answerCount = 0;
  let reflectionCount = 0;

  for (const dayId of progress.completedDays) {
    const dayNum = dayNumberFromId(dayId);
    if (!dayNum) continue;
    const day = getFirstJourneyDay(dayNum);
    if (!day) continue;
    const answers = answersForDay(progress, day);
    const allQuestions = [...day.questions, day.step];
    for (const question of allQuestions) {
      const key = answerKeyFor(day, question.id);
      answerCount += optionIdsFor(answers, key, question.options).length;
    }
    if (progress.reflections[dayId]) reflectionCount += 1;
  }

  return { answerCount, reflectionCount };
}

export function buildReflectionExport(progress: JourneyProgress): {
  text: string;
  filename: string;
  summary: ExportSummary;
} {
  const date = new Date().toISOString().split("T")[0];
  const { answerCount, reflectionCount } = countSelections(progress);
  const lines: string[] = [
    "Beauty from Ashes: The First Journey — Reflections Export",
    `Exported: ${date}`,
    "",
    "This file contains your own answers and reflections from Beauty from Ashes.",
    "It was exported from this browser, on this device. It does not contain",
    "anything you typed in optional notes.",
    "This app is educational and reflective; it is not therapy, diagnosis, or treatment.",
    "",
    "Important: this app saves everything locally in this browser. If you clear",
    "this browser's storage or use a different browser or device, your journey",
    "data will not be there unless you have exported it or kept it elsewhere.",
    "",
  ];

  for (const dayId of progress.completedDays) {
    const dayNum = dayNumberFromId(dayId);
    if (!dayNum) continue;
    const day = getFirstJourneyDay(dayNum);
    if (!day) continue;
    const answers = answersForDay(progress, day);
    const reflection = progress.reflections[dayId];

    lines.push("---");
    lines.push(`Day ${day.day} · ${day.title}`);
    lines.push(`Theme: ${day.theme}`);
    lines.push("");

    const allQuestions = [...day.questions, day.step];
    const answeredQuestions = allQuestions.filter((question) => {
      const key = answerKeyFor(day, question.id);
      return optionIdsFor(answers, key, question.options).length > 0;
    });

    if (answeredQuestions.length > 0) {
      lines.push("Your selections:");
      for (const question of answeredQuestions) {
        const key = answerKeyFor(day, question.id);
        const ids = optionIdsFor(answers, key, question.options);
        lines.push(`- ${question.prompt}`);
        for (const id of ids) {
          const label = question.options.find((o) => o.id === id)?.label;
          if (label) lines.push(`  • ${label}`);
        }
      }
      lines.push("");
    }

    if (reflection) {
      lines.push("Your reflection:");
      lines.push(reflection);
      lines.push("");
    }
  }

  return {
    text: lines.join("\n"),
    filename: `beauty-from-ashes-reflections-${date}.txt`,
    summary: {
      dayCount: progress.completedDays.length,
      reflectionCount,
      answerCount,
    },
  };
}

export function downloadTextFile(text: string, filename: string) {
  if (typeof window === "undefined") return;

  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
