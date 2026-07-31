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
    saveLocator({ dayId: "day-2", step: "listen", index: 4 });
    expect(readProgress().locator).toEqual({ dayId: "day-2", step: "listen", index: 4 });
    clearLocator();
    expect(readProgress().locator).toBeNull();
  });

  it("saving a locator does not complete a day", () => {
    saveLocator({ dayId: "day-2", step: "listen", index: 4 });
    expect(isDayComplete(readProgress(), "day-2")).toBe(false);
    expect(readProgress().completedDays).toEqual([]);
  });

  it("marks completion once, idempotently", () => {
    markDayComplete("day-1");
    markDayComplete("day-1");
    expect(readProgress().completedDays).toEqual(["day-1"]);
    expect(isDayComplete(readProgress(), "day-1")).toBe(true);
  });

  it("stores structured answer ids and resume reflection text", () => {
    saveDayAnswers("day-1", ["heavy", "guarded"]);
    saveDayReflection("day-1", "A provisional reflection.");
    const p = readProgress();
    expect(p.answers["day-1"]).toEqual(["heavy", "guarded"]);
    expect(p.reflections["day-1"]).toContain("provisional");
  });

  it("treats only real in-progress state as meaningful", () => {
    expect(hasMeaningfulProgress(readProgress())).toBe(false);
    saveLocator({ dayId: "day-1", step: "arrive", index: 0 });
    expect(hasMeaningfulProgress(readProgress())).toBe(true);
  });

  it("clears everything explicitly", () => {
    saveLocator({ dayId: "day-1", step: "name", index: 2 });
    markDayComplete("day-1");
    clearJourney();
    expect(localStorage.getItem(JOURNEY_STORAGE_KEY)).toBeNull();
    expect(readProgress().completedDays).toEqual([]);
  });

  it("migrates legacy visited days", () => {
    expect(migrateLegacyVisitedDays(JSON.stringify({ visitedDays: [1, 2] }))).toEqual([
      "day-1",
      "day-2",
    ]);
    expect(migrateLegacyVisitedDays("garbage")).toEqual([]);
  });
});
