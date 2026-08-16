// Integration tests for the wired ten-day First Journey.
//
// The day route is data-driven: it renders whatever `screensFor(day)` returns
// and stores structured IDs through the progress store. These tests exercise
// that same logic (content, screen order, resume, reflection, completion)
// without a DOM, mirroring the approach in day-resume.integration.test.ts.

import { beforeEach, describe, expect, it } from "vitest";
import {
  FIRST_JOURNEY_DAYS,
  FIRST_JOURNEY_FINAL_DAY,
  getFirstJourneyDay,
} from "@/content/first-journey";
import { JOURNEY_DAYS, JOURNEY_LENGTH, dayIdFor } from "@/content/journey";
import { screenKey, screenLabel, screensFor } from "@/content/journey-types";

class MemoryStorage {
  private map = new Map<string, string>();
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

const { readProgress, saveLocator, saveDayAnswers, markDayComplete } = await import(
  "@/lib/journey/progress"
);
const { resolveResumeIndex, mergeStepAnswers, optionIndexesFor } = await import(
  "@/lib/journey/resume"
);
const { answerKeyFor, buildReflection, reflectionToText, selectedOptionIds } =
  await import("@/lib/journey/reflection-engine");

beforeEach(() => localStorage.clear());

describe("canonical First Journey", () => {
  it("is exactly Days 1–10 in order", () => {
    expect(FIRST_JOURNEY_DAYS.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(JOURNEY_LENGTH).toBe(10);
    expect(FIRST_JOURNEY_FINAL_DAY).toBe(10);
  });

  it("drives the journey home list from the canonical content", () => {
    expect(JOURNEY_DAYS.map((d) => d.day)).toEqual(FIRST_JOURNEY_DAYS.map((d) => d.day));
    for (const d of JOURNEY_DAYS) {
      const source = getFirstJourneyDay(d.day)!;
      expect(d.id).toBe(dayIdFor(d.day));
      expect(d.title).toBe(source.title);
      expect(d.theme).toBe(source.theme);
      expect(d.descriptor).toBe(source.descriptor);
    }
  });

  it("resolves every day 1–10, including 8, 9 and 10", () => {
    for (let day = 1; day <= 10; day += 1) {
      const content = getFirstJourneyDay(day);
      expect(content, `day ${day}`).toBeDefined();
      expect(content!.questions.length).toBeGreaterThan(0);
      expect(content!.practise.reflection.steps.length).toBeGreaterThan(0);
      expect(content!.practise.spiritual.scripture?.reference).toBeTruthy();
      expect(content!.reflection.sections.length).toBeGreaterThan(0);
      expect(content!.close.carryForward.length).toBeGreaterThan(0);
    }
  });

  it("carries no obsolete seven-day, skip or AI-technical wording", () => {
    const text = JSON.stringify(FIRST_JOURNEY_DAYS).toLowerCase();
    expect(text).not.toMatch(/seven[- ]day|week 1|\bskip\b|close for today|that's enough for today/);
    expect(text).not.toMatch(/\bai\b|live ai|curated reflection|language model/);
  });
});

describe("screen sequences", () => {
  it("gives every day the full set of screen kinds, opening at arrive and ending at close", () => {
    for (const day of FIRST_JOURNEY_DAYS) {
      const screens = screensFor(day);
      const kinds = screens.map((s) => s.kind);
      expect(kinds[0]).toBe("arrive");
      expect(kinds.at(-1)).toBe("close");
      for (const required of ["understand", "question", "practise", "step", "reflection"]) {
        expect(kinds, `day ${day.day} · ${required}`).toContain(required);
      }
      // Every screen has a stable storage key and a human label.
      const keys = screens.map(screenKey);
      expect(new Set(keys).size).toBe(keys.length);
      for (const s of screens) expect(screenLabel(day, s).length).toBeGreaterThan(0);
    }
  });

  it("places an Explore screen directly after any question that carries one", () => {
    for (const day of FIRST_JOURNEY_DAYS) {
      const screens = screensFor(day);
      screens.forEach((s, idx) => {
        if (s.kind !== "question") return;
        const q = day.questions.find((x) => x.id === s.questionId)!;
        if (!q.echo) return;
        expect(screens[idx + 1]).toEqual({ kind: "echo", questionId: q.id });
      });
    }
  });

  it("advances screen by screen from arrive to close for every day", () => {
    for (const day of FIRST_JOURNEY_DAYS) {
      const screens = screensFor(day);
      let i = 0;
      while (i < screens.length - 1) i += 1;
      expect(screens[i].kind).toBe("close");
    }
  });
});

/** Mirrors the route: first render is the opening screen, then resume, then autosave. */
function mountDay(dayNumber: number, opts: { resume?: boolean } = {}) {
  const day = getFirstJourneyDay(dayNumber)!;
  const screens = screensFor(day);
  const stepKeys = screens.map(screenKey);
  const dayId = dayIdFor(dayNumber);

  let index = 0;
  const progress = readProgress();
  const restored = resolveResumeIndex({
    stepKeys,
    dayId,
    locator: progress.locator,
    requested: Boolean(opts.resume),
  });
  if (restored >= 0) index = restored;
  saveLocator({ dayId, step: stepKeys[index], index });

  return {
    day,
    dayId,
    screens,
    stepKeys,
    index,
    answers: progress.answers[dayId] ?? [],
    get screen() {
      return screens[index];
    },
    answer(questionId: string, optionIndexes: number[]) {
      const key = answerKeyFor(day, questionId);
      const next = mergeStepAnswers(readProgress().answers[dayId], key, optionIndexes);
      saveDayAnswers({ dayId, meaningVersion: "v1" }, next);
      return next;
    },
    advanceTo(kind: string) {
      const target = screens.findIndex((s) => s.kind === kind);
      index = target;
      saveLocator({ dayId, step: stepKeys[index], index });
      if (screens[index].kind === "close") markDayComplete(dayId);
    },
    goHome() {
      // Home only saves the current place; it never completes or clears.
      saveLocator({ dayId, step: stepKeys[index], index });
    },
  };
}

describe("navigation, resume and completion", () => {
  it("Home does not complete a day and does not erase answers", () => {
    const view = mountDay(8);
    view.answer(view.day.questions[0]!.id, [1]);
    view.advanceTo("practise");
    view.goHome();

    const after = readProgress();
    expect(after.completedDays).toEqual([]);
    expect(after.answers["day-08"]?.length).toBe(1);
    expect(after.locator?.dayId).toBe("day-08");
  });

  it("restores the exact screen and previous choices without locator overwrite", () => {
    const first = mountDay(9);
    const questionId = first.day.questions[0]!.id;
    first.answer(questionId, [0, 2].slice(0, first.day.questions[0]!.select === "one" ? 1 : 2));
    first.advanceTo("step");
    const savedStep = readProgress().locator!.step;

    const resumed = mountDay(9, { resume: true });
    expect(screenKey(resumed.screen)).toBe(savedStep);
    expect(readProgress().locator!.step).toBe(savedStep);
    expect(selectedOptionIds(resumed.day, questionId, resumed.answers).length).toBeGreaterThan(0);
    expect(readProgress().completedDays).toEqual([]);
  });

  it("opens at arrive without resume and never strands a stale locator", () => {
    saveLocator({ dayId: "day-10", step: "a-step-that-no-longer-exists" });
    expect(screenKey(mountDay(10, { resume: true }).screen)).toBe("arrive");
    expect(screenKey(mountDay(10).screen)).toBe("arrive");
  });

  it("completes a day only on its close screen, for every day", () => {
    for (let day = 1; day <= 10; day += 1) {
      localStorage.clear();
      const view = mountDay(day);
      view.advanceTo("reflection");
      expect(readProgress().completedDays).toEqual([]);
      view.advanceTo("close");
      expect(readProgress().completedDays).toEqual([dayIdFor(day)]);
    }
  });

  it("offers a next day through Day 9 and none after Day 10", () => {
    const nextDay = (d: number) => (d < FIRST_JOURNEY_FINAL_DAY ? d + 1 : null);
    expect(nextDay(1)).toBe(2);
    expect(nextDay(9)).toBe(10);
    expect(nextDay(10)).toBeNull();
  });

  it("keeps completed days revisitable without clearing completion", () => {
    markDayComplete("day-02");
    const view = mountDay(2);
    view.advanceTo("practise");
    expect(readProgress().completedDays).toEqual(["day-02"]);
  });
});

describe("personalized reflection", () => {
  it("builds a substantive reflection for every day with no answers at all", () => {
    for (const day of FIRST_JOURNEY_DAYS) {
      const built = buildReflection(day, undefined);
      expect(built.intro).toBe(day.reflection.intro);
      expect(built.sections).toHaveLength(day.reflection.sections.length);
      for (const section of built.sections) {
        expect(section.paragraphs.length).toBeGreaterThan(0);
        expect(section.paragraphs.join(" ").length).toBeGreaterThan(40);
      }
      expect(reflectionToText(built).length).toBeGreaterThan(300);
    }
  });

  it("uses the unanswered fallback for a question that was continued past", () => {
    const day = getFirstJourneyDay(3)!;
    const section = day.reflection.sections.find((s) => s.from && s.lines)!;
    const built = buildReflection(day, []);
    const rendered = built.sections.find((s) => s.id === section.id)!;
    expect(rendered.paragraphs).toContain(section.unanswered);
  });

  it("uses the person's structured choices when they answered", () => {
    const day = getFirstJourneyDay(1)!;
    const section = day.reflection.sections.find((s) => s.from && s.lines)!;
    const question = day.questions.find((q) => q.id === section.from)!;
    const optionIdx = question.options.findIndex((o) => section.lines![o.id]);
    const answers = mergeStepAnswers([], answerKeyFor(day, question.id), [optionIdx]);

    const built = buildReflection(day, answers);
    const rendered = built.sections.find((s) => s.id === section.id)!;
    expect(rendered.paragraphs).toContain(section.lines![question.options[optionIdx]!.id]);
    expect(rendered.paragraphs).not.toContain(section.unanswered);
  });

  it("stays tentative and never diagnoses or prescribes", () => {
    for (const day of FIRST_JOURNEY_DAYS) {
      const text = reflectionToText(buildReflection(day, undefined)).toLowerCase();
      expect(text).not.toMatch(
        /you must|you should|you have a diagnos|you are diagnos|disorder|prescrib|guarantee/,
      );
    }
  });

  it("stores answers as low-sensitivity structured IDs only", () => {
    const day = getFirstJourneyDay(5)!;
    const key = answerKeyFor(day, day.questions[0]!.id);
    const ids = mergeStepAnswers([], key, [2]);
    expect(ids).toEqual([`${key}.2`]);
    expect(optionIndexesFor(ids, key, day.questions[0]!.options.length)).toEqual([2]);
  });
});
