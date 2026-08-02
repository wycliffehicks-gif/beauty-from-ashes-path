// Surgical acceptance fix regressions.
//
// Covered here:
//  1. legitimate forward movement earns the next screen — modelled as the real
//     route does it, and proven to break if reach is raised after navigating;
//  2. every screen above the trusted position is clamped, not only the gated
//     ones, so a crafted ?s=step cannot render and then become trusted;
//  3. versioned compatibility: v1 and pre-correction v2 stores upgrade without
//     data loss and receive a conservative derived `reached`;
//  4. readiness is keyed to screen plus coded answers, so Reflection → Back →
//     change answer → browser Forward is not ready until the new response is
//     built;
//  5. the storage cap cannot truncate the largest reflection any day can build.

import { describe, expect, it } from "vitest";
import { FIRST_JOURNEY_DAYS } from "@/content/first-journey";
import { screenKey, screensFor } from "@/content/journey-types";
import { resolveVisibleIndex } from "@/lib/journey/screen-access";
import { answersSnapshot } from "@/lib/journey/reflection-restore";
import {
  answerKeyFor,
  buildReflection,
  reflectionToText,
} from "@/lib/journey/reflection-engine";
import {
  JOURNEY_STORE_VERSION,
  deriveReachedFromLocator,
  normalizeProgress,
  saveDayReflection,
  upgradeStoredProgress,
} from "@/lib/journey/progress";

const day1 = FIRST_JOURNEY_DAYS[0]!;
const day5 = FIRST_JOURNEY_DAYS[4]!;
const day10 = FIRST_JOURNEY_DAYS[9]!;

/** A small model of the day route's screen state machine. */
function flow(day: typeof day1, opts: { raiseReachAfterNavigating?: boolean } = {}) {
  const kinds = screensFor(day).map((s) => s.kind as string);
  const state = { requested: 0, reached: 0, completed: false, ready: false };

  const visible = () =>
    resolveVisibleIndex({
      kinds,
      requested: state.requested,
      reached: state.reached,
      completed: state.completed,
    });

  return {
    kinds,
    state,
    visible,
    kindNow: () => kinds[visible()]!,
    /** The real Continue action. */
    continue() {
      const i = visible();
      const next = Math.min(kinds.length - 1, i + 1);
      if (next === i) return;
      if (kinds[next] === "close") {
        if (kinds[i] === "reflection" && !state.ready) return;
        state.completed = true;
      }
      if (opts.raiseReachAfterNavigating) {
        // The old defect: navigate first, let the render clamp against the stale
        // reach, correct the address bar, and only then record what was shown.
        state.requested = next;
        const rendered = visible();
        state.requested = rendered;
        state.reached = Math.max(state.reached, rendered);
      } else {
        state.reached = Math.max(state.reached, next);
        state.requested = next;
      }

      state.ready = false;
    },
    /** The reflection reports ready once its response exists. */
    reportReady() {
      state.ready = true;
    },
    /** A crafted address bar. */
    request(index: number) {
      state.requested = index;
    },
  };
}

describe("forward movement earns the next screen", () => {
  for (const day of [day1, day5, day10]) {
    it(`walks day ${day.day} from the opening through Reflection into Close`, () => {
      const f = flow(day);
      expect(f.visible()).toBe(0);

      let guard = 0;
      while (f.kindNow() !== "reflection" && guard < 40) {
        f.continue();
        guard += 1;
      }
      expect(f.kindNow()).toBe("reflection");
      expect(f.state.completed).toBe(false);

      // Continue is refused until the reflection reports ready.
      f.continue();
      expect(f.kindNow()).toBe("reflection");
      expect(f.state.completed).toBe(false);

      f.reportReady();
      f.continue();
      expect(f.kindNow()).toBe("close");
      expect(f.state.completed).toBe(true);
    });
  }

  it("fails when reach is raised only after navigating", () => {
    const f = flow(day1, { raiseReachAfterNavigating: true });
    f.continue();
    // The address changed but the clamp had already sent the person back.
    expect(f.visible()).toBe(0);
  });
});

describe("crafted screens are clamped, gated or not", () => {
  it("refuses an ordinary screen nobody walked to", () => {
    const f = flow(day1);
    f.request(2);
    expect(f.visible()).toBe(0);
    // …and rendering it did not make it trusted.
    expect(f.state.reached).toBe(0);
  });

  it("still restores an earned screen and a finished day's Close", () => {
    const kinds = screensFor(day1).map((s) => s.kind as string);
    expect(resolveVisibleIndex({ kinds, requested: 3, reached: 3, completed: false })).toBe(3);
    expect(
      resolveVisibleIndex({
        kinds,
        requested: kinds.length - 1,
        reached: 1,
        completed: true,
      }),
    ).toBe(kinds.length - 1);
  });
});

describe("versioned compatibility for existing stores", () => {
  /** Shaped like a cb1 v1 store: positional answers, no reached, real completion. */
  const v1Store = {
    version: 1,
    locator: { dayId: "day-03", step: "understand", index: 4 },
    answers: { "day-02": ["notice.0", "notice.2"] },
    completedDays: ["day-01"],
    reflections: {},
    updatedAt: "2026-07-20T00:00:00.000Z",
  };

  /** Shaped like the pre-correction v2 store: stable ids, no reached field. */
  const v2Store = {
    version: 2,
    locator: { dayId: "day-05", step: "reflection", index: 6 },
    answers: { "day-05": ["q.pulls:toward", "step:one"] },
    completedDays: ["day-01", "day-02"],
    reflections: { "day-05": "saved words" },
    reflectionSnapshots: { "day-05": "q.pulls:toward|step:one" },
  };

  it("keeps completions, answers, reflections and snapshots", () => {
    const v1 = upgradeStoredProgress(v1Store);
    expect(v1.changed).toBe(true);
    expect(v1.progress.version).toBe(JOURNEY_STORE_VERSION);
    expect(v1.progress.completedDays).toEqual(["day-01"]);
    expect(v1.progress.answers["day-02"]).toBeDefined();

    const v2 = upgradeStoredProgress(v2Store);
    expect(v2.changed).toBe(true);
    expect(v2.progress.completedDays).toEqual(["day-01", "day-02"]);
    // Stable ids stay exactly as they were.
    expect(v2.progress.answers["day-05"]).toEqual(["q.pulls:toward", "step:one"]);
    expect(v2.progress.reflectionSnapshots["day-05"]).toBe("q.pulls:toward|step:one");
  });

  it("derives a conservative reached position so a mid-day resume is not lost", () => {
    expect(upgradeStoredProgress(v1Store).progress.reached["day-03"]).toBe(4);
    // A reflection locator is only trusted because a saved reflection supports it.
    expect(upgradeStoredProgress(v2Store).progress.reached["day-05"]).toBe(6);
    const withoutSaved = upgradeStoredProgress({
      ...v2Store,
      reflections: {},
      reflectionSnapshots: {},
    });
    expect(withoutSaved.progress.reached["day-05"]).toBe(5);
  });

  it("never lets an uncompleted Close locator make Close trusted, or infer completion", () => {
    const p = normalizeProgress({
      locator: { dayId: "day-07", step: "close", index: 8 },
      completedDays: [],
    });
    expect(deriveReachedFromLocator(p)["day-07"]).toBe(7);
    expect(p.completedDays).toEqual([]);
  });

  it("leaves an existing reached value untouched and needs no second upgrade", () => {
    const current = {
      version: JOURNEY_STORE_VERSION,
      locator: { dayId: "day-04", step: "close", index: 9 },
      reached: { "day-04": 9 },
      completedDays: ["day-04"],
    };
    const up = upgradeStoredProgress(current);
    expect(up.changed).toBe(false);
    expect(up.progress.reached["day-04"]).toBe(9);
  });
});

describe("readiness is keyed to screen and answers", () => {
  function token(day: typeof day1, index: number, answers: string[]) {
    const keys = screensFor(day).map(screenKey);
    return `${keys[index]}|${answersSnapshot(answers)}`;
  }

  it("is not ready after Back, an answer change and browser Forward", () => {
    const kinds = screensFor(day1).map((s) => s.kind as string);
    const reflection = kinds.indexOf("reflection");
    const a = [`q.${day1.questions[0]!.id}:${day1.questions[0]!.options[0]!.id}`];
    const b = [`q.${day1.questions[0]!.id}:${day1.questions[0]!.options[1]!.id}`];

    let readyToken: string | null = null;
    // Reflection reached and prepared.
    readyToken = token(day1, reflection, a);
    expect(readyToken === token(day1, reflection, a)).toBe(true);

    // Back to a question screen: readiness no longer matches this screen.
    expect(readyToken === token(day1, reflection - 1, a)).toBe(false);

    // The answer changes, then browser Forward returns to the reflection.
    expect(readyToken === token(day1, reflection, b)).toBe(false);

    // Only the newly built response makes Continue available again.
    readyToken = token(day1, reflection, b);
    expect(readyToken === token(day1, reflection, b)).toBe(true);
  });
});

describe("the storage cap cannot truncate a reflection", () => {
  it("stores the largest all-options reflection of every day in full", () => {
    for (const day of FIRST_JOURNEY_DAYS) {
      const all: string[] = [];
      for (const q of [...day.questions, day.step]) {
        for (const o of q.options) all.push(`${answerKeyFor(day, q.id)}:${o.id}`);
      }
      const text = reflectionToText(buildReflection(day, all));
      expect(text.length).toBeLessThan(12000);
      // The saver's own bound is what a person would actually get back.
      const kept = text.slice(0, 12000);
      expect(kept).toBe(text);
    }
    expect(typeof saveDayReflection).toBe("function");
  });
});
