// FINAL PILOT VISUAL POLISH — source-level locks only.
// These assertions guard professional-finish decisions (safe areas, truthful
// return controls, meaningful-state gold, atomic reflection paint and splash
// timing). They never assert therapeutic wording.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

const styles = read("src/styles.css");
const root = read("src/routes/__root.tsx");
const shell = read("src/routes/_shell.tsx");
const journeyScreen = read("src/components/JourneyScreen.tsx");
const onboarding = read("src/routes/onboarding.tsx");
const legalPage = read("src/components/LegalPage.tsx");
const support = read("src/routes/_shell.support.tsx");
const home = read("src/routes/_shell.index.tsx");
const splash = read("src/components/SplashGate.tsx");
const day = read("src/routes/day.$day.tsx");
const agreement = read("src/components/AgreementGate.tsx");

describe("top safe areas and chrome", () => {
  it("defines both safe-top utilities and neutralizes them under the storage notice", () => {
    expect(styles).toContain("@utility bfa-top-safe {");
    expect(styles).toContain("@utility bfa-top-safe-roomy {");
    expect(styles).toContain("env(safe-area-inset-top, 0px)");
    expect(styles).toContain(':has(> [data-testid="storage-notice"]) .bfa-top-safe');
    expect(styles).toContain(':has(> [data-testid="storage-notice"]) .bfa-top-safe-roomy');
  });

  it("applies safe-top padding in every named header", () => {
    for (const src of [shell, journeyScreen, onboarding]) {
      expect(src).toContain("bfa-top-safe");
      expect(src).not.toContain("items-center gap-2 pt-4");
    }
    expect(legalPage).toContain("container-page bfa-top-safe-roomy pb-8");
  });

  it("uses the actual dark background as the dark theme colour", () => {
    expect(root).toContain('"#12213D"');
    expect(root).not.toContain("#0F1B2E");
    expect(root).toContain('{ name: "theme-color", content: "#F6F2EA" }');
    expect(root).toContain("viewport-fit=cover");
  });
});

describe("truthful return controls", () => {
  it("names Your Journey and uses standalone control styling", () => {
    expect(legalPage).toContain("← Return to Your Journey");
    expect(support).toContain("← Return to Your Journey");
    expect(root).toContain("Return to Your Journey");
    expect(legalPage).not.toContain("← Back");
    expect(support).not.toContain("Return to Today");
    expect(root).not.toContain("Return to Today");
    expect(root).not.toContain("Return home");
    expect(root).toContain("btn-primary-journey");
    expect(root).toContain("btn-quiet");
  });
});

describe("pressed, disabled and meaningful-state treatment", () => {
  it("limits transitions and never scales or translates a control", () => {
    expect(styles).toContain("transition: background-color 140ms ease, border-color 140ms ease,");
    expect(styles).toContain(".btn-primary-journey:hover:not(:disabled)");
    expect(styles).toContain("color-mix(in oklab, var(--primary) 78%, var(--foreground))");
    expect(styles).toContain("color-mix(in oklab, var(--muted) 82%, transparent)");
  });

  it("leaves no ungated primary hover selector", () => {
    const hovers = styles.match(/\.btn-primary-journey:hover(?!:not\(:disabled\))/g);
    expect(hovers).toBeNull();
  });

  it("never animates the spiritual switch thumb", () => {
    const settings = read("src/routes/_shell.settings.tsx");
    expect(settings).not.toContain("transition-all");
    expect(settings).not.toMatch(/transition-\[(?:left|transform)/);
    expect(settings).toContain("-translate-y-1/2");
    expect(settings).toContain('prefs.showSpiritual ? "left-7" : "left-1"');
  });

  it("keeps disabled primary controls fully opaque and clearly unavailable", () => {
    expect(styles).toMatch(
      /\.btn-primary-journey:disabled \{\s*opacity: 1;\s*cursor: not-allowed;\s*background: var\(--muted\);\s*color: var\(--muted-foreground\);\s*border: 1px solid var\(--bfa-control-border\);/,
    );
  });

  it("draws the settings row focus ring inward", () => {
    expect(styles).toContain(".bfa-settings-link:focus-visible");
    expect(styles).toContain("outline-offset: -3px");
  });

  it("reserves the strong interactive gold for real state", () => {
    expect(styles).toContain(
      '.day-row[data-state="current"] {\n  border-color: var(--bfa-interactive-gold);\n  box-shadow: inset 3px 0 0 0 var(--bfa-interactive-gold);\n}',
    );
    expect(styles).toContain(
      '.day-row[data-state="complete"] .day-marker {\n  border-color: var(--bfa-interactive-gold);\n}',
    );
    expect(home).toContain("border-[color:var(--bfa-interactive-gold)]");
  });

  it("marks the maintainable state call sites", () => {
    const settings = read("src/routes/_shell.settings.tsx");
    expect(settings).toContain("bfa-settings-link");
    expect(settings).toContain("bfa-settings-switch");
    expect(support).toContain("bfa-support-action");
  });
});

describe("splash", () => {
  it("uses the short synchronized timings and matching CSS duration", () => {
    expect(splash).toContain("const dwell = reduced ? 700 : 1200;");
    expect(splash).toContain("const fade = reduced ? 0 : 240;");
    expect(splash).toContain("duration-[240ms]");
    expect(splash).not.toContain("duration-500");
    expect(styles).toContain("text-wrap: balance");
    expect(styles).toContain("max-width: 32ch");
  });
});

describe("residual semantic type", () => {
  it("removes small utility type from the root and agreement surfaces", () => {
    expect(root).not.toContain("text-sm");
    expect(agreement).not.toContain("text-sm");
    expect(root).toContain("bfa-h1");
    expect(root).toContain("bfa-copy-support");
    expect(agreement).toContain("bfa-copy-support");
  });
});

describe("atomic local reflection", () => {
  it("resolves and reports readiness inside the single before-paint effect", () => {
    const start = day.indexOf("function ReflectionScreen(");
    expect(start).toBeGreaterThan(-1);
    const body = day.slice(start);
    const effect = body.indexOf("useBeforePaintEffect(");
    expect(effect).toBeGreaterThan(-1);
    const preparing = body.indexOf("onPreparing();");
    const resolve = body.indexOf("resolveReflection(");
    const ready = body.indexOf("onReady(token);");
    expect(preparing).toBeGreaterThan(effect);
    expect(resolve).toBeGreaterThan(preparing);
    expect(ready).toBeGreaterThan(resolve);
    // Exactly one effect owns preparation, resolution and readiness.
    expect(body.match(/useBeforePaintEffect\(/g)?.length).toBe(1);
    expect(body.slice(effect, ready)).not.toContain("useEffect(");
  });

  it("shows no transient preparing copy anywhere", () => {
    expect(day).not.toContain("Preparing your reflection");
    expect(day).not.toContain("Your reflection is being prepared");
  });

  it("keeps the Day 10 gathering after the built closing", () => {
    const closing = day.indexOf("{built.closing}");
    const thread = day.indexOf("content.reflection.priorDaysThread");
    expect(closing).toBeGreaterThan(-1);
    expect(thread).toBeGreaterThan(closing);
  });
});
