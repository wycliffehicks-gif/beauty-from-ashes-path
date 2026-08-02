import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The older standalone practice library is outside this release and is not held
 * to the same safety standard as the ten-day First Journey, so no holding or
 * "coming soon" page may be shown to a customer. Any visit — including every
 * legacy /practice/$id path, which redirects here — resolves safely to Your
 * Journey. Each day of The First Journey still offers its own explained
 * practice. The earlier page remains in version history for future recovery.
 */
export const Route = createFileRoute("/_shell/practices")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
  component: () => null,
});
