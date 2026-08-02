// Small, SSR-safe local preference store.
// Only low-sensitivity data: onboarding flag, spiritual toggle,
// and visited days. No journal text is ever stored.

import { useEffect, useState } from "react";

import { readLocal, removeLocal, writeLocal } from "@/lib/storage-status";

const STORAGE_KEY = "bfa.v1";

export interface LegalAcceptance {
  /** Version identifier for the Terms + Privacy + Important Information bundle
   *  in force at the moment the user accepted. Bump when wording changes. */
  version: string;
  /** ISO timestamp of acceptance. No other content is stored. */
  acceptedAt: string;
}

export interface Prefs {
  onboarded: boolean;
  showSpiritual: boolean;
  visitedDays: number[];
  legalAcceptance?: LegalAcceptance;
}

/**
 * Current legal-bundle version. Increment when Terms of Use, Privacy Notice,
 * or Important Information wording is materially changed and re-acknowledgement
 * is required. Bumped to 2026-08-02 because the Privacy Notice wording changed
 * materially, so a previously recorded agreement is asked for again. Founder
 * note: final wording pending Ontario lawyer review before public launch.
 * Bumped to 2026-08-02.2 because Important Information changed materially
 * (crisis actions and overwhelmed-state guidance).
 */
export const LEGAL_BUNDLE_VERSION = "2026-08-02.2";

/**
 * Spiritual reflection is opt-in: the opening says it is offered only if the
 * person chooses it, so a fresh or cleared device starts with it off. An
 * explicitly stored true or false is always preserved.
 */
export const PREF_DEFAULTS: Prefs = {
  onboarded: false,
  showSpiritual: false,
  visitedDays: [],
};

const defaults: Prefs = PREF_DEFAULTS;

/** Read the stored preferences, applying defaults for anything absent. */
export function readPrefs(): Prefs {
  return read();
}

/** Whole positive integers only, deduplicated and bounded. */
function sanitizeVisitedDays(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const value of raw) {
    if (typeof value !== "number" || !Number.isInteger(value)) continue;
    if (value <= 0 || value > 3650) continue;
    if (!out.includes(value)) out.push(value);
    if (out.length >= 400) break;
  }
  return out;
}

function sanitizeLegalAcceptance(raw: unknown): LegalAcceptance | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const version = typeof r.version === "string" ? r.version.slice(0, 64) : "";
  const acceptedAt = typeof r.acceptedAt === "string" ? r.acceptedAt.slice(0, 64) : "";
  if (version.length === 0 || acceptedAt.length === 0) return undefined;
  return { version, acceptedAt };
}

/**
 * Fail-safe field-by-field validation. Arbitrary parsed JSON is never spread
 * over the defaults, so a corrupt, hostile or legacy store cannot turn an
 * opt-in preference on: ONLY a literal `true` enables `showSpiritual`. The
 * string "false", the string "true", numbers, null, arrays, objects and unknown
 * keys are all discarded. Any legacy field (such as `favourites`) is dropped by
 * simply never being read.
 */
export function sanitizePrefs(raw: unknown): Prefs {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...defaults };
  const r = raw as Record<string, unknown>;
  const next: Prefs = {
    onboarded: r.onboarded === true,
    showSpiritual: r.showSpiritual === true,
    visitedDays: sanitizeVisitedDays(r.visitedDays),
  };
  const acceptance = sanitizeLegalAcceptance(r.legalAcceptance);
  if (acceptance) next.legalAcceptance = acceptance;
  return next;
}

function read(): Prefs {
  if (typeof window === "undefined") return defaults;
  try {
    const raw = readLocal(STORAGE_KEY);
    if (!raw) return defaults;
    return sanitizePrefs(JSON.parse(raw));
  } catch {
    return defaults;
  }
}


function write(next: Prefs) {
  if (typeof window === "undefined") return;
  // The in-memory fallback keeps this tab coherent when persistence fails, and
  // the normal change notification is dispatched either way.
  writeLocal(STORAGE_KEY, JSON.stringify(next));
  try {
    window.dispatchEvent(new CustomEvent("bfa-prefs-change"));
  } catch {
    /* ignore */
  }
}

export function usePrefs(): [Prefs, (patch: Partial<Prefs>) => void, boolean] {
  const [prefs, setPrefs] = useState<Prefs>(defaults);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPrefs(read());
    setHydrated(true);
    const onChange = () => setPrefs(read());
    window.addEventListener("bfa-prefs-change", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("bfa-prefs-change", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const update = (patch: Partial<Prefs>) => {
    const next = { ...read(), ...patch };
    write(next);
    setPrefs(next);
  };

  return [prefs, update, hydrated];
}

export function markDayVisited(day: number) {
  const cur = read();
  if (!cur.visitedDays.includes(day)) {
    write({ ...cur, visitedDays: [...cur.visitedDays, day] });
  }
}

/** Idempotent and nonthrowing, even when removal itself throws. */
export function resetAll() {
  if (typeof window === "undefined") return;
  removeLocal(STORAGE_KEY);
  try {
    window.dispatchEvent(new CustomEvent("bfa-prefs-change"));
  } catch {
    /* ignore */
  }
}
