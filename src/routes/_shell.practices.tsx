import { Link, createFileRoute } from "@tanstack/react-router";
import { PRACTICES } from "@/content/practices";

export const Route = createFileRoute("/_shell/practices")({
  head: () => ({
    meta: [
      { title: "Practices — Beauty from Ashes" },
      {
        name: "description",
        content: "Small, standalone tools for grounding, naming, lament and reconnection.",
      },
      { property: "og:title", content: "Practices — Beauty from Ashes" },
      {
        property: "og:description",
        content: "Grounding, naming, lament and reconnection — one short practice at a time.",
      },
    ],
  }),
  component: PracticesPage,
});

function PracticesPage() {
  return (
    <section className="space-y-6 py-6">
      <header className="space-y-2">
        <h1 className="font-serif text-3xl text-foreground">Practices</h1>
        <p className="text-muted-foreground">
          Short, standalone tools. Use one when it fits. Skip when it doesn’t.
        </p>
      </header>

      <ul className="space-y-3">
        {PRACTICES.map((p) => (
          <li key={p.id}>
            <Link
              to="/practice/$id"
              params={{ id: p.id }}
              className="block rounded-xl border border-border bg-card p-4 hover:border-primary/60"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-serif text-lg text-foreground">{p.title}</h2>
                <span className="text-xs uppercase tracking-widest text-muted-foreground">
                  {p.duration}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{p.purpose}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
