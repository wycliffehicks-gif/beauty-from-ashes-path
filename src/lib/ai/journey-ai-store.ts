// Separate, bounded device-local AI responses. Authored progress is untouched.
import { readLocal, removeLocalConfirmed, writeLocal } from "@/lib/storage-status";
import { JOURNEY_AI_DISCLOSURE_VERSION } from "@/lib/ai/journey-disclosure";
import type { JourneyResponseIdentity } from "@/lib/ai/journey-policy";
import { prepareJourneyGeneration } from "@/lib/ai/journey-policy";
import { composeJourneyResponseIdentity } from "@/lib/ai/journey-identity";
import { parseJourneyRequest } from "@/lib/ai/journey-contract";
import { validateJourneyReflection } from "@/lib/ai/journey-response";
import type { GroundedJourneySource } from "@/lib/ai/journey-grounding";
import { dayIdFor } from "@/content/journey";

export const JOURNEY_AI_STORAGE_KEY = "bfa.ai.journey.v1";
export const JOURNEY_AI_STORE_VERSION = "journey-ai-store-2";
export const JOURNEY_AI_EVENT = "bfa:ai-reflection-changed";
export const JOURNEY_AI_CONSENT_KEY = "bfa.ai.consent.v1";
export type JourneyReflectionMode = "ai" | "authored";
type Path = "on" | "off";
export interface StoredAiReflection {
  dayId: string; text: string; paragraphs: string[]; canonicalIdentity: string;
  provenance: "live-model"; disclosureVersion: string; savedAt: string;
}
interface DayStore { on?: StoredAiReflection; off?: StoredAiReflection; modes?: Partial<Record<Path, JourneyReflectionMode>> }
interface StoreShape { storeVersion: string; byDay: Record<string, DayStore> }
const emptyStore = (): StoreShape => ({ storeVersion: JOURNEY_AI_STORE_VERSION, byDay: {} });
const pathFor = (spiritual: boolean): Path => spiritual ? "on" : "off";
function canonicalDay(id: string): string | null {
  const match = /^day-(\d{1,2})$/.exec(id);
  const day = match ? Number(match[1]) : 0;
  return day >= 1 && day <= 10 ? dayIdFor(day) : null;
}
// The first component is the complete canonical JSON; later version components
// contain no braces. Parsing it does not treat an identity as a security proof.
function identityContext(identity: string): { day: number; spiritual: boolean } | null {
  if (typeof identity !== "string" || identity.length > 100_000 || !identity.endsWith("|live-model")) return null;
  try {
    const raw = JSON.parse(identity.slice(0, identity.lastIndexOf("}|") + 1));
    return Number.isInteger(raw.day) && raw.day >= 1 && raw.day <= 10 && typeof raw.spiritual === "boolean"
      ? { day: raw.day, spiritual: raw.spiritual } : null;
  } catch { return null; }
}
function readStore(): StoreShape {
  const raw = readLocal(JOURNEY_AI_STORAGE_KEY);
  if (!raw || raw.length > 3_000_000) return emptyStore();
  try {
    const p = JSON.parse(raw);
    if (!p || typeof p.byDay !== "object" || !p.byDay || Array.isArray(p.byDay)) return emptyStore();
    if (![JOURNEY_AI_STORE_VERSION, "journey-ai-store-1"].includes(p.storeVersion)) return emptyStore();
    const byDay: Record<string, DayStore> = {};
    for (const [key, value] of Object.entries(p.byDay)) {
      const day = canonicalDay(key);
      if (!day || !value || typeof value !== "object" || Array.isArray(value)) continue;
      if (p.storeVersion === "journey-ai-store-1") {
        const entry = value as StoredAiReflection;
        const context = identityContext(entry.canonicalIdentity);
        if (context && dayIdFor(context.day) === day) byDay[day] = { [pathFor(context.spiritual)]: { ...entry, dayId: day } };
      } else {
        const item = value as DayStore;
        const modes: DayStore["modes"] = {};
        for (const path of ["on", "off"] as const) if (item.modes?.[path] === "ai" || item.modes?.[path] === "authored") modes[path] = item.modes[path];
        byDay[day] = { on: item.on, off: item.off, modes };
      }
    }
    return { storeVersion: JOURNEY_AI_STORE_VERSION, byDay };
  } catch { return emptyStore(); }
}
function announce(kind: "save" | "clear" | "mode" | "consent") {
  if (typeof window === "undefined") return;
  try { window.dispatchEvent(new CustomEvent(JOURNEY_AI_EVENT, { detail: { kind } })); } catch { /* SSR/test host */ }
}
function writeStore(next: StoreShape, kind: "save" | "clear" | "mode"): boolean {
  const serialized = JSON.stringify(next);
  if (serialized.length > 3_000_000) return false;
  const written = writeLocal(JOURNEY_AI_STORAGE_KEY, serialized);
  // Failed persistence still updates the authoritative in-tab storage overlay.
  announce(kind);
  return written;
}
export function readAiReflection(dayId: string, canonicalIdentity: string, source?: GroundedJourneySource): StoredAiReflection | null {
  const day = canonicalDay(dayId), context = identityContext(canonicalIdentity);
  if (!day || !context || dayIdFor(context.day) !== day) return null;
  const entry = readStore().byDay[day]?.[pathFor(context.spiritual)];
  if (!entry || entry.dayId !== day || entry.provenance !== "live-model" || entry.canonicalIdentity !== canonicalIdentity || entry.disclosureVersion !== JOURNEY_AI_DISCLOSURE_VERSION || typeof entry.savedAt !== "string") return null;
  const checked = validateJourneyReflection({ text: entry.text, source: source ?? ({ spiritualAuthorised: context.spiritual } as GroundedJourneySource) });
  if (!checked.ok) return null;
  // Paragraphs are always derived from validated text, never trusted separately.
  return { ...entry, text: checked.reflection.text, paragraphs: checked.reflection.paragraphs };
}
export function saveAiReflection(args: { dayId: string; text: string; paragraphs?: string[]; identity: JourneyResponseIdentity; source?: GroundedJourneySource }): boolean {
  const day = canonicalDay(args.dayId), context = identityContext(args.identity.canonicalIdentity);
  if (!day || !context || dayIdFor(context.day) !== day || args.identity.provenance !== "live-model") return false;
  const checked = validateJourneyReflection({ text: args.text, source: args.source ?? ({ spiritualAuthorised: context.spiritual } as GroundedJourneySource) });
  if (!checked.ok) return false;
  const store = readStore(), path = pathFor(context.spiritual);
  const entry: StoredAiReflection = { dayId: day, text: checked.reflection.text, paragraphs: checked.reflection.paragraphs, canonicalIdentity: args.identity.canonicalIdentity, provenance: "live-model", disclosureVersion: JOURNEY_AI_DISCLOSURE_VERSION, savedAt: new Date().toISOString() };
  const existing = store.byDay[day] ?? {};
  store.byDay[day] = { ...existing, [path]: entry, modes: { ...existing.modes, [path]: "ai" } };
  return writeStore(store, "save");
}
export function readAiMode(dayId: string, spiritual: boolean): JourneyReflectionMode | null {
  const day = canonicalDay(dayId);
  return day ? readStore().byDay[day]?.modes?.[pathFor(spiritual)] ?? null : null;
}
export function saveAiMode(dayId: string, spiritual: boolean, mode: JourneyReflectionMode): boolean {
  const day = canonicalDay(dayId);
  if (!day || (mode !== "ai" && mode !== "authored")) return false;
  const store = readStore(), existing = store.byDay[day] ?? {};
  store.byDay[day] = { ...existing, modes: { ...existing.modes, [pathFor(spiritual)]: mode } };
  return writeStore(store, "mode");
}
export function clearAiReflection(dayId: string, spiritual?: boolean): boolean {
  const day = canonicalDay(dayId);
  if (!day) return false;
  const store = readStore();
  if (spiritual === undefined) delete store.byDay[day];
  else if (store.byDay[day]) delete store.byDay[day][pathFor(spiritual)];
  return writeStore(store, "clear");
}
export function clearAllAiReflections(): boolean { const removed = removeLocalConfirmed(JOURNEY_AI_STORAGE_KEY); announce("clear"); return removed; }
export function hasAnyAiReflection(): boolean { return Object.values(readStore().byDay).some(day => !!day.on || !!day.off); }
export function aiConsentAccepted(): boolean {
  try { const p = JSON.parse(readLocal(JOURNEY_AI_CONSENT_KEY) ?? "null"); return p?.accepted === true && p.disclosureVersion === JOURNEY_AI_DISCLOSURE_VERSION; } catch { return false; }
}
export function recordAiConsent(accepted: boolean): boolean {
  const written = writeLocal(JOURNEY_AI_CONSENT_KEY, JSON.stringify({ accepted, disclosureVersion: JOURNEY_AI_DISCLOSURE_VERSION, recordedAt: new Date().toISOString() }));
  announce("consent"); return written;
}
export function clearAiConsent(): boolean { const removed = removeLocalConfirmed(JOURNEY_AI_CONSENT_KEY); announce("consent"); return removed; }
export interface AiPresentationInput { day: number; answerMeaningVersion: string; answers: string[]; spiritual: boolean }
/** Shared by hook and export: no network, no mutation, no authored substitution. */
export function resolveSavedAiPresentation(input: AiPresentationInput | null, hydrated = true) {
  const parsed = input && hydrated ? parseJourneyRequest(input) : null;
  if (!parsed?.ok) return null;
  const prepared = prepareJourneyGeneration(parsed.request);
  const identity = composeJourneyResponseIdentity(prepared.identity, "live-model");
  const dayId = dayIdFor(parsed.request.day.day);
  const stored = readAiReflection(dayId, identity.canonicalIdentity, prepared.grounding);
  const explicitMode = readAiMode(dayId, parsed.request.spiritual);
  return { dayId, identity, source: prepared.grounding, stored, explicitMode, mode: explicitMode ?? (stored ? "ai" : "authored") as JourneyReflectionMode };
}
