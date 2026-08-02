// SSR-safe local-storage access with honest failure reporting.
//
// The app tells people their place is saved, so a silent write failure is not
// acceptable. When localStorage is unavailable (blocked, private mode, quota),
// values are kept in memory so the current tab keeps working, the normal change
// notifications are still dispatched, and a calm notice tells the truth:
// this tab only.
//
// AUTHORITY RULES (this is the part a naive fallback gets wrong):
//  - After a failed write, the in-memory value for that owned key is
//    AUTHORITATIVE, even if later `getItem` calls still succeed and return the
//    older persisted value. Otherwise sequential mutations silently lose each
//    other on a quota/write-only failure.
//  - After a failed remove, the key is TOMBSTONED, so stale persistent data can
//    never resurrect after an explicit Clear.
//  - A later genuinely successful persistent write clears that key's memory
//    value and tombstone, but never hides the already-observed unavailable
//    state or the global notice during this visit.
//
// Only keys this app owns are ever read, written or removed. Nothing else in
// the browser is probed or touched.

import { useEffect, useState } from "react";

export const STORAGE_STATUS_EVENT = "bfa-storage-status";

/** Exact wording approved for the unavailable-persistence notice. */
export const STORAGE_UNAVAILABLE_NOTICE =
  "Saving is unavailable in this browser. You can continue, but your place and choices may be lost when this tab closes or reloads.";

/** Authoritative in-memory values for owned keys whose persistent write failed. */
const memory = new Map<string, string>();
/** Owned keys whose persistent removal failed; they must read as absent. */
const tombstones = new Set<string>();
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

/** Test-only reset of the in-memory fallback, tombstones and status. */
export function resetStorageStatusForTests() {
  memory.clear();
  tombstones.clear();
  persistenceAvailable = true;
}

/**
 * Read an app-owned key.
 *
 * Order of authority: tombstone (removed) → in-memory value (a write that could
 * not be persisted) → the persistent store. A stale persisted value can never
 * shadow a newer in-tab value, and can never resurrect after a failed remove.
 */
export function readLocal(key: string): string | null {
  if (typeof window === "undefined") return null;
  if (tombstones.has(key)) return null;
  if (memory.has(key)) return memory.get(key) as string;
  try {
    return window.localStorage.getItem(key);
  } catch {
    markUnavailable();
  }
  return null;
}

/**
 * Write an app-owned key. Attempts real persistence first; only if that fails
 * is the value kept authoritatively in this tab's memory so the session stays
 * coherent. A genuine success clears any fallback state for that key.
 */
export function writeLocal(key: string, value: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, value);
    memory.delete(key);
    tombstones.delete(key);
    return true;
  } catch {
    memory.set(key, value);
    tombstones.delete(key);
    markUnavailable();
    return false;
  }
}

/**
 * Remove an app-owned key. Idempotent and never throws. If the persistent
 * removal fails, the key is tombstoned so it reads as genuinely absent for the
 * rest of this visit.
 */
export function removeLocal(key: string) {
  memory.delete(key);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
    tombstones.delete(key);
  } catch {
    tombstones.add(key);
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
 * One calm notice, shown only when persistence is genuinely unavailable.
 *
 * It sits at the top of the app in normal document flow, so it is visible in
 * the first viewport and can never cover the sticky bottom navigation dock.
 * Because it sits above the app, its divider is on the bottom edge.
 *
 * `suppressed` lets the opening splash keep it unmounted while the splash
 * covers (and inerts) the app; when the splash ends the notice mounts fresh, so
 * `role="status"` can actually announce rather than having existed inside
 * aria-hidden content.
 */
export function StorageNotice({ suppressed = false }: { suppressed?: boolean } = {}) {
  const { persistent, hydrated } = useStorageStatus();
  if (suppressed || !hydrated || persistent) return null;
  return (
    <div
      data-testid="storage-notice"
      role="status"
      aria-live="polite"
      className="border-b border-border bg-card px-4 py-3"
    >
      <p className="container-page text-center text-sm text-foreground">
        {STORAGE_UNAVAILABLE_NOTICE}
      </p>
    </div>
  );
}
