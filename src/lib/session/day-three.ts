// Shared constants and helpers linking Day 3 to the Week 1 deep guided session.
//
// PRIVACY: reads sessionStorage only (transient). Nothing is written here, and
// nothing about the session is persisted to localStorage except the Day 3
// visited marker, which is set ONLY by the Stage 11 finish-and-clear action.

import { SESSION_STAGE_ORDER } from "@/content/sessions";
import { readSessionState, type SessionState } from "@/lib/session-state";

export const WEEK_01_SESSION_ID = "week-01";
export const SESSION_DAY = 3;

/**
 * True when transient session state exists that a person could meaningfully
 * resume: they have moved past Arrival, or made at least one choice.
 * A finished session is never resumable.
 */
export function isResumableSession(state: SessionState): boolean {
  if (state.finished) return false;
  if (state.stage !== SESSION_STAGE_ORDER[0]) return true;
  if (Object.keys(state.choices ?? {}).length > 0) return true;
  return Boolean(state.readiness || state.route || state.practice || state.step || state.note);
}

export function hasResumableWeek01Session(): boolean {
  return isResumableSession(readSessionState(WEEK_01_SESSION_ID));
}
