// PASS A foundation revision locks.
//
// Three things must not silently regress: the plain orientation screen that now
// opens the journey, the agreement's removed review note, and the readable
// semantic type ramp that substantive copy depends on.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { AGREEMENT_COPY, OPENING_SCREENS } from "@/content/opening";

const read = (p: string) => readFileSync(p, "utf8");
const STYLES = read("src/styles.css");

describe("opening order", () => {
  it("opens with the plain orientation screen, then the existing three", () => {
    expect(OPENING_SCREENS[0]?.key).toBe("orientation");
    expect(OPENING_SCREENS.map((s) => s.key)).toEqual([
      "orientation",
      "welcome",
      "find-here",
      "how-it-works",
    ]);
  });

  it("states plainly what it is, who it is for, that it stands alone, and one boundary", () => {
    const first = OPENING_SCREENS[0]!;
    expect(first.title).toContain("10-day guided journey");
    expect(first.lead).toContain("adults");
    expect(first.points.join(" ")).toContain("watched the videos");
    expect(first.closing).toContain("not psychotherapy or crisis care");
  });

  it("explains the heaviness metaphor on Welcome instead of assuming it", () => {
    const welcome = OPENING_SCREENS.find((s) => s.key === "welcome")!;
    expect(welcome.lead).not.toMatch(/heav/i);
    expect(welcome.points.join(" ")).toMatch(/emotional or spiritual strain/i);
    expect(welcome.points.join(" ")).toMatch(/not physical weight/i);
  });
});

describe("agreement cleanup", () => {
  it("no longer carries the review note", () => {
    expect("reviewNote" in AGREEMENT_COPY).toBe(false);
    expect(read("src/content/opening.ts")).not.toContain("not required to read them");
  });

  it("keeps both confirmations and all three legal links", () => {
    expect(AGREEMENT_COPY.adultLabel).toMatch(/18 years/);
    expect(AGREEMENT_COPY.termsLabel).toMatch(/Terms of Use/);
    const onboarding = read("src/routes/onboarding.tsx");
    for (const to of ["/terms", "/privacy", "/important-information"]) {
      expect(onboarding).toContain(`to="${to}"`);
    }
  });
});

describe("journey home clarity", () => {
  const home = read("src/routes/_shell.index.tsx");

  it('names the section "The 10-Day Journey"', () => {
    expect(home).toContain("The 10-Day Journey");
    expect(home).not.toContain("The ten days");
  });

  it('shows a visible "Day" word beside the digit in every row', () => {
    expect(home).toContain("day-marker-word");
    expect(home).toContain(">Day<");
    expect(home).toContain("day-marker-num");
  });
});

describe("semantic type ramp", () => {
  it("defines the deliberate roles rather than redefining Tailwind utilities", () => {
    for (const role of [
      "@utility bfa-copy",
      "@utility bfa-copy-lead",
      "@utility bfa-copy-support",
      "@utility bfa-copy-meta",
      "@utility bfa-h1",
      "@utility bfa-h2",
    ]) {
      expect(STYLES).toContain(role);
    }
  });

  it("keeps every ramp size rem-relative so browser zoom still works", () => {
    const ramp = STYLES.slice(STYLES.indexOf("@utility bfa-copy"));
    expect(ramp).not.toMatch(/font-size:\s*\d+px/);
  });

  it("leaves no shrinking size utility on the audited surfaces", () => {
    const audited = [
      "src/routes/onboarding.tsx",
      "src/routes/_shell.index.tsx",
      "src/routes/day.$day.tsx",
      "src/components/JourneyScreen.tsx",
      "src/routes/_shell.settings.tsx",
      "src/routes/_shell.support.tsx",
      "src/components/LegalPage.tsx",
      "src/routes/contact-support.tsx",
      "src/routes/important-information.tsx",
      "src/routes/privacy.tsx",
      "src/routes/terms.tsx",
    ];
    for (const file of audited) {
      const source = read(file);
      expect(source, file).not.toMatch(/className="[^"]*\btext-(xs|sm|base)\b/);
      expect(source, file).not.toMatch(/\btext-\[0\.\d+rem\]/);
      expect(source, file).not.toMatch(/\btext-\[1[0-7]px\]/);
    }
  });
});

describe("product-first splash", () => {
  const splash = read("src/components/SplashGate.tsx");

  it("shows the product title and what it is", () => {
    expect(splash).toContain("Beauty from Ashes");
    expect(splash).toContain("A 10-Day Guided Reflection Journey");
  });

  it("drops the tiny parent lockup from the splash only", () => {
    expect(splash).not.toContain("A Resurgence Therapeutics experience");
    expect(splash).not.toContain("Awaken · Rediscover · Hope");
    // Ownership stays elsewhere in the product.
    expect(read("src/content/settings.ts")).toMatch(/Resurgence/);
  });

  it("keeps first-display-per-session and the inert, aria-hidden underlay", () => {
    expect(splash).toContain("bfa_splash_shown_v1");
    expect(splash).toContain('setAttribute("inert"');
    expect(splash).toContain('aria-hidden={visible ? "true" : undefined}');
    expect(splash).toContain('aria-hidden="true"');
  });

  it("draws the gold thread once and disables it under reduced motion", () => {
    expect(STYLES).toContain("bfa-thread-draw");
    expect(STYLES).not.toContain("bfa-thread-draw 640ms ease-out infinite");
    const reduced = STYLES.slice(STYLES.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toContain("animation: none");
  });
});
