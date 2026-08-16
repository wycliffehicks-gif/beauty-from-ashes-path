// PASS C2A — answer-meaning firewall regression locks.
//
// These tests prove that a day's coded selections can only ever be read under
// the meaning they were made in, that upgrading an old store never invents or
// destroys meaning, and that a future revision of a day's questions is handled
// safely BEFORE any such revision exists. Nothing here is a semantic rewrite:
// every canonical day is still meaning version "v1" in this pass.
//
// Local, deterministic and coded-token only: no network, no model, no labels,
// no free text, no analytics.

import { beforeEach, describe, expect, it } from "vitest";

class MemoryStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return Array.from(this.map.keys())[i] ?? null;
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

const { FIRST_JOURNEY_DAYS, getFirstJourneyDay } = await import("@/content/first-journey");
const { screenKey, screensFor } = await import("@/content/journey-types");
const { PRE_V4_MEANING_VERSION, MAX_MEANING_VERSIONS_PER_DAY } = await import(
  "@/lib/journey/answer-meaning"
);
const { migrateDayAnswers } = await import("@/lib/journey/answer-migration");
const {
  JOURNEY_STORAGE_KEY,
  JOURNEY_STORE_VERSION,
  adoptCurrentAnswerMeaning,
  answersForDay,
  clearJourney,
  emptyProgress,
  hasMeaningfulProgress,
  hasPendingAnswerMeaningRevision,
  isDayComplete,
  markDayComplete,
  normalizeProgress,
  readProgress,
  saveDayAnswers,
  saveDayReflection,
  saveLocator,
  saveReached,
  upgradeStoredProgress,
} = await import("@/lib/journey/progress");
const { reflectionContentFingerprint, reflectionSnapshot, resolveReflection } =
  await import("@/lib/journey/reflection-restore");
const { buildReflection, reflectionToText } = await import(
  "@/lib/journey/reflection-engine"
);
const { resolveVisibleIndex } = await import("@/lib/journey/screen-access");
const { resolveResumeIndex } = await import("@/lib/journey/resume");

import type { JourneyDayContent } from "@/content/journey-types";

const day1 = getFirstJourneyDay(1)!;
/** Canonical Day 8 — semantically revised in PASS C2B, so meaning version v2. */
const day8Canonical = getFirstJourneyDay(8)!;
/** The pre-C2B meaning of Day 8, used to model legacy stores and rollback. */
const day8: JourneyDayContent = { ...day8Canonical, answerMeaningVersion: "v1" };

/**
 * FROZEN pre-C2 Day 8 option IDs, in their exact stored order, for q.route,
 * q.size and step. A very old POSITIONAL record must always be translated
 * through THIS list — never through future v2 wording or order.
 */
const FROZEN_DAY_8_V1 = {
  "q.route": [
    "self",
    "body",
    "reality",
    "values",
    "creativity",
    "person",
    "community",
    "god",
    "other",
    "unclear",
    "none",
    "private",
  ],
  "q.size": ["tiny", "small", "moderate", "rehearse", "unclear", "none", "private"],
  step: ["act", "message", "outside", "own", "rehearse", "unclear", "none", "private"],
} as const;

/** The live revised Day 8 (meaning v2). */
function day8AsV2(): JourneyDayContent {
  return day8Canonical;
}
function day8AsV3(): JourneyDayContent {
  return { ...day8Canonical, answerMeaningVersion: "v3" };
}

function stored(value: unknown) {
  localStorage.setItem(JOURNEY_STORAGE_KEY, JSON.stringify(value));
}

beforeEach(() => {
  localStorage.clear();
});

describe("content stamps its answer meaning, and nothing else", () => {
  it("marks Day 8 v2 after its C2B semantic rewrite and every other day v1", () => {
    expect(FIRST_JOURNEY_DAYS.map((d) => d.answerMeaningVersion)).toEqual([
      "v1",
      "v1",
      "v1",
      "v1",
      "v1",
      "v1",
      "v1",
      "v2",
      "v1",
      "v1",
    ]);
    expect(day8Canonical.answerMeaningVersion).toBe("v2");
  });

  it("agrees with the frozen pre-v4 meaning map for every day", () => {
    for (const d of FIRST_JOURNEY_DAYS) {
      const dayId = `day-${String(d.day).padStart(2, "0")}`;
      expect(PRE_V4_MEANING_VERSION[dayId]).toBe("v1");
    }
    // The frozen map is exactly the ten canonical days and is not extensible.
    expect(Object.keys(PRE_V4_MEANING_VERSION)).toHaveLength(10);
    expect(Object.isFrozen(PRE_V4_MEANING_VERSION)).toBe(true);
  });

  it("leaves every question, option, step, select mode and screen order intact", () => {
    expect(day8.questions.map((q) => q.id)).toEqual(["route", "size"]);
    expect(day8.step.id).toBe("step");
    expect(day8.questions[0]!.options.map((o) => o.id)).toEqual([
      ...FROZEN_DAY_8_V1["q.route"],
    ]);
    expect(day8.questions[1]!.options.map((o) => o.id)).toEqual([
      ...FROZEN_DAY_8_V1["q.size"],
    ]);
    expect(day8.step.options.map((o) => o.id)).toEqual([...FROZEN_DAY_8_V1.step]);
    expect(day8.shape).toBe("practise-mid");
    expect(screensFor(day8).map(screenKey)).toEqual([
      "arrive",
      "understand",
      "q.route",
      "e.route",
      "practise",
      "q.size",
      "step",
      "reflection",
      "close",
    ]);
  });
});

describe("store upgrades to v4 from v1, v2 and v3", () => {
  it("upgrades a positional v1 store, seeding meaning v1 exactly", () => {
    const legacy = { version: 1, answers: { "day-08": ["q.route.0", "q.size.1", "step.2"] } };
    const { progress, changed } = upgradeStoredProgress(legacy);
    expect(changed).toBe(true);
    expect(progress.version).toBe(4);
    expect(progress.answerSets["day-08"]!["v1"]).toEqual([
      "q.route:self",
      "q.size:small",
      "step:outside",
    ]);
    // The frozen legacy mirror is kept, migrated, not deleted.
    expect(progress.answers["day-08"]).toEqual(progress.answerSets["day-08"]!["v1"]);
  });

  it("upgrades a v2 store without re-migrating stable ids", () => {
    const tokens = ["q.route:body", "q.size:tiny"];
    const { progress } = upgradeStoredProgress({ version: 2, answers: { "day-08": tokens } });
    expect(progress.answerSets["day-08"]!["v1"]).toEqual(tokens);
    expect(progress.answers["day-08"]).toEqual(tokens);
  });

  it("upgrades a v3 store and preserves every other field", () => {
    const tokens = ["q.route:values"];
    const keys = screensFor(day8).map(screenKey);
    const reflectionIdx = keys.indexOf("reflection");
    const text = reflectionToText(buildReflection(day8, tokens));
    const snapshot = reflectionSnapshot(day8, tokens);
    const { progress } = upgradeStoredProgress({
      version: 3,
      answers: { "day-08": tokens },
      completedDays: ["day-07"],
      reached: { "day-08": reflectionIdx },
      locator: { dayId: "day-08", step: "reflection", index: reflectionIdx },
      reflections: { "day-08": text },
      reflectionSnapshots: { "day-08": snapshot },
      updatedAt: "2026-08-16T00:00:00.000Z",
    });

    expect(progress.answerSets["day-08"]!["v1"]).toEqual(tokens);
    expect(progress.answers["day-08"]).toEqual(tokens);
    expect(progress.completedDays).toEqual(["day-07"]);
    expect(progress.reached["day-08"]).toBe(reflectionIdx);
    expect(progress.locator).toEqual({
      dayId: "day-08",
      step: "reflection",
      index: reflectionIdx,
    });
    expect(progress.reflections["day-08"]).toBe(text);
    expect(progress.reflectionSnapshots["day-08"]).toBe(snapshot);
    expect(progress.updatedAt).toBe("2026-08-16T00:00:00.000Z");
  });

  it("is idempotent", () => {
    const legacy = { version: 1, answers: { "day-08": ["q.route.0"] } };
    const once = upgradeStoredProgress(legacy).progress;
    const twice = upgradeStoredProgress(once);
    expect(twice.changed).toBe(false);
    expect(twice.progress.answerSets).toEqual(once.answerSets);
    expect(twice.progress.answers).toEqual(once.answers);
    // A third pass through normalisation is also stable.
    expect(normalizeProgress(twice.progress).answerSets).toEqual(once.answerSets);
  });

  it("maps every frozen Day 8 positional and stable token to v1 exactly", () => {
    for (const [stepKey, ids] of Object.entries(FROZEN_DAY_8_V1)) {
      ids.forEach((id, index) => {
        const positional = migrateDayAnswers("day-08", [`${stepKey}.${index}`]);
        expect(positional).toEqual([`${stepKey}:${id}`]);
        const { progress } = upgradeStoredProgress({
          version: 1,
          answers: { "day-08": [`${stepKey}.${index}`] },
        });
        expect(progress.answerSets["day-08"]!["v1"]).toEqual([`${stepKey}:${id}`]);
        // An already-stable token is untouched.
        expect(migrateDayAnswers("day-08", [`${stepKey}:${id}`])).toEqual([
          `${stepKey}:${id}`,
        ]);
      });
    }
  });
});

describe("version-aware helpers", () => {
  it("returns only the current meaning's set", () => {
    stored({
      version: 4,
      answerSets: { "day-08": { v1: ["q.route:self"], v2: ["q.route:body"] } },
    });
    const p = readProgress();
    expect(answersForDay(p, day8)).toEqual(["q.route:self"]);
    expect(answersForDay(p, day8AsV2())).toEqual(["q.route:body"]);
    expect(answersForDay(p, day8AsV3())).toEqual([]);
    expect(answersForDay(emptyProgress, day8)).toEqual([]);
  });

  it("sees an older non-empty set as a pending revision, with no active answers", () => {
    saveDayAnswers(day8, ["q.route:self", "q.size:tiny"]);
    const p = readProgress();
    const v2 = day8AsV2();
    expect(hasPendingAnswerMeaningRevision(p, v2)).toBe(true);
    expect(answersForDay(p, v2)).toEqual([]);
    // Not pending for a new person, nor for the day as it stands today.
    expect(hasPendingAnswerMeaningRevision(p, day8)).toBe(false);
    expect(hasPendingAnswerMeaningRevision(emptyProgress, v2)).toBe(false);
  });

  it("does not treat an empty older set as a pending revision", () => {
    stored({ version: 4, answerSets: { "day-08": { v1: [] } } });
    expect(hasPendingAnswerMeaningRevision(readProgress(), day8AsV2())).toBe(false);
  });

  it("adopts the current meaning as an explicitly empty set", () => {
    saveDayAnswers(day8, ["q.route:self"]);
    adoptCurrentAnswerMeaning(day8AsV2());
    const p = readProgress();
    expect(p.answerSets["day-08"]!["v2"]).toEqual([]);
    expect(Object.prototype.hasOwnProperty.call(p.answerSets["day-08"]!, "v2")).toBe(true);
    expect(p.answerSets["day-08"]!["v1"]).toEqual(["q.route:self"]);
    expect(p.answers["day-08"]).toEqual(["q.route:self"]);
    expect(hasPendingAnswerMeaningRevision(p, day8AsV2())).toBe(false);
    // Adoption is idempotent and never clears real selections.
    saveDayAnswers(day8AsV2(), ["q.route:body"]);
    adoptCurrentAnswerMeaning(day8AsV2());
    expect(readProgress().answerSets["day-08"]!["v2"]).toEqual(["q.route:body"]);
  });

  it("writes only the current meaning, never merging or overwriting an older one", () => {
    saveDayAnswers(day8, ["q.route:self", "q.size:tiny"]);
    saveDayAnswers(day8AsV2(), ["q.route:community"]);
    const p = readProgress();
    expect(p.answerSets["day-08"]!["v1"]).toEqual(["q.route:self", "q.size:tiny"]);
    expect(p.answerSets["day-08"]!["v2"]).toEqual(["q.route:community"]);
    // v1 rollback still retrieves the original v1 selections.
    expect(answersForDay(p, day8)).toEqual(["q.route:self", "q.size:tiny"]);
    // The frozen mirror only ever reflects v1.
    expect(p.answers["day-08"]).toEqual(["q.route:self", "q.size:tiny"]);
  });

  it("lets a further semantic v3 coexist safely", () => {
    saveDayAnswers(day8, ["q.route:self"]);
    saveDayAnswers(day8AsV2(), ["q.route:body"]);
    saveDayAnswers(day8AsV3(), ["q.route:values"]);
    const p = readProgress();
    expect(Object.keys(p.answerSets["day-08"]!).sort()).toEqual(["v1", "v2", "v3"]);
    expect(answersForDay(p, day8AsV3())).toEqual(["q.route:values"]);
    expect(answersForDay(p, day8)).toEqual(["q.route:self"]);
  });

  it("keeps meaningful-progress logic on the current meaning", () => {
    // Legacy v1-only selections are pending, not active, so they alone do not
    // count as meaningful progress under the revised Day 8.
    saveDayAnswers(day8, ["q.route:self"]);
    saveLocator({ dayId: "day-08", step: "arrive", index: 0 });
    expect(hasMeaningfulProgress(readProgress())).toBe(false);

    saveDayAnswers(day8Canonical, ["q.route:self"]);
    expect(hasMeaningfulProgress(readProgress())).toBe(true);
  });
});

describe("sanitisation and bounds", () => {
  it("rejects unsafe version ids and non-array values, and never makes them current", () => {
    stored({
      version: 4,
      answerSets: {
        "day-08": {
          v1: ["q.route:self"],
          v9: ["q.route:body"],
          "v1; drop": ["q.route:body"],
          v2: "q.route:body",
          v3: { 0: "q.route:body" },
          v4: null,
        },
      },
    });
    const sets = readProgress().answerSets["day-08"]!;
    expect(Object.keys(sets)).toEqual(["v1"]);
    expect(answersForDay(readProgress(), day8AsV2())).toEqual([]);
    expect(hasPendingAnswerMeaningRevision(readProgress(), day8AsV2())).toBe(true);
  });

  it("keeps an explicitly empty current set as the acknowledgment marker", () => {
    stored({ version: 4, answerSets: { "day-08": { v1: [] } } });
    const sets = readProgress().answerSets["day-08"]!;
    expect(Object.prototype.hasOwnProperty.call(sets, "v1")).toBe(true);
    expect(sets["v1"]).toEqual([]);
  });

  it("caps coded tokens per set and versions per day", () => {
    const many = Array.from({ length: 60 }, (_, n) => `q.route:opt${n}`);
    const versions: Record<string, string[]> = {};
    for (let n = 1; n <= 8; n += 1) versions[`v${n}`] = ["q.route:self"];
    stored({ version: 4, answerSets: { "day-08": { ...versions, v1: many } } });
    const sets = readProgress().answerSets["day-08"]!;
    expect(sets["v1"]!.length).toBe(40);
    expect(Object.keys(sets).length).toBeLessThanOrEqual(MAX_MEANING_VERSIONS_PER_DAY);
  });

  it("ignores a corrupt answerSets container entirely", () => {
    stored({ version: 4, answerSets: "nonsense" });
    expect(readProgress().answerSets).toEqual({});
    stored({ version: 4, answerSets: { "day-08": ["q.route:self"] } });
    expect(readProgress().answerSets).toEqual({});
  });
});

describe("dormant revisit path clamps to Arrive", () => {
  it("clamps a deep link and a resume while a revision is pending", () => {
    const keys = screensFor(day8).map(screenKey);
    saveDayAnswers(day8, ["q.route:self"]);
    saveReached("day-08", keys.length - 1);
    markDayComplete("day-08");
    saveLocator({ dayId: "day-08", step: "reflection", index: keys.indexOf("reflection") });

    const p = readProgress();
    const pending = hasPendingAnswerMeaningRevision(p, day8AsV2());
    expect(pending).toBe(true);

    // The flow's own clamp: pending wins over every earned index.
    const visible = pending
      ? 0
      : resolveVisibleIndex({
          kinds: screensFor(day8).map((s) => s.kind),
          requested: keys.length - 1,
          reached: p.reached["day-08"] ?? 0,
          completed: isDayComplete(p, "day-08"),
        });
    expect(visible).toBe(0);

    // Stored trust is untouched by the clamp.
    expect(p.reached["day-08"]).toBe(keys.length - 1);
    expect(isDayComplete(p, "day-08")).toBe(true);
    expect(p.locator).toEqual({
      dayId: "day-08",
      step: "reflection",
      index: keys.indexOf("reflection"),
    });
    // The resume target itself is still valid; the flow simply does not use it.
    expect(
      resolveResumeIndex({ stepKeys: keys, dayId: "day-08", locator: p.locator, requested: true }),
    ).toBe(keys.indexOf("reflection"));
  });

  it("stops clamping once the current meaning is adopted", () => {
    saveDayAnswers(day8, ["q.route:self"]);
    adoptCurrentAnswerMeaning(day8AsV2());
    expect(hasPendingAnswerMeaningRevision(readProgress(), day8AsV2())).toBe(false);
  });
});

describe("reflection safety", () => {
  it("invalidates a saved reflection on a meaning bump alone", () => {
    const answers = ["q.route:self"];
    expect(reflectionContentFingerprint(day8AsV2())).not.toBe(
      reflectionContentFingerprint(day8),
    );
    const text = reflectionToText(buildReflection(day8, answers));
    const snapshot = reflectionSnapshot(day8, answers);
    saveDayReflection("day-08", text, snapshot);

    // Under the revised meaning the older saved response cannot be restored,
    // and the rebuild uses the current-version answers (none yet).
    const resolved = resolveReflection(day8AsV2(), [], { text, snapshot });
    expect(resolved.restored).toBe(false);
    expect(resolved.replaceSaved).toBe(true);
    expect(resolved.snapshot).toBe(reflectionSnapshot(day8AsV2(), []));

    // Nothing was proactively deleted.
    const p = readProgress();
    expect(p.reflections["day-08"]).toBe(text);
    expect(p.reflectionSnapshots["day-08"]).toBe(snapshot);

    // Under the unchanged meaning it still restores word for word.
    expect(resolveReflection(day8, answers, { text, snapshot }).restored).toBe(true);
  });

  it("keeps day 1 proof independent of day 8 proof", () => {
    expect(reflectionContentFingerprint(day1)).not.toBe(
      reflectionContentFingerprint(day8),
    );
  });
});

describe("clear and restart", () => {
  it("removes versioned sets with the existing journey key", () => {
    saveDayAnswers(day8, ["q.route:self"]);
    saveDayAnswers(day8AsV2(), ["q.route:body"]);
    expect(localStorage.getItem(JOURNEY_STORAGE_KEY)).not.toBeNull();
    clearJourney();
    expect(localStorage.getItem(JOURNEY_STORAGE_KEY)).toBeNull();
    const p = readProgress();
    expect(p.answerSets).toEqual({});
    expect(p.answers).toEqual({});
    expect(p.version).toBe(JOURNEY_STORE_VERSION);
  });
});
