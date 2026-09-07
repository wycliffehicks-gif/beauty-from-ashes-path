// Device-local store for accepted AI reflections.
//
// It is SEPARATE from `bfa.journey.v1`. Deterministic progress, answers and the
// authored reflection snapshots are never read, written or invalidated here, so
// an AI response can never overwrite the authored path, and clearing AI
// responses never touches a person's answers.
//
// A stored response is only ever returned for an EXACT identity match. When the
// day's answers, spiritual preference, authored source, policy, model, validator
// or disclosure version change, the old response simply stops matching and is
// not shown — it is never re-labelled as current.

import { readLocal, removeLocalConfirmed, writeLocal } from "@/lib/storage-status";
import { JOURNEY_AI_DISCLOSURE_VERSION } from "@/lib/ai/journey-disclosure";
import type { JourneyResponseIdentity } from "@/lib/ai/journey-policy";

export const JOURNEY_AI_STORAGE_KEY = "bfa.ai.journey.v1";
export const JOURNEY_AI_STORE_VERSION = "journey-ai-store-1";
export const JOURNEY_AI_EVENT = "bfa:ai-reflection-changed";

/** Bounded so a stored file cannot grow without limit. */
const MAX_STORED_DAYS = 10;
const MAX_STORED_TEXT_CHARS = 12_000;

export interface StoredAiReflection {
  dayId: string;
  text: string;
  paragraphs: string[];
  /** The exact identity string the response was accepted under. */
  canonicalIdentity: string;
  provenance: JourneyResponseIdentity["provenance"];
  disclosureVersion: string;
  savedAt: string;
}

interface StoreShape {
  storeVersion: string;
  byDay: Record<string, StoredAiReflection>;
}

function emptyStore(): StoreShape {
  return { storeVersion: JOURNEY_AI_STORE_VERSION, byDay: {} };
}

function readStore(): StoreShape {
  const raw = readLocal(JOURNEY_AI_STORAGE_KEY);
  if (!raw) return emptyStore();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return emptyStore();
    const p = parsed as Partial<StoreShape>;
    if (p.storeVersion !== JOURNEY_AI_STORE_VERSION) return emptyStore();
    if (typeof p.byDay !== "object" || p.byDay === null) return emptyStore();
    return { storeVersion: JOURNEY_AI_STORE_VERSION, byDay: { ...p.byDay } };
  } catch {
    return emptyStore();
  }
}

function announce(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(JOURNEY_AI_EVENT));
  } catch {
    /* ignore */
  }
}

function writeStore(next: StoreShape): boolean {
  const written = writeLocal(JOURNEY_AI_STORAGE_KEY, JSON.stringify(next));
  if (written) announce();
  return written;
}

function valid(entry: unknown): entry is StoredAiReflection {
  if (typeof entry !== "object" || entry === null) return false;
  const e = entry as Record<string, unknown>;
  return (
    typeof e.dayId === "string" &&
    typeof e.text === "string" &&
    e.text.length > 0 &&
    e.text.length <= MAX_STORED_TEXT_CHARS &&
    Array.isArray(e.paragraphs) &&
    e.paragraphs.every((p) => typeof p === "string") &&
    typeof e.canonicalIdentity === "string" &&
    e.canonicalIdentity.length > 0 &&
    (e.provenance === "mock" || e.provenance === "live-model") &&
    typeof e.disclosureVersion === "string" &&
    typeof e.savedAt === "string"
  );
}

/**
 * Return the saved reflection for this day ONLY when it matches the identity of
 * the request as it stands right now, and only when it was accepted under the
 * current disclosure. Anything else returns null.
 */
export function readAiReflection(
  dayId: string,
  canonicalIdentity: string,
): StoredAiReflection | null {
  const entry = readStore().byDay[dayId];
  if (!valid(entry)) return null;
  if (entry.canonicalIdentity !== canonicalIdentity) return null;
  if (entry.disclosureVersion !== JOURNEY_AI_DISCLOSURE_VERSION) return null;
  return entry;
}

/** Save an accepted response. Returns false when this device cannot save. */
export function saveAiReflection(args: {
  dayId: string;
  text: string;
  paragraphs: string[];
  identity: JourneyResponseIdentity;
}): boolean {
  if (args.text.length === 0 || args.text.length > MAX_STORED_TEXT_CHARS) return false;

  const store = readStore();
  const entry: StoredAiReflection = {
    dayId: args.dayId,
    text: args.text,
    paragraphs: [...args.paragraphs],
    canonicalIdentity: args.identity.canonicalIdentity,
    provenance: args.identity.provenance,
    disclosureVersion: JOURNEY_AI_DISCLOSURE_VERSION,
    savedAt: new Date().toISOString(),
  };

  const byDay = { ...store.byDay, [args.dayId]: entry };
  const dayIds = Object.keys(byDay);
  if (dayIds.length > MAX_STORED_DAYS) {
    const oldest = dayIds
      .filter((id) => id !== args.dayId)
      .sort((a, b) => (byDay[a]?.savedAt ?? "").localeCompare(byDay[b]?.savedAt ?? ""))[0];
    if (oldest) delete byDay[oldest];
  }

  return writeStore({ storeVersion: JOURNEY_AI_STORE_VERSION, byDay });
}

/** Remove one day's AI reflection. Answers and progress are untouched. */
export function clearAiReflection(dayId: string): boolean {
  const store = readStore();
  if (!store.byDay[dayId]) return true;
  const byDay = { ...store.byDay };
  delete byDay[dayId];
  return writeStore({ storeVersion: JOURNEY_AI_STORE_VERSION, byDay });
}

/**
 * Remove every AI reflection. Reports honestly: false means this device could
 * not confirm removal, so the app must not claim the information is gone.
 */
export function clearAllAiReflections(): boolean {
  const removed = removeLocalConfirmed(JOURNEY_AI_STORAGE_KEY);
  announce();
  return removed;
}

/** True when any AI reflection is stored on this device. */
export function hasAnyAiReflection(): boolean {
  return Object.keys(readStore().byDay).length > 0;
}

/* ------------------------------------------------------- recorded AI choice -- */

export const JOURNEY_AI_CONSENT_KEY = "bfa.ai.consent.v1";

/**
 * Whether this device has an AI choice recorded against the CURRENT disclosure.
 * A disclosure change makes this false again, so the explanation is read afresh
 * rather than an old agreement being carried forward.
 */
export function aiConsentAccepted(): boolean {
  const raw = readLocal(JOURNEY_AI_CONSENT_KEY);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return false;
    const p = parsed as Record<string, unknown>;
    return p.accepted === true && p.disclosureVersion === JOURNEY_AI_DISCLOSURE_VERSION;
  } catch {
    return false;
  }
}

/** Record the choice. Returns false when this device cannot save. */
export function recordAiConsent(accepted: boolean): boolean {
  return writeLocal(
    JOURNEY_AI_CONSENT_KEY,
    JSON.stringify({
      accepted,
      disclosureVersion: JOURNEY_AI_DISCLOSURE_VERSION,
      recordedAt: new Date().toISOString(),
    }),
  );
}

/** Forget the recorded choice, so it is asked again. */
export function clearAiConsent(): boolean {
  return removeLocalConfirmed(JOURNEY_AI_CONSENT_KEY);
}
