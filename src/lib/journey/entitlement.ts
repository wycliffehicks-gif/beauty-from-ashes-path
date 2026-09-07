// Local, monetisation-ready entitlement for The First Journey.
//
// WHY A SEPARATE STORE
//  - The journey progress store (v4) holds therapeutic content and has a
//    frozen migration contract. Access is a commercial concern, not a
//    therapeutic one, so it lives in its own small key and can never corrupt
//    answers, reflections or completion.
//
// PILOT BEHAVIOUR
//  - No payment provider is involved. In pilot mode the boundary explains what
//    it will be later, and unlocking is granted immediately and locally.
//  - Nothing is sent anywhere. Nothing is verified. This is deliberately a
//    copy-and-flow rehearsal, not commerce.

import { useEffect, useState } from "react";

import { readLocal, removeLocal, writeLocal } from "@/lib/storage-status";

/** Days 1–FREE_DAYS are always available, full strength, at no cost. */
export const FREE_DAYS = 4;

/** No checkout exists yet; the boundary unlocks locally and says so. */
export const PILOT_UNLOCK_MODE = true;

const KEY = "bfa.entitlement.v1";

export interface Entitlement {
  unlocked: boolean;
  /** How access was granted. Only "pilot" is possible today. */
  source: "pilot" | "purchase" | null;
}

export const LOCKED: Entitlement = { unlocked: false, source: null };

/** Pure: is this day number available under the given entitlement? */
export function isDayUnlocked(day: number, entitlement: Entitlement): boolean {
  if (!Number.isInteger(day) || day < 1) return false;
  if (day <= FREE_DAYS) return true;
  return entitlement.unlocked === true;
}

/** Pure: the first day that sits behind the boundary. */
export function firstPaidDay(): number {
  return FREE_DAYS + 1;
}

/** Pure and defensive: unknown shapes read as locked rather than throwing. */
export function normalizeEntitlement(raw: unknown): Entitlement {
  if (!raw || typeof raw !== "object") return LOCKED;
  const r = raw as Record<string, unknown>;
  const unlocked = r.unlocked === true;
  const source =
    r.source === "pilot" || r.source === "purchase" ? (r.source as Entitlement["source"]) : null;
  return unlocked ? { unlocked: true, source: source ?? "pilot" } : LOCKED;
}

export function readEntitlement(): Entitlement {
  if (typeof window === "undefined") return LOCKED;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? normalizeEntitlement(JSON.parse(raw)) : LOCKED;
  } catch {
    return LOCKED;
  }
}

function write(next: Entitlement) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Volatile storage: the boundary still opens for this visit.
  }
  window.dispatchEvent(new Event(ENTITLEMENT_EVENT));
}

const ENTITLEMENT_EVENT = "bfa:entitlement";

/** Grant access during the pilot. No payment, no network, no identifiers. */
export function grantPilotUnlock() {
  write({ unlocked: true, source: "pilot" });
}

export function clearEntitlement() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
  window.dispatchEvent(new Event(ENTITLEMENT_EVENT));
}

/**
 * Hydration-safe read. The first client render matches the server (locked and
 * unhydrated), so no boundary or unlocked content can flash.
 */
export function useEntitlement(): { entitlement: Entitlement; hydrated: boolean } {
  const [entitlement, setEntitlement] = useState<Entitlement>(LOCKED);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const sync = () => setEntitlement(readEntitlement());
    sync();
    setHydrated(true);
    window.addEventListener(ENTITLEMENT_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(ENTITLEMENT_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return { entitlement, hydrated };
}
