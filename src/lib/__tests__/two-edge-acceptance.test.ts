// Focused protection for the final two-edge acceptance fix:
//
//  1. the storage notice sits at the top of the splash underlay, is suppressed
//     while the splash covers the app, and mounts (so it can announce) after;
//  2. onboarding's Begin is single-flight: it can never issue a second
//     history.go, its button is inert while collapsing, and Home replaces the
//     remaining entry only at the exact recorded entry index.
//
// The project's vitest environment is `node` (no DOM, and no new dependencies
// are permitted), so the onboarding behaviour is modelled with a faithful
// replica of the component's guard logic, and the wiring of that logic into the
// real component is asserted structurally.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

/**
 * Faithful replica of onboarding's accept/collapse machine: an immediate
 * ref-style guard, a collapsing flag that makes activation inert, and Home
 * replacement only at the exact entry index.
 */
function makeOpeningController(entryIndex: number, startIndex: number) {
  const calls = { go: [] as number[], navigateHome: 0 };
  let historyIndex = startIndex;
  let collapsing = false;
  const started = { current: false };

  const settle = () => {
    if (!collapsing) return;
    if (historyIndex === entryIndex) {
      collapsing = false;
      calls.navigateHome += 1;
    }
  };

  return {
    calls,
    get collapsing() {
      return collapsing;
    },
    get buttonDisabled() {
      return collapsing;
    },
    /** One activation of the Begin control. */
    activate() {
      if (collapsing) return; // click handler inert during collapse
      if (started.current) return; // immediate single-flight guard
      started.current = true;
      const depth = historyIndex - entryIndex;
      if (depth <= 0) {
        calls.navigateHome += 1;
        return;
      }
      collapsing = true;
      calls.go.push(-depth);
    },
    /** The browser applying a history.go, then the settle effect running. */
    applyHistory(delta: number) {
      historyIndex += delta;
      settle();
    },
    settle,
  };
}

describe("onboarding Begin is single-flight and never overshoots", () => {
  it("issues exactly one history.go for a rapid double activation", () => {
    const c = makeOpeningController(4, 7);
    c.activate();
    c.activate(); // double tap before any rerender
    c.activate();
    expect(c.calls.go).toEqual([-3]);
    expect(c.calls.navigateHome).toBe(0);
  });

  it("disables the control while collapsing and keeps its handler inert", () => {
    const c = makeOpeningController(2, 5);
    c.activate();
    expect(c.buttonDisabled).toBe(true);
    // Activation on any opening screen reached during the collapse does nothing.
    c.applyHistory(-1);
    c.activate();
    expect(c.calls.go).toEqual([-3]);
  });

  it("replaces with Home only at the exact recorded entry index", () => {
    const c = makeOpeningController(4, 7);
    c.activate();
    c.applyHistory(-1);
    expect(c.calls.navigateHome).toBe(0);
    c.applyHistory(-1);
    expect(c.calls.navigateHome).toBe(0);
    c.applyHistory(-1);
    expect(c.calls.navigateHome).toBe(1);
    expect(c.collapsing).toBe(false);
  });

  it("never replaces an unrelated overshot entry", () => {
    const c = makeOpeningController(4, 7);
    c.activate();
    c.applyHistory(-5); // overshoot past the entry index
    expect(c.calls.navigateHome).toBe(0);
  });

  it("preserves the direct-load depth<=0 path with no history.go", () => {
    const c = makeOpeningController(3, 3);
    c.activate();
    expect(c.calls.go).toEqual([]);
    expect(c.calls.navigateHome).toBe(1);
  });

  it("wires that exact logic into the onboarding component", () => {
    const src = read("src/routes/onboarding.tsx");
    // Immediate ref-based single-flight guard, not state alone.
    expect(src).toContain("const acceptStarted = useRef(false)");
    expect(src).toContain("if (acceptStarted.current) return;");
    expect(src).toContain("acceptStarted.current = true;");
    // Exact-index completion, never `<=`.
    expect(src).toContain("if (historyIndex === entry) {");
    expect(src).not.toContain("if (historyIndex <= entry) {");
    // Button disabled and inert while collapsing.
    expect(src).toContain("disabled={!canAdvance || collapsing}");
    expect(src).toContain("aria-disabled={!canAdvance || collapsing}");
    expect(src).toContain("if (collapsing) return;");
    expect(src).toContain("Opening your journey…");
    // Visible Back and the depth<=0 direct-load path are preserved.
    expect(src).toContain("router.history.back()");
    expect(src).toContain("if (depth <= 0) {");
  });
});

describe("storage notice placement after the splash", () => {
  it("is owned by SplashGate, above the app, and suppressed during splash", () => {
    const gate = read("src/components/SplashGate.tsx");
    const notice = gate.indexOf("<StorageNotice suppressed={noticeSuppressed} />");
    const children = gate.indexOf("{children}");
    expect(notice).toBeGreaterThan(-1);
    expect(notice).toBeLessThan(children);
    // Suppressed by default, released when no splash runs and when it ends.
    expect(gate).toContain("useState(true)");
    expect(gate).toContain("setNoticeSuppressed(false)");
    expect(gate.match(/setNoticeSuppressed\(false\)/g)?.length).toBe(2);
    // Splash lifecycle untouched.
    expect(gate).toContain('const SESSION_KEY = "bfa_splash_shown_v1"');
    expect(gate).toContain("reduced ? 700 : 1200");
    expect(gate).toContain("reduced ? 0 : 240");
    expect(gate).toContain("duration-[240ms]");
    expect(gate).toContain('node.setAttribute("inert", "")');
  });

  it("no longer renders the notice from the root route", () => {
    expect(read("src/routes/__root.tsx")).not.toContain("StorageNotice");
  });

  it("keeps the approved wording and uses a bottom divider", () => {
    const src = read("src/lib/storage-status.tsx");
    expect(src).toContain(
      "Saving is unavailable in this browser. You can continue, but your place and choices may be lost when this tab closes or reloads.",
    );
    expect(src).toContain("border-b border-border");
    expect(src).not.toContain("border-t border-border");
    expect(src).toContain('role="status"');
    expect(src).toContain('aria-live="polite"');
    // Suppression keeps it unmounted entirely rather than merely hidden.
    expect(src).toContain("if (suppressed || !hydrated || persistent) return null;");
  });
});
