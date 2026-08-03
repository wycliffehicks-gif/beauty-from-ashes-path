import { Link } from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Last screen whose focus was managed, remembered across remounts of this
 * component. A single-page screen change is not a document load, so nothing
 * would otherwise tell a screen-reader user that the screen changed. The first
 * screen of a visit is recorded WITHOUT taking focus, so an ordinary page load
 * never steals focus from the top of the document.
 */
let lastFocusedScreenKey: string | null = null;

/**
 * Sentinel recorded when a journey screen unmounts (the person opened Settings,
 * went Home, or otherwise left the day). It is deliberately not a real screen
 * key, so returning to the very same screen still counts as a screen change and
 * is announced, while a first document load (null) never steals focus.
 */
const SCREEN_LEFT = "\u0000screen-left";

/**
 * Record that `key` is now the visible screen and report whether that was a
 * genuine screen transition (as opposed to the first screen of a visit or the
 * same screen re-rendering). Every in-day screen identity — including the
 * reflection, which manages its own focus — must call this so browser Back from
 * it is still recognised as a change.
 */
export function recordScreenTransition(key: string): boolean {
  const previous = lastFocusedScreenKey;
  lastFocusedScreenKey = key;
  return previous !== null && previous !== key;
}

/** Note that the journey screen was left, so coming back announces the screen. */
export function markScreenLeft() {
  if (lastFocusedScreenKey !== null) lastFocusedScreenKey = SCREEN_LEFT;
}

/** Test-only: forget the remembered screen so each case starts from a load. */
export function __resetScreenFocusTracking() {
  lastFocusedScreenKey = null;
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

  // Leaving the day entirely (Settings, Home, a full unmount) means returning to
  // the very same screen is a real change again and must be announced.
  useEffect(() => markScreenLeft, []);


  return (
    <div className="journey-page">
      <div className="container-page flex min-h-[100dvh] flex-col">
        <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 pt-4 pb-2">
          <Link
            to="/"
            aria-label="Home — Your Journey"
            className="journey-chrome-btn"
          >
            <HomeIcon />
          </Link>
          <p className="min-w-0 truncate text-center text-xs uppercase tracking-[0.2em] text-muted-foreground">
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
              <p className="col-span-2 text-center text-sm text-muted-foreground">
                {continueHint}
              </p>
            )}
          </nav>
        )}
      </div>
    </div>
  );
}


function HomeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 11.2 12 4l8 7.2" />
      <path d="M6 10.5V20h12v-9.5" />
    </svg>
  );
}

/** Conventional settings glyph: this control navigates to Settings, not a menu. */
function SettingsIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a1.5 1.5 0 1 1-2.12 2.12l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a1.5 1.5 0 1 1-3 0v-.11a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a1.5 1.5 0 1 1-2.12-2.12l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a1.5 1.5 0 1 1 0-3h.11a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a1.5 1.5 0 1 1 2.12-2.12l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.03-1.56V3a1.5 1.5 0 1 1 3 0v.11a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a1.5 1.5 0 1 1 2.12 2.12l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1.03H21a1.5 1.5 0 1 1 0 3h-.11a1.7 1.7 0 0 0-1.49 1.03z" />
    </svg>
  );
}

