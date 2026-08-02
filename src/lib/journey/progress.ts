// Versioned First Journey progress store.
//
// PRIVACY RULES (governing project knowledge):
//  - localStorage on this device/browser only. No accounts, no cloud, no
//    analytics, no telemetry.
//  - Low-sensitivity structured answer IDs only. Raw sensitive free text is
//    NEVER written here; optional notes stay in sessionStorage (see
//    src/lib/session-state.ts) until the later redesign.
//  - Nothing is ever placed in a URL or logged.
//  - A generated deterministic reflection is stored only so a person can
//    resume the screen they were on.

import { useCallback, useEffect, useState } from "react";
import { migrateAnswersToStableIds } from "./answer-migration";

export const JOURNEY_STORAGE_KEY = "bfa.journey.v1";
/** v2 stores each option's stable id instead of its position. */
export const JOURNEY_STORE_VERSION = 2;

/** Legacy low-sensitivity preference store (visited days only). */
const LEGACY_PREFS_KEY = "bfa.v1";

/** Every local/session key this app owns, for a complete, scoped clear. */
export const APP_OWNED_LOCAL_KEYS = [JOURNEY_STORAGE_KEY, LEGACY_PREFS_KEY] as const;
export const APP_OWNED_SESSION_KEYS = ["bfa_splash_shown_v1"] as const;
export const APP_OWNED_KEY_PREFIXES = ["bfa.session.", "bfa."] as const;


const MAX_ANSWER_ID_LENGTH = 64;
const MAX_ANSWERS_PER_DAY = 40;
const MAX_REFLECTION_LENGTH = 4000;

export interface JourneyLocator {
  /** e.g. "day-04" */
  dayId: string;
  /** Screen or step key within that day, e.g. "notice". */
  step: string;
  /** Optional numeric step index, when the day flow uses one. */
  index?: number;
}

export interface JourneyProgress {
  version: number;
  /** Where the person was last, for "Continue where you left off". */
  locator: JourneyLocator | null;
  /** dayId → structured answer IDs chosen that day. */
  answers: Record<string, string[]>;
  /** dayIds genuinely finished. Never set merely by opening a day or Home. */
  completedDays: string[];
  /** dayId → deterministic personalized reflection text, for resume only. */
  reflections: Record<string, string>;
  /**
   * dayId → fingerprint of the coded selections the saved reflection was built
   * from, so a saved response is only restored when it still belongs to those
   * exact answers. Coded option IDs only; never labels or typed text.
   */
  reflectionSnapshots: Record<string, string>;
  /**
   * dayId → highest in-day screen index genuinely reached. Used only to stop a
   * crafted URL from opening (or completing) a screen nobody walked to.
   */
  reached: Record<string, number>;
  updatedAt: string | null;
}

export const emptyProgress: JourneyProgress = {
  version: JOURNEY_STORE_VERSION,
  locator: null,
  answers: {},
  completedDays: [],
  reflections: {},
  reflectionSnapshots: {},
  reached: {},
  updatedAt: null,
};

function isSafeId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ANSWER_ID_LENGTH &&
    /^[A-Za-z0-9._:-]+$/.test(value)
  );
}

function sanitizeLocator(raw: unknown): JourneyLocator | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isSafeId(r.dayId) || !isSafeId(r.step)) return null;
  const index =
    typeof r.index === "number" && Number.isInteger(r.index) && r.index >= 0
      ? r.index
      : undefined;
  return index === undefined
    ? { dayId: r.dayId, step: r.step }
    : { dayId: r.dayId, step: r.step, index };
}

function sanitizeAnswers(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string[]> = {};
  for (const [dayId, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!isSafeId(dayId) || !Array.isArray(list)) continue;
    const ids = list.filter(isSafeId).slice(0, MAX_ANSWERS_PER_DAY);
    if (ids.length > 0) out[dayId] = ids;
  }
  return out;
}

function sanitizeReflections(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [dayId, text] of Object.entries(raw as Record<string, unknown>)) {
    if (!isSafeId(dayId) || typeof text !== "string") continue;
    const trimmed = text.slice(0, MAX_REFLECTION_LENGTH);
    if (trimmed.length > 0) out[dayId] = trimmed;
  }
  return out;
}

const MAX_SNAPSHOT_LENGTH = 1024;

/** Coded selection fingerprints only: ids, separators and nothing else. */
function sanitizeSnapshots(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [dayId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isSafeId(dayId) || typeof value !== "string") continue;
    if (value.length === 0 || value.length > MAX_SNAPSHOT_LENGTH) continue;
    if (!/^[A-Za-z0-9._:|-]+$/.test(value)) continue;
    out[dayId] = value;
  }
  return out;
}

function sanitizeReached(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [dayId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isSafeId(dayId)) continue;
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) continue;
    out[dayId] = Math.min(value, 64);
  }
  return out;
}

/**
 * Parse the earlier `bfa.v1` visited-day markers. Kept for reference only.
 *
 * "Visited" was never proof that a day was finished, so this is deliberately
 * NOT used to create completion markers anywhere.
 */
export function migrateLegacyVisitedDays(rawLegacy: string | null): string[] {
  if (!rawLegacy) return [];
  try {
    const parsed = JSON.parse(rawLegacy) as { visitedDays?: unknown };
    if (!Array.isArray(parsed.visitedDays)) return [];
    return parsed.visitedDays
      .filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n > 0)
      .map((n) => `day-${String(n).padStart(2, "0")}`);
  } catch {
    return [];
  }
}

export function normalizeProgress(raw: unknown): JourneyProgress {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const completed = Array.isArray(r.completedDays) ? r.completedDays.filter(isSafeId) : [];
  return {
    version: JOURNEY_STORE_VERSION,
    locator: sanitizeLocator(r.locator),
    answers: sanitizeAnswers(r.answers),
    completedDays: Array.from(new Set(completed)),
    reflections: sanitizeReflections(r.reflections),
    reflectionSnapshots: sanitizeSnapshots(r.reflectionSnapshots),
    reached: sanitizeReached(r.reached),
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : null,
  };
}

/**
 * One-time store upgrade. Positional answer tokens become stable option ids.
 *
 * Days a person genuinely finished in this store are PRESERVED: they were
 * recorded by this app's own completion path and deleting them would silently
 * take real work away. Only the separate legacy `bfa.v1` visited-day markers are
 * never promoted to completion, because "visited" was never proof of finishing
 * (see ./answer-migration.ts). Locator, answers and saved reflections are kept.
 */
export function upgradeStoredProgress(raw: unknown): {
  progress: JourneyProgress;
  changed: boolean;
} {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const storedVersion = typeof r.version === "number" ? r.version : 1;
  const normalized = normalizeProgress(raw);
  if (!raw || storedVersion >= JOURNEY_STORE_VERSION) {
    return { progress: normalized, changed: false };
  }
  return {
    progress: {
      ...normalized,
      answers: migrateAnswersToStableIds(normalized.answers),
    },
    changed: true,
  };
}

export const JOURNEY_CHANGE_EVENT = "bfa-journey-change";

export function readProgress(): JourneyProgress {
  if (typeof window === "undefined") return emptyProgress;
  try {
    const raw = window.localStorage.getItem(JOURNEY_STORAGE_KEY);
    const { progress, changed } = upgradeStoredProgress(raw ? JSON.parse(raw) : null);
    if (changed) {
      try {
        window.localStorage.setItem(
          JOURNEY_STORAGE_KEY,
          JSON.stringify({ ...progress, updatedAt: new Date().toISOString() }),
        );
      } catch {
        /* storage may be unavailable; the migrated view still applies */
      }
    }
    return progress;
  } catch {
    return emptyProgress;
  }
}


function write(next: JourneyProgress) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      JOURNEY_STORAGE_KEY,
      JSON.stringify({ ...next, updatedAt: new Date().toISOString() }),
    );
    window.dispatchEvent(new CustomEvent(JOURNEY_CHANGE_EVENT));
  } catch {
    /* storage may be unavailable; the journey still works for this visit */
  }
}

function mutate(fn: (cur: JourneyProgress) => JourneyProgress) {
  write(fn(readProgress()));
}

/** Quiet autosave of the exact screen a person is on. Never completes a day. */
export function saveLocator(locator: JourneyLocator) {
  const clean = sanitizeLocator(locator);
  if (!clean) return;
  mutate((cur) => ({ ...cur, locator: clean }));
}

export function clearLocator() {
  mutate((cur) => ({ ...cur, locator: null }));
}

/** Replace the structured answer IDs recorded for a day. */
export function saveDayAnswers(dayId: string, answerIds: string[]) {
  if (!isSafeId(dayId)) return;
  const ids = answerIds.filter(isSafeId).slice(0, MAX_ANSWERS_PER_DAY);
  mutate((cur) => ({ ...cur, answers: { ...cur.answers, [dayId]: ids } }));
}

/**
 * Save the exact deterministic reflection a person read, together with a
 * fingerprint of the coded selections it was assembled from, so it can be
 * restored later only when it still belongs to those same answers.
 */
export function saveDayReflection(dayId: string, text: string, snapshot?: string) {
  if (!isSafeId(dayId) || typeof text !== "string" || text.trim().length === 0) return;
  const clean =
    typeof snapshot === "string" &&
    snapshot.length > 0 &&
    snapshot.length <= MAX_SNAPSHOT_LENGTH &&
    /^[A-Za-z0-9._:|-]+$/.test(snapshot)
      ? snapshot
      : undefined;
  mutate((cur) => ({
    ...cur,
    reflections: { ...cur.reflections, [dayId]: text.slice(0, MAX_REFLECTION_LENGTH) },
    reflectionSnapshots: clean
      ? { ...cur.reflectionSnapshots, [dayId]: clean }
      : cur.reflectionSnapshots,
  }));
}

/**
 * Record the furthest in-day screen genuinely reached. This is the only proof
 * that a reflection or Close screen was walked to rather than typed into the
 * address bar. It never marks a day complete.
 */
export function saveReached(dayId: string, index: number) {
  if (!isSafeId(dayId) || !Number.isInteger(index) || index <= 0) return;
  mutate((cur) =>
    (cur.reached[dayId] ?? 0) >= index
      ? cur
      : { ...cur, reached: { ...cur.reached, [dayId]: Math.min(index, 64) } },
  );
}

/** Only a genuine end-of-day action may call this. */
export function markDayComplete(dayId: string) {
  if (!isSafeId(dayId)) return;
  mutate((cur) =>
    cur.completedDays.includes(dayId)
      ? cur
      : { ...cur, completedDays: [...cur.completedDays, dayId] },
  );
}

export function isDayComplete(progress: JourneyProgress, dayId: string): boolean {
  return progress.completedDays.includes(dayId);
}

/**
 * A resume card is only meaningful when there is somewhere real to return to:
 * a saved locator for a day that is not already finished, and either some
 * movement past the opening screen or at least one recorded answer.
 */
export function hasMeaningfulProgress(
  progress: JourneyProgress,
  firstStepKey = "arrive",
): boolean {
  const loc = progress.locator;
  if (!loc) return false;
  if (progress.completedDays.includes(loc.dayId)) return false;
  if (loc.step !== firstStepKey) return true;
  if ((loc.index ?? 0) > 0) return true;
  return (progress.answers[loc.dayId]?.length ?? 0) > 0;
}

/** Keys this app owns in a given store, resolved defensively. */
function appOwnedKeys(store: {
  length?: number;
  key?: (i: number) => string | null;
}): string[] {
  const out: string[] = [];
  const len = typeof store.length === "number" ? store.length : 0;
  if (typeof store.key !== "function") return out;
  for (let i = 0; i < len; i += 1) {
    const k = store.key(i);
    if (!k) continue;
    if (APP_OWNED_KEY_PREFIXES.some((p) => k.startsWith(p)) || k.startsWith("bfa_")) {
      out.push(k);
    }
  }
  return out;
}

/**
 * Explicit, confirmed clear of every Beauty from Ashes-owned item on this
 * device and browser: preferences and legal acceptance, the journey locator,
 * stable and legacy structured selections, saved deterministic reflections,
 * completion markers, legacy weekly-session state and the launch-screen
 * session marker. Nothing else in the browser is touched.
 */
export function clearJourney() {
  if (typeof window === "undefined") return;

  const removeAll = (store: Storage | undefined, extra: readonly string[]) => {
    if (!store) return;
    const keys = new Set<string>([...extra, ...appOwnedKeys(store)]);
    for (const k of keys) {
      try {
        store.removeItem(k);
      } catch {
        /* ignore individual failures */
      }
    }
  };

  try {
    removeAll(window.localStorage, [...APP_OWNED_LOCAL_KEYS, ...APP_OWNED_SESSION_KEYS]);
  } catch {
    /* ignore */
  }
  try {
    removeAll(window.sessionStorage, [...APP_OWNED_SESSION_KEYS, ...APP_OWNED_LOCAL_KEYS]);
  } catch {
    /* ignore */
  }

  try {
    window.dispatchEvent(new CustomEvent(JOURNEY_CHANGE_EVENT));
    window.dispatchEvent(new CustomEvent("bfa-prefs-change"));
  } catch {
    /* ignore */
  }
}


/** SSR-safe subscription hook. Every future day can autosave through this. */
export function useJourneyProgress(): {
  progress: JourneyProgress;
  hydrated: boolean;
  saveLocator: (locator: JourneyLocator) => void;
  saveAnswers: (dayId: string, ids: string[]) => void;
  complete: (dayId: string) => void;
} {
  const [progress, setProgress] = useState<JourneyProgress>(emptyProgress);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const sync = () => setProgress(readProgress());
    sync();
    setHydrated(true);
    window.addEventListener(JOURNEY_CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(JOURNEY_CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return {
    progress,
    hydrated,
    saveLocator: useCallback((locator: JourneyLocator) => saveLocator(locator), []),
    saveAnswers: useCallback((dayId: string, ids: string[]) => saveDayAnswers(dayId, ids), []),
    complete: useCallback((dayId: string) => markDayComplete(dayId), []),
  };
}
