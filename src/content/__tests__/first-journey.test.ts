import { describe, expect, it } from "vitest";
import { AGREEMENT_COPY, OPENING_SCREENS } from "@/content/opening";
import {
  PRIVACY_CONFIDENTIALITY_POINTS,
  PRIVACY_CONFIDENTIALITY_REVIEW_NOTE,
  SETTINGS_SECTIONS,
} from "@/content/settings";
import { JOURNEY_DAYS, JOURNEY_HOME_TITLE, JOURNEY_IDENTITY, dayIdFor } from "@/content/journey";

describe("opening flow content", () => {
  it("has exactly the three explanatory screens before the agreement", () => {
    expect(OPENING_SCREENS).toHaveLength(3);
    expect(OPENING_SCREENS.map((s) => s.id)).toEqual(["welcome", "what", "how"]);
  });

  it("keeps each explanatory screen short enough to fit a phone viewport", () => {
    for (const screen of OPENING_SCREENS) {
      const chars = [screen.title, screen.lead ?? "", ...screen.body].join(" ").length;
      expect(chars).toBeLessThan(700);
      expect(screen.body.length).toBeLessThanOrEqual(4);
    }
  });

  it("does not label screens with internal Why/What/How terms", () => {
    for (const screen of OPENING_SCREENS) {
      expect(screen.title).not.toMatch(/^(why|what|how)\b/i);
    }
  });

  it("agreement keeps two separate confirmations and a calm processing sentence", () => {
    expect(AGREEMENT_COPY.confirmations).toHaveLength(2);
    expect(AGREEMENT_COPY.confirmations.some((c) => /18/.test(c.label))).toBe(true);
    expect(AGREEMENT_COPY.confirmations.some((c) => /terms|privacy/i.test(c.label))).toBe(true);
    expect(AGREEMENT_COPY.processingNote).not.toMatch(/algorithm|model|LLM|artificial intelligence/i);
  });
});

describe("settings architecture", () => {
  it("contains every required section", () => {
    expect(SETTINGS_SECTIONS.map((s) => s.id)).toEqual([
      "privacy-confidentiality",
      "support-safety",
      "important-information",
      "terms-privacy",
      "about-beauty-from-ashes",
      "about-resurgence",
      "clear-or-restart",
    ]);
  });

  it("privacy copy makes the required plain statements", () => {
    const all = PRIVACY_CONFIDENTIALITY_POINTS.join(" ").toLowerCase();
    expect(all).toMatch(/no .*(staff|one) .*(watch|read)/);
    expect(all).toContain("device");
    expect(all).toMatch(/personalised|personalized/);
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
