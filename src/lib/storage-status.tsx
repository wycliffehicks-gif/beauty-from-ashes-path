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
  removeLocalConfirmed(key);
}

/**
 * Remove an app-owned key and report whether the removal could actually be
 * CONFIRMED in persistent storage.
 *
 * Confirmation is checked directly against the persistent store, never through
 * `readLocal`, and the key is tombstoned FIRST so that a removal which returns
 * quietly without doing anything — or a confirmation read that throws — can
 * still never let the old value be read again in this tab. Only a persistent
 * read that genuinely returns null lifts the tombstone. Only presence or
 * absence is inspected — never contents. A later genuinely successful write to
 * the same key clears the tombstone in `writeLocal`.
 */
export function removeLocalConfirmed(key: string): boolean {
  memory.delete(key);
  if (typeof window === "undefined") return false;
  let store: Storage;
  try {
    store = window.localStorage;
  } catch {
    tombstones.add(key);
    markUnavailable();
    return false;
  }
  // Provisional until proven: the app must not show this value again either way.
  tombstones.add(key);
  try {
    store.removeItem(key);
  } catch {
    markUnavailable();
    return false;
  }
  try {
    if (store.getItem(key) === null) {
      tombstones.delete(key);
      return true;
    }
  } catch {
    markUnavailable();
    return false;
  }
  markUnavailable();
  return false;
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
      <p className="bfa-copy-support container-page text-center text-foreground">
        {STORAGE_UNAVAILABLE_NOTICE}
      </p>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Outcome of the MOST RECENT explicit clear.
//
// This is deliberately separate from the sticky saving-availability state
// above. "Saving is unavailable" is a property of the visit; "this clear could
// not be confirmed" is a property of one action the person just took, and the
// app promises to tell them when it happens. Only presence/absence and
// success/failure are tracked — never any stored contents.
// ---------------------------------------------------------------------------

export const CLEAR_STATUS_EVENT = "bfa-clear-status";

/** Exact wording approved for an unconfirmed removal. */
export const CLEAR_UNCONFIRMED_NOTICE =
  "Some saved app information could not be confirmed as removed. It may still remain in this browser. To remove it, use your browser’s settings to clear this app’s site data.";

let clearUnconfirmed = false;

function dispatchClearStatus() {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(CLEAR_STATUS_EVENT));
  } catch {
    /* ignore */
  }
}

/** Start a fresh clear attempt. Any previous outcome is no longer relevant. */
export function beginClearAttempt() {
  clearUnconfirmed = false;
  dispatchClearStatus();
}

/** Record that some part of this clear could not be confirmed as removed. */
export function noteClearFailure() {
  if (clearUnconfirmed) return;
  clearUnconfirmed = true;
  dispatchClearStatus();
}

/** True when the most recent clear could not be fully confirmed. */
export function isClearUnconfirmed(): boolean {
  return clearUnconfirmed;
}

/** Test-only reset of the clear-outcome state. */
export function resetClearStatusForTests() {
  clearUnconfirmed = false;
}

/** Subscribe to the outcome of the most recent clear. SSR-safe. */
export function useClearStatus(): { unconfirmed: boolean; hydrated: boolean } {
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const sync = () => setUnconfirmed(isClearUnconfirmed());
    sync();
    setHydrated(true);
    window.addEventListener(CLEAR_STATUS_EVENT, sync);
    return () => window.removeEventListener(CLEAR_STATUS_EVENT, sync);
  }, []);

  return { unconfirmed, hydrated };
}

/**
 * The same calm notice markup and styles as above, used only to tell the truth
 * about a clear that could not be confirmed. It lives above the app in normal
 * flow, so it survives the navigation to the opening and stays visible there.
 */
export function ClearNotice({ suppressed = false }: { suppressed?: boolean } = {}) {
  const { unconfirmed, hydrated } = useClearStatus();
  if (suppressed || !hydrated || !unconfirmed) return null;
  return (
    <div
      data-testid="clear-notice"
      role="status"
      aria-live="polite"
      className="border-b border-border bg-card px-4 py-3"
    >
      <p className="bfa-copy-support container-page text-center text-foreground">
        {CLEAR_UNCONFIRMED_NOTICE}
      </p>
    </div>
  );
}
