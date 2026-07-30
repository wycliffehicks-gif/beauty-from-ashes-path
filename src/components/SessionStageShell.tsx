import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

/**
 * Calm shell for the weekly deep session.
 *
 * Provides the persistent orientation controls a stuck person needs:
 * where am I, how do I go back, how do I pause, how do I get support,
 * how do I leave safely. No scores, no streaks, no productivity language.
 */
export function SessionStageShell({
  children,
  stageLabel,
  stageNumber,
  totalStages,
  onBack,
  onPause,
  onLeave,
  onClear,
}: {
  children: ReactNode;
  stageLabel: string;
  stageNumber: number;
  totalStages: number;
  onBack?: () => void;
  onPause: () => void;
  onLeave: () => void;
  onClear: () => void;
}) {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <div className="container-page flex min-h-[100dvh] flex-col py-6">
        <header className="space-y-3 pb-4">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onBack ?? onLeave}
              className="inline-link inline-flex min-h-11 items-center rounded-md px-2 text-sm text-muted-foreground hover:text-foreground"
            >
              {onBack ? "← Back" : "✕ Close"}
            </button>
            <p className="min-w-0 flex-1 truncate text-center text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {stageLabel}
            </p>
            <button
              type="button"
              onClick={onLeave}
              data-testid="session-leave"
              className="inline-link inline-flex min-h-11 items-center rounded-md px-2 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Save my place
            </button>
          </div>

          <nav className="flex flex-wrap items-center justify-center gap-1 text-sm">
            <Link
              to="/"
              className="inline-link inline-flex min-h-11 items-center rounded-md px-3 text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Home
            </Link>
            <span aria-hidden className="text-muted-foreground">·</span>
            <button
              type="button"
              onClick={onPause}
              data-testid="session-pause"
              className="inline-link inline-flex min-h-11 items-center rounded-md px-3 text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Pause and Ground
            </button>
            <span aria-hidden className="text-muted-foreground">·</span>
            <Link
              to="/support"
              className="inline-link inline-flex min-h-11 items-center rounded-md px-3 text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Support
            </Link>
          </nav>
        </header>

        <div className="mb-6 space-y-2">
          <div aria-hidden className="flex gap-1">
            {Array.from({ length: totalStages }).map((_, idx) => (
              <span
                key={idx}
                className={`h-0.5 flex-1 rounded ${
                  idx < stageNumber ? "bg-primary" : "bg-border"
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Movement {stageNumber} of {totalStages}. There is no pace to keep up with.
          </p>
        </div>

        <div className="flex-1">{children}</div>

        <div className="flex flex-col items-center gap-1 pt-8 text-sm">
          <button
            type="button"
            onClick={onLeave}
            className="inline-link inline-flex min-h-11 items-center rounded-md px-3 text-muted-foreground underline underline-offset-4"
          >
            Save my place and leave
          </button>
          <button
            type="button"
            onClick={onClear}
            data-testid="session-clear"
            className="inline-link inline-flex min-h-11 items-center rounded-md px-3 text-xs text-muted-foreground underline underline-offset-4"
          >
            Clear this session
          </button>
        </div>
      </div>
    </div>
  );
}

export function SessionPrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-primary px-5 py-3 text-base font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function SessionSubtleButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-12 w-full items-center justify-center rounded-lg border border-border bg-background px-5 py-3 text-base font-medium text-foreground hover:bg-secondary"
    >
      {children}
    </button>
  );
}

export function ChoiceChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-12 w-full rounded-md border px-4 py-3 text-left text-base transition-colors ${
        active
          ? "border-[var(--gold)] bg-[var(--champagne)]/40 text-foreground"
          : "border-border bg-card hover:border-[var(--deep-navy)]/40"
      }`}
    >
      {label}
    </button>
  );
}

export function StageTeach({ text }: { text: string }) {
  return (
    <div className="rounded-lg border-l-4 border-l-[var(--gold)] border-y border-r border-border bg-secondary/40 p-4">
      <p className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">
        Why this part matters
      </p>
      <p className="text-base leading-relaxed text-foreground">{text}</p>
    </div>
  );
}
