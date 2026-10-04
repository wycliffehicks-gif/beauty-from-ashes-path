import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { recordScreenTransition } from "@/components/JourneyScreen";

/**
 * Announce a ready page after client navigation, using the same transition
 * ledger as the day flow. Call this from the content owner, never from a gate
 * or a persistent layout: a holding screen must not consume the transition.
 * Day/resume and reflection screens keep their existing focus ownership.
 */
export function usePageFocus<T extends HTMLElement = HTMLElement>({
  screenKey,
  ready = true,
}: {
  screenKey: string;
  ready?: boolean;
}) {
  // During navigation the router can expose the incoming pathname while the
  // outgoing page still renders. Wait for the committed route, and use the
  // content owner's key rather than deriving one from that pending pathname.
  const settled = useRouterState({ select: (state) => state.status === "idle" });
  const contentRef = useRef<T | null>(null);

  useEffect(() => {
    if (!ready || !settled) return;
    const heading = contentRef.current?.querySelector("h1");
    if (!heading || !recordScreenTransition(screenKey)) return;
    if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
    heading.focus();
  }, [screenKey, ready, settled]);

  return contentRef;
}
