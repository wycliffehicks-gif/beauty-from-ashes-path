// Current-journey controller: explicit generation, exact saved identity and no
// paid request on restoration. A shared in-tab registry deduplicates remounts.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { currentJourneyAiConsent } from "@/lib/ai/journey-consent";
import { generateJourneyAiReflection, getJourneyAiAvailability } from "@/lib/ai/journey-ai.functions";
import {
  JOURNEY_AI_EVENT, JOURNEY_AI_STORAGE_KEY, JOURNEY_AI_CONSENT_KEY,
  aiConsentAccepted, clearAiReflection, resolveSavedAiPresentation,
  saveAiReflection, saveAiMode, type JourneyReflectionMode,
} from "@/lib/ai/journey-ai-store";
import { CLEAR_STATUS_EVENT, removeLocalConfirmed } from "@/lib/storage-status";
import type { JourneyBoundaryResult } from "@/lib/ai/journey-boundary";

export type JourneyAiStatus = "idle" | "ready" | "generating" | "shown" | "failed";
export interface JourneyAiRequestInput { day: number; answerMeaningVersion: string; answers: string[]; spiritual: boolean }
interface Attempt { promise: Promise<JourneyBoundaryResult>; invalidated: boolean }
const pending = new Map<string, Attempt>();
const boundTargets = new WeakSet<object>();
function invalidates(event: Event): boolean {
  if (event.type === "storage") {
    const e = event as StorageEvent;
    if (e.key !== null && e.key !== JOURNEY_AI_STORAGE_KEY && e.key !== JOURNEY_AI_CONSENT_KEY) return false;
    // Honour an explicit clear from another tab even if this tab had an
    // authoritative failed-write overlay for the same owned key.
    if (e.newValue === null) {
      if (e.key === null || e.key === JOURNEY_AI_STORAGE_KEY) removeLocalConfirmed(JOURNEY_AI_STORAGE_KEY);
      if (e.key === null || e.key === JOURNEY_AI_CONSENT_KEY) removeLocalConfirmed(JOURNEY_AI_CONSENT_KEY);
    }
    return true;
  }
  const kind = (event as CustomEvent<{ kind?: string }>).detail?.kind;
  return !kind || kind === "clear" || kind === "mode" || (kind === "consent" && !aiConsentAccepted());
}
function bindInvalidation() {
  if (typeof window === "undefined" || boundTargets.has(window)) return;
  boundTargets.add(window);
  const change = (event: Event) => {
    if (invalidates(event)) for (const attempt of pending.values()) attempt.invalidated = true;
  };
  window.addEventListener(JOURNEY_AI_EVENT, change);
  window.addEventListener(CLEAR_STATUS_EVENT, change);
  window.addEventListener("storage", change);
}
export function journeyAiFailureMessage(code: string): string {
  switch (code) {
    case "ai-not-activated": case "ai-not-released": return "The AI reflection is not switched on yet. Your saved reflection remains available, or you can choose the written reflection.";
    case "pilot-not-verified": case "pilot-check-unavailable": return "We could not confirm your access just now. Please try again when your connection is available.";
    case "consent-invalid": case "consent-version-stale": case "consent-not-accepted": return "Please read the current AI explanation and choose whether to send today's selections.";
    case "provider-rate-limited": return "The AI service is busy right now. You can try again in a little while.";
    case "provider-budget-exhausted": return "The AI reflection is unavailable at the moment. You can keep a saved reflection or choose the written reflection.";
    case "provider-timeout": case "provider-network": case "provider-unavailable": return "We could not reach the AI service. Please check your connection and try again.";
    default: return "The AI reflection could not be completed this time. You can try again or choose the written reflection.";
  }
}
interface View { key: string; status: JourneyAiStatus; failureCode?: string }
export function useJourneyAiReflection(input: JourneyAiRequestInput | null) {
  const callServer = useServerFn(generateJourneyAiReflection);
  const checkAvailability = useServerFn(getJourneyAiAvailability);
  const [availability, setAvailability] = useState({ available: false, loading: true });
  const [, bump] = useState(0);
  const [view, setView] = useState<View | null>(null);
  const alive = useRef(false), epoch = useRef(0);
  const presentation = resolveSavedAiPresentation(input);
  const key = presentation?.identity.canonicalIdentity ?? "";
  const mode: JourneyReflectionMode = presentation?.explicitMode ?? (presentation?.stored ? "ai" : availability.available && presentation ? "ai" : "authored");
  const latestKey = useRef(key), latestMode = useRef(mode);
  // Synchronous identity guard: old text is never exposed for a new render,
  // including the render before useEffect cleanup on spiritual-mode changes.
  if (latestKey.current !== key || latestMode.current !== mode) {
    epoch.current += 1;
    latestKey.current = key;
    latestMode.current = mode;
  }
  const inputKey = input ? JSON.stringify(input) : "";
  const stableInput = useMemo(() => input, [inputKey]);
  useEffect(() => {
    alive.current = true;
    bindInvalidation();
    return () => { alive.current = false; epoch.current += 1; };
  }, []);
  useEffect(() => {
    let active = true;
    setAvailability({ available: false, loading: true });
    Promise.resolve().then(() => checkAvailability()).then(result => {
      if (active) setAvailability({ available: result?.available === true, loading: false });
    }).catch(() => { if (active) setAvailability({ available: false, loading: false }); });
    return () => { active = false; };
  }, [checkAvailability]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const change = (event: Event) => {
      if (event.type === "storage") {
        const e = event as StorageEvent;
        if (e.key !== null && e.key !== JOURNEY_AI_STORAGE_KEY && e.key !== JOURNEY_AI_CONSENT_KEY) return;
      }
      if (invalidates(event)) { epoch.current += 1; setView(null); }
      bump(n => n + 1);
    };
    window.addEventListener(JOURNEY_AI_EVENT, change);
    window.addEventListener(CLEAR_STATUS_EVENT, change);
    window.addEventListener("storage", change);
    return () => { window.removeEventListener(JOURNEY_AI_EVENT, change); window.removeEventListener(CLEAR_STATUS_EVENT, change); window.removeEventListener("storage", change); };
  }, []);
  const setMode = useCallback((next: JourneyReflectionMode) => {
    const current = resolveSavedAiPresentation(stableInput);
    if (!current || !stableInput) return;
    epoch.current += 1;
    saveAiMode(current.dayId, stableInput.spiritual, next);
    setView(null);
    bump(n => n + 1);
  }, [stableInput]);
  const generate = useCallback(async () => {
    const current = resolveSavedAiPresentation(stableInput);
    if (!current || !stableInput || !availability.available) return;
    const requestKey = current.identity.canonicalIdentity;
    if (!aiConsentAccepted()) { setView({ key: requestKey, status: "failed", failureCode: "consent-not-accepted" }); return; }
    // Restoration never regenerates an existing matching accepted response.
    if (current.stored) { saveAiMode(current.dayId, stableInput.spiritual, "ai"); bump(n => n + 1); return; }
    if (current.mode !== "ai") saveAiMode(current.dayId, stableInput.spiritual, "ai");
    latestMode.current = "ai";
    const ownEpoch = epoch.current;
    let attempt = pending.get(requestKey);
    if (attempt?.invalidated) return; // an abandoned paid call must settle first
    if (!attempt) {
      attempt = { invalidated: false, promise: Promise.resolve().then(() => {
        if (!aiConsentAccepted() || pending.get(requestKey)?.invalidated) return { ok: false, code: "consent-not-accepted" } as JourneyBoundaryResult;
        return callServer({ data: { request: stableInput, consent: currentJourneyAiConsent() } });
      }) as Promise<JourneyBoundaryResult> };
      pending.set(requestKey, attempt);
      const owned = attempt;
      void attempt.promise.finally(() => { if (pending.get(requestKey) === owned) pending.delete(requestKey); }).catch(() => {});
    }
    setView({ key: requestKey, status: "generating" });
    let result: JourneyBoundaryResult;
    try { result = await attempt.promise; }
    catch { if (alive.current && epoch.current === ownEpoch && latestKey.current === requestKey && !attempt.invalidated) setView({ key: requestKey, status: "failed", failureCode: "provider-network" }); return; }
    if (!alive.current || epoch.current !== ownEpoch || latestKey.current !== requestKey || latestMode.current !== "ai" || attempt.invalidated || !aiConsentAccepted()) return;
    if (!result || result.ok !== true) { setView({ key: requestKey, status: "failed", failureCode: result && "code" in result ? result.code : "provider-invalid-output" }); return; }
    if (result.identity?.canonicalIdentity !== requestKey || result.identity.provenance !== "live-model") { setView({ key: requestKey, status: "failed", failureCode: "response-model-mismatch" }); return; }
    saveAiReflection({ dayId: current.dayId, text: result.text, identity: result.identity, source: current.source });
    const saved = resolveSavedAiPresentation(stableInput)?.stored;
    setView(saved ? { key: requestKey, status: "shown" } : { key: requestKey, status: "failed", failureCode: "provider-invalid-output" });
    bump(n => n + 1);
  }, [callServer, stableInput, availability.available]);
  const discard = useCallback(() => {
    const current = resolveSavedAiPresentation(stableInput);
    if (!current || !stableInput) return;
    epoch.current += 1;
    clearAiReflection(current.dayId, stableInput.spiritual);
    setView(null);
    bump(n => n + 1);
  }, [stableInput]);
  const stored = mode === "ai" ? presentation?.stored : null;
  const activeView = view?.key === key ? view : null;
  const status: JourneyAiStatus = stored ? "shown" : mode !== "ai" ? "idle" : activeView?.status ?? "ready";
  return {
    available: availability.available, availabilityLoading: availability.loading, loading: availability.loading,
    mode, setMode, status, hasSavedReflection: !!presentation?.stored, text: stored?.text ?? null, paragraphs: stored?.paragraphs ?? [],
    ready: !availability.loading && (mode === "authored" || !!stored),
    failureMessage: activeView?.failureCode ? journeyAiFailureMessage(activeView.failureCode) : null,
    generate, discard,
  };
}
