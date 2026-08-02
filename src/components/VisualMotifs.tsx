/**
 * Quiet Contour and Living Gold Thread — decorative motifs.
 *
 * Code-native inline SVG only: no external assets, no imagery, no animation
 * that carries meaning. Every motif is purely presentational, hidden from the
 * accessibility tree and non-interactive. Text is never placed over artwork.
 *
 * Variants:
 *  - "splash"     atmospheric opening composition
 *  - "home"       quiet hero atmosphere for Journey Home
 *  - "threshold"  a doorway-like arrival band above a heading
 *  - "quiet-edge" sparse edge contour for reading/answering surfaces
 *  - "thread"     a vertical living gold thread beside a list
 */

export type MotifVariant = "splash" | "home" | "threshold" | "quiet-edge" | "thread";

const GOLD = "var(--bfa-gold-line)";
const CHAMPAGNE = "var(--bfa-champagne-line)";
const ASH = "var(--bfa-ash-line)";
const MINERAL = "var(--bfa-mineral-form)";

export function VisualMotif({
  variant,
  className = "",
}: {
  variant: MotifVariant;
  className?: string;
}) {
  return (
    <div aria-hidden="true" className={`bfa-visual-motif ${className}`}>
      {variant === "splash" && <SplashMotif />}
      {variant === "home" && <HomeMotif />}
      {variant === "threshold" && <ThresholdMotif />}
      {variant === "quiet-edge" && <QuietEdgeMotif />}
      {variant === "thread" && <ThreadMotif />}
    </div>
  );
}

function SplashMotif() {
  return (
    <svg
      className="bfa-visual-svg"
      viewBox="0 0 390 640"
      preserveAspectRatio="xMidYMid slice"
      focusable="false"
    >
      <g fill="none" strokeLinecap="round">
        <ellipse cx="196" cy="300" rx="188" ry="248" fill={MINERAL} opacity="0.5" />
        <ellipse cx="150" cy="392" rx="150" ry="150" fill={MINERAL} opacity="0.35" />
        <path d="M-20 168 C 96 132, 190 214, 300 176 C 360 156, 392 168, 412 160" stroke={ASH} strokeWidth="1" opacity="0.5" />
        <path d="M-20 208 C 104 176, 196 252, 306 216 C 364 198, 394 208, 414 202" stroke={CHAMPAGNE} strokeWidth="1" opacity="0.8" />
        <path d="M-20 470 C 108 436, 188 508, 300 470 C 362 450, 392 462, 412 456" stroke={ASH} strokeWidth="1" opacity="0.4" />
        <path d="M-20 508 C 112 476, 200 546, 308 510 C 366 492, 396 502, 416 498" stroke={CHAMPAGNE} strokeWidth="1" opacity="0.65" />
        {/* the living gold thread — one irregular seam */}
        <path
          d="M62 -10 C 92 96, 46 168, 108 246 C 168 320, 130 388, 196 452 C 258 512, 240 578, 288 652"
          stroke={GOLD}
          strokeWidth="1.6"
          opacity="0.9"
        />
        <path
          d="M108 246 C 142 262, 168 250, 206 226"
          stroke={GOLD}
          strokeWidth="1"
          opacity="0.5"
        />
        <path
          d="M196 452 C 232 462, 262 448, 292 420"
          stroke={GOLD}
          strokeWidth="1"
          opacity="0.4"
        />
      </g>
    </svg>
  );
}

function HomeMotif() {
  return (
    <svg
      className="bfa-visual-svg"
      viewBox="0 0 390 260"
      preserveAspectRatio="xMidYMax slice"
      focusable="false"
    >
      <g fill="none" strokeLinecap="round">
        <ellipse cx="300" cy="46" rx="150" ry="118" fill={MINERAL} opacity="0.55" />
        <ellipse cx="70" cy="120" rx="120" ry="104" fill={MINERAL} opacity="0.3" />
        <path d="M-20 74 C 96 44, 190 118, 300 82 C 358 64, 392 74, 414 68" stroke={ASH} strokeWidth="1" opacity="0.45" />
        <path d="M-20 106 C 104 78, 198 150, 306 116 C 362 100, 394 108, 414 104" stroke={CHAMPAGNE} strokeWidth="1" opacity="0.75" />
        <path d="M-20 216 C 110 186, 196 250, 304 218 C 362 202, 394 210, 414 206" stroke={CHAMPAGNE} strokeWidth="1" opacity="0.5" />
        <path
          d="M-16 30 C 74 62, 128 22, 214 66 C 288 104, 320 78, 410 118"
          stroke={GOLD}
          strokeWidth="1.5"
          opacity="0.85"
        />
      </g>
    </svg>
  );
}

function ThresholdMotif() {
  return (
    <svg
      className="bfa-visual-svg"
      viewBox="0 0 390 144"
      preserveAspectRatio="xMidYMid slice"
      focusable="false"
    >
      <g fill="none" strokeLinecap="round">
        <ellipse cx="195" cy="150" rx="150" ry="96" fill={MINERAL} opacity="0.5" />
        {/* an opening: two contours drawing apart, a room beyond */}
        <path d="M18 142 C 46 74, 96 34, 168 20" stroke={ASH} strokeWidth="1" opacity="0.55" />
        <path d="M372 142 C 344 74, 294 34, 222 20" stroke={ASH} strokeWidth="1" opacity="0.55" />
        <path d="M40 142 C 66 84, 110 48, 172 34" stroke={CHAMPAGNE} strokeWidth="1" opacity="0.8" />
        <path d="M350 142 C 324 84, 280 48, 218 34" stroke={CHAMPAGNE} strokeWidth="1" opacity="0.8" />
        <path d="M-10 118 C 92 96, 296 96, 400 118" stroke={CHAMPAGNE} strokeWidth="1" opacity="0.5" />
        <path
          d="M112 144 C 148 112, 156 74, 196 44 C 232 18, 258 26, 286 6"
          stroke={GOLD}
          strokeWidth="1.5"
          opacity="0.9"
        />
      </g>
    </svg>
  );
}

function QuietEdgeMotif() {
  return (
    <svg
      className="bfa-visual-svg"
      viewBox="0 0 390 520"
      preserveAspectRatio="xMidYMid slice"
      focusable="false"
    >
      <g fill="none" strokeLinecap="round">
        <path d="M-10 42 C 78 20, 128 62, 188 46" stroke={CHAMPAGNE} strokeWidth="1" opacity="0.7" />
        <path d="M-10 66 C 66 48, 108 78, 156 68" stroke={ASH} strokeWidth="1" opacity="0.35" />
        <path d="M400 468 C 320 490, 268 452, 208 470" stroke={CHAMPAGNE} strokeWidth="1" opacity="0.6" />
        <path
          d="M6 -10 C 22 92, -2 176, 18 268 C 34 350, 12 430, 30 530"
          stroke={GOLD}
          strokeWidth="1.4"
          opacity="0.75"
        />
        <path d="M18 268 C 44 280, 62 272, 84 254" stroke={GOLD} strokeWidth="1" opacity="0.35" />
      </g>
    </svg>
  );
}

function ThreadMotif() {
  return (
    <svg
      className="bfa-visual-svg"
      viewBox="0 0 40 1000"
      preserveAspectRatio="none"
      focusable="false"
    >
      <g fill="none" strokeLinecap="round">
        <path
          d="M20 -10 C 30 90, 10 180, 22 280 C 34 380, 8 470, 20 570 C 32 668, 10 760, 22 860 C 32 940, 18 980, 20 1010"
          stroke={GOLD}
          strokeWidth="1.4"
          opacity="0.7"
        />
        <path
          d="M14 120 C 24 220, 6 300, 16 400"
          stroke={CHAMPAGNE}
          strokeWidth="1"
          opacity="0.5"
        />
      </g>
    </svg>
  );
}
