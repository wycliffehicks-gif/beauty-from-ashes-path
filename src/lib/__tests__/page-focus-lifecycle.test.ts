import { beforeEach, describe, expect, it, vi } from "vitest";

// Exercise the actual focus hook and shared transition ledger with controlled
// router states/effect commits. DOM focus visibility and browser keyboard order
// are verified separately in the built app; these cases cover lifecycle races.
const harness = vi.hoisted(() => {
  const state = {
    status: "idle" as "idle" | "pending",
    slots: [] as Array<unknown>,
    index: 0,
    effects: [] as Array<() => void>,
    lastEffect: undefined as (() => void) | undefined,
  };
  return {
    state,
    hooks: {
      useRef(initial: unknown) {
        const index = state.index++;
        return (state.slots[index] ??= { current: initial });
      },
      useEffect(effect: () => void, deps: unknown[]) {
        const index = state.index++;
        const previous = state.slots[index] as unknown[] | undefined;
        if (previous && previous.every((value, i) => Object.is(value, deps[i]))) return;
        state.slots[index] = deps;
        state.effects.push(effect);
        state.lastEffect = effect;
      },
    },
  };
});

vi.mock("react", async (original) => ({
  ...(await original<object>()),
  ...harness.hooks,
}));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (state: { status: string }) => unknown }) =>
    select({ status: harness.state.status }),
}));

import {
  __resetScreenFocusTracking,
  recordRouteTransition,
  recordScreenTransition,
} from "@/components/JourneyScreen";
import { usePageFocus } from "@/lib/use-page-focus";

function heading() {
  const attributes = new Map<string, string>();
  return {
    focus: vi.fn(),
    hasAttribute: (name: string) => attributes.has(name),
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    attributes,
  };
}

function mountOwner() {
  harness.state.slots = [];
  harness.state.index = 0;
  harness.state.effects = [];
}

function renderOwner(target: ReturnType<typeof heading>, screenKey: string, ready = true) {
  harness.state.index = 0;
  const ref = usePageFocus({ screenKey, ready });
  ref.current = { querySelector: () => target } as unknown as HTMLElement;
  harness.state.effects.splice(0).forEach((effect) => effect());
}

beforeEach(() => {
  __resetScreenFocusTracking();
  harness.state.status = "idle";
  harness.state.lastEffect = undefined;
  mountOwner();
});

describe("page focus across navigation, readiness and history", () => {
  it("does not steal focus when an initial Home document finishes hydrating", () => {
    const home = heading();
    recordRouteTransition("/");
    renderOwner(home, "home:journey", false);
    renderOwner(home, "home:journey", true);
    harness.state.lastEffect?.(); // StrictMode's repeated setup is harmless.
    expect(home.focus).not.toHaveBeenCalled();
    expect(home.attributes.has("tabindex")).toBe(false);
  });

  it("leaves the outgoing owner quiet while a pending route mounts, then focuses once", () => {
    const home = heading();
    const settings = heading();
    recordRouteTransition("/");
    renderOwner(home, "home:journey");
    recordRouteTransition("/settings");
    harness.state.status = "pending";
    renderOwner(home, "home:journey");
    mountOwner();
    renderOwner(settings, "page:settings");
    expect(home.focus).not.toHaveBeenCalled();
    expect(settings.focus).not.toHaveBeenCalled();
    harness.state.status = "idle";
    renderOwner(settings, "page:settings");
    harness.state.lastEffect?.();
    expect(settings.focus).toHaveBeenCalledTimes(1);
    expect(settings.attributes.get("tabindex")).toBe("-1");
    // Invalidating this same route must not move focus away from its controls.
    harness.state.status = "pending";
    renderOwner(settings, "page:settings");
    harness.state.status = "idle";
    renderOwner(settings, "page:settings");
    expect(settings.focus).toHaveBeenCalledTimes(1);
  });

  it("retains a client transition until Home's progress is ready", () => {
    const home = heading();
    recordRouteTransition("/day/2");
    recordScreenTransition("2:practise");
    recordRouteTransition("/");
    renderOwner(home, "home:journey", false);
    expect(home.focus).not.toHaveBeenCalled();
    renderOwner(home, "home:journey", true);
    expect(home.focus).toHaveBeenCalledTimes(1);
    // Returning to the same resumed day still belongs to JourneyScreen.
    recordRouteTransition("/day/2");
    expect(recordScreenTransition("2:practise")).toBe(true);
    expect(recordScreenTransition("2:reflection")).toBe(true);
    expect(recordScreenTransition("2:reflection")).toBe(false);
  });

  it("announces client entry and opening Back, suppressing acceptance collapse", () => {
    const opening = heading();
    const home = heading();
    recordRouteTransition("/");
    recordScreenTransition("home:landing");
    recordRouteTransition("/onboarding");
    renderOwner(opening, "opening:0");
    renderOwner(opening, "opening:1");
    renderOwner(opening, "opening:0");
    expect(opening.focus).toHaveBeenCalledTimes(3);
    renderOwner(opening, "opening:4");
    renderOwner(opening, "opening:0", false);
    expect(opening.focus).toHaveBeenCalledTimes(4);
    recordRouteTransition("/");
    mountOwner();
    renderOwner(home, "home:journey");
    expect(home.focus).toHaveBeenCalledTimes(1);
  });

  it("announces another legal document when React reuses its content owner", () => {
    const legal = heading();
    recordRouteTransition("/privacy");
    renderOwner(legal, "legal:Privacy Notice");
    recordRouteTransition("/terms");
    harness.state.status = "pending";
    renderOwner(legal, "legal:Privacy Notice");
    renderOwner(legal, "legal:Terms of Use");
    expect(legal.focus).not.toHaveBeenCalled();
    harness.state.status = "idle";
    renderOwner(legal, "legal:Terms of Use");
    expect(legal.focus).toHaveBeenCalledTimes(1);
  });
});
