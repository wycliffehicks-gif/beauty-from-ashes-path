import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { VisualMotif } from "@/components/VisualMotifs";
import { LandingPage } from "@/components/LandingPage";
import { hasCurrentAcceptance } from "@/lib/agreement";
import {
  JOURNEY_DAYS,
  JOURNEY_HOME_TITLE,
  JOURNEY_IDENTITY,
  getJourneyDayById,
} from "@/content/journey";
import { usePrefs } from "@/lib/prefs";
import { useStorageStatus } from "@/lib/storage-status";
import {
  buildReflectionExport,
  downloadTextFile,
  openPrintableExport,
  type ExportPresentation,
} from "@/lib/journey/export";
import { hasMeaningfulProgress, useJourneyProgress } from "@/lib/journey/progress";

export const Route = createFileRoute("/_shell/")({
  head: () => ({
    meta: [
      { title: "Beauty from Ashes: The First Journey — A gentle daily companion for walking toward hope" },
      {
        name: "description",
        content:
          "A 10-day private guided reflection companion. Notice what is heavy, name it with honesty, and take one honest step forward. No scores, no streaks, no pressure.",
      },
      { property: "og:title", content: "Beauty from Ashes: The First Journey" },
      {
        property: "og:description",
        content:
          "A 10-day private guided reflection companion. Notice what is heavy, name it with honesty, and take one honest step forward.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HomeGate,
});

function HomeGate() {
  const [prefs, , hydrated] = usePrefs();
  const accepted = hasCurrentAcceptance(prefs);

  if (!hydrated) {
    return (
      <div className="container-page flex min-h-[60dvh] items-center justify-center" role="status" aria-live="polite">
        <p className="bfa-copy-support text-muted-foreground">One moment…</p>
      </div>
    );
  }

  // The first impression for a new person is a public landing page. Once the
  // legal bundle has been accepted, the same URL becomes the journey home.
  return accepted ? <JourneyHome /> : <LandingPage />;
}

function JourneyHome() {
  const { progress, hydrated } = useJourneyProgress();
  // Exports must show exactly what the screens would present right now, so the
  // hydrated spiritual preference is passed explicitly and fails closed.
  const [prefs, , prefsHydrated] = usePrefs();
  const exportPresentation = {
    hydrated: prefsHydrated,
    showSpiritual: prefs.showSpiritual,
  };
  const { persistent, hydrated: storageHydrated } = useStorageStatus();

  const completed = new Set(progress.completedDays);
  const resume = hydrated && hasMeaningfulProgress(progress) ? progress.locator : null;
  const resumeDay = resume ? getJourneyDayById(resume.dayId) : undefined;

  // "Where you are now" must be the day the saved resume locator actually points
  // to. Only when there is no meaningful resume does the first unfinished day
  // become the quiet starting point. No locks — every day stays open.
  const currentId =
    resumeDay?.id ?? JOURNEY_DAYS.find((d) => !completed.has(d.id))?.id ?? null;

  const allComplete = JOURNEY_DAYS.every((d) => completed.has(d.id));

  return (
    <section className="space-y-8 pb-6">
      <div className="bfa-visual-home-hero">
        <VisualMotif variant="home" />
        <header className="bfa-visual-home-hero-inner space-y-3">
          <h1 className="bfa-heading bfa-h1 font-serif">{JOURNEY_HOME_TITLE}</h1>
          <p className="bfa-copy-support text-muted-foreground">{JOURNEY_IDENTITY}</p>
          <hr className="gold-seam w-28" />
          <p className="bfa-copy text-foreground">
            Open a day when you have a little space. Days stay open, and you can return to any of
            them as often as you like.
          </p>
        </header>
      </div>

      {allComplete && (
        <div
          data-testid="completion-card"
          className="rounded-xl border border-[color:var(--bfa-interactive-gold)] bg-card p-5"
        >
          <p className="eyebrow">You have walked through all ten days</p>
          <h2 className="bfa-h2 mt-2 font-serif text-foreground">
            This is a completion, not an arrival
          </h2>
          <p className="bfa-copy-support mt-2 text-muted-foreground">
            You are welcome to revisit any day, name what has shifted, try a practice, or save your
            reflections to keep them somewhere safe.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link to="/shifted" className="btn-primary-journey flex-1" data-testid="shifted-link">
              What has shifted
            </Link>
            <Link to="/practices" className="btn-quiet flex-1">
              Try a practice now
            </Link>
          </div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <ExportButton progress={progress} presentation={exportPresentation} />
            <button
              type="button"
              data-testid="export-printable"
              onClick={() => openPrintableExport(progress, exportPresentation)}
              className="btn-quiet flex-1"
            >
              Printable version
            </button>
          </div>
        </div>
      )}

      {/* One-tap way into a short practice, for days when a whole day is too
          much. It is not a substitute for a day and does not record anything. */}
      <div data-testid="quick-practice-card" className="rounded-xl border border-border bg-card p-5">
        <h2 className="bfa-h3 font-serif text-foreground">If today feels like too much</h2>
        <p className="bfa-copy-support mt-1 text-muted-foreground">
          A short practice is here instead — two to five minutes, nothing recorded.
        </p>
        <Link to="/practices" className="btn-quiet mt-3 inline-flex" data-testid="quick-practice-link">
          Take a short practice
        </Link>
      </div>

      {resume && resumeDay && !allComplete && (
        <div
          data-testid="resume-card"
          className="rounded-xl border border-[color:var(--bfa-interactive-gold)] bg-card p-5"
        >
          <p className="eyebrow">Continue where you left off</p>
          <h2 className="bfa-h2 mt-2 font-serif text-foreground">
            Day {resumeDay.day} · {resumeDay.title}
          </h2>
          <p
            className="bfa-copy-support mt-1 text-muted-foreground"
            data-testid="resume-storage-note"
          >
            {!storageHydrated || persistent
              ? "Your place is saved in this browser, on this device."
              : "Your place is available in this tab for now. It may be lost if this tab closes or reloads."}
          </p>
          <Link
            to="/day/$day"
            params={{ day: String(resumeDay.day) }}
            search={{ resume: true }}
            className="btn-primary-journey mt-4 w-full"
          >
            Continue
          </Link>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="bfa-h2 font-serif text-foreground">The 10-Day Journey</h2>
        <div className="bfa-visual-thread-track">
          <VisualMotif variant="thread" />
          <ol className="space-y-3">
            {JOURNEY_DAYS.map((d) => {
              const isComplete = completed.has(d.id);
              const state = isComplete ? "complete" : d.id === currentId ? "current" : "upcoming";
              return (
                <li key={d.id}>
                  <Link
                    to="/day/$day"
                    params={{ day: String(d.day) }}
                    className="day-row"
                    data-state={state}
                    data-testid={`day-row-${d.id}`}
                  >
                    {/* Visible "Day N" in digits, for fast scanning. It is
                        decorative for assistive tech, which reads the row's own
                        "Day N:" name once instead. */}
                    <span aria-hidden className="day-marker">
                      <span className="day-marker-word">Day</span>
                      <span className="day-marker-num">{d.day}</span>
                    </span>
                    <span className="min-w-0">
                      {/* The day number is decorative in the marker, so the row
                          still needs a real "Day N" name for assistive tech. */}
                      <span className="sr-only">Day {d.day}: </span>
                      <span className="bfa-h3 block font-serif text-foreground">{d.title}</span>

                      <span className="bfa-copy-support day-row-theme mt-1 block text-muted-foreground">
                        {d.theme}
                      </span>
                      <span className="day-row-meta mt-2 block">
                        {state !== "upcoming" && (
                          <span className="day-row-state" data-state={state}>
                            {state === "complete" ? "Finished" : "Where you are now"}
                          </span>
                        )}
                        <span className="bfa-copy-meta day-row-descriptor text-muted-foreground">
                          {state === "upcoming" ? "Open any time · " : ""}
                          {d.descriptor}
                        </span>
                      </span>
                    </span>
                    <span aria-hidden className="day-row-chevron">
                      ›
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>

        <p className="bfa-copy-support pt-1 text-muted-foreground">
          Nothing here is timed, scored or compared.
        </p>
      </div>
    </section>
  );
}

function ExportButton({
  progress,
  presentation,
}: {
  progress: ReturnType<typeof useJourneyProgress>["progress"];
  presentation: ExportPresentation;
}) {
  const [done, setDone] = useState(false);
  const hasContent = progress.completedDays.length > 0;

  return (
    <button
      type="button"
      disabled={!hasContent}
      data-testid="export-reflections"
      onClick={() => {
        const { text, filename } = buildReflectionExport(progress, presentation);
        downloadTextFile(text, filename);
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      }}
      className="btn-quiet flex-1"
    >
      {done ? "Saved" : hasContent ? "Save your reflections" : "No reflections yet"}
    </button>
  );
}
