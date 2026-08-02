import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The older standalone practice library is outside this private pilot and is
 * not held to the same safety standard as the ten-day First Journey. Every
 * /practice/$id path — including the former pause-and-ground page — safely
 * lands on the Practices holding page. No old practice content can render.
 */
export const Route = createFileRoute("/practice/$id")({
  beforeLoad: () => {
    throw redirect({ to: "/practices", replace: true });
  },
  component: () => null,
});
