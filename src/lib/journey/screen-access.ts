// Pure screen-reachability rules for the First Journey day flow.
//
// A query string is never proof that a screen was reached. The reflection and
// Close screens may only be shown when the person genuinely arrived there:
//  - within this visit, or on reload/Back/Forward, because the day's
//    high-water screen (`reached`) covers that index; or
//  - because the day is already finished, so its Close is legitimately
//    restorable.
//
// Every other screen stays directly addressable: it records nothing, completes
// nothing, and clamping it would only strand people. Browser storage is never
// read here — callers pass the stored values in, so server and first client
// render agree.

/** Screen kinds that must be earned rather than typed into the address bar. */
export const GATED_SCREEN_KINDS = ["reflection", "close"] as const;

export type GatedKind = (typeof GATED_SCREEN_KINDS)[number];

export function isGatedKind(kind: string): kind is GatedKind {
  return (GATED_SCREEN_KINDS as readonly string[]).includes(kind);
}

export interface ScreenAccessRequest {
  /** Screen kinds for the day, in order. */
  kinds: readonly string[];
  /** The index the URL asked for. */
  requested: number;
  /** Highest index genuinely reached in this day, from the store. */
  reached: number;
  /** True when this day is already recorded as finished. */
  completed: boolean;
}

/**
 * The highest index a person may legitimately be shown right now.
 */
export function allowedIndex({
  kinds,
  reached,
  completed,
}: Omit<ScreenAccessRequest, "requested">): number {
  const closeIdx = kinds.length - 1;
  const earned = Number.isInteger(reached) && reached > 0 ? Math.min(reached, closeIdx) : 0;
  return completed ? closeIdx : earned;
}

/**
 * The index the flow should actually render. EVERY screen above the trusted
 * high-water mark is clamped, not only the reflection and Close: a crafted
 * `?s=step` must not render and then quietly become trusted. Already-earned
 * screens (reload, Back, Forward) and a finished day's Close still restore.
 */
export function resolveVisibleIndex({
  kinds,
  requested,
  reached,
  completed,
}: ScreenAccessRequest): number {
  const last = kinds.length - 1;
  if (last < 0) return 0;
  const want = Number.isInteger(requested) && requested > 0 ? Math.min(requested, last) : 0;
  const allowed = allowedIndex({ kinds, reached, completed });
  return Math.max(0, Math.min(want, allowed));
}

