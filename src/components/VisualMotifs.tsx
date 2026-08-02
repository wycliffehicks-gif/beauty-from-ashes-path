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
 *  - "thread"     a vertical living gold thread beside a list
 */

import type { MotifKey } from "@/content/journey-types";

export type MotifVariant = "splash" | "home" | "thread";


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

/* ===========================================================================
   Day motifs — the Living Gold Thread carried across all ten days.

   Geometry is driven by the canonical `content.motif` MotifKey, never by day
   number. Three treatments express the same day geometry at three intensities:

     - "arrival"  the day's atmospheric opening (above the eyebrow)
     - "quiet"    a restrained normal-flow divider inside working screens
     - "closing"  a more spacious, never brighter, restatement at Close

   Every day motif is decorative: inline SVG only, aria-hidden, unfocusable,
   pointer-events none, static, no text, no external asset, no animation. Fields
   are restrained mists; days are distinguished by geometry, not colour.
   =========================================================================== */

export type DayMotifTreatment = "arrival" | "quiet" | "closing";

type FieldTint = "blue" | "plum" | "green" | "stone";

type Field = { cx: number; cy: number; rx: number; ry: number; tint: FieldTint };

type DayGeometry = {
  /** Low-opacity mists. Arrival uses both; closing keeps only the first. */
  fields: [Field, Field];
  /** Arrival draws all four; closing draws the first three. */
  contours: [string, string, string, string];
  /** The one principal gold path. */
  gold: string;
  /** A short secondary gold trace, arrival only. */
  goldTrace?: string;
  /** Closing gold: same intensity, more room. */
  goldClosing: string;
  /** One gold fragment for the quiet divider. */
  quietGold: string;
  /** One supporting contour for the quiet divider. */
  quietContour: string;
};

const FIELD_VAR: Record<FieldTint, string> = {
  blue: "var(--bfa-field-blue)",
  plum: "var(--bfa-field-plum)",
  green: "var(--bfa-field-green)",
  stone: "var(--bfa-field-stone)",
};

const DAY_GEOMETRY: Record<MotifKey, DayGeometry> = {
  /* Day 1 — two contour fields draw apart; the thread crosses the opening. */
  threshold: {
    fields: [
      { cx: 112, cy: 140, rx: 128, ry: 96, tint: "blue" },
      { cx: 288, cy: 146, rx: 122, ry: 92, tint: "stone" },
    ],
    contours: [
      "M22 146 C 52 78, 104 36, 172 22",
      "M368 146 C 338 78, 286 36, 218 22",
      "M46 146 C 72 90, 116 52, 176 38",
      "M344 146 C 318 90, 274 52, 214 38",
    ],
    gold: "M104 148 C 142 116, 152 76, 195 46 C 234 20, 262 30, 292 8",
    goldTrace: "M195 46 C 214 52, 232 48, 248 36",
    goldClosing: "M118 104 C 152 82, 162 54, 198 36 C 228 22, 250 28, 272 14",
    quietGold: "M96 30 C 138 16, 178 30, 218 12 C 248 -1, 268 8, 292 2",
    quietContour: "M60 34 C 108 24, 150 36, 196 26",
  },

  /* Day 2 — incomplete offset rings; the thread loops once and continues. */
  attention: {
    fields: [
      { cx: 208, cy: 78, rx: 112, ry: 78, tint: "blue" },
      { cx: 108, cy: 108, rx: 88, ry: 68, tint: "green" },
    ],
    contours: [
      "M126 24 C 190 14, 236 46, 232 84 C 228 120, 178 136, 132 124",
      "M156 44 C 204 38, 236 62, 232 90",
      "M76 74 C 108 52, 152 58, 170 84 C 186 108, 166 130, 138 132",
      "M266 40 C 308 44, 336 70, 330 100",
    ],
    gold: "M-8 118 C 62 108, 96 74, 138 78 C 168 82, 172 108, 150 114 C 132 119, 122 102, 138 92 C 176 68, 240 100, 300 74 C 342 56, 366 66, 398 58",
    goldTrace: "M300 74 C 322 82, 344 78, 362 66",
    goldClosing:
      "M-8 82 C 66 74, 100 48, 140 52 C 166 55, 170 76, 152 81 C 138 85, 130 70, 144 62 C 180 44, 244 68, 302 48 C 342 34, 366 42, 398 36",
    quietGold: "M84 28 C 114 26, 124 12, 142 14 C 156 16, 156 30, 144 32 C 132 34, 130 20, 146 14 C 176 4, 232 24, 286 12",
    quietContour: "M52 22 C 92 34, 128 20, 168 30",
  },

  /* Day 3 — a denser cluster on one side; the thread reaches clearer space. */
  naming: {
    fields: [
      { cx: 82, cy: 92, rx: 104, ry: 86, tint: "plum" },
      { cx: 300, cy: 122, rx: 128, ry: 86, tint: "stone" },
    ],
    contours: [
      "M14 24 C 62 42, 44 82, 92 96",
      "M28 12 C 76 34, 56 78, 108 92",
      "M6 54 C 54 68, 46 108, 96 118",
      "M40 130 C 82 118, 104 130, 138 122",
    ],
    gold: "M22 142 C 68 128, 74 92, 118 82 C 168 70, 214 96, 268 76 C 316 58, 350 68, 392 54",
    goldTrace: "M118 82 C 134 62, 152 54, 176 52",
    goldClosing: "M28 96 C 70 86, 78 58, 120 50 C 170 40, 216 62, 270 46 C 316 32, 350 40, 392 30",
    quietGold: "M62 32 C 96 22, 106 8, 138 8 C 190 8, 240 26, 300 14",
    quietContour: "M40 12 C 62 20, 58 30, 84 34",
  },

  /* Day 4 — a broad asymmetric canopy over open inner space. */
  shelter: {
    fields: [
      { cx: 196, cy: 158, rx: 158, ry: 104, tint: "green" },
      { cx: 300, cy: 60, rx: 110, ry: 62, tint: "stone" },
    ],
    contours: [
      "M-6 96 C 58 30, 178 8, 268 26 C 336 40, 372 66, 396 74",
      "M16 116 C 76 56, 182 34, 264 50 C 326 62, 358 84, 382 92",
      "M96 148 C 106 116, 138 96, 182 92",
      "M300 148 C 292 122, 272 106, 244 98",
    ],
    gold: "M-4 108 C 62 44, 174 22, 262 38 C 322 50, 356 74, 396 84",
    goldTrace: "M262 38 C 272 56, 284 66, 300 72",
    goldClosing: "M-4 76 C 64 24, 176 6, 264 22 C 322 32, 356 54, 396 62",
    quietGold: "M52 34 C 108 8, 214 4, 276 18 C 310 26, 326 32, 344 34",
    quietContour: "M78 36 C 124 20, 208 18, 258 28",
  },

  /* Day 5 — two currents facing different ways; one gold S travels between. */
  "two-pulls": {
    fields: [
      { cx: 88, cy: 52, rx: 104, ry: 62, tint: "blue" },
      { cx: 306, cy: 116, rx: 108, ry: 66, tint: "plum" },
    ],
    contours: [
      "M-6 40 C 56 18, 116 44, 168 26",
      "M-6 66 C 52 46, 110 70, 160 54",
      "M396 106 C 336 128, 274 100, 224 120",
      "M396 132 C 340 152, 278 124, 230 144",
    ],
    gold: "M188 -8 C 176 40, 236 60, 226 100 C 218 132, 168 138, 158 156",
    goldTrace: "M226 100 C 244 106, 258 104, 272 96",
    goldClosing: "M190 4 C 180 42, 232 58, 224 92 C 218 118, 178 124, 168 140",
    quietGold: "M156 -4 C 148 12, 200 20, 192 36 C 186 48, 158 46, 152 58",
    quietContour: "M64 16 C 100 6, 122 22, 150 14",
  },

  /* Day 6 — uneven compressed contours; the thread dips and changes course. */
  cost: {
    fields: [
      { cx: 240, cy: 96, rx: 128, ry: 76, tint: "stone" },
      { cx: 84, cy: 66, rx: 82, ry: 58, tint: "blue" },
    ],
    contours: [
      "M-6 44 C 62 34, 148 58, 200 46 C 226 40, 240 52, 252 46",
      "M-6 62 C 60 54, 150 74, 202 64 C 224 60, 238 70, 250 64",
      "M186 78 C 214 74, 232 84, 252 78 C 274 72, 296 82, 320 76",
      "M190 96 C 216 92, 234 102, 254 96 C 278 90, 300 100, 326 94",
    ],
    gold: "M-8 100 C 58 96, 102 118, 152 128 C 196 136, 224 112, 250 90 C 282 62, 330 72, 396 56",
    goldTrace: "M250 90 C 258 108, 268 116, 284 122",
    goldClosing: "M-8 74 C 56 70, 100 90, 148 98 C 190 104, 218 84, 244 66 C 278 42, 328 50, 396 36",
    quietGold: "M56 12 C 96 10, 118 30, 152 34 C 184 38, 202 22, 220 8 C 244 -8, 276 0, 316 -8",
    quietContour: "M84 26 C 116 22, 138 32, 168 26",
  },

  /* Day 7 — one broad holding curve around an irregular inner form. */
  compassion: {
    fields: [
      { cx: 196, cy: 96, rx: 138, ry: 84, tint: "plum" },
      { cx: 208, cy: 92, rx: 62, ry: 44, tint: "stone" },
    ],
    contours: [
      "M40 128 C 12 76, 66 22, 152 14 C 244 6, 320 44, 344 96",
      "M64 130 C 44 88, 88 44, 158 36 C 230 28, 296 58, 318 100",
      "M176 66 C 214 56, 250 74, 246 98 C 242 122, 202 132, 178 118 C 158 106, 156 74, 176 66",
      "M156 108 C 168 122, 190 128, 208 124",
    ],
    gold: "M28 148 C 4 88, 62 26, 152 16 C 250 6, 330 50, 356 116",
    goldTrace: "M152 16 C 160 34, 170 44, 186 50",
    goldClosing: "M34 106 C 12 58, 66 12, 152 4 C 246 -4, 322 32, 348 90",
    quietGold: "M48 36 C 32 12, 96 -6, 168 -2 C 240 2, 292 18, 330 30",
    quietContour: "M96 26 C 132 12, 196 12, 240 22",
  },

  /* Day 8 — two separated islands; the thread spans one narrow interval. */
  reconnect: {
    fields: [
      { cx: 88, cy: 88, rx: 84, ry: 62, tint: "green" },
      { cx: 300, cy: 74, rx: 88, ry: 58, tint: "blue" },
    ],
    contours: [
      "M22 96 C 34 56, 88 40, 130 58 C 162 72, 158 108, 122 118 C 82 130, 30 122, 22 96",
      "M46 94 C 58 70, 96 62, 122 74",
      "M240 78 C 254 40, 306 26, 348 44 C 380 58, 376 92, 340 102 C 300 112, 248 104, 240 78",
      "M266 78 C 278 56, 314 48, 338 60",
    ],
    gold: "M-6 116 C 44 128, 96 128, 140 106 C 176 88, 208 88, 244 96 C 292 106, 340 92, 396 96",
    goldTrace: "M140 106 C 158 96, 178 92, 198 92",
    goldClosing: "M-6 84 C 46 96, 98 96, 142 74 C 178 56, 208 56, 244 64 C 292 74, 340 60, 396 64",
    quietGold: "M40 30 C 84 34, 120 24, 152 16 C 190 6, 236 20, 300 16",
    quietContour: "M64 12 C 92 4, 122 8, 142 18",
  },

  /* Day 9 — two faint rehearsal traces beside one solid gold route. */
  practise: {
    fields: [
      { cx: 196, cy: 116, rx: 148, ry: 78, tint: "stone" },
      { cx: 132, cy: 46, rx: 96, ry: 44, tint: "green" },
    ],
    contours: [
      "M-6 74 C 62 52, 128 90, 196 66 C 258 44, 322 76, 396 54",
      "M-6 96 C 64 74, 130 112, 198 88 C 260 66, 324 98, 396 76",
      "M40 34 C 96 20, 148 40, 196 28",
      "M60 130 C 116 118, 168 136, 216 124",
    ],
    gold: "M-8 118 C 64 96, 130 134, 200 110 C 262 88, 326 120, 398 98",
    goldTrace: "M200 110 C 214 118, 230 120, 246 116",
    goldClosing: "M-8 86 C 64 64, 130 100, 200 76 C 262 54, 326 86, 398 64",
    quietGold: "M40 30 C 100 12, 156 34, 216 18 C 256 8, 288 16, 330 8",
    quietContour: "M40 14 C 100 -4, 156 18, 216 2",
  },

  /* Day 10 — contours widen toward the edges; the thread leaves the frame. */
  carry: {
    fields: [
      { cx: 196, cy: 132, rx: 168, ry: 84, tint: "blue" },
      { cx: 64, cy: 64, rx: 74, ry: 48, tint: "stone" },
    ],
    contours: [
      "M-6 52 C 76 74, 152 74, 240 60 C 316 48, 358 34, 398 24",
      "M-6 78 C 78 104, 156 106, 246 92 C 322 80, 360 62, 398 50",
      "M20 34 C 52 44, 74 42, 98 36",
      "M300 120 C 336 112, 366 116, 396 110",
    ],
    gold: "M-10 122 C 70 116, 124 84, 200 70 C 282 54, 330 40, 400 20",
    goldTrace: "M28 118 C 48 108, 56 96, 60 84",
    goldClosing: "M-10 86 C 72 82, 126 54, 202 42 C 284 28, 332 18, 400 -2",
    quietGold: "M28 34 C 92 30, 148 20, 216 12 C 282 4, 320 6, 366 -2",
    quietContour: "M28 20 C 60 26, 84 24, 108 18",
  },
};

const ARRIVAL_VIEWBOX = "0 0 390 148";
const CLOSING_VIEWBOX = "0 0 390 104";
const QUIET_VIEWBOX = "0 0 390 40";

/**
 * A decorative day motif in normal document flow. Never sits behind text.
 */
export function DayMotif({
  motif,
  treatment,
  className = "",
}: {
  motif: MotifKey;
  treatment: DayMotifTreatment;
  className?: string;
}) {
  const g = DAY_GEOMETRY[motif];
  const viewBox =
    treatment === "arrival"
      ? ARRIVAL_VIEWBOX
      : treatment === "closing"
        ? CLOSING_VIEWBOX
        : QUIET_VIEWBOX;

  return (
    <div
      aria-hidden="true"
      data-bfa-motif={treatment}
      data-bfa-day-motif={motif}
      className={`bfa-day-motif bfa-day-motif-${treatment} ${className}`}
    >
      <svg
        className="bfa-visual-svg"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid slice"
        focusable="false"
      >
        <g fill="none" strokeLinecap="round">
          {treatment === "arrival" && (
            <>
              {g.fields.map((f, n) => (
                <ellipse
                  key={n}
                  className="bfa-day-field"
                  cx={f.cx}
                  cy={f.cy}
                  rx={f.rx}
                  ry={f.ry}
                  fill={FIELD_VAR[f.tint]}
                />
              ))}
              {g.contours.map((d, n) => (
                <path
                  key={d}
                  d={d}
                  stroke={n % 2 === 0 ? ASH : CHAMPAGNE}
                  strokeWidth="1"
                  opacity={n % 2 === 0 ? 0.4 : 0.75}
                />
              ))}
              <path d={g.gold} stroke={GOLD} strokeWidth="1.5" opacity="0.85" />
              {g.goldTrace && (
                <path d={g.goldTrace} stroke={GOLD} strokeWidth="1" opacity="0.4" />
              )}
            </>
          )}

          {treatment === "closing" && (
            <>
              <ellipse
                className="bfa-day-field"
                cx={g.fields[0].cx}
                cy={g.fields[0].cy - 26}
                rx={g.fields[0].rx}
                ry={g.fields[0].ry}
                fill={FIELD_VAR[g.fields[0].tint]}
              />
              {g.contours.slice(0, 3).map((d, n) => (
                <path
                  key={d}
                  d={d}
                  stroke={n % 2 === 0 ? ASH : CHAMPAGNE}
                  strokeWidth="1"
                  opacity={n % 2 === 0 ? 0.34 : 0.6}
                  transform="translate(0,-26)"
                />
              ))}
              <path d={g.goldClosing} stroke={GOLD} strokeWidth="1.5" opacity="0.85" />
            </>
          )}

          {treatment === "quiet" && (
            <>
              <path d={g.quietContour} stroke={CHAMPAGNE} strokeWidth="1" opacity="0.6" />
              <path d={g.quietGold} stroke={GOLD} strokeWidth="1.4" opacity="0.7" />
            </>
          )}
        </g>
      </svg>
    </div>
  );
}
