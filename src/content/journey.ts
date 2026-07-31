// First Journey configuration.
//
// PROVISIONAL: the final length of "Beauty from Ashes: The First Journey" is
// not yet decided (likely 9–12 days). This file deliberately derives its day
// list from the existing content so Block 1 stays compatible with the current
// routes, while giving every surface a single place to read from when the
// journey is remapped in Block 2. Nothing here claims a seven-day journey.

import { DAYS } from "./days";
import { SESSION_DAY } from "@/lib/session/day-three";

export const JOURNEY_HOME_TITLE = "Your Journey";
export const JOURNEY_IDENTITY = "Beauty from Ashes: The First Journey";

/** True while the day list is temporary scaffolding awaiting the Block 2 remap. */
export const JOURNEY_LENGTH_IS_PROVISIONAL = true;

export type JourneyDayKind = "practice" | "guided-session";

export interface JourneyDay {
  /** Stable identifier used by the progress store. */
  id: string;
  /** Current route parameter. Will remain numeric through the remap. */
  day: number;
  title: string;
  theme: string;
  kind: JourneyDayKind;
  /** Short, non-pressuring descriptor shown on the journey home. */
  shape: string;
}

/** `3` → `day-03`. Zero-padded so ordering stays stable past nine days. */
export function dayIdFor(day: number): string {
  return `day-${String(day).padStart(2, "0")}`;
}

/** `day-03` → `3`; returns null for anything unrecognised. */
export function dayNumberFromId(id: string): number | null {
  const m = /^day-(\d{2,})$/.exec(id);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export const JOURNEY_DAYS: JourneyDay[] = DAYS.map((d) => {
  const guided = d.day === SESSION_DAY;
  return {
    id: dayIdFor(d.day),
    day: d.day,
    title: d.title,
    theme: d.theme,
    kind: guided ? ("guided-session" as const) : ("practice" as const),
    shape: guided
      ? "A longer guided reflection — you can pause and return"
      : "A shorter daily reflection",
  };
});

export function getJourneyDay(day: number): JourneyDay | undefined {
  return JOURNEY_DAYS.find((d) => d.day === day);
}

export function getJourneyDayById(id: string): JourneyDay | undefined {
  return JOURNEY_DAYS.find((d) => d.id === id);
}
