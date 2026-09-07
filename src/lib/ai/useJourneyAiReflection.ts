// Participant-side controller for the current ten-day AI reflection.
//
// Behaviour it guarantees:
//   - NOTHING is generated automatically. A person must press Generate.
//   - one in-flight call at a time; a repeat press while running is ignored
//     rather than becoming a second paid call;
//   - a stored response is shown only on an EXACT identity match, so changing an
//     answer, the spiritual preference or the day silently invalidates it;
//   - a failure never substitutes the authored reflection for an AI one, and
//     never claims a reflection was written when it was not;
//   - unmount, navigation and clearing abandon the result instead of writing it.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { parseJourneyRequest } from "@/lib/ai/journey-contract";
import { prepareJourneyGeneration } from "@/lib/ai/journey-policy";
import { composeJourneyResponseIdentity } from "@/lib/ai/journey-identity";
import { currentJourneyAiConsent } from "@/lib/ai/journey-consent";
import { generateJourneyAiReflection } from "@/lib/ai/journey-ai.functions";
import {
  JOURNEY_AI_EVENT,
  clearAiReflection,
  readAiReflection,
  saveAiReflection,
} from "@/lib/ai/journey-ai-store";
import type { JourneyBoundaryResult } from "@/lib/ai/journey-boundary";

export type JourneyAiStatus = "idle" | "ready" | "generating" | "shown" | "failed";

export interface JourneyAiRequestInput {
  day: number;
  answerMeaningVersion: string;
  answers: string[];
  spiritual: boolean;
}

/** One short, honest sentence per fixed failure code. No internal codes shown. */
export function journeyAiFailureMessage(code: string): string {
  switch (code) {
    case "ai-not-activated":
    case "ai-not-released":
      return "The AI reflection is not switched on yet. The written reflection for this day is below.";
    case "pilot-not-verified":
    case "pilot-check-unavailable":
      return "We could not confirm your access just now. Please reload and enter your access code again.";
    case "consent-invalid":
    case "consent-version-stale":
    case "consent-not-accepted":
      return "The explanation has changed since you last agreed, so please read it and choose again.";
    case "provider-rate-limited":
      return "The AI service is busy right now. You can try again in a little while.";
    case "provider-budget-exhausted":
      return "The AI reflection is unavailable at the moment. The written reflection for this day is below.";
    case "provider-timeout":
    case "provider-network":
    case "provider-unavailable":
      return "We could not reach the AI service. Please check your connection and try again.";
    default:
      return "The AI reflection could not be completed this time. The written reflection for this day is below.";
  }
}

export function useJourneyAiReflection(input: JourneyAiRequestInput | null) {
  const callServer = useServerFn(generateJourneyAiReflection);

  const [status, setStatus] = useState<JourneyAiStatus>("idle");
  const [text, setText] = useState<string | null>(null);
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [failureCode, setFailureCode] = useState<string | null>(null);

  const inFlight = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /**
   * The exact identity this request would be answered under, computed with the
   * same pure preparation the server uses. `null` means the request itself is
   * not currently valid, so no call may be offered.
   */
  const identity = useMemo(() => {
    if (!input) return null;
    const parsed = parseJourneyRequest(input);
    if (!parsed.ok) return null;
    const prepared = prepareJourneyGeneration(parsed.request);
    return composeJourneyResponseIdentity(prepared.identity, "live-model");
  }, [input]);

  const dayId = useMemo(() => (input ? `day-${input.day}` : null), [input]);

  // Restore, or drop, whenever the identity changes. A non-matching stored
  // response is simply not shown; the answers behind it are never touched.
  useEffect(() => {
    if (!dayId || !identity) {
      setStatus("idle");
      setText(null);
      setParagraphs([]);
      setFailureCode(null);
      return;
    }
    const stored = readAiReflection(dayId, identity.canonicalIdentity);
    if (stored) {
      setText(stored.text);
      setParagraphs(stored.paragraphs);
      setFailureCode(null);
      setStatus("shown");
    } else {
      setText(null);
      setParagraphs([]);
      setFailureCode(null);
      setStatus("ready");
    }
  }, [dayId, identity]);

  // Another surface (a clear, or a second tab) changing the store re-resolves.
  useEffect(() => {
    if (typeof window === "undefined" || !dayId || !identity) return;
    const onChange = () => {
      if (!alive.current) return;
      const stored = readAiReflection(dayId, identity.canonicalIdentity);
      if (!stored) {
        setText(null);
        setParagraphs([]);
        setStatus((s) => (s === "generating" ? s : "ready"));
      }
    };
    window.addEventListener(JOURNEY_AI_EVENT, onChange);
    return () => window.removeEventListener(JOURNEY_AI_EVENT, onChange);
  }, [dayId, identity]);

  const generate = useCallback(async () => {
    if (!input || !identity || !dayId) return;
    if (inFlight.current) return; // never a second paid call for one press
    inFlight.current = true;
    setStatus("generating");
    setFailureCode(null);

    let result: JourneyBoundaryResult;
    try {
      result = (await callServer({
        data: { request: input, consent: currentJourneyAiConsent() },
      })) as JourneyBoundaryResult;
    } catch {
      inFlight.current = false;
      if (!alive.current) return;
      setStatus("failed");
      setFailureCode("provider-network");
      return;
    }
    inFlight.current = false;

    // Abandoned: the person navigated away or unmounted. Nothing is stored.
    if (!alive.current) return;

    if (!result || result.ok !== true) {
      setStatus("failed");
      setFailureCode(result && "code" in result ? result.code : "provider-invalid-output");
      return;
    }

    // Honesty check: only a response accepted under the identity we asked for
    // is shown or saved.
    if (result.identity?.canonicalIdentity !== identity.canonicalIdentity) {
      setStatus("failed");
      setFailureCode("response-model-mismatch");
      return;
    }

    setText(result.text);
    setParagraphs(result.paragraphs);
    setStatus("shown");
    saveAiReflection({
      dayId,
      text: result.text,
      paragraphs: result.paragraphs,
      identity: result.identity,
    });
  }, [callServer, dayId, identity, input]);

  const discard = useCallback(() => {
    if (!dayId) return;
    clearAiReflection(dayId);
    setText(null);
    setParagraphs([]);
    setStatus("ready");
  }, [dayId]);

  return {
    available: identity !== null,
    status,
    text,
    paragraphs,
    failureMessage: failureCode ? journeyAiFailureMessage(failureCode) : null,
    generate,
    discard,
  };
}
