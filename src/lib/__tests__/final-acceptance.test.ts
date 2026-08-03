// Focused regression protection for the final consolidated acceptance pass.
//
// These tests prove the exact behaviours and copy the founder accepted: a
// storage fallback that is genuinely authoritative (including tombstones after
// a failed removal), and the approved therapeutic and interface wording.

import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getFirstJourneyDay } from "@/content/first-journey";
import {
  isPersistenceAvailable,
  readLocal,
  removeLocal,
  resetStorageStatusForTests,
  writeLocal,
} from "@/lib/storage-status";

const read = (path: string) => readFileSync(path, "utf8");

/** A localStorage stand-in whose write/remove behaviour can be made to fail. */
function fakeStore() {
  const data = new Map<string, string>();
  const state = { failWrites: false, failRemoves: false, failReads: false };
  return {
    state,
    data,
    api: {
      get length() {
        return data.size;
      },
      key: (i: number) => Array.from(data.keys())[i] ?? null,
      getItem: (k: string) => {
        if (state.failReads) throw new Error("blocked");
        return data.has(k) ? (data.get(k) as string) : null;
      },
      setItem: (k: string, v: string) => {
        if (state.failWrites) throw new Error("QuotaExceededError");
        data.set(k, v);
      },
      removeItem: (k: string) => {
        if (state.failRemoves) throw new Error("blocked");
        data.delete(k);
      },
      clear: () => data.clear(),
    },
  };
}

describe("storage fallback authority", () => {
  let store: ReturnType<typeof fakeStore>;

  beforeEach(() => {
    resetStorageStatusForTests();
    store = fakeStore();
    (globalThis as Record<string, unknown>).window = {
      localStorage: store.api,
      dispatchEvent: () => true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
    resetStorageStatusForTests();
  });

  it("keeps the newest value readable after a quota failure, not the stale stored one", () => {
    expect(writeLocal("bfa.journey.v1", "first")).toBe(true);
    store.state.failWrites = true;
    expect(writeLocal("bfa.journey.v1", "second")).toBe(false);
    // The in-memory value is authoritative even though getItem still works.
    expect(readLocal("bfa.journey.v1")).toBe("second");
    expect(isPersistenceAvailable()).toBe(false);
  });

  it("does not let sequential volatile mutations lose each other", () => {
    store.state.failWrites = true;
    writeLocal("bfa.journey.v1", "a");
    writeLocal("bfa.journey.v1", "b");
    expect(readLocal("bfa.journey.v1")).toBe("b");
  });

  it("tombstones a key whose removal failed, so cleared data cannot resurrect", () => {
    writeLocal("bfa.journey.v1", "kept");
    store.state.failRemoves = true;
    removeLocal("bfa.journey.v1");
    expect(readLocal("bfa.journey.v1")).toBeNull();
    // Still physically present, but it must never read back.
    expect(store.data.get("bfa.journey.v1")).toBe("kept");
  });

  it("lets a later genuine write replace a tombstoned key", () => {
    store.state.failRemoves = true;
    writeLocal("bfa.journey.v1", "old");
    removeLocal("bfa.journey.v1");
    expect(readLocal("bfa.journey.v1")).toBeNull();
    store.state.failRemoves = false;
    expect(writeLocal("bfa.journey.v1", "new")).toBe(true);
    expect(readLocal("bfa.journey.v1")).toBe("new");
  });

  it("falls back to memory when reads themselves throw", () => {
    store.state.failWrites = true;
    writeLocal("bfa.journey.v1", "volatile");
    store.state.failReads = true;
    expect(readLocal("bfa.journey.v1")).toBe("volatile");
  });
});

describe("approved therapeutic wording", () => {
  it("keeps Day 1's arrival echo purely descriptive", () => {
    const day1 = getFirstJourneyDay(1)!;
    const text = JSON.stringify(day1);
    expect(text).toContain("You arrived steadier than usual.");
    expect(text).not.toContain("more room than usual");
  });

  it("says Day 3's practice may itself be meaningful without clarity or action", () => {
    const day3 = JSON.stringify(getFirstJourneyDay(3)!);
    expect(day3).toContain(
      "may itself be meaningful; it does not have to become clarity, insight, relief, or action",
    );
  });

  it("uses the exact approved Day 10 relational closing", () => {
    expect(getFirstJourneyDay(10)!.reflection.closing).toBe(
      "Whatever you chose\u2014or left open\u2014does not have to prove progress, readiness, safety, or what comes next. Whatever you could name\u2014or could not name\u2014matters. You deserve to be met with care without having to prove that it is serious enough.",
    );
  });

  it("never claims persistence inside any day's therapeutic copy", () => {
    for (let n = 1; n <= 10; n += 1) {
      const text = JSON.stringify(getFirstJourneyDay(n)!);
      expect(text, `day ${n}`).not.toContain("saved on this device");
      expect(text, `day ${n}`).not.toContain("stored on this device");
    }
  });

  it("addresses the person directly in Day 8 and Day 9 reflections", () => {
    for (const n of [8, 9]) {
      const text = JSON.stringify(getFirstJourneyDay(n)!);
      expect(text, `day ${n}`).not.toContain(" was selected as a setting");
      expect(text, `day ${n}`).toMatch(/You named|You considered|You kept/);
    }
  });

  it("varies Day 10's procedural safeguard phrasing instead of repeating one formula", () => {
    const text = JSON.stringify(getFirstJourneyDay(10)!);
    expect(text).not.toContain("This choice does not tell us");
    expect(text).toContain("Nothing here tells us");
  });
});

describe("interface and visual foundation", () => {
  it("uses a conventional gear icon rather than a hamburger for Settings", () => {
    for (const file of ["src/routes/_shell.tsx", "src/components/JourneyScreen.tsx"]) {
      const src = read(file);
      expect(src, file).toContain("SettingsIcon");
      expect(src, file).not.toContain("MenuIcon");
      // The three-line hamburger path must be gone.
      expect(src, file).not.toContain("M4 7h16");
    }
  });

  it("sets the Resurgence IBM Plex typography and native color-scheme", () => {
    const css = read("src/styles.css");
    expect(css).toContain('"IBM Plex Serif"');
    expect(css).toContain('"IBM Plex Sans"');
    expect(css).toContain("color-scheme: light");
    expect(css).toContain("color-scheme: dark");
  });

  it("lets SplashGate own the storage notice at the top of the underlay", () => {
    const root = read("src/routes/__root.tsx");
    expect(root).not.toContain("StorageNotice");
    const gate = read("src/components/SplashGate.tsx");
    const notice = gate.indexOf("<StorageNotice suppressed={noticeSuppressed} />");
    const children = gate.indexOf("{children}");
    expect(notice).toBeGreaterThan(-1);
    expect(notice).toBeLessThan(children);
  });

  it("makes no Wix media claim in Privacy while keeping the Google Fonts disclosure", () => {
    const privacy = read("src/routes/privacy.tsx");
    expect(privacy.toLowerCase()).not.toContain("wix");
    expect(privacy).toContain("Google Fonts");
  });

  it("keeps onboarding's Begin transition deterministic rather than timed", () => {
    const onboarding = read("src/routes/onboarding.tsx");
    expect(onboarding).toContain("collapsing");
    expect(onboarding).not.toContain("setTimeout(() => {\n      navigate");
    expect(onboarding).not.toContain("250");
  });
});
