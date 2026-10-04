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
import { getJourneyAiFailure, normalizeJourneyAiFailure, type JourneyAiFailureCode } from "@/lib/ai/journey-ai-feedback";

export type JourneyAiStatus = "idle" | "ready" | "generating" | "shown" | "failed";
export interface JourneyAiRequestInput { day: number; answerMeaningVersion: string; answers: string[]; spiritual: boolean }
interface Attempt { promise: Promise<JourneyBoundaryResult>; invalidated: boolean; cleared: boolean; provisionalSuccess?: boolean; deadlineAt: number }
export const JOURNEY_AVAILABILITY_WAIT_MS = 10_000;
// Longer than the current 45-second server transport deadline. A client timeout
// does not prove that a server request stopped or that no cost was incurred.
export const JOURNEY_GENERATION_WAIT_MS = 60_000;
const CLIENT_WAIT_EXPIRED = Symbol("client-wait-expired");
const pending = new Map<string, Attempt>();
const boundTargets = new WeakSet<object>();
// Refusals and unsettled presentation outcomes survive mode changes/remounts in
// this window. This is only a UX hold: reload/clear is not durable accounting or
// permission to redispatch.
const failuresByWindow = new WeakMap<object, Map<string, JourneyAiFailureCode>>();
function windowFailures() {
  if (typeof window === "undefined") return null;
  let failures = failuresByWindow.get(window);
  if (!failures) { failures = new Map(); failuresByWindow.set(window, failures); }
  return failures;
}
function clearsFailureHistory(event: Event): boolean {
  if (event.type === CLEAR_STATUS_EVENT) return true;
  if (event.type === "storage") {
    const e = event as StorageEvent;
    return e.newValue === null && (e.key === null || e.key === JOURNEY_AI_STORAGE_KEY);
  }
  return (event as CustomEvent<{ kind?: string }>).detail?.kind === "clear";
}
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
    if (clearsFailureHistory(event)) {
      for (const attempt of pending.values()) attempt.cleared = true;
      windowFailures()?.clear();
    }
    if (invalidates(event)) for (const attempt of pending.values()) attempt.invalidated = true;
  };
  window.addEventListener(JOURNEY_AI_EVENT, change);
  window.addEventListener(CLEAR_STATUS_EVENT, change);
  window.addEventListener("storage", change);
}
export function journeyAiFailureMessage(code: string): string {
  return getJourneyAiFailure(code).message;
}
interface View { key: string; status: JourneyAiStatus; failureCode?: string }
export function useJourneyAiReflection(input: JourneyAiRequestInput | null) {
  const callServer = useServerFn(generateJourneyAiReflection);
  const checkAvailability = useServerFn(getJourneyAiAvailability);
  const [availability, setAvailability] = useState<{
    available: boolean; loading: boolean; checked: boolean; failureCode?: JourneyAiFailureCode;
  }>({ available: false, loading: true, checked: false });
  const [availabilityCheck, setAvailabilityCheck] = useState(0);
  const [, bump] = useState(0);
  const [view, setView] = useState<View | null>(null);
  const alive = useRef(false), epoch = useRef(0);
  const presentation = resolveSavedAiPresentation(input);
  const key = presentation?.identity.canonicalIdentity ?? "";
  const mode: JourneyReflectionMode = presentation?.explicitMode ?? (presentation?.stored ? "ai" : availability.available && presentation ? "ai" : "authored");
  const latestKey = useRef(key), latestMode = useRef(mode);
  const failureHistory = windowFailures();
  const reportFailure = useCallback((requestKey: string, code: unknown, replaceOwnProvisional = false) => {
    const previous = failureHistory?.get(requestKey);
    const normalized = replaceOwnProvisional && previous === "request-status-unknown"
      ? normalizeJourneyAiFailure(code) : previous ?? normalizeJourneyAiFailure(code);
    failureHistory?.set(requestKey, normalized);
    setView({ key: requestKey, status: "failed", failureCode: normalized });
  }, [failureHistory]);
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
    const checkedKey = latestKey.current;
    setAvailability(previous => ({ ...previous, loading: true }));
    const fail = () => setAvailability({ available: false, loading: false, checked: true, failureCode: "availability-check-unavailable" });
    const timer = setTimeout(() => {
      if (!active) return;
      active = false;
      fail();
    }, JOURNEY_AVAILABILITY_WAIT_MS);
    Promise.resolve().then(() => checkAvailability()).then(result => {
      if (!active) return;
      active = false; clearTimeout(timer);
      if (result?.available === true) {
        // Only an explicit check can clear an access refusal. A remount or a
        // successful check must never erase a usage/provider/uncertain hold.
        const held = failureHistory?.get(checkedKey);
        if (availabilityCheck > 0 && held && getJourneyAiFailure(held).recovery === "check-availability") {
          failureHistory?.delete(checkedKey);
          setView(previous => previous?.key === checkedKey ? null : previous);
        }
        setAvailability({ available: true, loading: false, checked: true });
      } else {
        const code = result && "code" in result && ["ai-not-activated", "ai-not-released", "pilot-not-verified", "pilot-check-unavailable"].includes(result.code)
          ? normalizeJourneyAiFailure(result.code) : "availability-check-unavailable";
        setAvailability({ available: false, loading: false, checked: true, failureCode: code });
      }
    }).catch(() => { if (active) { active = false; clearTimeout(timer); fail(); } });
    return () => { active = false; clearTimeout(timer); };
  }, [checkAvailability, availabilityCheck, failureHistory]);
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
    if (!current || !stableInput || !availability.available || availability.loading) return;
    const requestKey = current.identity.canonicalIdentity;
    // Restoration never regenerates an existing matching accepted response.
    if (current.stored) { saveAiMode(current.dayId, stableInput.spiritual, "ai"); bump(n => n + 1); return; }
    const held = failureHistory?.get(requestKey);
    if (held) { reportFailure(requestKey, held); return; }
    if (!aiConsentAccepted()) { reportFailure(requestKey, "consent-not-accepted"); return; }
    if (current.mode !== "ai") saveAiMode(current.dayId, stableInput.spiritual, "ai");
    latestMode.current = "ai";
    const ownEpoch = epoch.current;
    let attempt = pending.get(requestKey);
    if (attempt?.invalidated) {
      // An abandoned or timed-out call cannot be replaced. Reporting uncertainty
      // keeps a separate same-window hold even after the pending call settles.
      reportFailure(requestKey, "request-status-unknown");
      return;
    }
    if (!attempt) {
      attempt = { invalidated: false, cleared: false, deadlineAt: Date.now() + JOURNEY_GENERATION_WAIT_MS, promise: Promise.resolve().then(() => {
        if (!aiConsentAccepted() || pending.get(requestKey)?.invalidated) return { ok: false, code: "consent-not-accepted" } as JourneyBoundaryResult;
        return callServer({ data: { request: stableInput, consent: currentJourneyAiConsent() } });
      }) as Promise<JourneyBoundaryResult> };
      pending.set(requestKey, attempt);
      const owned = attempt;
      // Retain only bounded outcome codes independently of mounted views. A
      // successful result stays held until an active guarded consumer accepts it;
      // leaving the screen cannot turn discarded output into a fresh dispatch.
      const retainOutcome = (code: unknown, provisionalSuccess = false) => {
        if (!owned.cleared && !failureHistory?.has(requestKey)) {
          failureHistory?.set(requestKey, normalizeJourneyAiFailure(code));
          owned.provisionalSuccess = provisionalSuccess;
        }
      };
      void attempt.promise.then(result => {
        retainOutcome(result?.ok === true ? "request-status-unknown"
          : typeof result === "object" && result !== null && "code" in result ? result.code : "provider-invalid-output", result?.ok === true);
      }, () => retainOutcome("request-status-unknown"));
      void attempt.promise.finally(() => { if (pending.get(requestKey) === owned) pending.delete(requestKey); }).catch(() => {});
    }
    setView({ key: requestKey, status: "generating" });
    let result: JourneyBoundaryResult | typeof CLIENT_WAIT_EXPIRED;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      result = await Promise.race([
        attempt.promise,
        new Promise<typeof CLIENT_WAIT_EXPIRED>(resolve => {
          // A remount joins the original deadline rather than starting a fresh
          // waiting window for the same underlying request.
          timer = setTimeout(() => resolve(CLIENT_WAIT_EXPIRED), Math.max(0, attempt.deadlineAt - Date.now()));
        }),
      ]);
    }
    catch {
      if (alive.current && epoch.current === ownEpoch && latestKey.current === requestKey && latestMode.current === "ai" && aiConsentAccepted()) {
        reportFailure(requestKey, "request-status-unknown");
      }
      return;
    }
    finally { if (timer !== undefined) clearTimeout(timer); }
    if (result === CLIENT_WAIT_EXPIRED) {
      // Keep the registry entry until the underlying promise settles. Releasing
      // it here could allow a second billable request while the first still runs.
      attempt.invalidated = true;
      if (alive.current && epoch.current === ownEpoch && latestKey.current === requestKey && latestMode.current === "ai") {
        reportFailure(requestKey, "request-status-unknown");
      }
      return;
    }
    if (!alive.current || epoch.current !== ownEpoch || latestKey.current !== requestKey || latestMode.current !== "ai" || !aiConsentAccepted()) return;
    if (attempt.invalidated) {
      reportFailure(requestKey, "request-status-unknown");
      return;
    }
    if (!result || result.ok !== true) { reportFailure(requestKey, typeof result === "object" && result !== null && "code" in result ? result.code : "provider-invalid-output"); return; }
    if (result.identity?.canonicalIdentity !== requestKey || result.identity.provenance !== "live-model") { reportFailure(requestKey, "response-model-mismatch", attempt.provisionalSuccess); return; }
    saveAiReflection({ dayId: current.dayId, text: result.text, identity: result.identity, source: current.source });
    const saved = resolveSavedAiPresentation(stableInput)?.stored;
    if (saved) {
      if (attempt.provisionalSuccess && !attempt.cleared && failureHistory?.get(requestKey) === "request-status-unknown") failureHistory.delete(requestKey);
      setView({ key: requestKey, status: "shown" });
    }
    else reportFailure(requestKey, "provider-invalid-output", attempt.provisionalSuccess);
    bump(n => n + 1);
  }, [callServer, stableInput, availability.available, availability.loading, failureHistory, reportFailure]);
  const discard = useCallback(() => {
    const current = resolveSavedAiPresentation(stableInput);
    if (!current || !stableInput) return;
    epoch.current += 1;
    clearAiReflection(current.dayId, stableInput.spiritual);
    setView(null);
    bump(n => n + 1);
  }, [stableInput]);
  const recheckAvailability = useCallback(() => {
    const held = failureHistory?.get(latestKey.current);
    const recovery = held ? getJourneyAiFailure(held).recovery : undefined;
    const availabilityRecovery = availability.failureCode ? getJourneyAiFailure(availability.failureCode).recovery : undefined;
    if (availability.loading || (recovery !== "check-availability" && availabilityRecovery !== "check-availability")) return;
    setAvailabilityCheck(check => check + 1);
  }, [availability.loading, availability.failureCode, failureHistory]);
  const clearConsentFailure = useCallback(() => {
    const currentKey = latestKey.current, held = failureHistory?.get(currentKey);
    if (!aiConsentAccepted() || !held || getJourneyAiFailure(held).recovery !== "review-consent") return;
    failureHistory?.delete(currentKey);
    setView(previous => previous?.key === currentKey ? null : previous);
    bump(n => n + 1);
  }, [failureHistory]);
  const stored = mode === "ai" ? presentation?.stored : null;
  const activeView = view?.key === key ? view : null;
  const heldCode = failureHistory?.get(key) ?? activeView?.failureCode;
  const failure = !stored && heldCode ? getJourneyAiFailure(heldCode) : null;
  const status: JourneyAiStatus = stored ? "shown" : mode !== "ai" ? "idle" : failure ? "failed" : activeView?.status ?? "ready";
  return {
    available: availability.available, availabilityLoading: availability.loading, loading: availability.loading,
    mode, setMode, status, hasSavedReflection: !!presentation?.stored, text: stored?.text ?? null, paragraphs: stored?.paragraphs ?? [],
    ready: (!availability.loading || availability.checked) && (mode === "authored" || !!stored),
    failure, failureMessage: failure?.message ?? null,
    availabilityFailure: availability.failureCode ? getJourneyAiFailure(availability.failureCode) : null,
    canGenerate: !!presentation && availability.available && !availability.loading && !presentation.stored && !failure && status !== "generating" && aiConsentAccepted(),
    generate, discard, recheckAvailability, clearConsentFailure,
  };
}
