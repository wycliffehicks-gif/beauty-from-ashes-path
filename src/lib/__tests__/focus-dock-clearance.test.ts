import type { FocusEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { keepFocusAboveDock } from "@/lib/focus-dock-clearance";

// Controlled geometry protects the measured scrolling and stale/pointer-focus
// guards. Actual layout, browser focus scrolling and clicks are browser-tested.
class TestElement {
  isConnected = true;
  focusVisible = true;
  matches() {
    return this.focusVisible;
  }
}

function fixture() {
  vi.stubGlobal("HTMLElement", TestElement);
  let control = { top: 798, bottom: 855, left: 350, right: 900 };
  let dock = { top: 798, bottom: 900, left: 320, right: 960 };
  let position = "sticky";
  let contained = true;
  const frames: Array<() => void> = [];
  const scrollBy = vi.fn();
  const target = Object.assign(new TestElement(), {
    getBoundingClientRect: () => control,
  });
  const document = {
    activeElement: target as TestElement | null,
    defaultView: {
      innerHeight: 900,
      requestAnimationFrame: (fn: () => void) => frames.push(fn),
      getComputedStyle: () => ({ position }),
      scrollBy,
    },
  };
  const main = Object.assign(new TestElement(), {
    ownerDocument: document,
    contains: () => contained,
    parentElement: {
      querySelector: () => ({ getBoundingClientRect: () => dock }),
    },
  });
  return {
    target,
    main,
    document,
    scrollBy,
    setPosition: (value: string) => {
      position = value;
    },
    setContained: (value: boolean) => {
      contained = value;
    },
    setControl: (value: typeof control) => {
      control = value;
    },
    setDock: (value: typeof dock) => {
      dock = value;
    },
    focus: () =>
      keepFocusAboveDock({ currentTarget: main, target } as unknown as FocusEvent<HTMLElement>),
    frame: () => frames.splice(0).forEach((fn) => fn()),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("focus clearance above the measured sticky dock", () => {
  it("clears the observed fully hidden 57px control after native scrolling", () => {
    const test = fixture();
    test.focus();
    expect(test.scrollBy).not.toHaveBeenCalled();
    test.frame();
    expect(test.scrollBy).toHaveBeenCalledExactlyOnceWith({ top: 65, behavior: "instant" });
  });

  it.each(["static", "pointer"])("leaves %s interaction and layout alone", (mode) => {
    const test = fixture();
    if (mode === "static") test.setPosition("static");
    else test.target.focusVisible = false;
    test.focus();
    test.frame();
    expect(test.scrollBy).not.toHaveBeenCalled();
  });

  it.each(["focus-moved", "detached", "left-main", "pointer-before-frame"])(
    "does not scroll a stale queued focus after %s",
    (change) => {
      const test = fixture();
      test.focus();
      if (change === "focus-moved") test.document.activeElement = null;
      if (change === "detached") test.main.isConnected = false;
      if (change === "left-main") test.setContained(false);
      if (change === "pointer-before-frame") test.target.focusVisible = false;
      test.frame();
      expect(test.scrollBy).not.toHaveBeenCalled();
    },
  );

  it.each(["already-clear", "dock-below-viewport", "beside-dock"])(
    "does not scroll when %s",
    (layout) => {
      const test = fixture();
      if (layout === "already-clear")
        test.setControl({ top: 650, bottom: 707, left: 350, right: 900 });
      if (layout === "dock-below-viewport")
        test.setDock({ top: 950, bottom: 1050, left: 320, right: 960 });
      if (layout === "beside-dock") test.setControl({ top: 798, bottom: 855, left: 0, right: 300 });
      test.focus();
      test.frame();
      expect(test.scrollBy).not.toHaveBeenCalled();
    },
  );

  it("keeps a tall control's start visible when it cannot completely fit", () => {
    const test = fixture();
    test.setControl({ top: 20, bottom: 1000, left: 350, right: 900 });
    test.focus();
    test.frame();
    expect(test.scrollBy).toHaveBeenCalledExactlyOnceWith({ top: 12, behavior: "instant" });
  });
});
