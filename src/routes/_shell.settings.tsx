import { Link, createFileRoute } from "@tanstack/react-router";
import { usePrefs, resetAll } from "@/lib/prefs";

export const Route = createFileRoute("/_shell/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Beauty from Ashes" },
      { name: "description", content: "Manage spiritual content preference and local data." },
      { property: "og:title", content: "Settings — Beauty from Ashes" },
      { property: "og:description", content: "Manage spiritual content preference and local data." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const [prefs, update] = usePrefs();

  return (
    <section className="space-y-8 py-6">
      <header className="space-y-2">
        <h1 className="font-serif text-3xl text-foreground">Settings</h1>
        <p className="text-muted-foreground">Small choices, changeable any time.</p>
      </header>

      <div className="surface-card space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-serif text-lg text-foreground">Scripture &amp; spiritual reflection</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Show optional Scripture and prayer sections on each day. You can toggle this whenever
              you like. Reflections work fully without it.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.showSpiritual}
            onClick={() => update({ showSpiritual: !prefs.showSpiritual })}
            className={`relative h-7 w-12 shrink-0 rounded-full border border-border transition-colors ${
              prefs.showSpiritual ? "bg-primary" : "bg-secondary"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-all ${
                prefs.showSpiritual ? "left-6" : "left-0.5"
              }`}
            />
            <span className="sr-only">Toggle spiritual content</span>
          </button>
        </div>
      </div>

      <div className="surface-card space-y-3">
        <h2 className="font-serif text-lg text-foreground">Your local data</h2>
        <p className="text-sm text-muted-foreground">
          Only your preference and which days you have visited are stored — on this device only.
          Clearing your browser data will remove them. Nothing you name or reflect on is stored.
        </p>
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined" && window.confirm("Clear local preferences and visited days?")) {
              resetAll();
              window.location.href = "/onboarding";
            }
          }}
          className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary"
        >
          Clear local data
        </button>
      </div>

      <div className="surface-card space-y-2">
        <h2 className="font-serif text-lg text-foreground">About this beta</h2>
        <p className="text-sm text-muted-foreground">
          This is a private prototype of <em>Beauty from Ashes</em>, a gentle daily companion for walking
          toward hope. It is part of the wider Resurgence Therapeutics ecosystem. It is not therapy,
          medical care, or crisis support.
        </p>
        <div className="pt-2 text-sm">
          <Link to="/support" className="inline-link text-primary underline underline-offset-4">
            Support &amp; Safety →
          </Link>
        </div>
      </div>
    </section>
  );
}
