// SSR-safe local-storage access with honest failure reporting.
//
// The app tells people their place is saved, so a silent write failure is not
// acceptable. When localStorage is unavailable (blocked, private mode, quota),
// values are kept in memory so the current tab keeps working, the normal change
// notifications are still dispatched, and a calm global notice tells the truth:
// this tab only.
//
// Only keys this app owns are ever read, written or removed. Nothing else in
// the browser is probed or touched.

import { useEffect, useState } from "react";

export const STORAGE_STATUS_EVENT = "bfa-storage-status";

/** Exact wording approved for the unavailable-persistence notice. */
export const STORAGE_UNAVAILABLE_NOTICE =
  "Saving is unavailable in this browser. You can continue, but your place and choices may be lost when this tab closes or reloads.";

const memory = new Map<string, string>();
let persistenceAvailable = true;

function markUnavailable() {
  if (!persistenceAvailable) return;
  persistenceAvailable = false;
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(STORAGE_STATUS_EVENT));
  } catch {
    /* ignore */
  }
}

/** True while ordinary persistence still works. Never throws. */
export function isPersistenceAvailable(): boolean {
  return persistenceAvailable;
}

/** Test-only reset of the in-memory fallback and status. */
export function resetStorageStatusForTests() {
  memory.clear();
  persistenceAvailable = true;
}

/** Read an app-owned key. Falls back to this tab's in-memory value. */
export function readLocal(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(key);
    if (value !== null) return value;
  } catch {
    markUnavailable();
  }
  return memory.has(key) ? (memory.get(key) as string) : null;
}

/**
 * Write an app-owned key. Always records the value in memory first so the
 * current tab stays coherent, then attempts real persistence.
 */
export function writeLocal(key: string, value: string): boolean {
  memory.set(key, value);
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    markUnavailable();
    return false;
  }
}

/** Remove an app-owned key. Idempotent and never throws. */
export function removeLocal(key: string) {
  memory.delete(key);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    markUnavailable();
  }
}

/** Subscribe to persistence-availability changes. SSR-safe. */
export function useStorageStatus(): { persistent: boolean; hydrated: boolean } {
  const [persistent, setPersistent] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const sync = () => setPersistent(isPersistenceAvailable());
    sync();
    setHydrated(true);
    window.addEventListener(STORAGE_STATUS_EVENT, sync);
    return () => window.removeEventListener(STORAGE_STATUS_EVENT, sync);
  }, []);

  return { persistent, hydrated };
}

/**
 * One calm, nonpersistent global notice, shown only when persistence is
 * genuinely unavailable. It claims nothing about a device, and never says
 * anything was kept.
 */
export function StorageNotice() {
  const { persistent, hydrated } = useStorageStatus();
  if (!hydrated || persistent) return null;
  return (
    <div
      data-testid="storage-notice"
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-[90] border-t border-border bg-card px-4 py-3"
    >
      <p className="container-page text-center text-sm text-foreground">
        {STORAGE_UNAVAILABLE_NOTICE}
      </p>
    </div>
  );
}
