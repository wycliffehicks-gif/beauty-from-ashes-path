import { describe, expect, it } from "vitest";
import { AGREEMENT_COPY, OPENING_SCREENS } from "@/content/opening";
import {
  PRIVACY_CONFIDENTIALITY_POINTS,
  PRIVACY_CONFIDENTIALITY_REVIEW_NOTE,
  SETTINGS_SECTIONS,
} from "@/content/settings";
import { JOURNEY_DAYS, JOURNEY_HOME_TITLE, JOURNEY_IDENTITY, dayIdFor } from "@/content/journey";

describe("opening flow content", () => {
  it("has exactly the four explanatory screens before the agreement", () => {
    expect(OPENING_SCREENS).toHaveLength(4);
    expect(OPENING_SCREENS.map((s) => s.key)).toEqual([
      "orientation",
      "welcome",
      "find-here",
      "how-it-works",
    ]);
  });

  it("keeps each explanatory screen readable without becoming an essay", () => {
    for (const screen of OPENING_SCREENS) {
      const chars = [screen.eyebrow, screen.title, screen.lead, ...screen.points, screen.closing ?? ""].join(" ").length;
      // The plain orientation screen is deliberately fuller; scrolling is
      // preferred to shrinking substantive copy.
      expect(chars).toBeLessThan(900);
      expect(screen.points.length).toBeLessThanOrEqual(4);
    }
  });

  it("does not label screens with internal Why/What/How terms", () => {
    for (const screen of OPENING_SCREENS) {
      expect(screen.title).not.toMatch(/^(why|what|how)\b/i);
    }
  });

  it("agreement keeps two separate confirmations and a calm processing sentence", () => {
    expect(AGREEMENT_COPY.adultLabel).toMatch(/18/);
    expect(AGREEMENT_COPY.termsLabel).toMatch(/Terms of Use/);
    expect(AGREEMENT_COPY.termsLabel).toMatch(/Privacy Notice/);
    expect(AGREEMENT_COPY.automatedProcessingSentence).not.toMatch(
      /algorithm|\bLLM\b/i,
    );
    // The AI addition requires an honest separate processing choice; the old
    // blanket no-AI/no-transmission wording is intentionally superseded.
    expect(AGREEMENT_COPY.automatedProcessingSentence).toMatch(/AI reflections, when available/);
    expect(AGREEMENT_COPY.automatedProcessingSentence).toMatch(/separate informed choice/);
    expect(AGREEMENT_COPY.automatedProcessingSentence).toMatch(/external AI service/);
    expect(AGREEMENT_COPY.isNotPoints.join(" ")).toMatch(/not monitored/i);
  });
});

describe("settings architecture", () => {
  it("contains every required section", () => {
    expect(SETTINGS_SECTIONS.map((s) => s.id)).toEqual([
      "privacy-confidentiality",
      "support-safety",
      "important-information",
      "terms-and-privacy",
      "about-beauty-from-ashes",
      "about-resurgence",
      "clear-or-restart",
    ]);
  });

  it("privacy copy makes the required plain statements", () => {
    const all = PRIVACY_CONFIDENTIALITY_POINTS.join(" ").toLowerCase();
    expect(all).toMatch(/no .*(staff|one) .*(watch|read)/);
    expect(all).toContain("device");
    expect(all).toMatch(/written reflections/);
    expect(all).toMatch(/separate informed choice/);
    expect(all).toMatch(/names/);
    expect(all).toMatch(/clear/);
    expect(all).toMatch(/psychotherapy/);
    expect(all).toMatch(/not monitored/);
    expect(PRIVACY_CONFIDENTIALITY_REVIEW_NOTE).toMatch(/review/i);
  });
});

describe("journey home data", () => {
  it("uses the First Journey identity and no seven-day claim", () => {
    expect(JOURNEY_HOME_TITLE).toBe("Your Journey");
    expect(JOURNEY_IDENTITY).toBe("Beauty from Ashes: The First Journey");
    expect(JOURNEY_IDENTITY).not.toMatch(/week|seven|7[- ]day/i);
  });

  it("gives every day a stable padded id and a title", () => {
    for (const d of JOURNEY_DAYS) {
      expect(d.id).toBe(dayIdFor(d.day));
      expect(d.title.length).toBeGreaterThan(0);
    }
  });
});
