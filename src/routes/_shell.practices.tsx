import { Link, createFileRoute } from "@tanstack/react-router";

/**
 * The older standalone practice library is not part of this private pilot and
 * is not held to the same safety standard as the ten-day First Journey. This
 * route is a calm holding page; every /practice/$id path lands here too.
 */
export const Route = createFileRoute("/_shell/practices")({
  head: () => ({
    meta: [
      { title: "Practices — Beauty from Ashes" },
      {
        name: "description",
        content:
          "The standalone practice library is being reviewed and is not part of this private pilot.",
      },
      { property: "og:title", content: "Practices — Beauty from Ashes" },
      {
        property: "og:description",
        content:
          "The standalone practice library is being reviewed and is not part of this private pilot.",
      },
    ],
  }),
  component: PracticesHoldingPage,
});

export const PRACTICES_HOLDING_MESSAGE =
  "The standalone practice library is being reviewed and is not part of this private pilot.";

function PracticesHoldingPage() {
  return (
    <section className="space-y-6 py-6" data-testid="practices-holding">
      <header className="space-y-2">
        <h1 className="font-serif text-3xl text-foreground">Practices</h1>
        <p className="text-foreground">{PRACTICES_HOLDING_MESSAGE}</p>
        <p className="text-sm text-muted-foreground">
          Each day of The First Journey still offers its own practice, explained step by step.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground"
        >
          Return to your journey
        </Link>
        <Link
          to="/support"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-background px-5 py-3 text-sm font-medium text-foreground"
        >
          Support &amp; Safety
        </Link>
      </div>
    </section>
  );
}
