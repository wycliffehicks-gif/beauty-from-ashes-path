import { Link, createFileRoute } from "@tanstack/react-router";
import { usePrefs } from "@/lib/prefs";
import { DAYS } from "@/content/days";
import { SESSION_DAY } from "@/lib/session/day-three";


export const Route = createFileRoute("/_shell/")({
  head: () => ({
    meta: [
      { title: "Today — Beauty from Ashes" },
      {
        name: "description",
        content: "Start where you are. A gentle daily companion for walking toward hope.",
      },
      { property: "og:title", content: "Today — Beauty from Ashes" },
      {
        property: "og:description",
        content: "Start where you are. Begin one honest step.",
      },
    ],
  }),
  component: TodayPage,
});

function TodayPage() {
  const [prefs] = usePrefs();
  // Suggest the next unvisited day in the seven, otherwise Day 1.
  const nextDay =
    DAYS.find((d) => !prefs.visitedDays.includes(d.day))?.day ?? 1;
  const suggested = DAYS.find((d) => d.day === nextDay)!;

  return (
    <section className="space-y-8 py-6">
      <header className="space-y-2">
        <p className="font-serif text-lg font-medium tracking-wide text-[var(--deep-navy)] sm:text-xl">
          Resurgence Therapeutics
        </p>
        <p className="brand-tagline">
          AWAKEN&nbsp;|&nbsp;REDISCOVER&nbsp;|&nbsp;HOPE
        </p>

        <h1 className="font-serif text-3xl leading-tight text-foreground sm:text-4xl">
          Start where you are.
        </h1>
        <p className="text-muted-foreground">
          Not where you think you should be. There is no wrong pace today.
        </p>
      </header>

      <div className="surface-card space-y-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--ember)]" />
          Week 1 · Day {suggested.day}
        </div>
        <h2 className="font-serif text-2xl text-foreground">{suggested.title}</h2>
        <p className="text-sm text-muted-foreground">{suggested.theme}</p>
        <p className="text-sm text-muted-foreground">
          {suggested.day === SESSION_DAY
            ? "This one is the longer guided session — usually 30 to 60 minutes, and you can pause."
            : "A short daily practice."}
        </p>

        <div className="flex flex-col gap-2 pt-2 sm:flex-row">
          <Link
            to="/day/$day"
            params={{ day: String(suggested.day) }}
            className="inline-flex flex-1 items-center justify-center rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground transition-colors hover:opacity-90"
          >
            {suggested.day === SESSION_DAY ? "Open the guided session" : "Begin One Honest Step"}
          </Link>

          <Link
            to="/practice/$id"
            params={{ id: "pause-and-ground" }}
            className="inline-flex flex-1 items-center justify-center rounded-lg border border-border bg-background px-5 py-3 font-medium text-foreground hover:bg-secondary"
          >
            Pause and Ground
          </Link>
        </div>
      </div>

      <div className="rounded-lg border border-border/70 bg-secondary/40 p-4 text-sm text-muted-foreground">
        Missed days don’t count against you. You can revisit any day, in any order,
        for as long as you need.
      </div>

      <div>
        <h3 className="mb-3 font-serif text-lg text-foreground">Choose another day</h3>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {DAYS.map((d) => (
            <li key={d.day}>
              <Link
                to="/day/$day"
                params={{ day: String(d.day) }}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 hover:border-primary/60"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-xs uppercase tracking-widest text-muted-foreground">
                    Day {d.day}
                    {prefs.visitedDays.includes(d.day) ? " · visited" : ""}
                  </span>
                  <span className="truncate font-serif text-base text-foreground">{d.title}</span>
                </span>
                <span aria-hidden className="text-muted-foreground">›</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
