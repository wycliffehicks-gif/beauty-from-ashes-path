// Restoring the exact saved reflection for a day.
//
// A saved reflection is only shown again when it can be PROVEN to belong to
// this day and to the same set of stable answer IDs. The proof is a small
// snapshot string built only from coded option IDs — never labels, never free
// text, never anything typed. If the snapshot is missing (an older plain-string
// save) or does not match, the reflection is rebuilt deterministically from
// founder-approved day content and the current selections, and the saved copy
// is replaced. Nothing here calls a network or a model.

import type { JourneyDayContent } from "@/content/journey-types";
import type { BuiltReflection } from "./reflection-engine";

/** A stable, order-independent fingerprint of a day's coded selections. */
export function answersSnapshot(answerIds: readonly string[] | undefined): string {
  const ids = Array.from(new Set(answerIds ?? [])).sort();
  return ids.length === 0 ? "none" : ids.join("|");
}

/**
 * Snapshot format marker. Bumping this alone invalidates every saved
 * reflection, because a saved snapshot must match character for character.
 */
export const REFLECTION_SNAPSHOT_VERSION = "r2";

/** Small deterministic non-cryptographic hash (FNV-1a, 32-bit, hex). */
function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * A fingerprint of the founder-approved reflection copy for one day: its
 * intro, every section (id, title, opening, source question, each option line
 * and the unanswered line) and its closing. Only approved day content goes in
 * — never a label the person chose, never anything typed, never notes. A future
 * edit to any of that copy changes this value, so a reflection saved under the
 * older wording can no longer be restored.
 */
export function reflectionContentFingerprint(day: JourneyDayContent): string {
  const r = day.reflection;
  const parts: string[] = [`day:${day.day}`, `intro:${r.intro}`];
  for (const s of r.sections) {
    parts.push(`s:${s.id}`, `t:${s.title}`, `o:${s.opening ?? ""}`, `f:${s.from ?? ""}`);
    const lines = s.lines ?? {};
    for (const key of Object.keys(lines).sort()) {
      parts.push(`l:${key}=${lines[key]}`);
    }
    parts.push(`u:${s.unanswered}`);
  }
  parts.push(`c:${r.closing}`);
  return hashText(parts.join("\u0001"));
}

/**
 * The full proof stored beside a saved reflection: snapshot format, the
 * approved reflection content for that day, and the day's coded selections.
 * Storage-safe characters only.
 */
export function reflectionSnapshot(
  day: JourneyDayContent,
  answerIds: readonly string[] | undefined,
): string {
  return [
    REFLECTION_SNAPSHOT_VERSION,
    reflectionContentFingerprint(day),
    answersSnapshot(answerIds),
  ].join(":");
}

/**
 * Rebuild the structured reflection from saved plain text, so the exact words a
 * person already read are what they see again. Returns null whenever the saved
 * text cannot be mapped confidently onto this day's approved sections; the
 * caller then rebuilds. This never throws.
 */
export function restoreReflection(
  day: JourneyDayContent,
  savedText: string | undefined,
): BuiltReflection | null {
  if (typeof savedText !== "string" || savedText.trim().length === 0) return null;

  try {
    const chunks = savedText.split("\n\n").map((c) => c.trim()).filter(Boolean);
    if (chunks.length < 2) return null;

    const titles = day.reflection.sections.map((s) => s.title);
    // Every section title must appear once, in order, for the mapping to hold.
    const positions: number[] = [];
    let cursor = 0;
    for (const title of titles) {
      const at = chunks.indexOf(title, cursor);
      if (at < 0) return null;
      positions.push(at);
      cursor = at + 1;
    }
    if (positions.length === 0) return null;

    const intro = chunks.slice(0, positions[0]!).join("\n\n");
    if (intro.length === 0) return null;

    const sections = day.reflection.sections.map((section, n) => {
      const start = positions[n]! + 1;
      const end = n + 1 < positions.length ? positions[n + 1]! : chunks.length - 1;
      const paragraphs = chunks.slice(start, Math.max(start, end));
      return { id: section.id, title: section.title, paragraphs };
    });

    if (sections.some((s) => s.paragraphs.length === 0)) return null;

    const closing = chunks[chunks.length - 1] ?? "";
    if (closing.length === 0) return null;

    return { intro, sections, closing };
  } catch {
    return null;
  }
}
