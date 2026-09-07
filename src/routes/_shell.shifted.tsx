import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  buildReflectionExport,
  downloadTextFile,
  openPrintableExport,
} from "@/lib/journey/export";
import { useJourneyProgress } from "@/lib/journey/progress";
import { usePrefs } from "@/lib/prefs";

export const Route = createFileRoute("/_shell/shifted")({
  head: () => ({
    meta: [
      { title: "What Has Shifted — Beauty from Ashes: The First Journey" },
      {
        name: "description",
        content:
          "An optional closing reflection after Day 10: name what feels different, then keep your reflections if you would like to.",
      },
      { property: "og:title", content: "What Has Shifted — Beauty from Ashes" },
      {
        property: "og:description",
        content: "An optional closing reflection after the tenth day.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ShiftedPage,
});

const PROMPTS = [
  "Something I notice sooner than I used to",
  "Something I can name now that I could not name before",
  "Something I am holding a little more gently",
  "Something that is still hard, and that is allowed",
];

function ShiftedPage() {
  const { progress } = useJourneyProgress();
  // Same preference-aware presentation as the reflection screens; unknown
  // preference fails closed.
  const [prefs, , prefsHydrated] = usePrefs();
  const exportPresentation = { hydrated: prefsHydrated, showSpiritual: prefs.showSpiritual };
  // Deliberately unpersisted. This screen is a place to think, not another
  // record to keep. Nothing typed here is saved, exported or sent anywhere.
  const [notes, setNotes] = useState<Record<number, string>>({});

  return (
    <section className="space-y-8 pb-6">
      <header className="space-y-2">
        <h1 className="bfa-heading bfa-h1 font-serif">What has shifted</h1>
        <p className="bfa-copy-support text-muted-foreground">
          Optional. Nothing here is measured, scored or compared with where you began.
        </p>
        <hr className="gold-seam w-24" />
        <p className="bfa-copy text-foreground">
          Change after ten days is rarely tidy, and it is often small. It may be that you notice
          something a little sooner, or that a familiar feeling has a name now. It may also be that
          very little feels different yet. All of that is honest.
        </p>
      </header>

      <div className="space-y-4">
        {PROMPTS.map((prompt, i) => (
          <div key={prompt} className="surface-card space-y-2">
            <label
              htmlFor={`shifted-${i}`}
              className="bfa-copy block font-medium text-foreground"
            >
              {prompt}
            </label>
            <textarea
              id={`shifted-${i}`}
              data-testid={`shifted-note-${i}`}
              rows={3}
              value={notes[i] ?? ""}
              onChange={(e) => setNotes((prev) => ({ ...prev, [i]: e.target.value }))}
              className="bfa-copy w-full rounded-lg border border-border bg-background p-3 text-foreground"
            />
          </div>
        ))}
        <p className="bfa-copy-support text-muted-foreground" data-testid="shifted-unsaved-note">
          What you type on this screen is not saved. When you leave this page it is gone, on
          purpose.
        </p>
      </div>

      <div className="surface-card space-y-3">
        <h2 className="bfa-h3 font-serif text-foreground">Keep your reflections</h2>
        <p className="bfa-copy-support text-muted-foreground">
          Your finished days, the choices you selected and the reflections you were given can be
          saved as a plain-text file or as a printable page. Both are created in this browser and
          are not sent anywhere.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            data-testid="shifted-export-text"
            onClick={() => {
              const { text, filename } = buildReflectionExport(progress, exportPresentation);
              downloadTextFile(text, filename);
            }}
            className="btn-quiet flex-1"
          >
            Save as text file
          </button>
          <button
            type="button"
            data-testid="shifted-export-print"
            onClick={() => openPrintableExport(progress, exportPresentation)}
            className="btn-quiet flex-1"
          >
            Printable version
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link to="/" className="btn-primary-journey flex-1">
          Return to Your Journey
        </Link>
        <Link to="/practices" className="btn-quiet flex-1">
          Try a practice
        </Link>
      </div>
    </section>
  );
}
