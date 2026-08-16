// Regression locks for the reflection persistence/versioning correction.
//
// Defect fixed: a returning browser could restore an older saved personalized
// reflection purely because its coded-answer snapshot and section titles still
// matched, so pre-Pass-B wording (for example Day 7's "No inner response was
// selected…") could be displayed again. A saved reflection is now provable only
// against day + coded answers + the CURRENT approved reflection content.
//
// Everything here is local, deterministic and free of labels, notes or typed
// text. No network, no model, no new dependency.

import { beforeEach, describe, expect, it } from "vitest";

class MemoryStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}

const localStorage = new MemoryStorage();
(globalThis as unknown as { window: unknown }).window = {
  localStorage,
  sessionStorage: new MemoryStorage(),
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
};
(globalThis as unknown as { CustomEvent: unknown }).CustomEvent = class {
  constructor(public type: string) {}
};

const { FIRST_JOURNEY_DAYS } = await import("@/content/first-journey");
const { buildReflection, reflectionToText } = await import(
  "@/lib/journey/reflection-engine"
);
const {
  answersSnapshot,
  reflectionContentFingerprint,
  reflectionSnapshot,
  resolveReflection,
  REFLECTION_SNAPSHOT_VERSION,
} = await import("@/lib/journey/reflection-restore");
const {
  isDayComplete,
  markDayComplete,
  readProgress,
  saveDayAnswers,
  saveDayReflection,
  saveLocator,
  saveReached,
} = await import("@/lib/journey/progress");

const day7 = FIRST_JOURNEY_DAYS[6]!;
const day1 = FIRST_JOURNEY_DAYS[0]!;

/** First option of the first question, as a stable coded answer token. */
function codedAnswers(day: typeof day7): string[] {
  return day.questions.map((q) => `q.${q.id}:${q.options[0]!.id}`);
}

/** A pre-fix saved reflection: current section titles, older prose. */
function legacySavedText(day: typeof day7): string {
  const chunks: string[] = ["An older intro paragraph."];
  for (const s of day.reflection.sections) {
    chunks.push(s.title, "No inner response was selected, so nothing is assumed here.");
  }
  chunks.push("An older closing paragraph.");
  return chunks.join("\n\n");
}

beforeEach(() => {
  localStorage.clear();
});

describe("reflection proof carries the approved content version", () => {
  it("is versioned, day-specific and answer-specific", () => {
    const answers = codedAnswers(day7);
    const snap = reflectionSnapshot(day7, answers);
    expect(snap.startsWith(`${REFLECTION_SNAPSHOT_VERSION}:`)).toBe(true);
    expect(snap.endsWith(answersSnapshot(answers))).toBe(true);
    expect(snap).not.toBe(reflectionSnapshot(day1, answers));
    expect(snap).not.toBe(reflectionSnapshot(day7, answers.slice(1)));
    // Storage-safe characters only (progress.ts sanitises with this set).
    expect(/^[A-Za-z0-9._:|-]+$/.test(snap)).toBe(true);
    expect(snap.length).toBeLessThanOrEqual(1024);
  });

  it("changes when the canonical reflection copy of a day changes", () => {
    const before = reflectionContentFingerprint(day7);
    const edited = {
      ...day7,
      reflection: { ...day7.reflection, closing: `${day7.reflection.closing} (edited)` },
    };
    expect(reflectionContentFingerprint(edited)).not.toBe(before);
    // Order-independent selections do not change it; content does.
    expect(reflectionContentFingerprint(day7)).toBe(before);
  });
});

describe("a stale saved reflection can never be shown", () => {
  it("rebuilds a legacy Day 7 save with no version proof, and replaces storage", () => {
    const answers = codedAnswers(day7);
    const stale = legacySavedText(day7);
    // Legacy proof: the old answers-only snapshot format.
    const resolved = resolveReflection(day7, answers, {
      text: stale,
      snapshot: answersSnapshot(answers),
    });

    expect(resolved.restored).toBe(false);
    expect(resolved.replaceSaved).toBe(true);
    expect(resolved.text).not.toContain("No inner response was selected");
    const shown = [
      resolved.built.intro,
      ...resolved.built.sections.flatMap((s) => [s.title, ...s.paragraphs]),
      resolved.built.closing,
    ].join("\n");
    expect(shown).not.toContain("No inner response was selected");
    expect(resolved.text).toBe(reflectionToText(buildReflection(day7, answers)));

    // Storage is replaced with the current wording and the current proof.
    saveDayReflection("day-07", resolved.text, resolved.snapshot);
    const p = readProgress();
    expect(p.reflections["day-07"]).not.toContain("No inner response was selected");
    expect(p.reflectionSnapshots["day-07"]).toBe(reflectionSnapshot(day7, answers));
  });

  it("rebuilds when the content fingerprint no longer matches", () => {
    const answers = codedAnswers(day7);
    const built = buildReflection(day7, answers);
    const mismatched = `${REFLECTION_SNAPSHOT_VERSION}:deadbeef:${answersSnapshot(answers)}`;
    const resolved = resolveReflection(day7, answers, {
      text: reflectionToText(built),
      snapshot: mismatched,
    });
    expect(resolved.restored).toBe(false);
    expect(resolved.replaceSaved).toBe(true);
    expect(resolved.snapshot).toBe(reflectionSnapshot(day7, answers));
  });

  it("restores a current-version, same-answer save word for word", () => {
    const answers = codedAnswers(day7);
    const built = buildReflection(day7, answers);
    const text = reflectionToText(built);
    const resolved = resolveReflection(day7, answers, {
      text,
      snapshot: reflectionSnapshot(day7, answers),
    });
    expect(resolved.restored).toBe(true);
    expect(resolved.replaceSaved).toBe(false);
    expect(resolved.text).toBe(text);
    expect(resolved.built.intro).toBe(built.intro);
    expect(resolved.built.closing).toBe(built.closing);
    expect(resolved.built.sections).toEqual(built.sections);
  });

  it("rebuilds when the coded answers changed", () => {
    const answers = codedAnswers(day7);
    const built = buildReflection(day7, answers);
    const resolved = resolveReflection(day7, answers.slice(1), {
      text: reflectionToText(built),
      snapshot: reflectionSnapshot(day7, answers),
    });
    expect(resolved.restored).toBe(false);
  });
});

describe("no other progress is disturbed", () => {
  it("keeps answers, completion, reached and locator through replacement", () => {
    const answers = codedAnswers(day7);
    saveDayAnswers({ dayId: "day-07", meaningVersion: "v1" }, answers);
    saveReached("day-07", 6);
    saveLocator({ dayId: "day-07", step: "reflection", index: 6 });
    markDayComplete("day-06");
    saveDayReflection("day-07", legacySavedText(day7), answersSnapshot(answers));

    const resolved = resolveReflection(day7, readProgress().answers["day-07"], {
      text: readProgress().reflections["day-07"],
      snapshot: readProgress().reflectionSnapshots["day-07"],
    });
    saveDayReflection("day-07", resolved.text, resolved.snapshot);

    const p = readProgress();
    expect(p.answers["day-07"]).toEqual(answers);
    expect(p.reached["day-07"]).toBe(6);
    expect(p.locator).toEqual({ dayId: "day-07", step: "reflection", index: 6 });
    expect(isDayComplete(p, "day-06")).toBe(true);
    expect(isDayComplete(p, "day-07")).toBe(false);
  });
});
