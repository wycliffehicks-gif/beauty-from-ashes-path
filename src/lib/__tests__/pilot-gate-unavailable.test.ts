// A wrong code and an unreachable check are different things.
//
// Mock-only: no network, no server function, no credentials. The unlock check is
// supplied as a stub that either resolves an honest answer or rejects.

import { describe, expect, it } from "vitest";
import {
  classifyUnlockAttempt,
  marksFieldInvalid,
  UNLOCK_MESSAGES,
} from "@/lib/gate-ui";

describe("pilot gate: mismatch versus unavailable", () => {
  it("treats a resolved refusal as a genuine mismatch", async () => {
    const outcome = await classifyUnlockAttempt(async () => ({ ok: false }));
    expect(outcome).toBe("mismatch");
    expect(UNLOCK_MESSAGES[outcome as "mismatch"]).toBe(
      "That code doesn’t match. Please check it and try again.",
    );
    expect(marksFieldInvalid(outcome)).toBe(true);
  });

  it("does not claim a wrong code when the request itself fails", async () => {
    for (const thrown of [new Error("network down"), new Response("x", { status: 500 })]) {
      const outcome = await classifyUnlockAttempt(async () => {
        throw thrown;
      });
      expect(outcome).toBe("unavailable");
      expect(UNLOCK_MESSAGES[outcome as "unavailable"]).toBe(
        "We couldn’t check the code right now. Please try again.",
      );
      // Announced, but the field itself is not marked wrong.
      expect(marksFieldInvalid(outcome)).toBe(false);
    }
  });

  it("treats an unusable answer as unavailable rather than a mismatch", async () => {
    const outcome = await classifyUnlockAttempt(async () => undefined as never);
    expect(outcome).toBe("unavailable");
  });

  it("unlocks on a resolved success", async () => {
    expect(await classifyUnlockAttempt(async () => ({ ok: true }))).toBe("unlocked");
    expect(marksFieldInvalid("unlocked")).toBe(false);
    expect(marksFieldInvalid(null)).toBe(false);
  });

  it("a retry clears the previous outcome, then succeeds", async () => {
    const answers = [
      async () => {
        throw new Error("unavailable");
      },
      async () => ({ ok: false }),
      async () => ({ ok: true }),
    ];
    const outcomes: string[] = [];
    for (const attempt of answers) {
      outcomes.push(await classifyUnlockAttempt(attempt as () => Promise<{ ok: boolean }>));
    }
    expect(outcomes).toEqual(["unavailable", "mismatch", "unlocked"]);
  });

  it("both messages are distinct and announced to a screen reader as one live error", async () => {
    const source = await (await import("node:fs/promises")).readFile(
      "src/components/PilotGate.tsx",
      "utf8",
    );
    expect(UNLOCK_MESSAGES.mismatch).not.toBe(UNLOCK_MESSAGES.unavailable);
    expect(source).toContain('role="alert"');
    expect(source).toContain("aria-invalid={invalid || undefined}");
    expect(source).toContain('aria-describedby={outcome ? "pilot-passcode-error" : undefined}');
    // Access failure/retry and public-path matching are now exercised by
    // pilot-status.test.ts. This test retains the distinct unlock-field UI.
  });
});

describe("Day 4 boundary claims nothing the person may not have done", () => {
  it("offers space instead of asserting they noticed or named something", async () => {
    const source = await (await import("node:fs/promises")).readFile(
      "src/components/ContinueJourneyBoundary.tsx",
      "utf8",
    );
    const flat = source.replace(/\s+/g, " ");
    expect(flat).toContain("days offer space to notice what you may be carrying");
    expect(flat).toContain(
      "You do not need to have named anything or noticed a change to pause here or continue.",
    );
    expect(flat).not.toContain("are complete in themselves");
    expect(flat).not.toContain("still have noticed something");
    // Unchanged: no-payment wording, access marker and navigation.
    expect(source).toContain("There is nothing to pay and nothing to enter.");
    expect(source).toContain('data-testid="boundary-continue"');
    expect(source).toContain("grantPilotUnlock()");
    expect(source).toContain('data-testid="boundary-home"');
  });
});
