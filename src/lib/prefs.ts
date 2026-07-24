// Small, SSR-safe local preference store.
// Only low-sensitivity data: onboarding flag, spiritual toggle,
// visited days and favourites. No journal text is ever stored.

import { useEffect, useState } from "react";

const STORAGE_KEY = "bfa.v1";

export interface Prefs {
  onboarded: boolean;
  showSpiritual: boolean;
  visitedDays: number[];
  favourites: string[]; // day-N or practice-<id>
}

const defaults: Prefs = {
  onboarded: false,
  showSpiritual: true,
  visitedDays: [],
  favourites: [],
};

function read(): Prefs {
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...(JSON.parse(raw) as Partial<Prefs>) };
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

export function toggleFavourite(key: string) {
  const cur = read();
  const has = cur.favourites.includes(key);
  write({
    ...cur,
    favourites: has ? cur.favourites.filter((k) => k !== key) : [...cur.favourites, key],
  });
}

export function resetAll() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("bfa-prefs-change"));
}
