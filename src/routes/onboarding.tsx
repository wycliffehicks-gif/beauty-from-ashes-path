import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

/** The router's own history position, for a truthful visible Back. */
function useHistoryIndex(): number {
  const router = useRouter();
  return useRouterState({
    select: (s) =>
      (s.location.state as { __TSR_index?: number } | undefined)?.__TSR_index ??
      router.history.length - 1,
  });
}

import { LEGAL_BUNDLE_VERSION, usePrefs } from "@/lib/prefs";
import { AGREEMENT_COPY, OPENING_SCREENS } from "@/content/opening";

/** Stable, non-answer screen keys so real history matches the visible steps. */
const OPENING_KEYS = [...OPENING_SCREENS.map((s) => s.key), "agreement"] as const;
const SAFE_KEY = /^[a-z-]{1,32}$/;

export const Route = createFileRoute("/onboarding")({
  /**
   * `s` names the visible opening screen, so browser and Android Back and
   * Forward move exactly one screen and match the visible Back and Continue.
   * It is never answer data and never anything a person typed.
   */
  validateSearch: (search: Record<string, unknown>): { s?: string } =>
    typeof search.s === "string" && SAFE_KEY.test(search.s) ? { s: search.s } : {},
  head: () => ({
    meta: [
      { title: "Welcome — Beauty from Ashes: The First Journey" },
      {
        name: "description",
        content:
          "A quiet place to slow down and look honestly. Beauty from Ashes: The First Journey.",
      },
      { property: "og:title", content: "Welcome — Beauty from Ashes" },
      {
        property: "og:description",
        content: "A quiet place to slow down and look honestly.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Opening,
});

const TOTAL = OPENING_SCREENS.length + 1; // three explanatory screens + agreement

function Opening() {
  const [, update] = usePrefs();
  const navigate = useNavigate();
  const router = useRouter();
  const search = Route.useSearch();
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);

  const fromUrl = search.s ? OPENING_KEYS.indexOf(search.s as (typeof OPENING_KEYS)[number]) : -1;
  const step = fromUrl >= 0 ? fromUrl : 0;

  // The real history position when this onboarding visit began. Only entries
  // this visit actually pushed may be walked back; a direct load or reload of
  // ?s=how-it-works or ?s=agreement pushed nothing, so visible Back must move to
  // the previous opening screen instead of leaving the app.
  const historyIndex = useHistoryIndex();
  const entryHistoryIndex = useRef<number | null>(null);
  if (entryHistoryIndex.current === null) entryHistoryIndex.current = historyIndex;

  const isAgreement = step === OPENING_SCREENS.length;
  const canAdvance = !isAgreement || (adultConfirmed && termsAgreed);

  const goToStep = (next: number, opts: { replace?: boolean } = {}) => {
    const key = OPENING_KEYS[Math.max(0, Math.min(OPENING_KEYS.length - 1, next))];
    if (key === search.s) return;
    navigate({ to: "/onboarding", search: { s: key }, replace: opts.replace });
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  };

  const goBack = () => {
    if (step <= 0) return;
    const depth = historyIndex - (entryHistoryIndex.current ?? historyIndex);
    if (depth > 0) {
      router.history.back();
      if (typeof window !== "undefined") window.scrollTo(0, 0);
      return;
    }
    goToStep(step - 1, { replace: true });
  };





  // Deterministic post-acceptance transition. Home replaces the remaining entry
  // only once this visit's pushed entries have actually collapsed back to the
  // exact entry position — no timer, so Home can never land before the collapse
  // and strand the person back in onboarding, and an unrelated overshot entry
  // can never be replaced.
  const [collapsing, setCollapsing] = useState(false);
  // Immediate (pre-rerender) single-flight guard: a rapid double activation must
  // not be able to issue a second history.go.
  const acceptStarted = useRef(false);
  useEffect(() => {
    if (!collapsing) return;
    const entry = entryHistoryIndex.current ?? historyIndex;
    if (historyIndex === entry) {
      setCollapsing(false);
      navigate({ to: "/", replace: true });
    }
  }, [collapsing, historyIndex, navigate]);

  const accept = () => {
    if (!canAdvance) return;
    if (acceptStarted.current) return;
    acceptStarted.current = true;
    update({
      onboarded: true,
      legalAcceptance: {
        version: LEGAL_BUNDLE_VERSION,
        acceptedAt: new Date().toISOString(),
      },
    });
    // Collapse only the history entries this onboarding visit pushed, then
    // replace the remaining entry with Home, so browser/Android Back after
    // Begin cannot reveal an earlier onboarding screen. Unrelated prior
    // site/browser history is never erased.
    const depth = historyIndex - (entryHistoryIndex.current ?? historyIndex);
    if (depth <= 0) {
      navigate({ to: "/", replace: true });
      return;
    }
    setCollapsing(true);
    router.history.go(-depth);
  };


  return (
    <div className="journey-page">
      <div className="container-page flex min-h-[100dvh] flex-col">
        <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 pt-4 pb-1">
          {step > 0 ? (
            <button
              type="button"
              onClick={goBack}
              className="journey-chrome-btn text-sm"
              aria-label="Back"
            >
              ←
            </button>
          ) : (
            <span aria-hidden className="min-h-[44px] min-w-[44px]" />
          )}
          <p className="min-w-0 truncate text-center text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {step + 1} of {TOTAL}
          </p>
          <Link
            to="/support"
            className="journey-chrome-btn"
            aria-label="Support and safety"
            title="Support and safety"
          >
            <svg
              aria-hidden
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="8.5" />
              <circle cx="12" cy="12" r="3.5" />
              <path d="M6 6l3.6 3.6M18 6l-3.6 3.6M6 18l3.6-3.6M18 18l-3.6-3.6" />
            </svg>
          </Link>
        </header>

        <main className="bfa-safe-center flex-1 py-2">
          {isAgreement ? (
            <AgreementScreen
              adultConfirmed={adultConfirmed}
              termsAgreed={termsAgreed}
              setAdultConfirmed={setAdultConfirmed}
              setTermsAgreed={setTermsAgreed}
            />
          ) : (
            <ExplanatoryScreen index={step} />
          )}
        </main>

        <nav aria-label="Opening navigation" className="journey-dock">
          <button
            type="button"
            disabled={!canAdvance}
            aria-disabled={!canAdvance}
            onClick={() => (isAgreement ? accept() : goToStep(step + 1))}
            className="btn-primary-journey w-full"
          >
            {isAgreement ? AGREEMENT_COPY.beginLabel : "Continue"}
          </button>
          {isAgreement && !canAdvance && (
            <p className="pt-2 text-center text-sm text-muted-foreground">
              Please confirm both statements above to continue.
            </p>
          )}
        </nav>
      </div>
    </div>
  );
}

function ExplanatoryScreen({ index }: { index: number }) {
  const screen = OPENING_SCREENS[index];
  return (
    <section className="space-y-5" data-screen={screen.key}>
      <p className="eyebrow">{screen.eyebrow}</p>
      <h1 className="bfa-heading font-serif text-[1.7rem] leading-tight sm:text-4xl">
        {screen.title}
      </h1>
      <hr className="gold-seam w-24" />
      <p className="text-[1.02rem] leading-relaxed text-foreground sm:text-lg">{screen.lead}</p>
      <ul className="space-y-2.5">
        {screen.points.map((p) => (
          <li key={p} className="flex gap-3 text-[0.98rem] leading-snug text-foreground sm:text-base">
            <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--gold)]" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
      {screen.closing && (
        <p className="text-[0.95rem] italic leading-snug text-muted-foreground">{screen.closing}</p>
      )}
    </section>
  );
}

function AgreementScreen({
  adultConfirmed,
  termsAgreed,
  setAdultConfirmed,
  setTermsAgreed,
}: {
  adultConfirmed: boolean;
  termsAgreed: boolean;
  setAdultConfirmed: (v: boolean) => void;
  setTermsAgreed: (v: boolean) => void;
}) {
  return (
    <section className="space-y-4" data-screen="agreement">
      <p className="eyebrow">{AGREEMENT_COPY.eyebrow}</p>
      <h1 className="bfa-heading font-serif text-[1.6rem] leading-tight sm:text-3xl">
        {AGREEMENT_COPY.title}
      </h1>
      <p className="text-[0.98rem] leading-snug text-foreground">{AGREEMENT_COPY.lead}</p>

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="eyebrow text-[0.72rem]">What this is</p>
        <ul className="mt-2 space-y-1 text-[0.94rem] leading-snug text-foreground">
          {AGREEMENT_COPY.isPoints.map((p) => (
            <li key={p}>· {p}</li>
          ))}
        </ul>
        <p className="eyebrow mt-4 text-[0.72rem]">What it is not</p>
        <ul className="mt-2 space-y-1 text-[0.94rem] leading-snug text-foreground">
          {AGREEMENT_COPY.isNotPoints.map((p) => (
            <li key={p}>· {p}</li>
          ))}
        </ul>
      </div>

      <p className="text-[0.9rem] leading-snug text-muted-foreground">
        {AGREEMENT_COPY.automatedProcessingSentence}
      </p>
      <p className="text-[0.9rem] leading-snug text-muted-foreground">
        {AGREEMENT_COPY.safetySentence}
      </p>

      <p className="text-[0.86rem] leading-snug text-muted-foreground">
        {AGREEMENT_COPY.reviewNote}{" "}
        <Link to="/terms" target="_blank" className="inline-link text-primary underline underline-offset-4">
          Terms
        </Link>
        {" · "}
        <Link to="/privacy" target="_blank" className="inline-link text-primary underline underline-offset-4">
          Privacy
        </Link>
        {" · "}
        <Link
          to="/important-information"
          target="_blank"
          className="inline-link text-primary underline underline-offset-4"
        >
          Important Information
        </Link>
      </p>

      <label className="flex min-h-[44px] items-start gap-3 rounded-xl border border-border bg-card p-3.5">
        <input
          type="checkbox"
          data-testid="agree-adult"
          checked={adultConfirmed}
          onChange={(e) => setAdultConfirmed(e.target.checked)}
          className="mt-1 h-5 w-5 shrink-0"
        />
        <span className="text-[0.94rem] leading-snug text-foreground">
          {AGREEMENT_COPY.adultLabel}
        </span>
      </label>

      <label className="flex min-h-[44px] items-start gap-3 rounded-xl border border-border bg-card p-3.5">
        <input
          type="checkbox"
          data-testid="agree-terms"
          checked={termsAgreed}
          onChange={(e) => setTermsAgreed(e.target.checked)}
          className="mt-1 h-5 w-5 shrink-0"
        />
        <span className="text-[0.94rem] leading-snug text-foreground">
          {AGREEMENT_COPY.termsLabel}
        </span>
      </label>
    </section>
  );
}
