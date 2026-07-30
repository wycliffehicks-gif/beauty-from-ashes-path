import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { hasResumableWeek01Session } from "@/lib/session/day-three";

// PROVISIONAL COPY — for founder review.

export function DayThreeOrientation({ title, theme }: { title: string; theme: string }) {
  const [resumable, setResumable] = useState(false);
  const [notToday, setNotToday] = useState(false);

  useEffect(() => {
    setResumable(hasResumableWeek01Session());
  }, []);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <div className="container-page flex min-h-[100dvh] flex-col py-6">
        <header className="flex items-center justify-between gap-3 pb-4">
          <Link
            to="/journey"
            className="inline-flex min-h-11 items-center rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
          >
            ← Week 1
          </Link>
          <p className="min-w-0 flex-1 truncate text-center text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Day 3 · Guided session
          </p>
          <Link
            to="/"
            className="inline-flex min-h-11 items-center rounded-md px-2 py-1 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Home
          </Link>
        </header>

        {notToday ? (
          <main className="flex-1 space-y-5">
            <h1 className="font-serif text-2xl text-foreground">Not today is a real answer</h1>
            <p className="text-muted-foreground">
              Choosing not to begin is not failure. The session will still be here, unchanged,
              whenever there is a little more room. Nothing has been lost.
            </p>
            <div className="flex flex-col gap-3">
              <Link
                to="/practice/$id"
                params={{ id: "pause-and-ground" }}
                className="inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground hover:opacity-90"
              >
                Pause and Ground
              </Link>
              <Link
                to="/"
                className="inline-flex min-h-12 items-center justify-center rounded-lg border border-border bg-background px-5 py-3 font-medium text-foreground hover:bg-secondary"
              >
                Return home
              </Link>
              <button
                type="button"
                onClick={() => setNotToday(false)}
                className="inline-flex min-h-12 items-center justify-center rounded-lg px-5 py-3 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Go back to the session overview
              </button>
            </div>
          </main>
        ) : (
          <main className="flex-1 space-y-6">
            <div className="space-y-2">
              <h1 className="font-serif text-3xl leading-tight text-foreground">{title}</h1>
              <p className="text-muted-foreground">{theme}</p>
            </div>

            <div className="surface-card space-y-3 text-[1.0625rem] leading-relaxed text-muted-foreground">
              <p className="text-foreground">
                Day 3 is different from the other days this week. It is one longer guided session,
                walked slowly, in eleven small stages.
              </p>
              <ul className="space-y-2">
                <li>It usually takes somewhere between 30 and 60 minutes.</li>
                <li>You can pause at any point and come back. It does not need to be one sitting.</li>
                <li>Nothing needs to be disclosed. Every question may be left unanswered.</li>
                <li>Anything you write stays on this device for this session only.</li>
              </ul>
            </div>

            <div className="flex flex-col gap-3">
              <Link
                to="/session/week-01"
                className="inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground hover:opacity-90"
              >
                Begin the guided session
              </Link>
              {resumable && (
                <Link
                  to="/session/week-01"
                  className="inline-flex min-h-12 items-center justify-center rounded-lg border border-primary/50 bg-background px-5 py-3 font-medium text-foreground hover:bg-secondary"
                >
                  Resume where I left off
                </Link>
              )}
              <button
                type="button"
                onClick={() => setNotToday(true)}
                className="inline-flex min-h-12 items-center justify-center rounded-lg border border-border bg-background px-5 py-3 font-medium text-foreground hover:bg-secondary"
              >
                Not today
              </button>
            </div>

            <div className="flex flex-col gap-2 border-t border-border/70 pt-4 text-sm">
              <Link
                to="/practice/$id"
                params={{ id: "pause-and-ground" }}
                className="inline-flex min-h-11 items-center text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Pause and Ground
              </Link>
              <Link
                to="/support"
                className="inline-flex min-h-11 items-center text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Support and safety
              </Link>
              <Link
                to="/journey"
                className="inline-flex min-h-11 items-center text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                View Week 1
              </Link>
            </div>

            <p className="text-sm text-muted-foreground">
              Day 3 is marked as walked only when you finish and close the session yourself.
            </p>
          </main>
        )}
      </div>
    </div>
  );
}
