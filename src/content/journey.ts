// First Journey configuration.
//
// The journey is ten days. Titles, themes and descriptors come from the
// canonical day content in src/content/first-journey.ts, so the journey home,
// the day flow and the tests can never drift apart.

import {
  FIRST_JOURNEY_DAYS,
  FIRST_JOURNEY_FINAL_DAY,
  FIRST_JOURNEY_LENGTH,
} from "./first-journey";

export const JOURNEY_HOME_TITLE = "Your Journey";
export const JOURNEY_IDENTITY = "Beauty from Ashes: The First Journey";

export const JOURNEY_LENGTH = FIRST_JOURNEY_LENGTH;
export const JOURNEY_FINAL_DAY = FIRST_JOURNEY_FINAL_DAY;

export interface JourneyDay {
  /** Stable identifier used by the progress store. */
  id: string;
  day: number;
  title: string;
  theme: string;
  /** Short, non-pressuring descriptor shown on the journey home. */
  descriptor: string;
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

export const JOURNEY_DAYS: JourneyDay[] = FIRST_JOURNEY_DAYS.map((d) => ({
  id: dayIdFor(d.day),
  day: d.day,
  title: d.title,
  theme: d.theme,
  descriptor: d.descriptor,
}));

export function getJourneyDay(day: number): JourneyDay | undefined {
  return JOURNEY_DAYS.find((d) => d.day === day);
}

export function getJourneyDayById(id: string): JourneyDay | undefined {
  return JOURNEY_DAYS.find((d) => d.id === id);
}
