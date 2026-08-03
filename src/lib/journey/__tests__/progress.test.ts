import { beforeEach, describe, expect, it } from "vitest";

// Minimal in-memory storage stub so these tests run in the node environment
// without pulling in jsdom (mirrors src/lib/__tests__/session-state.test.ts).
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

const {
  JOURNEY_STORAGE_KEY,
  clearJourney,
  clearLocator,
  emptyProgress,
  hasMeaningfulProgress,
  isDayComplete,
  markDayComplete,
  migrateLegacyVisitedDays,
  normalizeProgress,
  readProgress,
  saveDayAnswers,
  saveDayReflection,
  saveLocator,
} = await import("@/lib/journey/progress");

beforeEach(() => {
  localStorage.clear();
});

describe("journey progress store", () => {
  it("starts empty and tolerates junk", () => {
    expect(readProgress().locator).toBeNull();
    expect(normalizeProgress("not json").completedDays).toEqual([]);
    expect(normalizeProgress(null).version).toBe(emptyProgress.version);
  });

  it("saves and restores an exact screen locator", () => {
    saveLocator({ dayId: "day-02", step: "listen", index: 4 });
    expect(readProgress().locator).toEqual({ dayId: "day-02", step: "listen", index: 4 });
    clearLocator();
    expect(readProgress().locator).toBeNull();
  });

  it("saving a locator does not complete a day", () => {
    saveLocator({ dayId: "day-02", step: "listen", index: 4 });
    expect(isDayComplete(readProgress(), "day-02")).toBe(false);
    expect(readProgress().completedDays).toEqual([]);
  });

  it("marks completion once, idempotently", () => {
    markDayComplete("day-01");
    markDayComplete("day-01");
    expect(readProgress().completedDays).toEqual(["day-01"]);
    expect(isDayComplete(readProgress(), "day-01")).toBe(true);
  });

  it("stores structured answer ids and resume reflection text", () => {
    saveDayAnswers("day-01", ["heavy", "guarded"]);
    saveDayReflection("day-01", "A provisional reflection.");
    const p = readProgress();
    expect(p.answers["day-01"]).toEqual(["heavy", "guarded"]);
    expect(p.reflections["day-01"]).toContain("provisional");
  });

  it("treats only real in-progress state as meaningful", () => {
    expect(hasMeaningfulProgress(readProgress())).toBe(false);
    // Sitting on the opening screen with nothing chosen is not meaningful.
    saveLocator({ dayId: "day-01", step: "arrive", index: 0 });
    expect(hasMeaningfulProgress(readProgress())).toBe(false);
    saveLocator({ dayId: "day-01", step: "listen", index: 3 });
    expect(hasMeaningfulProgress(readProgress())).toBe(true);
    // A finished day re-opened and left mid-day is still a real place to
    // return to, so the resume card keeps that exact place.
    markDayComplete("day-01");
    expect(hasMeaningfulProgress(readProgress())).toBe(true);
    // A finished day sitting on its own closing screen has nothing to resume.
    saveLocator({ dayId: "day-01", step: "close", index: 0 });
    expect(hasMeaningfulProgress(readProgress())).toBe(false);
  });
  it("never resumes a completed day at its beginning or its close", () => {
    saveDayAnswers("day-01", ["state:heavy"]);
    markDayComplete("day-01");

    // Completed + Arrive, with answers still retained, is not a resume.
    saveLocator({ dayId: "day-01", step: "arrive", index: 0 });
    expect(hasMeaningfulProgress(readProgress())).toBe(false);

    // Completed + genuinely mid-day is still a real place to return to.
    saveLocator({ dayId: "day-01", step: "name", index: 2 });
    expect(hasMeaningfulProgress(readProgress())).toBe(true);

    // Completed + Reflection is mid-day too.
    saveLocator({ dayId: "day-01", step: "reflection", index: 0 });
    expect(hasMeaningfulProgress(readProgress())).toBe(true);

    // Completed + Close has nothing left to resume.
    saveLocator({ dayId: "day-01", step: "close", index: 0 });
    expect(hasMeaningfulProgress(readProgress())).toBe(false);

    // Completed status itself is untouched by any of the above.
    expect(isDayComplete(readProgress(), "day-01")).toBe(true);
  });

  it("keeps unfinished-day semantics unchanged", () => {
    // Incomplete Arrive with nothing recorded is not meaningful.
    saveLocator({ dayId: "day-02", step: "arrive", index: 0 });
    expect(hasMeaningfulProgress(readProgress())).toBe(false);
    // A normal incomplete mid-day place is.
    saveLocator({ dayId: "day-02", step: "listen", index: 1 });
    expect(hasMeaningfulProgress(readProgress())).toBe(true);
  });



  it("clears everything explicitly", () => {
    saveLocator({ dayId: "day-01", step: "name", index: 2 });
    markDayComplete("day-01");
    clearJourney();
    expect(localStorage.getItem(JOURNEY_STORAGE_KEY)).toBeNull();
    expect(readProgress().completedDays).toEqual([]);
  });

  it("migrates legacy visited days", () => {
    expect(migrateLegacyVisitedDays(JSON.stringify({ visitedDays: [1, 2] }))).toEqual([
      "day-01",
      "day-02",
    ]);
    expect(migrateLegacyVisitedDays("garbage")).toEqual([]);
  });
});
