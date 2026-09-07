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

import { getFirstJourneyDay } from "@/content/first-journey";
import { dayIdFor } from "@/content/journey";
import { screenKey, screensFor } from "@/content/journey-types";
import type { AnswerMeaningVersion, JourneyDayContent } from "@/content/journey-types";
import {
  beginClearAttempt,
  noteClearFailure,
  readLocal,
  removeLocal,
  removeLocalConfirmed,
  writeLocal,
} from "@/lib/storage-status";

import { ENTITLEMENT_EVENT, ENTITLEMENT_STORAGE_KEY } from "./entitlement";
import { REMINDER_EVENT, REMINDER_STORAGE_KEY } from "./reminder";

import {
  MAX_MEANING_VERSIONS_PER_DAY,
  isSafeMeaningVersion,
  preV4MeaningVersion,
} from "./answer-meaning";
import { migrateAnswersToStableIds } from "./answer-migration";


export const JOURNEY_STORAGE_KEY = "bfa.journey.v1";
/**
 * v2 stores each option's stable id instead of its position.
 * v3 additionally guarantees a trusted `reached` high-water screen, derived
 * conservatively for older stores so a legitimate mid-day resume is not lost.
 * v4 records coded selections per ANSWER MEANING VERSION (`answerSets`), so a
 * later revision of a day's questions can never re-interpret older choices. The
 * storage KEY is unchanged, and the flat `answers` map is retained as a frozen
 * v1 compatibility/rollback mirror.
 */
export const JOURNEY_STORE_VERSION = 4;



/** Legacy low-sensitivity preference store (visited days only). */
const LEGACY_PREFS_KEY = "bfa.v1";

/** Every local/session key this app owns, for a complete, scoped clear. */
export const APP_OWNED_LOCAL_KEYS = [JOURNEY_STORAGE_KEY, LEGACY_PREFS_KEY] as const;
export const APP_OWNED_SESSION_KEYS = ["bfa_splash_shown_v1"] as const;
export const APP_OWNED_KEY_PREFIXES = ["bfa.session.", "bfa."] as const;


const MAX_ANSWER_ID_LENGTH = 64;
const MAX_ANSWERS_PER_DAY = 40;
/**
 * Bounded generously above the largest reflection any of the ten days can
 * produce with every option selected (measured maximum ≈ 5.4k characters), so a
 * fully answered day can never be truncated. Still local-only and bounded.
 */
const MAX_REFLECTION_LENGTH = 12000;


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
  /**
   * FROZEN v1 compatibility/rollback mirror: dayId → structured answer IDs.
   * Only upgrade and compatibility code may read this. Every app surface reads
   * `answerSets` through the version-aware helpers below.
   */
  answers: Record<string, string[]>;
  /**
   * dayId → answer meaning version → the coded selections made under that
   * meaning. An explicitly present empty array is meaningful: it records that
   * the current meaning has been adopted with nothing yet chosen.
   */
  answerSets: Record<string, Record<string, string[]>>;
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
  answerSets: {},
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

/**
 * Versioned coded selections. Rules:
 *  - only bounded, safe meaning-version identifiers survive;
 *  - only an actual array survives, so a malformed or corrupt value can never
 *    become the current set implicitly;
 *  - an explicitly present EMPTY array is preserved, because it is the
 *    acknowledgment marker that the current meaning was adopted;
 *  - at most eight versions per day, and the existing coded-token cap per set.
 */
function sanitizeAnswerSets(raw: unknown): Record<string, Record<string, string[]>> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, Record<string, string[]>> = {};
  for (const [dayId, versions] of Object.entries(raw as Record<string, unknown>)) {
    if (!isSafeId(dayId)) continue;
    if (!versions || typeof versions !== "object" || Array.isArray(versions)) continue;
    const byVersion: Record<string, string[]> = {};
    for (const [version, list] of Object.entries(versions as Record<string, unknown>)) {
      if (!isSafeMeaningVersion(version) || !Array.isArray(list)) continue;
      if (Object.keys(byVersion).length >= MAX_MEANING_VERSIONS_PER_DAY) break;
      byVersion[version] = list.filter(isSafeId).slice(0, MAX_ANSWERS_PER_DAY);
    }
    if (Object.keys(byVersion).length > 0) out[dayId] = byVersion;
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
    answerSets: sanitizeAnswerSets(r.answerSets),

    completedDays: Array.from(new Set(completed)),
    reflections: sanitizeReflections(r.reflections),
    reflectionSnapshots: sanitizeSnapshots(r.reflectionSnapshots),
    reached: sanitizeReached(r.reached),
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : null,
  };
}

/**
 * Derive a conservative trusted high-water screen for a store written before
 * `reached` existed, using only a validated same-day locator.
 *
 * Every one of these must hold or nothing is conferred:
 *  - the locator names a real First Journey day;
 *  - its index is inside that day's real screen list;
 *  - its step EXACTLY equals the canonical screen key at that index.
 *
 * Then, conservatively:
 *  - a Reflection locator confers Reflection only when a genuine saved
 *    reflection for that day exists; otherwise it is capped strictly below it;
 *  - an uncompleted Close locator may confer Reflection only when a genuine
 *    saved reflection exists; otherwise it is capped strictly below Reflection;
 *  - a completed, exactly valid Close may remain trusted.
 *
 * Nothing here ever infers completion, and an existing higher `reached` value is
 * never lowered.
 */
export function deriveReachedFromLocator(p: JourneyProgress): Record<string, number> {
  const loc = p.locator;
  if (!loc) return p.reached;
  const idx = loc.index;
  if (typeof idx !== "number" || !Number.isInteger(idx) || idx <= 0) return p.reached;

  const dayMatch = /^day-(\d{2})$/.exec(loc.dayId);
  if (!dayMatch) return p.reached;
  const day = getFirstJourneyDay(Number(dayMatch[1]));
  if (!day) return p.reached;
  const keys = screensFor(day).map(screenKey);
  if (idx >= keys.length) return p.reached;
  // The saved step must be exactly the canonical key at that index. A stale or
  // crafted mismatch confers nothing at all.
  if (loc.step !== keys[idx]) return p.reached;

  const closeIdx = keys.length - 1;
  const reflectionIdx = keys.indexOf("reflection");
  const completed = p.completedDays.includes(loc.dayId);
  const saved = p.reflections[loc.dayId];
  const hasReflection = typeof saved === "string" && saved.length > 0;

  let derived = idx;
  if (loc.step === "close") {
    // An unfinished Close never makes Close itself trusted and never implies
    // completion. It may only reach back to Reflection when a genuine saved
    // reflection supports it; otherwise it stays strictly below Reflection.
    if (completed) derived = closeIdx;
    else if (reflectionIdx < 0) derived = 0;
    else derived = hasReflection ? reflectionIdx : reflectionIdx - 1;
  } else if (loc.step === "reflection") {
    derived = hasReflection ? idx : idx - 1;
  }

  const existing = p.reached[loc.dayId] ?? 0;
  if (derived <= existing || derived <= 0) return p.reached;
  return { ...p.reached, [loc.dayId]: Math.min(derived, 64) };
}


/**
 * One-time store upgrade. Positional answer tokens become stable option ids
 * (v1 → v2), and a conservative trusted `reached` value is derived from a
 * validated locator for stores written before it existed (→ v3).
 *
 * Days a person genuinely finished in this store are PRESERVED: they were
 * recorded by this app's own completion path and deleting them would silently
 * take real work away. Only the separate legacy `bfa.v1` visited-day markers are
 * never promoted to completion, because "visited" was never proof of finishing
 * (see ./answer-migration.ts). Locator, answers, saved reflections, snapshots
 * and any existing `reached` values are kept.
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
  // a) positional v1 tokens become stable option ids.
  const withAnswers: JourneyProgress =
    storedVersion < 2
      ? { ...normalized, answers: migrateAnswersToStableIds(normalized.answers) }
      : normalized;
  // b) `reached` is derived exactly as before.
  const withReached: JourneyProgress = {
    ...withAnswers,
    reached: deriveReachedFromLocator(withAnswers),
  };
  // c) every pre-v4 active answers entry is copied into the meaning version it
  //    actually carried, taken from the FROZEN map — never from current content.
  // d) the migrated legacy `answers` mirror is kept untouched.
  const answerSets =
    storedVersion < 4 ? seedPreV4AnswerSets(withReached) : withReached.answerSets;
  // e) the store is now version 4.
  return {
    progress: { ...withReached, answerSets },
    changed: true,
  };
}

/**
 * Copy pre-v4 selections into `answerSets` under their FROZEN meaning version.
 * An existing set for that version always wins, so this is idempotent, and an
 * unrecognised day id confers nothing at all.
 */
function seedPreV4AnswerSets(p: JourneyProgress): Record<string, Record<string, string[]>> {
  const out: Record<string, Record<string, string[]>> = { ...p.answerSets };
  for (const [dayId, tokens] of Object.entries(p.answers)) {
    const version = preV4MeaningVersion(dayId);
    if (!version) continue;
    const existing = out[dayId] ?? {};
    if (Object.prototype.hasOwnProperty.call(existing, version)) continue;
    out[dayId] = { ...existing, [version]: [...tokens] };
  }
  return out;
}



export const JOURNEY_CHANGE_EVENT = "bfa-journey-change";

export function readProgress(): JourneyProgress {
  if (typeof window === "undefined") return emptyProgress;
  try {
    const raw = readLocal(JOURNEY_STORAGE_KEY);
    const { progress, changed } = upgradeStoredProgress(raw ? JSON.parse(raw) : null);
    if (changed) {
      writeLocal(
        JOURNEY_STORAGE_KEY,
        JSON.stringify({ ...progress, updatedAt: new Date().toISOString() }),
      );
    }
    return progress;
  } catch {
    return emptyProgress;
  }
}


function write(next: JourneyProgress) {
  if (typeof window === "undefined") return;
  // The in-memory fallback keeps this tab working when persistence fails; the
  // change notification is dispatched either way so the UI stays coherent.
  writeLocal(JOURNEY_STORAGE_KEY, JSON.stringify({ ...next, updatedAt: new Date().toISOString() }));
  try {
    window.dispatchEvent(new CustomEvent(JOURNEY_CHANGE_EVENT));
  } catch {
    /* ignore */
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

/**
 * Either a day's own content (preferred) or an explicit meaning-version
 * context. A bare day id is deliberately NOT accepted: writing coded answers
 * without naming their meaning is what this pass exists to prevent.
 */
export type AnswerMeaningTarget =
  | JourneyDayContent
  | { dayId: string; meaningVersion: AnswerMeaningVersion };

function resolveTarget(
  target: AnswerMeaningTarget,
): { dayId: string; version: AnswerMeaningVersion } | null {
  if (typeof (target as JourneyDayContent).day === "number") {
    const day = target as JourneyDayContent;
    if (!isSafeMeaningVersion(day.answerMeaningVersion)) return null;
    return { dayId: dayIdFor(day.day), version: day.answerMeaningVersion };
  }
  const ctx = target as { dayId: string; meaningVersion: AnswerMeaningVersion };
  if (!isSafeId(ctx.dayId) || !isSafeMeaningVersion(ctx.meaningVersion)) return null;
  return { dayId: ctx.dayId, version: ctx.meaningVersion };
}

/** Keep at most eight meanings for one day, never dropping the current one. */
function boundVersions(
  sets: Record<string, string[]>,
  keep: AnswerMeaningVersion,
): Record<string, string[]> {
  const keys = Object.keys(sets);
  if (keys.length <= MAX_MEANING_VERSIONS_PER_DAY) return sets;
  const ordered = [keep, ...keys.filter((k) => k !== keep)].slice(
    0,
    MAX_MEANING_VERSIONS_PER_DAY,
  );
  const out: Record<string, string[]> = {};
  for (const k of ordered) out[k] = sets[k]!;
  return out;
}

/** The coded selections for a day under its CURRENT answer meaning only. */
export function answersForDay(
  progress: JourneyProgress,
  day: JourneyDayContent,
): string[] {
  return progress.answerSets?.[dayIdFor(day.day)]?.[day.answerMeaningVersion] ?? [];
}

/**
 * True only when this day's questions have been revised since the person
 * answered: there is no property at all for the current meaning, and at least
 * one older meaning holds real selections.
 */
export function hasPendingAnswerMeaningRevision(
  progress: JourneyProgress,
  day: JourneyDayContent,
): boolean {
  const sets = progress.answerSets?.[dayIdFor(day.day)];
  if (!sets) return false;
  if (Object.prototype.hasOwnProperty.call(sets, day.answerMeaningVersion)) return false;
  return Object.entries(sets).some(
    ([version, ids]) => version !== day.answerMeaningVersion && ids.length > 0,
  );
}

/**
 * Acknowledge a revised day: create the current meaning's set as explicitly
 * empty. Older sets and the legacy mirror are left exactly as they are.
 */
export function adoptCurrentAnswerMeaning(day: JourneyDayContent) {
  const t = resolveTarget(day);
  if (!t) return;
  mutate((cur) => {
    const sets = cur.answerSets[t.dayId] ?? {};
    if (Object.prototype.hasOwnProperty.call(sets, t.version)) return cur;
    return {
      ...cur,
      answerSets: {
        ...cur.answerSets,
        [t.dayId]: boundVersions({ ...sets, [t.version]: [] }, t.version),
      },
    };
  });
}

/**
 * Replace the structured answer IDs recorded for a day, under that day's
 * current answer meaning only. Older meanings are never merged or overwritten.
 * The flat legacy mirror is written only while the meaning is still v1.
 */
export function saveDayAnswers(target: AnswerMeaningTarget, answerIds: string[]) {
  const t = resolveTarget(target);
  if (!t) return;
  const ids = answerIds.filter(isSafeId).slice(0, MAX_ANSWERS_PER_DAY);
  mutate((cur) => ({
    ...cur,
    answerSets: {
      ...cur.answerSets,
      [t.dayId]: boundVersions(
        { ...(cur.answerSets[t.dayId] ?? {}), [t.version]: ids },
        t.version,
      ),
    },
    answers: t.version === "v1" ? { ...cur.answers, [t.dayId]: ids } : cur.answers,
  }));
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
 * a saved locator with either some movement past the opening screen or at least
 * one recorded answer.
 *
 * A finished day still counts when the saved place is genuinely mid-day, so
 * someone who re-opened a completed day and stopped part-way is returned to
 * exactly where they were. A finished day whose saved place is its own closing
 * screen is not a resume: there is nothing left to return to.
 */
export function hasMeaningfulProgress(
  progress: JourneyProgress,
  firstStepKey = "arrive",
  lastStepKey = "close",
): boolean {
  const loc = progress.locator;
  if (!loc) return false;
  const completed = progress.completedDays.includes(loc.dayId);
  // A finished day reopened at its very beginning, or sitting on its own close,
  // is not a place to resume — retained answers from that day do not change it.
  if (completed && (loc.step === lastStepKey || loc.step === firstStepKey)) return false;
  if (loc.step !== firstStepKey) return true;
  if ((loc.index ?? 0) > 0) return true;
  return currentAnswersForDayId(progress, loc.dayId).length > 0;
}

/**
 * Current-meaning selections for a stored day id. Canonical days resolve their
 * meaning from content; anything unrecognised falls back to the frozen legacy
 * mirror, which is compatibility code and the only reader permitted to do so.
 */
function currentAnswersForDayId(progress: JourneyProgress, dayId: string): string[] {
  const m = /^day-(\d{2,})$/.exec(dayId);
  const day = m ? getFirstJourneyDay(Number(m[1])) : undefined;
  if (day) return answersForDay(progress, day);
  return progress.answers?.[dayId] ?? [];
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
 * completion markers, legacy weekly-session state, the launch-screen session
 * marker, the pilot continuation marker and the reminder choice. Nothing else in
 * the browser is touched, and the private pilot cookie is not involved.
 *
 * HONESTY RULE: the outcome of THIS clear is tracked separately from the sticky
 * saving-availability state, and confirmation is taken from the persistent
 * stores rather than from the in-tab tombstones, which are designed to make a
 * refused removal read as absent. If any access, enumeration, removal or
 * confirmation step fails, the person is told plainly. Only presence or absence
 * of app-owned keys is inspected — never their contents.
 */
export function clearJourney() {
  if (typeof window === "undefined") return;

  beginClearAttempt();

  const discover = (store: Storage): string[] => {
    try {
      return appOwnedKeys(store);
    } catch {
      // Enumeration may throw in a locked-down browser. The named keys below
      // still go, but this clear can no longer be called complete.
      noteClearFailure();
      return [];
    }
  };

  // Every key this app owns by name, so a failed enumeration can never leave
  // the pilot continuation marker or the reminder choice behind silently.
  const named = [
    ...APP_OWNED_LOCAL_KEYS,
    ...APP_OWNED_SESSION_KEYS,
    ENTITLEMENT_STORAGE_KEY,
    REMINDER_STORAGE_KEY,
  ];

  // localStorage removals go through the shared layer, so a removal the browser
  // refuses is still tombstoned for this visit AND reported as unconfirmed.
  try {
    const store = window.localStorage;
    const keys = new Set<string>([...named, ...discover(store)]);
    for (const k of keys) {
      if (!removeLocalConfirmed(k)) noteClearFailure();
    }
  } catch {
    // The store itself is unreachable: nothing can be confirmed removed.
    for (const k of named) removeLocal(k);
    noteClearFailure();
  }

  try {
    const store = window.sessionStorage;
    const keys = new Set<string>([...named, ...discover(store)]);
    for (const k of keys) {
      try {
        store.removeItem(k);
        if (store.getItem(k) !== null) noteClearFailure();
      } catch {
        noteClearFailure();
      }
    }
  } catch {
    noteClearFailure();
  }

  // Every subscriber is notified from here, so the caller never needs a second
  // round of removals that could mask a partial failure: entitlement relocks,
  // the reminder cancels, preferences and progress reset.
  for (const event of [
    JOURNEY_CHANGE_EVENT,
    "bfa-prefs-change",
    ENTITLEMENT_EVENT,
    REMINDER_EVENT,
  ]) {
    try {
      window.dispatchEvent(new CustomEvent(event));
    } catch {
      /* ignore */
    }
  }
}



/** SSR-safe subscription hook. Every future day can autosave through this. */
export function useJourneyProgress(): {
  progress: JourneyProgress;
  hydrated: boolean;
  saveLocator: (locator: JourneyLocator) => void;
  saveAnswers: (target: AnswerMeaningTarget, ids: string[]) => void;
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
    saveAnswers: useCallback(
      (target: AnswerMeaningTarget, ids: string[]) => saveDayAnswers(target, ids),
      [],
    ),

    complete: useCallback((dayId: string) => markDayComplete(dayId), []),
  };
}
