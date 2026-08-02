import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The standalone Resources page is not finished and is not part of the
 * customer-facing First Journey, so no "coming soon" holding page may be shown.
 * Any visit resolves safely to Your Journey. The earlier page remains in version
 * history if it is ever recovered for a later release.
 */
export const Route = createFileRoute("/_shell/resources")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
  component: () => null,
});
