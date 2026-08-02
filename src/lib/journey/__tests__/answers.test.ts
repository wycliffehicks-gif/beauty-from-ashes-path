// Shared-integrity repair verification: stable answer ids and conservative
// migration. These lock the behaviour that a person's recorded choices keep
// their meaning when option lists change, and that nothing is ever silently
// re-interpreted as a different option.

import { beforeEach, describe, expect, it } from "vitest";

// Minimal in-memory storage stub, with key()/length so the scoped clear can
// enumerate app-owned keys exactly as a real browser store would.
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
(globalThis as unknown as { window: unknown }).window = {
  localStorage: new MemoryStorage(),
  sessionStorage: new MemoryStorage(),
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
};
(globalThis as unknown as { CustomEvent: unknown }).CustomEvent = class {
  constructor(public type: string) {}
};

import {
  mergeStableStepAnswers,
  optionIdsFor,
  optionIndexesForOptions,
  stableAnswerId as encodeAnswer,
} from "@/lib/journey/answers";
import { migrateAnswersToStableIds } from "@/lib/journey/answer-migration";
import { FIRST_JOURNEY_DAYS } from "@/content/first-journey";
import { dayIdFor } from "@/content/journey";
import {
  APP_OWNED_LOCAL_KEYS,
  JOURNEY_STORAGE_KEY,
  JOURNEY_STORE_VERSION,
  clearJourney,
  migrateLegacyVisitedDays,
  upgradeStoredProgress,
} from "@/lib/journey/progress";

const day1 = FIRST_JOURNEY_DAYS[0]!;
const firstQuestion = day1.questions[0]!;

describe("stable answer encoding", () => {
  it("encodes a step and option into one stable token", () => {
    expect(encodeAnswer("q.weight", "heavy")).toBe("q.weight:heavy");
  });


  it("resolves stable tokens to option ids regardless of option order", () => {
    const options = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const stored = [encodeAnswer("q.x", "c"), encodeAnswer("q.x", "a")];
    expect(optionIdsFor(stored, "q.x", options)).toEqual(["c", "a"]);

    const reordered = [{ id: "c" }, { id: "b" }, { id: "a" }];
    // The same stored answers still mean c and a, not positions 0 and 1.
    expect(optionIdsFor(stored, "q.x", reordered)).toEqual(["c", "a"]);
  });

  it("still reads legacy positional tokens through the current option list", () => {
    const options = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(optionIdsFor(["q.x.2"], "q.x", options)).toEqual(["c"]);
  });

  it("drops a legacy position that no longer exists", () => {
    expect(optionIdsFor(["q.x.7"], "q.x", [{ id: "a" }])).toEqual([]);
  });

  it("maps ids back to indexes for the current option list", () => {
    const options = [{ id: "a" }, { id: "b" }];
    expect(optionIndexesForOptions([encodeAnswer("q.x", "b")], "q.x", options)).toEqual([1]);
  });

  it("replaces only the answers for the step being recorded", () => {
    const cur = [encodeAnswer("q.a", "one"), encodeAnswer("q.b", "two")];
    const next = mergeStableStepAnswers(cur, "q.b", ["three"]);
    expect(next).toContain(encodeAnswer("q.a", "one"));
    expect(next).toContain(encodeAnswer("q.b", "three"));
    expect(next).not.toContain(encodeAnswer("q.b", "two"));
  });

  it("clears a step when nothing is selected", () => {
    const cur = [encodeAnswer("q.a", "one")];
    expect(mergeStableStepAnswers(cur, "q.a", [])).toEqual([]);
  });
});

describe("conservative store migration", () => {
  it("translates positional day answers into stable ids", () => {
    const dayId = dayIdFor(day1.day);
    const legacy = { [dayId]: [`q.${firstQuestion.id}.0`] };
    const migrated = migrateAnswersToStableIds(legacy);
    expect(migrated[dayId]).toEqual([
      encodeAnswer(`q.${firstQuestion.id}`, firstQuestion.options[0]!.id),
    ]);
  });

  it("keeps selections, the saved place and days genuinely finished", () => {
    const dayId = dayIdFor(day1.day);
    const { progress, changed } = upgradeStoredProgress({
      version: 1,
      locator: { dayId, step: "arrive", index: 0 },
      answers: { [dayId]: [`q.${firstQuestion.id}.0`] },
      completedDays: [dayId],
      reflections: { [dayId]: "a saved reflection" },
    });

    expect(changed).toBe(true);
    expect(progress.version).toBe(JOURNEY_STORE_VERSION);
    expect(progress.locator?.dayId).toBe(dayId);
    expect(progress.reflections[dayId]).toBe("a saved reflection");
    expect(progress.answers[dayId]?.[0]).toContain(firstQuestion.options[0]!.id);
    // Completion recorded by this app's own end-of-day path is real work and is
    // preserved; only legacy `bfa.v1` visited-day markers are never promoted.
    expect(progress.completedDays).toEqual([dayId]);
  });

  it("never promotes legacy visited days into completion", () => {
    const { progress } = upgradeStoredProgress({
      version: 1,
      answers: {},
      reflections: {},
    });
    expect(progress.completedDays).toEqual([]);
    // The legacy visited-day parser exists for reference only and produces day
    // ids that no migration path writes to completedDays.
    expect(migrateLegacyVisitedDays(JSON.stringify({ visitedDays: [1, 2] }))).toEqual([
      "day-01",
      "day-02",
    ]);
  });

  it("leaves a current-version store untouched", () => {
    const { changed } = upgradeStoredProgress({
      version: JOURNEY_STORE_VERSION,
      answers: {},
      completedDays: [],
      reflections: {},
    });
    expect(changed).toBe(false);
  });
});

describe("complete, scoped clear", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("removes every app-owned item and nothing else", () => {
    window.localStorage.setItem(JOURNEY_STORAGE_KEY, "{}");
    for (const key of APP_OWNED_LOCAL_KEYS) window.localStorage.setItem(key, "{}");
    window.localStorage.setItem("bfa.session.week-01", "{}");
    window.sessionStorage.setItem("bfa_splash_shown_v1", "1");
    window.localStorage.setItem("someone.elses.key", "keep me");

    clearJourney();

    expect(window.localStorage.getItem(JOURNEY_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem("bfa.v1")).toBeNull();
    expect(window.localStorage.getItem("bfa.session.week-01")).toBeNull();
    expect(window.sessionStorage.getItem("bfa_splash_shown_v1")).toBeNull();
    expect(window.localStorage.getItem("someone.elses.key")).toBe("keep me");
  });
});
