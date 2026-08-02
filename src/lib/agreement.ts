// One hydrated agreement gate for The First Journey.
//
// Restricted therapeutic surfaces may not render or write any state until the
// current legal bundle has been accepted on this device. This covers every
// route, including root-level ones such as /day/$day and ordinary /practice/*
// pages — not only children of the _shell layout.

import { LEGAL_BUNDLE_VERSION, type Prefs } from "@/lib/prefs";

/**
 * Reachable before (or without) current acceptance: the opening flow itself,
 * safety and information pages, and the single grounding practice a person may
 * need immediately.
 */
export const PUBLIC_PATHS = [
  "/onboarding",
  "/support",
  "/privacy",
  "/terms",
  "/important-information",
  "/contact-support",
  "/practice/pause-and-ground",
] as const;

function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed.length === 0 ? "/" : trimmed;
}

export function isPublicPath(pathname: string): boolean {
  return (PUBLIC_PATHS as readonly string[]).includes(normalizePath(pathname));
}

/** True only for an acceptance of the current legal bundle version. */
export function hasCurrentAcceptance(prefs: Pick<Prefs, "onboarded" | "legalAcceptance">) {
  return Boolean(prefs.onboarded) && prefs.legalAcceptance?.version === LEGAL_BUNDLE_VERSION;
}
