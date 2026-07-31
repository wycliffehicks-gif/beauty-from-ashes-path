// Integration regression test for the exact-resume defect: a locator saved
// partway through Day 2 must be restored exactly, and must NOT be overwritten
// by the opening screen (index 0) while resume restoration is pending.
//
// Runs in the node environment against an in-memory storage stub, mirroring
// src/lib/journey/__tests__/progress.test.ts. Full end-to-end behaviour is
// additionally verified in the browser at 360px and 390px.

import { beforeEach, describe, expect, it } from "vitest";

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

const { readProgress, saveLocator, saveDayAnswers } = await import("@/lib/journey/progress");
const { resolveResumeIndex, optionIndexesFor } = await import("@/lib/journey/resume");

/** The Day 2 flow: Arrive, Teach, Notice, Name, Listen, … Close. */
const DAY_02_STEPS = [
  "arrive",
  "teach",
  "notice",
  "name",
  "listen",
  "reflection",
  "reconnect",
  "step",
  "close",
];

/**
 * Mirrors the day route's mount sequence: first render is always the opening
 * screen, then the restore effect runs, then autosave is allowed to write.
 * `autosaveGated` reproduces the defect when set to false.
 */
function mountDayFlow({
  dayId,
  requested,
  autosaveGated = true,
}: {
  dayId: string;
  requested: boolean;
  autosaveGated?: boolean;
}) {
  let index = 0; // first render: opening screen, never read from storage
  let settled = !requested;

  // An ungated autosave fires on the first render, before restoration.
  if (!autosaveGated && !settled) {
    saveLocator({ dayId, step: DAY_02_STEPS[index], index });
  }

  // Restore effect (client only, before paint).
  const progress = readProgress();
  const restored = resolveResumeIndex({
    stepKeys: DAY_02_STEPS,
    dayId,
    locator: progress.locator,
    requested,
  });
  if (restored >= 0) index = restored;
  settled = true;

  // Autosave, now that the resume gate has settled.
  if (settled) saveLocator({ dayId, step: DAY_02_STEPS[index], index });

  return { index, step: DAY_02_STEPS[index], answers: progress.answers[dayId] ?? [] };
}

beforeEach(() => {
  localStorage.clear();
});

describe("Day flow exact resume (regression)", () => {
  it("opens on the exact saved step and does not overwrite it with index 0", () => {
    // Person progressed partway through Day 2 and returned Home.
    saveLocator({ dayId: "day-02", step: "name", index: 3 });
    saveDayAnswers("day-02", ["notice.2", "name.0"]);

    const view = mountDayFlow({ dayId: "day-02", requested: true });

    expect(view.step).toBe("name");
    expect(view.index).toBe(3);

    // The stored locator still points at the same screen — not Arrive.
    const after = readProgress().locator;
    expect(after).toEqual({ dayId: "day-02", step: "name", index: 3 });

    // Previously recorded structured answers are still available to restore.
    expect(optionIndexesFor(view.answers, "name", 9)).toEqual([0]);
    expect(optionIndexesFor(view.answers, "notice", 7)).toEqual([2]);
  });

  it("fails the same way the defect did when autosave is not gated", () => {
    saveLocator({ dayId: "day-02", step: "name", index: 3 });

    const view = mountDayFlow({ dayId: "day-02", requested: true, autosaveGated: false });

    // Guard: this is the broken behaviour the gate exists to prevent.
    expect(view.step).toBe("arrive");
    expect(readProgress().locator).toEqual({ dayId: "day-02", step: "arrive", index: 0 });
  });

  it("continues autosaving from the resumed screen", () => {
    saveLocator({ dayId: "day-02", step: "name", index: 3 });
    const view = mountDayFlow({ dayId: "day-02", requested: true });

    // Moving forward one screen from the resumed position.
    const next = view.index + 1;
    saveLocator({ dayId: "day-02", step: DAY_02_STEPS[next], index: next });

    expect(readProgress().locator).toEqual({ dayId: "day-02", step: "listen", index: 4 });
  });

  it("starts at Arrive without resume, leaving the saved locator to be replaced normally", () => {
    saveLocator({ dayId: "day-02", step: "name", index: 3 });

    const view = mountDayFlow({ dayId: "day-02", requested: false });

    expect(view.step).toBe("arrive");
    expect(readProgress().locator).toEqual({ dayId: "day-02", step: "arrive", index: 0 });
  });

  it("falls back to Arrive for a stale locator, then autosaves normally", () => {
    saveLocator({ dayId: "day-02", step: "a-step-that-no-longer-exists" });

    const view = mountDayFlow({ dayId: "day-02", requested: true });

    expect(view.step).toBe("arrive");
    expect(readProgress().locator).toEqual({ dayId: "day-02", step: "arrive", index: 0 });
  });

  it("never completes a day merely by resuming into it", () => {
    saveLocator({ dayId: "day-02", step: "name", index: 3 });
    mountDayFlow({ dayId: "day-02", requested: true });
    expect(readProgress().completedDays).toEqual([]);
  });
});
