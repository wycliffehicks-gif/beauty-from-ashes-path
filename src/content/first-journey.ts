// Canonical content for Beauty from Ashes: The First Journey.
//
// Ten days, in order. Days 1–5 and Days 6–10 are authored in separate files
// only for file size; this module is the single source every surface reads.

import { DAYS_ONE_TO_FIVE } from "./journey-days-a";
import { DAYS_SIX_TO_TEN } from "./journey-days-b";
import type { JourneyDayContent } from "./journey-types";

export const FIRST_JOURNEY_DAYS: JourneyDayContent[] = [
  ...DAYS_ONE_TO_FIVE,
  ...DAYS_SIX_TO_TEN,
].sort((a, b) => a.day - b.day);

/** The final day of The First Journey. */
export const FIRST_JOURNEY_LENGTH = FIRST_JOURNEY_DAYS.length;
export const FIRST_JOURNEY_FINAL_DAY = FIRST_JOURNEY_LENGTH;

export function getFirstJourneyDay(day: number): JourneyDayContent | undefined {
  return FIRST_JOURNEY_DAYS.find((d) => d.day === day);
}
