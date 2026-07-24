import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_shell/resources")({
  head: () => ({
    meta: [
      { title: "Resources — Beauty from Ashes" },
      {
        name: "description",
        content:
          "Links to Beauty from Ashes videos, the reflection journal, Resurgence Therapeutics and professional support.",
      },
      { property: "og:title", content: "Resources — Beauty from Ashes" },
      {
        property: "og:description",
        content: "Videos, the reflection journal, and professional support.",
      },
    ],
  }),
  component: ResourcesPage,
});

interface ResourceCard {
  title: string;
  description: string;
  href?: string;
  comingSoon?: boolean;
}

const RESOURCES: ResourceCard[] = [
  {
    title: "Beauty from Ashes — YouTube series",
    description:
      "Carl Wycliffe Hicks Jr.’s teaching series on walking toward hope. This app helps the series land in daily life.",
    href: "https://www.youtube.com/@carlwycliffehicksjr.2698",
  },
  {
    title: "Beauty from Ashes: 30 Days of Healing Reflection",
    description:
      "A companion guided journal for deeper written reflection. Coming soon.",
    comingSoon: true,
  },
  {
    title: "Resurgence Therapeutics",
    description:
      "Awaken · Rediscover · Hope. The wider ecosystem of tools and offerings. Website link coming soon.",
    comingSoon: true,
  },
  {
    title: "Professional support",
    description:
      "This app is not therapy. If you would like support, please reach out to a qualified professional in your area. A curated directory is coming soon.",
    comingSoon: true,
  },
];

function ResourcesPage() {
  return (
    <section className="space-y-6 py-6">
      <header className="space-y-2">
        <h1 className="font-serif text-3xl text-foreground">Resources</h1>
        <p className="text-muted-foreground">
          The videos teach and connect. The journal deepens what you write. The app helps you practise.
        </p>
      </header>

      <ul className="space-y-3">
        {RESOURCES.map((r) => (
          <li key={r.title} className="surface-card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-serif text-lg text-foreground">{r.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>
              </div>
              {r.comingSoon && (
                <span className="shrink-0 rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] uppercase tracking-widest text-muted-foreground">
                  Coming soon
                </span>
              )}
            </div>
            {r.href && (
              <a
                href={r.href}
                target="_blank"
                rel="noreferrer"
                className="inline-link mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary underline underline-offset-4"
              >
                Open link ↗
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
