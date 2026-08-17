import { Link } from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";
import { JourneyIcon, SettingsIcon } from "@/components/Icons";

/**
 * Client-only transition tracking for screen-reader announcement.
 *
 * A single-page change is not a document load, so nothing would otherwise tell
 * a screen-reader user that the screen changed. Two facts are remembered:
 *
 *  - `lastPath`: the pathname most recently recorded by the root. `null` means
 *    nothing has been recorded yet, so the very first record is the initial
 *    document path and must never move focus.
 *  - `lastScreenKey`: the in-day screen identity last recorded.
 *
 * Both recorders are idempotent: recording the same value twice (React
 * StrictMode's repeated render/effect probe) reports no second transition, so a
 * heading can never be focused twice. The root only records in the browser, so
 * no cross-request server state is mutated during SSR.
 */
let lastPath: string | null = null;
let lastScreenKey: string | null = null;
/** A client pathname change is pending announcement by the next screen shown. */
let pathChanged = false;

/**
 * Record the current router pathname. Called from the root during render, before
 * the routed child mounts, so the screen that mounts next knows whether it
 * arrived through a client-side navigation or an ordinary document load.
 */
export function recordRouteTransition(pathname: string) {
  if (lastPath === null) {
    // Initial document path of this tab: nothing to announce.
    lastPath = pathname;
    return;
  }
  if (lastPath === pathname) return;
  lastPath = pathname;
  // Leaving a day and coming back to the very same screen is a real change,
  // so the remembered screen identity is cleared with the path.
  lastScreenKey = null;
  pathChanged = true;
}

/**
 * Record that `key` is now the visible screen and report whether that was a
 * genuine transition (as opposed to the first screen after a document load, or
 * the same screen re-rendering). Every in-day screen identity — including the
 * reflection, which manages its own focus — must call this so browser Back from
 * it is still recognised as a change.
 */
export function recordScreenTransition(key: string): boolean {
  if (pathChanged) {
    pathChanged = false;
    lastScreenKey = key;
    return true;
  }
  const previous = lastScreenKey;
  lastScreenKey = key;
  return previous !== null && previous !== key;
}

/** Test-only: forget everything so each case starts from a fresh document load. */
export function __resetScreenFocusTracking() {
  lastPath = null;
  lastScreenKey = null;
  pathChanged = false;
}



/**
 * Reusable therapeutic screen shell for The First Journey.
 *
 * Chrome rules (governing project knowledge):
 *  - small Home control and small Settings control, same place on every screen;
 *  - Back and Continue in a consistent bottom navigation area;
 *  - no Resurgence logo or tagline, no safety banner, no Support/Pause/Close
 *    buttons and no repeated disclaimer in the normal content header;
 *  - all controls at least 44px, with accessible names and visible focus.
 *
 * Home navigates quietly. It never marks a day complete — callers autosave
 * the locator as the person moves, so returning home simply returns home.
 */
export function JourneyScreen({
  label,
  children,
  onBack,
  backLabel = "Back",
  onContinue,
  continueLabel = "Continue",
  continueDisabled = false,
  continueHint,
  footer,
  progress,
  focusKey,
  manageFocus = true,
}: {
  /** Quiet centre label, e.g. "Day 4 · Notice". */
  label?: string;
  children: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  onContinue?: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  continueHint?: string;
  /** Optional extra content directly above the bottom navigation. */
  footer?: ReactNode;
  /** Progress ticks: { current, total } — no scores, no streaks. */
  progress?: { current: number; total: number };
  /**
   * Stable key for the screen being shown. Every in-day screen should pass one,
   * including screens that focus themselves, so transition tracking stays true.
   */
  focusKey?: string;
  /**
   * When false the shell only records the transition and leaves focus alone —
   * used by the personalized reflection, which focuses its own heading once its
   * content is ready so nothing is focused or announced twice.
   */
  manageFocus?: boolean;
}) {
  const mainRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!focusKey) return;
    const changed = recordScreenTransition(focusKey);
    // Initial load of a visit, or the same screen re-rendering, must not move
    // focus; only a genuine screen change does.
    if (!changed || !manageFocus) return;
    const node = mainRef.current;
    if (!node) return;
    const heading = node.querySelector("h1");
    const target = (heading ?? node) as HTMLElement;
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus();
    // manageFocus is a fixed per-screen intent, so tracking follows focusKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);




  return (
    <div className="journey-page">
      <div className="container-page flex min-h-[100dvh] flex-col">
        <header className="journey-chrome grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 bfa-top-safe pb-3">
          <Link
            to="/"
            aria-label="Home — Your Journey"
            className="journey-chrome-btn"
          >
            <JourneyIcon />
          </Link>
          <p className="journey-chrome-label min-w-0 truncate text-center text-muted-foreground">
            {label ?? ""}
          </p>

          <Link to="/settings" aria-label="Settings" className="journey-chrome-btn">
            <SettingsIcon />
          </Link>

        </header>

        {progress && progress.total > 1 && (
          <div
            className="mb-5 flex gap-1"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={progress.total}
            aria-valuenow={progress.current + 1}
            aria-label="Progress through this day"
          >
            {Array.from({ length: progress.total }).map((_, idx) => (
              <span
                key={idx}
                data-state={idx <= progress.current ? "reached" : "unreached"}
                className="bfa-progress-segment"
              />
            ))}
          </div>
        )}

        <main ref={mainRef} className="journey-main flex-1 outline-none">
          {children}
        </main>

        {footer}

        {(onBack || onContinue) && (
          <nav
            aria-label="Screen navigation"
            className="journey-dock grid grid-cols-2 gap-3"
          >
            {onBack ? (
              <button type="button" onClick={onBack} className="btn-quiet">
                {backLabel}
              </button>
            ) : (
              <span aria-hidden />
            )}
            {onContinue ? (
              <button
                type="button"
                onClick={onContinue}
                disabled={continueDisabled}
                aria-disabled={continueDisabled}
                className="btn-primary-journey"
              >
                {continueLabel}
              </button>
            ) : (
              <span aria-hidden />
            )}
            {continueHint && (
              <p className="bfa-copy-support col-span-2 text-center text-muted-foreground">
                {continueHint}
              </p>
            )}
          </nav>
        )}
      </div>
    </div>
  );
}
