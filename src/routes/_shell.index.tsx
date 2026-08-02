import { Link, createFileRoute } from "@tanstack/react-router";
import { VisualMotif } from "@/components/VisualMotifs";
import {
  JOURNEY_DAYS,
  JOURNEY_HOME_TITLE,
  JOURNEY_IDENTITY,
  getJourneyDayById,
} from "@/content/journey";
import { hasMeaningfulProgress, useJourneyProgress } from "@/lib/journey/progress";
import { useStorageStatus } from "@/lib/storage-status";


export const Route = createFileRoute("/_shell/")({
  head: () => ({
    meta: [
      { title: "Your Journey — Beauty from Ashes: The First Journey" },
      {
        name: "description",
        content:
          "Your Journey: open a day when you have a little space. No locks, no streaks, no pressure.",
      },
      { property: "og:title", content: "Your Journey — Beauty from Ashes" },
      {
        property: "og:description",
        content: "Open a day when you have a little space. Every day stays revisitable.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: JourneyHome,
});

function JourneyHome() {
  const { progress, hydrated } = useJourneyProgress();
  const { persistent, hydrated: storageHydrated } = useStorageStatus();

  const completed = new Set(progress.completedDays);
  const resume = hydrated && hasMeaningfulProgress(progress) ? progress.locator : null;
  const resumeDay = resume ? getJourneyDayById(resume.dayId) : undefined;

  // "Where you are now" must be the day the saved resume locator actually points
  // to. Only when there is no meaningful resume does the first unfinished day
  // become the quiet starting point. No locks — every day stays open.
  const currentId =
    resumeDay?.id ?? JOURNEY_DAYS.find((d) => !completed.has(d.id))?.id ?? null;

  return (
    <section className="space-y-8 pb-6">
      <div className="bfa-visual-home-hero">
        <VisualMotif variant="home" />
        <header className="bfa-visual-home-hero-inner space-y-3">
          <h1 className="bfa-heading font-serif text-3xl leading-tight sm:text-4xl">
            {JOURNEY_HOME_TITLE}
          </h1>
          <p className="text-[0.95rem] text-muted-foreground">{JOURNEY_IDENTITY}</p>
          <hr className="gold-seam w-28" />
          <p className="text-base text-foreground">
            Open a day when you have a little space. Days stay open, and you can return to any of
            them as often as you like.
          </p>
        </header>
      </div>


      {resume && resumeDay && (
        <div
          data-testid="resume-card"
          className="rounded-xl border border-[color:var(--gold)] bg-card p-5"
        >
          <p className="eyebrow text-[0.72rem]">Continue where you left off</p>
          <h2 className="mt-2 font-serif text-xl text-foreground">
            Day {resumeDay.day} · {resumeDay.title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground" data-testid="resume-storage-note">
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
        <h2 className="font-serif text-lg text-foreground">The ten days</h2>
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
                  <span aria-hidden className="day-marker">
                    {d.day}
                  </span>
                  <span className="min-w-0">
                    {/* The day number is decorative in the marker, so the row
                        still needs a real "Day N" name for assistive tech. */}
                    <span className="sr-only">Day {d.day}: </span>
                    <span className="block font-serif text-lg leading-snug text-foreground">
                      {d.title}
                    </span>

                    <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">
                      {d.theme}
                    </span>
                    <span className="mt-1.5 block text-[0.72rem] uppercase tracking-[0.16em] text-muted-foreground">
                      {state === "complete"
                        ? "Finished · open any time"
                        : state === "current"
                          ? "Where you are now"
                          : "Open any time"}
                      {" · "}
                      {d.descriptor}
                    </span>
                  </span>
                  <span aria-hidden className="text-[color:var(--gold)]">
                    ›
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
        </div>

        <p className="pt-1 text-sm text-muted-foreground">
          Nothing here is timed, scored or compared.
        </p>
      </div>
    </section>
  );
}
