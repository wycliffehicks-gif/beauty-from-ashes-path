// Pure presentation logic for the private-pilot passcode screen.
//
// A wrong code and an unreachable check are different things, and telling
// someone their code is wrong when the check simply could not run is dishonest.
// This helper keeps the two apart. It has no transport, storage or environment
// access of its own: it only interprets the outcome of a supplied check.

export type UnlockOutcome = "unlocked" | "mismatch" | "unavailable";

/**
 * Run a supplied unlock check and classify the outcome honestly.
 *   - resolved { ok: true }  -> unlocked
 *   - resolved { ok: false } -> the code did not match
 *   - rejected / unusable    -> the check could not be completed
 */
export async function classifyUnlockAttempt(
  attempt: () => Promise<{ ok: boolean }>,
): Promise<UnlockOutcome> {
  try {
    const result = await attempt();
    if (result && typeof result.ok === "boolean") {
      return result.ok ? "unlocked" : "mismatch";
    }
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

export const UNLOCK_MESSAGES = {
  mismatch: "That code doesn’t match. Please check it and try again.",
  unavailable: "We couldn’t check the code right now. Please try again.",
} as const;

/** Only a genuine mismatch marks the field itself as invalid. */
export function marksFieldInvalid(outcome: UnlockOutcome | null): boolean {
  return outcome === "mismatch";
}
