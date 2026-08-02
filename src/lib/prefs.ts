// Small, SSR-safe local preference store.
// Only low-sensitivity data: onboarding flag, spiritual toggle,
// and visited days. No journal text is ever stored.

import { useEffect, useState } from "react";

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
 */
export const LEGAL_BUNDLE_VERSION = "2026-08-02";

/**
 * Spiritual reflection is opt-in: the opening says it is offered only if the
 * person chooses it, so a fresh or cleared device starts with it off. An
 * explicitly stored true or false is always preserved.
 */
const defaults: Prefs = {
  onboarded: false,
  showSpiritual: false,
  visitedDays: [],
};

function read(): Prefs {
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Prefs> & { favourites?: unknown };
    // Drop any legacy `favourites` field silently.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { favourites: _drop, ...rest } = parsed;
    return { ...defaults, ...rest };
  } catch {
    return defaults;
  }
}

function write(next: Prefs) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("bfa-prefs-change"));
  } catch {
    /* storage may be blocked; that's fine */
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

export function resetAll() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("bfa-prefs-change"));
}
