import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getPractice } from "@/content/practices";

export const Route = createFileRoute("/practice/$id")({
  head: ({ params }) => {
    const p = getPractice(params.id);
    const title = p ? `${p.title} — Beauty from Ashes` : "Practice — Beauty from Ashes";
    const desc = p?.purpose ?? "A short standalone practice.";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: PracticeFlow,
});

function PracticeFlow() {
  const { id } = Route.useParams();
  const practice = getPractice(id);
  const navigate = useNavigate();
  const [i, setI] = useState(-1); // -1 = intro

  // Reset progression when the practice changes.
  useEffect(() => {
    setI(-1);
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  }, [id]);

  if (!practice) {
    return (
      <div className="container-page min-h-[100dvh] py-10">
        <h1 className="font-serif text-2xl text-foreground">This practice isn’t here</h1>
        <Link to="/practices" className="inline-link mt-4 inline-block text-primary underline">
          Back to Practices
        </Link>
      </div>
    );
  }

  const total = practice.steps.length;
  const step = i >= 0 ? practice.steps[i] : null;
  const done = i >= total;

  const goNext = () => setI((n) => n + 1);
  const goPrev = () => setI((n) => Math.max(-1, n - 1));
  const exit = () => navigate({ to: "/practices" });

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <div className="container-page flex min-h-[100dvh] flex-col py-6">
        <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 pb-4">
          <button
            type="button"
            onClick={i > -1 ? goPrev : exit}
            className="inline-link rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
          >
            {i > -1 ? "← Back" : "✕ Close"}
          </button>
          <p className="min-w-0 truncate text-center text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {practice.title}
          </p>
          <Link
            to="/support"
            className="inline-link rounded-md px-2 py-1 text-sm text-muted-foreground underline underline-offset-4"
          >
            Support
          </Link>
        </header>

        <div aria-hidden className="mb-6 flex gap-1">
          {Array.from({ length: total + 1 }).map((_, idx) => (
            <span
              key={idx}
              className={`h-0.5 flex-1 rounded ${
                idx <= i + 1 ? "bg-primary" : "bg-border"
              }`}
            />
          ))}
        </div>

        <div className="flex-1 space-y-5">
          {i === -1 && (
            <>
              <h1 className="font-serif text-3xl leading-tight text-foreground">{practice.title}</h1>
              <p className="text-muted-foreground">{practice.purpose}</p>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">{practice.duration}</p>
              {practice.cautions && (
                <div className="rounded-xl border border-border bg-secondary/50 p-4 text-sm">
                  <p className="mb-1 font-medium text-foreground">Please note</p>
                  <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                    {practice.cautions.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {step && (
            <>
              {step.heading && (
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {step.heading}
                </p>
              )}
              <p className="font-serif text-2xl leading-snug text-foreground">{step.body}</p>
            </>
          )}

          {done && (
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Close</p>
              <h2 className="font-serif text-2xl text-foreground">A gentle close</h2>
              <p className="text-muted-foreground">
                You do not have to hold this any tighter than it wants to be held. Return whenever it helps.
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 pt-6">
          {!done && (
            <button
              type="button"
              onClick={goNext}
              className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground hover:opacity-90"
            >
              {i === -1 ? "Begin" : i === total - 1 ? "Close" : "Continue"}
            </button>
          )}
          {done && (
            <button
              type="button"
              onClick={exit}
              className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground hover:opacity-90"
            >
              Return to Practices
            </button>
          )}
          <button
            type="button"
            onClick={exit}
            className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-background px-5 py-3 text-sm text-muted-foreground hover:bg-secondary"
          >
            Close for today
          </button>
        </div>
      </div>
    </div>
  );
}
