import { Link, createFileRoute, redirect } from "@tanstack/react-router";

import { getPractice } from "@/content/practices";

/**
 * A single practice from the standalone registry (src/content/practices.ts).
 * Content is rendered exactly as authored — no free text, storage or AI.
 * An unrecognized slug keeps the existing safe fallback: Your Journey.
 */
export const Route = createFileRoute("/practice/$id")({
  beforeLoad: ({ params }) => {
    if (!getPractice(params.id)) {
      throw redirect({ to: "/", replace: true });
    }
  },
  head: ({ params }) => {
    const practice = getPractice(params.id);
    const title = practice
      ? `${practice.title} — Beauty from Ashes`
      : "Practice — Beauty from Ashes";
    const description = practice?.purpose ?? "A short, repeatable practice.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { name: "robots", content: "noindex, nofollow" },
      ],
    };
  },
  component: PracticePage,
});

function PracticePage() {
  const { id } = Route.useParams();
  const practice = getPractice(id);
  if (!practice) return null;

  return (
    <div className="journey-page">
      <div className="container-page flex min-h-[100dvh] flex-col">
        <header className="bfa-top-safe pb-2">
          <Link
            to="/practices"
            className="inline-link bfa-copy-support text-primary underline underline-offset-4"
          >
            ‹ Practices
          </Link>
        </header>

        <main className="flex-1 pb-10">
          <section className="space-y-8 pb-6" data-testid={`practice-${practice.id}`}>
            <header className="space-y-2">
              <h1 className="bfa-heading bfa-h1 font-serif">{practice.title}</h1>
              <p className="bfa-copy-support text-muted-foreground">{practice.duration}</p>
              <hr className="gold-seam w-24" />
              <p className="bfa-copy text-foreground">{practice.purpose}</p>
            </header>

            <ol className="space-y-3">
              {practice.steps.map((step, index) => (
                <li
                  key={`${practice.id}-step-${index}`}
                  className="rounded-lg border border-border bg-secondary/40 p-3"
                >
                  {step.heading && (
                    <p className="bfa-h3 font-serif text-foreground">{step.heading}</p>
                  )}
                  <p className="bfa-copy mt-1 text-foreground">{step.body}</p>
                </li>
              ))}
            </ol>

            {practice.cautions && practice.cautions.length > 0 && (
              <section className="space-y-2">
                <h2 className="bfa-h2 font-serif">Before you begin</h2>
                <ul className="space-y-2">
                  {practice.cautions.map((caution, index) => (
                    <li
                      key={`${practice.id}-caution-${index}`}
                      className="bfa-copy-support text-muted-foreground"
                    >
                      {caution}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <p className="bfa-copy-support text-muted-foreground">
              If this practice makes you feel worse, stop. You do not have to finish it.
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
