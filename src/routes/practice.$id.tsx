import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The older standalone practice library is outside this release and is not held
 * to the same safety standard as the ten-day First Journey. Every /practice/$id
 * path — including the former pause-and-ground page and its old free-text
 * exercise — resolves safely to Your Journey. No legacy practice content, and no
 * "coming soon" page, can render.
 */
export const Route = createFileRoute("/practice/$id")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
  component: () => null,
});
