/**
 * Owned icon set drawn from the Living Gold Thread motif.
 *
 * All icons are single-line strokes: no fills, no geometric primitives, no
 * generic utility glyphs. They share one stroke weight, one optical size and
 * one terminal shape so the chrome reads as one quiet language.
 *
 *   - Journey: a single line that opens
 *   - Practices: a line that pauses
 *   - Support: a line that steadies
 *   - Settings: a line that closes into a loop
 */

const STROKE = 1.5;
const SIZE = 22;

interface IconProps {
  className?: string;
}

function IconFrame({
  children,
  className = "",
  ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaLabel ? undefined : "true"}
      aria-label={ariaLabel}
      className={className}
    >
      {children}
    </svg>
  );
}

/** Journey / Home — one line that opens upward, like a receiving threshold. */
export function JourneyIcon({ className }: IconProps) {
  return (
    <IconFrame className={className}>
      <path d="M5 17 C 9 9, 15 9, 19 17" />
    </IconFrame>
  );
}

/** Practices — one horizontal line with a quiet pause at its centre. */
export function PracticeIcon({ className }: IconProps) {
  return (
    <IconFrame className={className}>
      <path d="M5 12 L10 12" />
      <path d="M14 12 L19 12" />
      <path d="M12 9 L12 15" />
    </IconFrame>
  );
}

/** Support & Safety — a steady horizontal line supported at both ends. */
export function SupportIcon({ className }: IconProps) {
  return (
    <IconFrame className={className}>
      <path d="M4 12 L20 12" />
      <path d="M4 12 L4 8" />
      <path d="M20 12 L20 8" />
      <path d="M7 12 L7 16" />
      <path d="M17 12 L17 16" />
    </IconFrame>
  );
}

/** Settings — a line that closes into a loop, still holding a small opening. */
export function SettingsIcon({ className }: IconProps) {
  return (
    <IconFrame className={className}>
      <path d="M12 4 C 16 4, 20 8, 20 12 C 20 16, 16 20, 12 20 C 8 20, 4 16, 4 12 C 4 8, 8 4, 12 4" />
    </IconFrame>
  );
}

/** Back — a single line returning, used where a textual arrow is not enough. */
export function BackIcon({ className }: IconProps) {
  return (
    <IconFrame className={className}>
      <path d="M15 5 L8 12 L15 19" />
    </IconFrame>
  );
}
