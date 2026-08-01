import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The standalone Day 1 reflection experiment is no longer part of the journey:
 * every day now carries its own unified "See My Personalized Reflection"
 * screen inside the day flow. This route stays only as a compatibility
 * redirect so old links land on the day itself rather than a dead nested
 * route (its parent is a leaf and renders no <Outlet />).
 */
export const Route = createFileRoute("/day/$day/reflection")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/day/$day", params: { day: params.day }, replace: true });
  },
});
