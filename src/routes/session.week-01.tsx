import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The former standalone Week 1 guided session is no longer part of the user
 * journey — its depth is redistributed across the ten days of The First
 * Journey. This route stays only as a compatibility redirect.
 */
export const Route = createFileRoute("/session/week-01")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});
