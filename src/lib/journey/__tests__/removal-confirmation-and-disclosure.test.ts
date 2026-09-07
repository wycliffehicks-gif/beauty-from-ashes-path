// Two bounded follow-ups, mock-only:
//  A. a removal that quietly does nothing, or whose confirmation read throws,
//     must never let the old information be read again in this tab, and must be
//     reported as unconfirmed;
//  B/C. the factual storage, pilot-cookie and offline wording.
//
// No real browser data is cleared, nothing is transmitted, and no notification
// or permission is involved.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";

type Mode = "ok" | "noopRemove" | "throwGetOnce";

class FakeStorage {
  map = new Map<string, string>();
  mode: Mode = "ok";
  private getThrowsLeft = 0;

  get length() {
    return this.map.size;
  }
  key(i: number) {
    return Array.from(this.map.keys())[i] ?? null;
  }
  getItem(k: string) {
    if (this.getThrowsLeft > 0) {
      this.getThrowsLeft -= 1;
      throw new Error("read blocked once");
    }
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    if (this.mode === "noopRemove") return;
    if (this.mode === "throwGetOnce") {
      // The removal "succeeds" but the confirmation read fails once.
      this.getThrowsLeft = 1;
      return;
    }
    this.map.delete(k);
  }
}

const local = new FakeStorage();
const session = new FakeStorage();

(globalThis as unknown as { window: unknown }).window = {
  localStorage: local,
  sessionStorage: session,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {
    return true;
  },
  setTimeout: (fn: () => void, ms?: number) => globalThis.setTimeout(fn, ms) as unknown as number,
  clearTimeout: (id: number) => globalThis.clearTimeout(id),
};
(globalThis as unknown as { CustomEvent: unknown }).CustomEvent =
  (globalThis as unknown as { CustomEvent?: unknown }).CustomEvent ??
  class {
    type: string;
    constructor(type: string) {
      this.type = type;
    }
  };

const storage = await import("@/lib/storage-status");
const progress = await import("../progress");
const prefs = await import("@/lib/prefs");
const entitlement = await import("../entitlement");
const reminder = await import("../reminder");
const { PRIVACY_SUMMARY_POINTS } = await import("@/content/settings");

function seed() {
  local.map.clear();
  session.map.clear();
  local.mode = "ok";
  session.mode = "ok";
  storage.resetStorageStatusForTests();
  storage.resetClearStatusForTests();
  local.map.set(
    "bfa.v1",
    JSON.stringify({ agreementVersion: "2026-08-16.1", spiritualContent: true }),
  );
  local.map.set(
    "bfa.journey.v1",
    JSON.stringify({ version: 4, currentDay: 6, completedDays: [1, 2, 3] }),
  );
  local.map.set("bfa.entitlement.v1", JSON.stringify({ unlocked: true, source: "pilot" }));
  local.map.set("bfa.reminder.v1", JSON.stringify({ enabled: true, time: "07:30" }));
}

function expectNothingOldIsVisible() {
  expect(storage.readLocal("bfa.journey.v1")).toBeNull();
  expect(storage.readLocal("bfa.v1")).toBeNull();
  const p = progress.readProgress();
  expect(p.completedDays ?? []).toEqual([]);
  expect(prefs.readPrefs().agreementVersion ?? null).toBeNull();
  expect(entitlement.readEntitlement()).toEqual(entitlement.LOCKED);
  expect(reminder.readReminder().enabled).toBe(false);
}

describe("A — removal is only trusted when persistently confirmed", () => {
  beforeEach(seed);

  test("a removal that silently does nothing hides the old state and warns", () => {
    local.mode = "noopRemove";
    progress.clearJourney();
    expectNothingOldIsVisible();
    expect(storage.isClearUnconfirmed()).toBe(true);
    // Honest: the data really is still in the browser.
    expect(local.map.has("bfa.journey.v1")).toBe(true);
  });

  test("a confirmation read that throws once cannot let old data reappear", () => {
    local.mode = "throwGetOnce";
    progress.clearJourney();
    // Reads have recovered by now, yet the tombstone still holds.
    local.mode = "ok";
    expectNothingOldIsVisible();
    expect(storage.isClearUnconfirmed()).toBe(true);
  });

  test("a fresh visit honestly still finds the residual data", () => {
    local.mode = "noopRemove";
    progress.clearJourney();
    // Simulated new visit: in-tab memory and tombstones are gone.
    storage.resetStorageStatusForTests();
    storage.resetClearStatusForTests();
    expect(storage.readLocal("bfa.journey.v1")).not.toBeNull();
    expect(entitlement.readEntitlement().unlocked).toBe(true);
  });

  test("a later genuinely successful removal restores normal behaviour", () => {
    local.mode = "noopRemove";
    progress.clearJourney();
    expect(storage.isClearUnconfirmed()).toBe(true);
    local.mode = "ok";
    progress.clearJourney();
    expect(storage.isClearUnconfirmed()).toBe(false);
    expect(local.map.has("bfa.journey.v1")).toBe(false);
    expect(storage.removeLocalConfirmed("bfa.journey.v1")).toBe(true);
  });

  test("a later successful write to the same key is authoritative again", () => {
    local.mode = "noopRemove";
    expect(storage.removeLocalConfirmed("bfa.entitlement.v1")).toBe(false);
    expect(storage.readLocal("bfa.entitlement.v1")).toBeNull();
    local.mode = "ok";
    entitlement.grantPilotUnlock();
    expect(entitlement.readEntitlement()).toEqual({ unlocked: true, source: "pilot" });
    expect(storage.readLocal("bfa.entitlement.v1")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// B and C — factual disclosure wording
// ---------------------------------------------------------------------------

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** Source text with line wrapping normalised, so assertions test wording. */
const flat = (p: string) => read(p).replace(/\s+/g, " ");

describe("B — the Privacy Notice describes what is actually stored", () => {
  const privacy = flat("src/routes/privacy.tsx");

  test("the stored-items list names the pilot access marker and the reminder", () => {
    expect(privacy).toContain(
      "Whether you opened Days 5–10 during the free pilot. This is an access marker, not a payment record.",
    );
    expect(privacy).toContain("Whether you enabled the optional reminder and the time you chose.");
  });

  test("the private-pilot access cookie is disclosed with its real name and life", () => {
    expect(privacy).toContain(
      '<h2 className="bfa-h2 font-serif">Private-pilot access cookie</h2>',
    );
    expect(privacy).toContain("<code>bfa-pilot-gate</code>");
    expect(privacy).toContain("for up to 30");
    expect(privacy).toContain("sends this cookie to the app’s server");
    expect(privacy).toContain(
      "does not contain your selected journey answers or personalised",
    );
    expect(privacy).toContain("clears journey information, not this access");
    expect(privacy).toContain("enter the pilot access code again");
  });

  test("it makes no over-claim about the cookie's contents or timing", () => {
    expect(privacy).not.toMatch(/only a (boolean|true\/false)/i);
    expect(privacy).not.toMatch(/no identifier/i);
    expect(privacy).not.toMatch(/only (created|set) after/i);
  });

  test("clearing is described as a request that may not be confirmed", () => {
    expect(privacy).not.toContain("You can remove all of it at any time");
    expect(privacy).not.toContain("is removed along with everything else when you clear");
    expect(privacy).toContain("tells you if the removal cannot be confirmed");
    expect(privacy).toContain("tells you if that removal cannot be confirmed");
  });

  test("the shown date is updated without touching the legal acceptance version", () => {
    expect(privacy).toContain('lastUpdated="September 7, 2026"');
    expect(read("src/lib/prefs.ts")).toContain(
      'export const LEGAL_BUNDLE_VERSION = "2026-08-16.1";',
    );
  });

  test("the local, no-AI reflection description is unchanged", () => {
    expect(privacy).toContain("assembled on this device");
    expect(privacy).toContain("No artificial intelligence, no server and no external");
  });
});

describe("B — the Settings privacy summary matches reality", () => {

  test("the first point is about saved journey information, still qualified", () => {
    expect(PRIVACY_SUMMARY_POINTS[0]).toBe(
      "When browser storage is available, your saved journey information stays in this browser on this device. If storage is unavailable, information may exist only in the current tab and can be lost when that tab closes or reloads.",
    );
  });

  test("clearing is a request, with an honest failure promise", () => {
    expect(PRIVACY_SUMMARY_POINTS).toContain(
      "You can ask the app to clear or restart your saved journey information from this page. If removal cannot be confirmed, the app will tell you.",
    );
    expect(PRIVACY_SUMMARY_POINTS.join(" ")).not.toContain(
      "clear or restart everything saved here",
    );
  });

  test("the no-account, no-AI point is unchanged", () => {
    expect(PRIVACY_SUMMARY_POINTS[1]).toContain("no artificial intelligence reading anything");
  });
});

describe("C — the install paragraph no longer promises offline use", () => {
  const settings = flat("src/routes/_shell.settings.tsx");

  test("it asks for a connection during the pilot", () => {
    expect(settings).toContain(
      "Add Beauty from Ashes to your home screen for easier access. Please use an internet connection during this pilot; offline use has not been verified.",
    );
    expect(settings).not.toContain("It will work offline");
  });

  test("the install control itself is untouched", () => {
    expect(settings).toContain('data-testid="install-pwa"');
    expect(settings).toContain("installPrompt?.prompt()");
  });
});
