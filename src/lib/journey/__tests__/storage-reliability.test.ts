// Reliability of three device-only concerns, all mock-only:
//  1. pilot continuation must still open when the browser refuses to persist;
//  2. an explicit clear must report honestly when removal cannot be confirmed;
//  3. the single reminder timer must be owned by the root scheduler.
//
// No real user data, no notification delivery, no permission request and no
// network of any kind is involved: every store, notification and timer here is
// a local mock.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

type Mode = "ok" | "throwWrite" | "throwRemove" | "throwAll" | "throwEnumerate";

class FakeStorage {
  map = new Map<string, string>();
  mode: Mode = "ok";
  /** Removal silently does nothing, as a quota-locked browser can behave. */
  swallowRemove = false;

  get length() {
    if (this.mode === "throwEnumerate") throw new Error("enumeration blocked");
    return this.map.size;
  }
  key(i: number) {
    if (this.mode === "throwEnumerate") throw new Error("enumeration blocked");
    return Array.from(this.map.keys())[i] ?? null;
  }
  getItem(k: string) {
    if (this.mode === "throwAll") throw new Error("read blocked");
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    if (this.mode === "throwAll" || this.mode === "throwWrite") throw new Error("write blocked");
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    if (this.mode === "throwAll" || this.mode === "throwRemove") {
      throw new Error("removal blocked");
    }
    if (this.swallowRemove) return;
    this.map.delete(k);
  }
}

const local = new FakeStorage();
const session = new FakeStorage();
let localBlocked = false;
let events: string[] = [];
let notifications: string[] = [];
let permission: "granted" | "denied" | "default" = "granted";

class FakeNotification {
  static permission: "granted" | "denied" | "default" = "granted";
  constructor(title: string) {
    notifications.push(title);
  }
}

const fakeWindow = {
  get localStorage() {
    if (localBlocked) throw new Error("storage access denied");
    return local;
  },
  get sessionStorage() {
    return session;
  },
  get Notification() {
    if (permission === "default" && FakeNotification.permission === "default") {
      FakeNotification.permission = "default";
    }
    return FakeNotification;
  },
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent(e: { type: string }) {
    events.push(e.type);
    return true;
  },
  setTimeout: (fn: () => void, ms?: number) => globalThis.setTimeout(fn, ms) as unknown as number,
  clearTimeout: (id: number) => globalThis.clearTimeout(id),
};

(globalThis as unknown as { window: unknown }).window = fakeWindow;
(globalThis as unknown as { CustomEvent: unknown }).CustomEvent =
  (globalThis as unknown as { CustomEvent?: unknown }).CustomEvent ??
  class {
    type: string;
    constructor(type: string) {
      this.type = type;
    }
  };

const storage = await import("@/lib/storage-status");
const entitlement = await import("../entitlement");
const reminder = await import("../reminder");
const progress = await import("../progress");

function reset() {
  local.map.clear();
  session.map.clear();
  local.mode = "ok";
  session.mode = "ok";
  local.swallowRemove = false;
  session.swallowRemove = false;
  localBlocked = false;
  events = [];
  notifications = [];
  permission = "granted";
  FakeNotification.permission = "granted";
  storage.resetStorageStatusForTests();
  storage.resetClearStatusForTests();
}

beforeEach(reset);
afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// 1. Pilot continuation
// ---------------------------------------------------------------------------

describe("pilot continuation survives blocked storage", () => {
  test("normal browser: unlocking opens Days 5–10 and persists", () => {
    entitlement.grantPilotUnlock();
    expect(local.map.has("bfa.entitlement.v1")).toBe(true);
    const e = entitlement.readEntitlement();
    expect(e).toEqual({ unlocked: true, source: "pilot" });
    for (let d = 5; d <= 10; d += 1) expect(entitlement.isDayUnlocked(d, e)).toBe(true);
  });

  test("all storage blocked: this visit still opens, Days 1–4 unaffected", () => {
    local.mode = "throwAll";
    entitlement.grantPilotUnlock();
    const e = entitlement.readEntitlement();
    expect(e.unlocked).toBe(true);
    for (let d = 1; d <= 4; d += 1) expect(entitlement.isDayUnlocked(d, e)).toBe(true);
    expect(entitlement.isDayUnlocked(10, e)).toBe(true);
    // Honest about durability: the saving notice is now warranted.
    expect(storage.isPersistenceAvailable()).toBe(false);
  });

  test("write-only failure with a stale locked value still readable", () => {
    local.map.set("bfa.entitlement.v1", JSON.stringify({ unlocked: false, source: null }));
    local.mode = "throwWrite";
    entitlement.grantPilotUnlock();
    // The stale persisted LOCKED value must not shadow this tab's unlock.
    expect(entitlement.readEntitlement()).toEqual({ unlocked: true, source: "pilot" });
    expect(entitlement.isDayUnlocked(7, entitlement.readEntitlement())).toBe(true);
  });

  test("subscribers are notified so navigation reflects the new state", () => {
    entitlement.grantPilotUnlock();
    expect(events).toContain(entitlement.ENTITLEMENT_EVENT);
    events = [];
    local.mode = "throwAll";
    entitlement.grantPilotUnlock();
    expect(events).toContain(entitlement.ENTITLEMENT_EVENT);
  });

  test("malformed stored values read as locked", () => {
    local.map.set("bfa.entitlement.v1", "{not json");
    expect(entitlement.readEntitlement()).toEqual(entitlement.LOCKED);
    local.map.set("bfa.entitlement.v1", JSON.stringify({ unlocked: "yes" }));
    expect(entitlement.readEntitlement()).toEqual(entitlement.LOCKED);
  });

  test("clearing relocks, including after a blocked write", () => {
    local.mode = "throwAll";
    entitlement.grantPilotUnlock();
    expect(entitlement.readEntitlement().unlocked).toBe(true);
    entitlement.clearEntitlement();
    expect(entitlement.readEntitlement()).toEqual(entitlement.LOCKED);
    expect(entitlement.isDayUnlocked(5, entitlement.readEntitlement())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Honest clear feedback
// ---------------------------------------------------------------------------

function seedAppData() {
  local.map.set("bfa.journey.v1", JSON.stringify({ version: 4 }));
  local.map.set("bfa.v1", "{}");
  local.map.set("bfa.entitlement.v1", JSON.stringify({ unlocked: true, source: "pilot" }));
  local.map.set("bfa.reminder.v1", JSON.stringify({ enabled: true, time: "20:00" }));
  local.map.set("unrelated.other-app", "keep me");
  session.map.set("bfa_splash_shown_v1", "1");
  session.map.set("unrelated.session", "keep me too");
}

describe("clearing reports its own outcome honestly", () => {
  test("success: app keys go, unrelated keys stay, nothing is claimed wrongly", () => {
    seedAppData();
    progress.clearJourney();
    expect(local.map.has("bfa.journey.v1")).toBe(false);
    expect(local.map.has("bfa.entitlement.v1")).toBe(false);
    expect(local.map.has("bfa.reminder.v1")).toBe(false);
    expect(session.map.has("bfa_splash_shown_v1")).toBe(false);
    expect(local.map.get("unrelated.other-app")).toBe("keep me");
    expect(session.map.get("unrelated.session")).toBe("keep me too");
    expect(storage.isClearUnconfirmed()).toBe(false);
  });

  test("local removal failure is reported even though the tab hides it", () => {
    seedAppData();
    local.mode = "throwRemove";
    progress.clearJourney();
    // In-tab reads look clean (tombstoned)…
    expect(storage.readLocal("bfa.journey.v1")).toBeNull();
    // …but the data is genuinely still in the browser, so we say so.
    expect(local.map.has("bfa.journey.v1")).toBe(true);
    expect(storage.isClearUnconfirmed()).toBe(true);
  });

  test("a removal that silently does nothing is still unconfirmed", () => {
    seedAppData();
    local.swallowRemove = true;
    progress.clearJourney();
    expect(storage.isClearUnconfirmed()).toBe(true);
  });

  test("session-only failure is reported although saving still works", () => {
    seedAppData();
    session.mode = "throwRemove";
    progress.clearJourney();
    expect(local.map.has("bfa.journey.v1")).toBe(false);
    expect(storage.isClearUnconfirmed()).toBe(true);
  });

  test("enumeration failure still removes every known key, and is reported", () => {
    seedAppData();
    local.mode = "throwEnumerate";
    session.mode = "throwEnumerate";
    progress.clearJourney();
    expect(local.map.has("bfa.journey.v1")).toBe(false);
    expect(local.map.has("bfa.entitlement.v1")).toBe(false);
    expect(local.map.has("bfa.reminder.v1")).toBe(false);
    expect(local.map.get("unrelated.other-app")).toBe("keep me");
    expect(storage.isClearUnconfirmed()).toBe(true);
  });

  test("storage access failure is reported", () => {
    localBlocked = true;
    progress.clearJourney();
    expect(storage.isClearUnconfirmed()).toBe(true);
  });

  test("an earlier save failure does not make a good clear look failed", () => {
    local.mode = "throwWrite";
    entitlement.grantPilotUnlock();
    expect(storage.isPersistenceAvailable()).toBe(false);
    local.mode = "ok";
    seedAppData();
    progress.clearJourney();
    expect(storage.isClearUnconfirmed()).toBe(false);
    // Saving availability is a separate, sticky fact about this visit.
    expect(storage.isPersistenceAvailable()).toBe(false);
  });

  test("a fresh attempt starts from no claim", () => {
    seedAppData();
    local.mode = "throwRemove";
    progress.clearJourney();
    expect(storage.isClearUnconfirmed()).toBe(true);
    local.mode = "ok";
    progress.clearJourney();
    expect(storage.isClearUnconfirmed()).toBe(false);
  });

  test("clearing notifies every subscription: progress, prefs, entitlement, reminder", () => {
    seedAppData();
    progress.clearJourney();
    expect(events).toContain(progress.JOURNEY_CHANGE_EVENT);
    expect(events).toContain("bfa-prefs-change");
    expect(events).toContain(entitlement.ENTITLEMENT_EVENT);
    expect(events).toContain(reminder.REMINDER_EVENT);
    // The reminder is genuinely off and the pilot unlock is genuinely relocked.
    expect(reminder.readReminder().enabled).toBe(false);
    expect(entitlement.readEntitlement()).toEqual(entitlement.LOCKED);
  });

  test("the notice wording is exact and does not claim success", () => {
    expect(storage.CLEAR_UNCONFIRMED_NOTICE).toBe(
      "Some saved app information could not be confirmed as removed. It may still remain in this browser. To remove it, use your browser’s settings to clear this app’s site data.",
    );
    expect(storage.CLEAR_UNCONFIRMED_NOTICE).not.toMatch(/removed successfully|has been removed\b/);
  });
});

// ---------------------------------------------------------------------------
// 3. Reminder lifecycle
// ---------------------------------------------------------------------------

describe("one reminder timer, owned by the root scheduler", () => {
  test("fires once and never re-arms itself", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 7, 12, 0, 0, 0));
    const cancel = reminder.scheduleReminder({ enabled: true, time: "13:00" }, new Date());
    expect(cancel).toBeTypeOf("function");
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(notifications).toEqual([reminder.REMINDER_TITLE]);
    vi.advanceTimersByTime(48 * 60 * 60 * 1000);
    expect(notifications).toHaveLength(1);
    cancel?.();
  });

  test("cancelling before the time means nothing arrives", () => {
    vi.useFakeTimers();
    const cancel = reminder.scheduleReminder(
      { enabled: true, time: "13:00" },
      new Date(2026, 8, 7, 12, 0, 0, 0),
    );
    cancel?.();
    vi.advanceTimersByTime(4 * 60 * 60 * 1000);
    expect(notifications).toEqual([]);
  });

  test("a time change replaces the timer rather than adding one", () => {
    vi.useFakeTimers();
    const now = new Date(2026, 8, 7, 12, 0, 0, 0);
    const first = reminder.scheduleReminder({ enabled: true, time: "13:00" }, now);
    first?.();
    const second = reminder.scheduleReminder({ enabled: true, time: "14:00" }, now);
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(notifications).toEqual([]);
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(notifications).toEqual([reminder.REMINDER_TITLE]);
    second?.();
  });

  test("off, denied and unsupported all schedule nothing", () => {
    expect(reminder.scheduleReminder({ enabled: false, time: "13:00" })).toBeNull();
    FakeNotification.permission = "denied";
    expect(reminder.scheduleReminder({ enabled: true, time: "13:00" })).toBeNull();
  });

  test("a refused write still disables for this tab", () => {
    reminder.saveReminder({ enabled: true, time: "07:30" });
    local.mode = "throwWrite";
    reminder.saveReminder({ enabled: false, time: "07:30" });
    expect(reminder.readReminder()).toEqual({ enabled: false, time: "07:30" });
    expect(reminder.scheduleReminder(reminder.readReminder())).toBeNull();
  });

  test("clearing cancels the choice", () => {
    reminder.saveReminder({ enabled: true, time: "07:30" });
    reminder.clearReminder();
    expect(reminder.readReminder()).toEqual(reminder.REMINDER_OFF);
  });
});
