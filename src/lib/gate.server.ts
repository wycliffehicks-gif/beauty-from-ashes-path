// Server-only helpers for the shared pilot passcode.
//
// One code, shared by every invited tester: this is a gate, not authentication.
// There is no account, no identity and no per-person revocation. The expected
// code lives only in a server environment variable and is never sent to the
// browser.

import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

export type GateSession = { unlocked?: boolean };

function sessionConfig() {
  return {
    password: process.env["SESSION_SECRET"]!,
    name: "bfa-pilot-gate",
    maxAge: 60 * 60 * 24 * 30, // a month, so a tester is not asked repeatedly
    cookie: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" },
  };
}

export function getGateSession() {
  return useSession<GateSession>(sessionConfig());
}

/**
 * Hash both sides to equal-length digests first: timingSafeEqual throws on a
 * length mismatch, and the raw length would itself leak through timing.
 * Entered codes are trimmed and compared case-insensitively so "sample code"
 * typed on a phone keyboard still works.
 */
export function passcodeMatches(input: string, expected: string): boolean {
  const normalize = (v: string) => v.trim().replace(/\s+/g, " ").toLowerCase();
  const a = createHash("sha256").update(normalize(input), "utf8").digest();
  const b = createHash("sha256").update(normalize(expected), "utf8").digest();
  return timingSafeEqual(a, b);
}

