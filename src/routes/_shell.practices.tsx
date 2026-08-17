import { Link, createFileRoute } from "@tanstack/react-router";
import { PRACTICES } from "@/content/practices";

export const Route = createFileRoute("/_shell/practices")({
  head: () => ({
    meta: [
      { title: "Practices — Beauty from Ashes: The First Journey" },
      {
        name: "description",
        content:
          "Short, repeatable practices you can return to at any time: grounding, naming patterns, safe connection, lament and more.",
      },
      { property: "og:title", content: "Practices — Beauty from Ashes" },
      {
        property: "og:description",
        content:
          "Short, repeatable practices you can return to at any time.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PracticesPage,
});

function PracticesPage() {
  return (
    <section className="space-y-8 pb-6">
      <header className="space-y-2">
        <h1 className="bfa-heading bfa-h1 font-serif">Practices</h1>
        <p className="bfa-copy-support text-muted-foreground">
          Short, repeatable ways to steady yourself. Nothing here is timed or scored.
        </p>
        <hr className="gold-seam w-24" />
        <p className="bfa-copy text-foreground">
          You can come back to any practice at any time — during the journey, after
          you have finished, or on a day when the whole road feels like too much.
        </p>
      </header>

      <div className="space-y-3">
        {PRACTICES.map((practice) => (
          <Link
            key={practice.id}
            to="/practice/$id"
            params={{ id: practice.id }}
            className="day-row"
            data-testid={`practice-row-${practice.id}`}
          >
            <span className="min-w-0">
              <span className="bfa-h3 block font-serif text-foreground">{practice.title}</span>
              <span className="bfa-copy-support day-row-theme mt-1 block text-muted-foreground">
                {practice.purpose}
              </span>
              <span className="day-row-meta mt-2 block">
                <span className="bfa-copy-meta day-row-descriptor text-muted-foreground">
                  {practice.duration}
                </span>
              </span>
            </span>
            <span aria-hidden className="day-row-chevron">
              ›
            </span>
          </Link>
        ))}
      </div>

      <p className="bfa-copy-support text-muted-foreground">
        If any practice makes you feel worse, stop. You do not have to finish it.
      </p>
    </section>
  );
}
