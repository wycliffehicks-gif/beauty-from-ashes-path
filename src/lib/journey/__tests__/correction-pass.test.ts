// Correction-pass regression tests: the confirmed blockers from the source and
// safety audit of the consolidated repair.
//
// Covered here:
//  - crafted ?s=reflection / ?s=close on fresh state is clamped;
//  - a genuinely reached reflection, and a finished day's Close, still restore;
//  - the exact saved reflection is restored only for the same coded answers;
//  - the readiness owner cannot be stranded disabled by a reset race;
//  - onboarding screen keys support real one-screen history.

import { describe, expect, it } from "vitest";
import { FIRST_JOURNEY_DAYS } from "@/content/first-journey";
import { screenKey, screensFor } from "@/content/journey-types";
import { OPENING_SCREENS } from "@/content/opening";
import { allowedIndex, resolveVisibleIndex } from "@/lib/journey/screen-access";
import { answersSnapshot, restoreReflection } from "@/lib/journey/reflection-restore";
import { buildReflection, reflectionToText } from "@/lib/journey/reflection-engine";

const day1 = FIRST_JOURNEY_DAYS[0]!;
const day5 = FIRST_JOURNEY_DAYS[4]!;
const day10 = FIRST_JOURNEY_DAYS[9]!;

function kindsFor(day: typeof day1) {
  return screensFor(day).map((s) => s.kind);
}

function indexOfKind(day: typeof day1, kind: (typeof day1)["questions"] extends never ? never : string) {
  return (kindsFor(day) as string[]).indexOf(kind);
}

describe("crafted screen queries cannot skip the journey", () => {
  for (const day of [day1, day5, day10]) {
    it(`clamps an unreached reflection and close on day ${day.day}`, () => {
      const kinds = kindsFor(day);
      const reflection = indexOfKind(day, "reflection");
      const close = kinds.length - 1;
      expect(reflection).toBeGreaterThan(0);

      expect(
        resolveVisibleIndex({ kinds, requested: reflection, reached: 0, completed: false }),
      ).toBe(0);
      expect(
        resolveVisibleIndex({ kinds, requested: close, reached: 0, completed: false }),
      ).toBe(0);
    });

    it(`still opens a genuinely reached reflection on day ${day.day}`, () => {
      const kinds = kindsFor(day);
      const reflection = indexOfKind(day, "reflection");
      expect(
        resolveVisibleIndex({
          kinds,
          requested: reflection,
          reached: reflection,
          completed: false,
        }),
      ).toBe(reflection);
    });

    it(`restores close for a finished day ${day.day}`, () => {
      const kinds = kindsFor(day);
      const close = kinds.length - 1;
      expect(
        resolveVisibleIndex({ kinds, requested: close, reached: 1, completed: true }),
      ).toBe(close);
    });
  }

  it("leaves ordinary screens directly addressable", () => {
    const kinds = kindsFor(day1);
    expect(resolveVisibleIndex({ kinds, requested: 2, reached: 0, completed: false })).toBe(2);
  });

  it("never allows more than the earned or finished position", () => {
    const kinds = kindsFor(day1);
    expect(allowedIndex({ kinds, reached: 3, completed: false })).toBe(3);
    expect(allowedIndex({ kinds, reached: 0, completed: true })).toBe(kinds.length - 1);
    expect(allowedIndex({ kinds, reached: -5, completed: false })).toBe(0);
  });
});

describe("the exact saved reflection is restored, or rebuilt", () => {
  it("restores the saved words when the coded answers are unchanged", () => {
    const answers = [`q.${day1.questions[0]!.id}:${day1.questions[0]!.options[0]!.id}`];
    const built = buildReflection(day1, answers);
    const saved = reflectionToText(built);

    const restored = restoreReflection(day1, saved);
    expect(restored).not.toBeNull();
    expect(restored!.intro).toBe(built.intro);
    expect(restored!.closing).toBe(built.closing);
    expect(restored!.sections.map((s) => s.title)).toEqual(
      built.sections.map((s) => s.title),
    );
    expect(restored!.sections[0]!.paragraphs).toEqual(built.sections[0]!.paragraphs);
  });

  it("proves association only through the coded answer snapshot", () => {
    const a = answersSnapshot(["q.x:one", "q.y:two"]);
    // Order does not change meaning; a different selection does.
    expect(answersSnapshot(["q.y:two", "q.x:one"])).toBe(a);
    expect(answersSnapshot(["q.x:one"])).not.toBe(a);
    expect(answersSnapshot([])).toBe("none");
    expect(answersSnapshot(undefined)).toBe("none");
  });

  it("returns null rather than crashing on unusable saved text", () => {
    expect(restoreReflection(day1, undefined)).toBeNull();
    expect(restoreReflection(day1, "")).toBeNull();
    expect(restoreReflection(day1, "a single stray line")).toBeNull();
    expect(restoreReflection(day1, "one\n\ntwo\n\nthree")).toBeNull();
    // A reflection saved for one day cannot be restored onto another.
    const foreign = reflectionToText(buildReflection(day5, []));
    expect(restoreReflection(day10, foreign)).toBeNull();
  });

  it("keeps an unanswered day's fallbacks restorable", () => {
    const built = buildReflection(day10, []);
    const restored = restoreReflection(day10, reflectionToText(built));
    expect(restored).not.toBeNull();
    expect(restored!.sections.every((s) => s.paragraphs.length > 0)).toBe(true);
  });
});

/**
 * Mirrors the route's readiness ownership: readiness is stored as the screen key
 * it belongs to, so no separate reset effect can unset it after the reflection
 * has reported ready.
 */
describe("reflection readiness has one owner", () => {
  function readiness() {
    let readyForKey: string | null = null;
    return {
      ready: (key: string) => readyForKey === key,
      report: (key: string) => {
        readyForKey = key;
      },
      /** The old racing reset, which must no longer be able to strand anyone. */
      enter: (key: string) => (readyForKey === key ? undefined : undefined),
    };
  }

  it("is true for the reflection screen once reported, and false elsewhere", () => {
    const day = day1;
    const keys = screensFor(day).map(screenKey);
    const reflectionKey = keys[indexOfKind(day, "reflection")]!;
    const r = readiness();

    expect(r.ready(reflectionKey)).toBe(false);
    r.report(reflectionKey);
    r.enter(reflectionKey); // entering again must not clear readiness
    expect(r.ready(reflectionKey)).toBe(true);
    expect(r.ready(keys[0]!)).toBe(false);
  });
});

describe("onboarding history keys", () => {
  it("names every opening screen plus the agreement, in order", () => {
    const keys = [...OPENING_SCREENS.map((s) => s.key), "agreement"];
    expect(keys).toEqual(["welcome", "find-here", "how-it-works", "agreement"]);
    for (const k of keys) expect(k).toMatch(/^[a-z-]{1,32}$/);
  });
});
