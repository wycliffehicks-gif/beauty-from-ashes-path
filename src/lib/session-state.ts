// Transient session state for the weekly deep session.
//
// PRIVACY CONTRACT
// - sessionStorage only. Cleared by the browser when the tab/session ends.
// - Never localStorage, never a database, never sent over the network.
// - Only: current stage key, low-sensitivity choice IDs, and an optional
//   short free-text note the person chose to write.
// - Free text is length-capped and stripped of control characters. It is
//   never surfaced anywhere outside the active session.

import { SESSION_STAGE_ORDER, type SessionStageKey } from "@/content/sessions";

const KEY_PREFIX = "bfa.session.";

export const MAX_NOTE_LENGTH = 400;

export interface SessionState {
  stage: SessionStageKey;
  /** Low-sensitivity, curated choice IDs, keyed by stage. */
  choices: Partial<Record<SessionStageKey, string[]>>;
  /** Optional short note, transient only. */
  note?: string;
  /** Readiness branch chosen at arrival, if any. */
  readiness?: string;
  /** Stage 7 — which reconnection route was explicitly chosen. Never defaulted. */
  route?: string;
  /** Stage 7 (Christian route only) — how much spiritual material was requested. */
  spiritualMode?: string;
  /** Stage 8 — the practice the person chose to open, if any. */
  practice?: string;
  /** Stage 10 — the one honest step chosen, if any. */
  step?: string;
  /** Stage 11 — set only when the session was truly finished and cleared. */
  finished?: boolean;
}


export function emptySessionState(): SessionState {
  return { stage: SESSION_STAGE_ORDER[0], choices: {} };
}

function storageKey(sessionId: string) {
  return `${KEY_PREFIX}${sessionId}`;
}

function isStageKey(v: unknown): v is SessionStageKey {
  return typeof v === "string" && (SESSION_STAGE_ORDER as string[]).includes(v);
}

/** Strip control characters, collapse whitespace runs, and cap length. */
export function sanitizeNote(input: unknown): string {
  if (typeof input !== "string") return "";
  // eslint-disable-next-line no-control-regex
  const stripped = input.replace(/[\u0000-\u001f\u007f]/g, " ");
  return stripped.replace(/[ \t]{2,}/g, " ").trimStart().slice(0, MAX_NOTE_LENGTH);
}

function sanitizeIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter((x) => /^[a-z0-9-]{1,40}$/.test(x))
    .slice(0, 32);
}

export function sanitizeSessionState(raw: unknown): SessionState {
  const base = emptySessionState();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;

  const stage = isStageKey(obj.stage) ? obj.stage : base.stage;

  const choices: SessionState["choices"] = {};
  if (obj.choices && typeof obj.choices === "object") {
    for (const [k, v] of Object.entries(obj.choices as Record<string, unknown>)) {
      if (!isStageKey(k)) continue;
      const ids = sanitizeIds(v);
      if (ids.length) choices[k] = ids;
    }
  }

  const note = sanitizeNote(obj.note);
  const readinessCandidate = sanitizeIds([obj.readiness])[0];
  const route = sanitizeIds([obj.route])[0];
  const spiritualMode = sanitizeIds([obj.spiritualMode])[0];
  const practice = sanitizeIds([obj.practice])[0];
  const step = sanitizeIds([obj.step])[0];

  return {
    stage,
    choices,
    ...(note ? { note } : {}),
    ...(readinessCandidate ? { readiness: readinessCandidate } : {}),
    ...(route ? { route } : {}),
    ...(spiritualMode ? { spiritualMode } : {}),
    ...(practice ? { practice } : {}),
    ...(step ? { step } : {}),
    ...(obj.finished === true ? { finished: true } : {}),
  };
}


export function readSessionState(sessionId: string): SessionState {
  if (typeof window === "undefined") return emptySessionState();
  try {
    const raw = window.sessionStorage.getItem(storageKey(sessionId));
    if (!raw) return emptySessionState();
    return sanitizeSessionState(JSON.parse(raw));
  } catch {
    return emptySessionState();
  }
}

export function writeSessionState(sessionId: string, next: SessionState): SessionState {
  const clean = sanitizeSessionState(next);
  if (typeof window === "undefined") return clean;
  try {
    window.sessionStorage.setItem(storageKey(sessionId), JSON.stringify(clean));
  } catch {
    /* storage may be blocked; the session still works, just without resume */
  }
  return clean;
}

export function clearSessionState(sessionId: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(storageKey(sessionId));
  } catch {
    /* ignore */
  }
}
