import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

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
}) {
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
                className={`h-0.5 flex-1 rounded ${
                  idx <= progress.current ? "bg-[color:var(--gold)]" : "bg-border"
                }`}
              />
            ))}
          </div>
        )}

        <main className="flex-1 pb-6">{children}</main>

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

function MenuIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}
