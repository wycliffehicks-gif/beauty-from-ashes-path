import { Link } from "@tanstack/react-router";
import { JourneyScreen } from "@/components/JourneyScreen";
import { FREE_DAYS, grantPilotUnlock } from "@/lib/journey/entitlement";

/**
 * The Day 4 boundary. It is deliberately quiet: no countdown, no urgency, no
 * comparison, no scarcity. During the pilot it opens the rest of the journey
 * immediately and says plainly that no payment is involved yet.
 */
export function ContinueJourneyBoundary({ day }: { day: number }) {
  return (
    <JourneyScreen label="Continue the journey" focusKey={`boundary:${day}`}>
      <div className="space-y-5">
        <div className="space-y-2">
          <p className="eyebrow">Day {day}</p>
          <h1 className="bfa-h1 font-serif text-foreground">Continue the journey</h1>
          <hr className="gold-seam w-24" />
        </div>

        <p className="bfa-copy text-foreground">
          The first {FREE_DAYS} days are complete in themselves. If you stopped here, you would
          still have noticed something, named it, and begun to understand what it may have been
          protecting.
        </p>
        <p className="bfa-copy text-foreground">
          Days {FREE_DAYS + 1} to 10 continue the same arc: what it is costing now, a more
          compassionate way to hold it, letting something good reach you, practising a different
          response, and carrying it forward.
        </p>

        <div className="surface-card space-y-2">
          <h2 className="bfa-h3 font-serif text-foreground">During this private version</h2>
          <p className="bfa-copy-support text-muted-foreground">
            There is nothing to pay and nothing to enter. This screen is here so the wording and
            the pacing can be reviewed before anything is ever offered for sale. Opening the rest
            of the journey happens on this device only.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            data-testid="boundary-continue"
            onClick={() => grantPilotUnlock()}
            className="btn-primary-journey flex-1"
          >
            Continue the journey
          </button>
          <Link to="/" className="btn-quiet flex-1" data-testid="boundary-home">
            Return to Your Journey
          </Link>
        </div>

        <p className="bfa-copy-support text-muted-foreground">
          You can also revisit any of the first {FREE_DAYS} days, or spend time with a practice
          instead. Nothing here is timed.
        </p>
      </div>
    </JourneyScreen>
  );
}
