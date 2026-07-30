import { Link, createFileRoute } from "@tanstack/react-router";
import { DAYS } from "@/content/days";
import { usePrefs } from "@/lib/prefs";

export const Route = createFileRoute("/_shell/journey")({
  head: () => ({
    meta: [
      { title: "Journey — Beauty from Ashes" },
      {
        name: "description",
        content: "Seven revisitable days of gentle reflection. No streaks, no locks.",
      },
      { property: "og:title", content: "Journey — Beauty from Ashes" },
      {
        property: "og:description",
        content: "Seven revisitable days. Walk in the order that fits you.",
      },
    ],
  }),
  component: JourneyPage,
});

function JourneyPage() {
  const [prefs] = usePrefs();
  return (
    <section className="space-y-6 py-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Week 1</p>
        <h1 className="font-serif text-3xl text-foreground">Week 1, at your pace</h1>
        <p className="text-muted-foreground">
          Week 1 holds short daily practices — Days 1 and 2 to prepare, Days 4 to 7 to integrate —
          and one longer guided session on Day 3. Every day is open. There are no streaks and no
          locks, and you can revisit any day, in any order.
        </p>
      </header>


      <ol className="space-y-3">
        {DAYS.map((d) => {
          const visited = prefs.visitedDays.includes(d.day);
          return (
            <li key={d.day}>
              <Link
                to="/day/$day"
                params={{ day: String(d.day) }}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-xl border border-border bg-card p-4 hover:border-primary/60"
              >
                <span
                  aria-hidden
                  className={`grid h-11 w-11 shrink-0 place-items-center rounded-full font-serif text-lg ${
                    visited
                      ? "bg-primary/15 text-primary"
                      : "bg-secondary text-foreground"
                  }`}
                >
                  {d.day}
                </span>
                <span className="min-w-0">
                  <span className="block font-serif text-lg text-foreground">{d.title}</span>
                  <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                    {d.theme}
                  </span>
                </span>
                <span aria-hidden className="text-muted-foreground">›</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
