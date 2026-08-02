import { Link, createFileRoute } from "@tanstack/react-router";
import { VisualMotif } from "@/components/VisualMotifs";
import {
  JOURNEY_DAYS,
  JOURNEY_HOME_TITLE,
  JOURNEY_IDENTITY,
  getJourneyDayById,
} from "@/content/journey";
import { hasMeaningfulProgress, useJourneyProgress } from "@/lib/journey/progress";


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

  const completed = new Set(progress.completedDays);
  const resume = hydrated && hasMeaningfulProgress(progress) ? progress.locator : null;
  const resumeDay = resume ? getJourneyDayById(resume.dayId) : undefined;

  // The current day is the first not-yet-complete day; everything after is
  // simply not started yet. No locks — all days stay open.
  const currentId = JOURNEY_DAYS.find((d) => !completed.has(d.id))?.id ?? null;

  return (
    <section className="space-y-8 pb-6">
      <div className="bfa-visual-home-hero">
        <VisualMotif variant="home" />
        <header className="bfa-visual-home-hero-inner space-y-3">
          <h1 className="font-serif text-3xl leading-tight text-[color:var(--navy)] sm:text-4xl">
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
          <p className="mt-1 text-sm text-muted-foreground">
            Your place was saved on this device. Nothing was lost.
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
                    <span className="block font-serif text-lg leading-snug text-foreground">
                      {d.title}
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                      {d.theme}
                    </span>
                    <span className="mt-1.5 block text-[0.72rem] uppercase tracking-[0.16em] text-muted-foreground">
                      {state === "complete"
                        ? "Finished · open any time"
                        : state === "current"
                          ? "Where you are now"
                          : "Not started yet"}
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
        <p className="pt-1 text-sm text-muted-foreground">
          Nothing here is timed, scored or compared.
        </p>
      </div>
    </section>
  );
}
