// The one place a person can choose an AI reflection.
//
// It is deliberately quiet and secondary: the authored reflection above it is
// always present, complete, and never replaced or delayed by this panel. There
// is no automatic generation, no countdown, no nudge and no reward.
//
// While the AI path is switched off, the panel states that plainly and offers
// nothing to press.

import { useEffect, useState } from "react";

import {
  JOURNEY_AI_DISCLOSURE_HEADING,
  JOURNEY_AI_DISCLOSURE_POINTS,
  JOURNEY_AI_UNAVAILABLE_NOTICE,
} from "@/lib/ai/journey-disclosure";
import { aiConsentAccepted, recordAiConsent } from "@/lib/ai/journey-ai-store";
import {
  useJourneyAiReflection,
  type JourneyAiRequestInput,
} from "@/lib/ai/useJourneyAiReflection";

export function JourneyAiReflection({ request }: { request: JourneyAiRequestInput | null }) {
  const ai = useJourneyAiReflection(request);
  const [hydrated, setHydrated] = useState(false);
  const [consented, setConsented] = useState(false);
  const [showDisclosure, setShowDisclosure] = useState(false);

  // Read on the client only, so the first paint never disagrees with the device.
  useEffect(() => {
    setConsented(aiConsentAccepted());
    setHydrated(true);
  }, []);

  if (!hydrated || !request) return null;

  const busy = ai.status === "generating";

  return (
    <section className="surface-card space-y-3" aria-labelledby="bfa-ai-heading">
      <h2 id="bfa-ai-heading" className="bfa-heading bfa-h3 font-serif">
        An optional AI reflection
      </h2>

      {!ai.available ? (
        <p className="bfa-copy text-muted-foreground">{JOURNEY_AI_UNAVAILABLE_NOTICE}</p>
      ) : !consented ? (
        <div className="space-y-3">
          <p className="bfa-copy text-muted-foreground">
            You can also have a reflection written for you from today’s choices. Please read
            what that involves first.
          </p>
          {showDisclosure ? (
            <div className="space-y-2">
              <h3 className="bfa-heading bfa-h4 font-serif">
                {JOURNEY_AI_DISCLOSURE_HEADING}
              </h3>
              {JOURNEY_AI_DISCLOSURE_POINTS.map((point) => (
                <p key={point} className="bfa-copy text-muted-foreground">
                  {point}
                </p>
              ))}
              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  type="button"
                  className="btn-primary-journey"
                  onClick={() => {
                    recordAiConsent(true);
                    setConsented(true);
                  }}
                >
                  I’ve read this — allow the AI reflection
                </button>
                <button
                  type="button"
                  className="btn-quiet"
                  onClick={() => setShowDisclosure(false)}
                >
                  Not now
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn-quiet" onClick={() => setShowDisclosure(true)}>
              Read what an AI reflection involves
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {ai.status === "shown" && ai.text ? (
            <div className="space-y-2">
              {ai.paragraphs.map((p) => (
                <p key={p} className="bfa-copy text-foreground">
                  {p}
                </p>
              ))}
              <p className="bfa-copy text-muted-foreground">
                Written by AI from today’s choices. It can be mistaken, and the written
                reflection above stays as it is.
              </p>
              <button type="button" className="btn-quiet" onClick={ai.discard}>
                Remove this AI reflection
              </button>
            </div>
          ) : (
            <>
              <p className="bfa-copy text-muted-foreground">
                Nothing is sent until you choose it.
              </p>
              <button
                type="button"
                className="btn-primary-journey"
                onClick={() => void ai.generate()}
                disabled={busy}
                aria-disabled={busy}
              >
                {busy ? "Writing your reflection…" : "Write an AI reflection for today"}
              </button>
            </>
          )}

          <p aria-live="polite" className="sr-only">
            {busy ? "Writing your reflection." : ""}
          </p>
          {ai.failureMessage ? (
            <p role="status" className="bfa-copy text-muted-foreground">
              {ai.failureMessage}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
