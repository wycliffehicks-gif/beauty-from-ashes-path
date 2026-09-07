// Export a person's own reflections and answers to a plain-text file.
//
// PRIVACY RULES
//  - Only runs in the browser, triggered by the person.
//  - Only reads localStorage; nothing is sent to a server.
//  - The export does NOT include free-text notes or any sessionStorage content.
//  - Coded selections are mapped back to their canonical labels for the person's
//    own readability, but the exported file is still their own data.
//
// PRESENTATION RULES
//  - The export shows exactly what the app would present right now: optional
//    Christian choices are withheld unless the spiritual preference is
//    hydrated AND on, using the same `presentationAnswers` filter as the
//    screens. Raw saved selections are never rewritten or deleted.
//  - Reflection text is resolved with the same proven `resolveReflection`
//    resolver the reflection screen uses, so a stale saved snapshot can never
//    export old wording beside current choices. Nothing is saved back.
//  - An unknown (unhydrated) preference fails closed: spiritual-only content is
//    withheld.

import { getFirstJourneyDay } from "@/content/first-journey";
import { dayNumberFromId } from "@/content/journey";
import { answerKeyFor } from "@/lib/journey/reflection-engine";
import { optionIdsFor } from "@/lib/journey/answers";
import { presentationAnswers } from "@/lib/journey/presentation-answers";
import { resolveReflection } from "@/lib/journey/reflection-restore";

import { answersForDay, type JourneyProgress } from "./progress";

export interface ExportSummary {
  dayCount: number;
  reflectionCount: number;
  answerCount: number;
}

/** How the export may present optional Christian content right now. */
export interface ExportPresentation {
  hydrated: boolean;
  showSpiritual: boolean;
}

/** Fail closed: without a proven preference, spiritual-only content is withheld. */
function normalizePresentation(opts?: ExportPresentation): ExportPresentation {
  if (!opts) return { hydrated: false, showSpiritual: false };
  return {
    hydrated: opts.hydrated === true,
    showSpiritual: opts.showSpiritual === true,
  };
}

interface ExportedDay {
  day: ReturnType<typeof getFirstJourneyDay>;
  answers: string[];
  reflection: string;
}

/**
 * The presentable state of every finished day, read only. Progress is never
 * mutated or saved here, and a day that was never completed is never rebuilt.
 */
function exportedDays(
  progress: JourneyProgress,
  presentation: ExportPresentation,
): NonNullable<ExportedDay>[] {
  const out: NonNullable<ExportedDay>[] = [];

  for (const dayId of progress.completedDays) {
    const dayNum = dayNumberFromId(dayId);
    if (!dayNum) continue;
    const day = getFirstJourneyDay(dayNum);
    if (!day) continue;

    const answers = presentationAnswers(day, answersForDay(progress, day), presentation);
    const { text } = resolveReflection(day, answers, {
      text: progress.reflections[dayId],
      snapshot: progress.reflectionSnapshots?.[dayId],
    });

    out.push({ day, answers, reflection: text });
  }

  return out;
}

export function buildReflectionExport(
  progress: JourneyProgress,
  presentationOpts?: ExportPresentation,
): {
  text: string;
  filename: string;
  summary: ExportSummary;
} {
  const presentation = normalizePresentation(presentationOpts);
  const date = new Date().toISOString().split("T")[0];
  const days = exportedDays(progress, presentation);

  let answerCount = 0;
  let reflectionCount = 0;

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

  for (const entry of days) {
    const day = entry.day!;
    const answers = entry.answers;

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
        answerCount += ids.length;
        lines.push(`- ${question.prompt}`);
        for (const id of ids) {
          const label = question.options.find((o) => o.id === id)?.label;
          if (label) lines.push(`  • ${label}`);
        }
      }
      lines.push("");
    }

    if (entry.reflection.trim().length > 0) {
      reflectionCount += 1;
      lines.push("Your reflection:");
      lines.push(entry.reflection);
      lines.push("");
    }
  }

  return {
    text: lines.join("\n"),
    filename: `beauty-from-ashes-reflections-${date}.txt`,
    summary: {
      dayCount: days.length,
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A formatted, printable version of the same export. It is built from the exact
 * same plain-text source, so the two can never disagree, and it is rendered in
 * the person's own browser only — nothing is uploaded.
 */
export function buildPrintableExport(
  progress: JourneyProgress,
  presentationOpts?: ExportPresentation,
): {
  html: string;
  summary: ExportSummary;
} {
  const { text, summary } = buildReflectionExport(progress, presentationOpts);


  const body = text
    .split("\n")
    .map((line) => {
      if (line === "---") return '<hr class="rule" />';
      if (line.trim() === "") return '<p class="spacer"></p>';
      if (/^Day \d+ · /.test(line)) return `<h2>${escapeHtml(line)}</h2>`;
      if (/^(Your selections:|Your reflection:)$/.test(line))
        return `<h3>${escapeHtml(line.replace(":", ""))}</h3>`;
      if (line.startsWith("  • ")) return `<p class="choice">${escapeHtml(line.trim())}</p>`;
      if (line.startsWith("- ")) return `<p class="prompt">${escapeHtml(line.slice(2))}</p>`;
      return `<p>${escapeHtml(line)}</p>`;
    })
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Beauty from Ashes — My Reflections</title>
<style>
  :root { color-scheme: light; }
  body {
    margin: 0 auto; padding: 2.5rem 1.5rem; max-width: 40rem;
    font-family: "IBM Plex Serif", Georgia, serif; color: #23201c; background: #fbf8f3;
    line-height: 1.65; font-size: 16px;
  }
  h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
  h2 { font-size: 1.15rem; margin: 1.75rem 0 0.25rem; }
  h3 {
    font-family: "IBM Plex Sans", system-ui, sans-serif; font-size: 0.8rem;
    letter-spacing: 0.08em; text-transform: uppercase; color: #6b6257;
    margin: 1rem 0 0.25rem;
  }
  p { margin: 0 0 0.35rem; }
  p.prompt { font-family: "IBM Plex Sans", system-ui, sans-serif; color: #4a443c; }
  p.choice { padding-left: 1rem; }
  p.spacer { margin: 0.5rem 0; }
  hr.rule { border: 0; border-top: 1px solid #c9a227; margin: 2rem 0 0.5rem; opacity: 0.6; }
  @media print { body { background: #fff; padding: 0.5in; } }
</style>
</head>
<body>
${body}
</body>
</html>`;

  return { html, summary };
}

/** Open the printable version in a new tab and offer the browser print dialog. */
export function openPrintableExport(
  progress: JourneyProgress,
  presentationOpts?: ExportPresentation,
): boolean {
  if (typeof window === "undefined") return false;
  const { html } = buildPrintableExport(progress, presentationOpts);

  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  try {
    win.focus();
    win.print();
  } catch {
    // A blocked print dialog still leaves a readable, savable page open.
  }
  return true;
}

