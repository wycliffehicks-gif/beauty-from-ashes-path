import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  JOURNEY_AI_DISCLOSURE_HEADING,
  JOURNEY_AI_DISCLOSURE_POINTS,
  JOURNEY_AI_UNAVAILABLE_NOTICE,
} from "@/lib/ai/journey-disclosure";
import { aiConsentAccepted, recordAiConsent, JOURNEY_AI_EVENT } from "@/lib/ai/journey-ai-store";
import { CLEAR_STATUS_EVENT } from "@/lib/storage-status";
import { useJourneyAiReflection, type JourneyAiRequestInput } from "@/lib/ai/useJourneyAiReflection";

const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** One chosen reflection, with the authored alternative always available. */
export function JourneyAiReflection({ request, children, onReadyChange }: {
  request: JourneyAiRequestInput | null;
  children: ReactNode;
  onReadyChange: (ready: boolean) => void;
}) {
  const ai = useJourneyAiReflection(request);
  const [hydrated, setHydrated] = useState(false);
  const [consented, setConsented] = useState(false);
  const [showDisclosure, setShowDisclosure] = useState(false);
  const resultHeading = useRef<HTMLHeadingElement>(null);

  useBeforePaint(() => {
    const refresh = () => {
      setConsented(aiConsentAccepted());
      setHydrated(true);
    };
    const clear = () => { setConsented(false); setShowDisclosure(false); };
    refresh();
    window.addEventListener(JOURNEY_AI_EVENT, refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener(CLEAR_STATUS_EVENT, clear);
    return () => {
      window.removeEventListener(JOURNEY_AI_EVENT, refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener(CLEAR_STATUS_EVENT, clear);
    };
  }, []);

  useBeforePaint(() => { onReadyChange(hydrated && ai.ready); }, [hydrated, ai.ready, onReadyChange]);
  useEffect(() => {
    if (ai.mode === "ai" && ai.status === "shown" && ai.text) resultHeading.current?.focus();
  }, [ai.mode, ai.status, ai.text]);

  if (!hydrated || !request || ai.availabilityLoading) {
    return <p role="status" className="bfa-copy text-muted-foreground">Preparing your reflection choices…</p>;
  }

  const busy = ai.status === "generating";
  const hasAi = ai.status === "shown" && !!ai.text;
  return (
    <div className="space-y-4">
      {ai.mode === "authored" ? (
        <>
          <p className="bfa-copy-support text-muted-foreground">Written reflection, drawn from the journey’s authored material.</p>
          {children}
          {ai.available || ai.hasSavedReflection ? (
            <button type="button" className="btn-quiet" onClick={() => ai.setMode("ai")}>Choose an AI reflection</button>
          ) : <p className="bfa-copy-support text-muted-foreground">{JOURNEY_AI_UNAVAILABLE_NOTICE}</p>}
        </>
      ) : (
        <section className="surface-card space-y-3" aria-labelledby="bfa-ai-heading">
          <h2 id="bfa-ai-heading" ref={resultHeading} tabIndex={-1} className="bfa-heading bfa-h3 font-serif outline-none">Your AI reflection</h2>
          {hasAi ? (
            <>
              {ai.paragraphs.map((paragraph, index) => <p key={index} className="bfa-copy text-foreground">{paragraph}</p>)}
              <p className="bfa-copy-support text-muted-foreground">Written by AI from today’s choices. It can be mistaken; keep what fits and leave what does not.</p>
            </>
          ) : !ai.available ? (
            <p role="status" className="bfa-copy text-muted-foreground">AI generation is unavailable right now. You can pause here or choose the written reflection.</p>
          ) : !consented ? (
            <div className="space-y-3">
              <p className="bfa-copy text-muted-foreground">A reflection can be written from today’s choices and journey material. Please read what that involves before choosing.</p>
              {showDisclosure ? (
                <>
                  <h3 className="bfa-heading bfa-h4 font-serif">{JOURNEY_AI_DISCLOSURE_HEADING}</h3>
                  {JOURNEY_AI_DISCLOSURE_POINTS.map((point) => <p key={point} className="bfa-copy text-muted-foreground">{point}</p>)}
                  <button type="button" className="btn-primary-journey" onClick={() => {
                    recordAiConsent(true);
                    setConsented(aiConsentAccepted());
                  }}>I’ve read this — allow AI reflections</button>
                </>
              ) : <button type="button" className="btn-quiet" onClick={() => setShowDisclosure(true)}>Read what an AI reflection involves</button>}
            </div>
          ) : (
            <>
              <p className="bfa-copy text-muted-foreground">Only today’s selected answers and relevant journey material will be sent when you choose to generate.</p>
              <button type="button" className="btn-primary-journey" onClick={() => void ai.generate()} disabled={busy}>
                {busy ? "Writing your reflection…" : "Generate my reflection"}
              </button>
            </>
          )}
          <p aria-live="polite" className="sr-only">{busy ? "Writing your reflection." : ""}</p>
          {ai.failureMessage ? <p role="status" className="bfa-copy text-muted-foreground">{ai.failureMessage}</p> : null}
          <button type="button" className="btn-quiet" onClick={() => ai.setMode("authored")}>Use the written reflection</button>
        </section>
      )}
    </div>
  );
}
