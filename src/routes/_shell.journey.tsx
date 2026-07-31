import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The old week-oriented Journey page has been replaced by "Your Journey" at
 * the app root. This route stays as a compatibility redirect so existing
 * links and any in-flight bookmarks keep working.
 */
export const Route = createFileRoute("/_shell/journey")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});
