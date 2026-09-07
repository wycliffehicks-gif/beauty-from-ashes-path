import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const harness = vi.hoisted(() => {
  const h = { slots: [] as any[], index: 0, effects: [] as Array<() => void>, dirty: false,
    accepted: false, ai: {} as any, generate: vi.fn(), setMode: vi.fn() };
  const equal = (a: any[], b: any[]) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const effect = (fn: () => any, deps: any[]) => { const i = h.index++; if (!h.slots[i] || !equal(h.slots[i].deps, deps)) { const old = h.slots[i]; h.slots[i] = { deps }; h.effects.push(() => { old?.cleanup?.(); h.slots[i].cleanup = fn(); }); } };
  return { h, hooks: {
    useState(initial: any) { const i = h.index++; if (!(i in h.slots)) h.slots[i] = typeof initial === "function" ? initial() : initial; return [h.slots[i], (v: any) => { const next = typeof v === "function" ? v(h.slots[i]) : v; if (!Object.is(next, h.slots[i])) { h.slots[i] = next; h.dirty = true; } }]; },
    useRef(initial: any) { const i = h.index++; return h.slots[i] ?? (h.slots[i] = { current: initial }); },
    useEffect: effect, useLayoutEffect: effect,
  } };
});
vi.mock("react", async importOriginal => ({ ...(await importOriginal<object>()), ...harness.hooks }));
vi.mock("@/lib/ai/useJourneyAiReflection", () => ({ useJourneyAiReflection: () => harness.h.ai }));
vi.mock("@/lib/ai/journey-ai-store", () => ({ JOURNEY_AI_EVENT: "test-ai-change", aiConsentAccepted: () => harness.h.accepted, recordAiConsent: (accepted: boolean) => { harness.h.accepted = accepted; return true; } }));
vi.mock("@/lib/storage-status", () => ({ CLEAR_STATUS_EVENT: "test-clear-start" }));

import { JourneyAiReflection } from "@/components/JourneyAiReflection";
const request = { day: 1, answerMeaningVersion: "test", answers: [], spiritual: false };
const ready = vi.fn();
function render(flush = true) {
  let tree: ReactElement; let rounds = 0;
  do {
    harness.h.index = 0; harness.h.dirty = false;
    tree = JourneyAiReflection({ request, children: createElement("p", null, "UNIQUE AUTHORED REFLECTION"), onReadyChange: ready });
    if (flush) harness.h.effects.splice(0).forEach(fn => fn());
    if (++rounds > 20) throw Error("Component did not settle");
  } while (flush && harness.h.dirty);
  return { tree: tree!, html: renderToStaticMarkup(tree!) };
}
function nodes(node: ReactNode): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement<{ children?: ReactNode }>;
  return [element, ...nodes(element.props.children)];
}
function click(text: string) {
  const tree = render().tree;
  const button = nodes(tree).find(node => node.type === "button" && renderToStaticMarkup(node).includes(text)) as ReactElement<{ onClick: () => void; disabled?: boolean }> | undefined;
  expect(button, `button ${text}`).toBeDefined();
  expect(button!.props.disabled).not.toBe(true);
  button!.props.onClick();
}
beforeEach(() => {
  harness.h.slots.forEach(slot => slot?.cleanup?.()); harness.h.slots = []; harness.h.effects = []; harness.h.accepted = false;
  harness.h.generate.mockReset(); harness.h.setMode.mockReset(); ready.mockReset();
  vi.stubGlobal("window", new EventTarget());
  harness.h.ai = { available: true, availabilityLoading: false, mode: "ai", status: "ready", text: null, paragraphs: [], hasSavedReflection: false, ready: false, failureMessage: null, generate: harness.h.generate, setMode: harness.h.setMode };
});

describe("actual JourneyAiReflection component with mocked controller states", () => {
  it("shows one AI reflection and excludes the authored child", () => {
    Object.assign(harness.h.ai, { status: "shown", text: "UNIQUE AI REFLECTION", paragraphs: ["UNIQUE AI REFLECTION"], hasSavedReflection: true, ready: true });
    const { html } = render();
    expect(html.split("UNIQUE AI REFLECTION")).toHaveLength(2);
    expect(html).not.toContain("UNIQUE AUTHORED REFLECTION");
    expect(ready).toHaveBeenLastCalledWith(true);
  });
  it("shows the authored child only when that mode is chosen", () => {
    Object.assign(harness.h.ai, { mode: "authored", ready: true });
    const { html } = render();
    expect(html).toContain("UNIQUE AUTHORED REFLECTION"); expect(html).not.toContain("Your AI reflection");
    expect(ready).toHaveBeenLastCalledWith(true);
    click("Choose an AI reflection"); expect(harness.h.setMode).toHaveBeenCalledWith("ai");
  });
  it("retains saved AI and permits returning to it while generation is unavailable", () => {
    Object.assign(harness.h.ai, { available: false, status: "shown", text: "SAVED AI WORDS", paragraphs: ["SAVED AI WORDS"], hasSavedReflection: true, ready: true });
    expect(render().html).toContain("SAVED AI WORDS");
    Object.assign(harness.h.ai, { mode: "authored", status: "idle", text: null, paragraphs: [] });
    expect(render().html).toContain("Choose an AI reflection");
    click("Choose an AI reflection"); expect(harness.h.setMode).toHaveBeenCalledWith("ai");
  });
  it("does not generate on render, disclosure opening or consent; only the explicit Generate click", () => {
    expect(render().html).not.toContain("Generate my reflection");
    click("Read what an AI reflection involves");
    expect(render().html).toContain("allow AI reflections");
    expect(harness.h.generate).not.toHaveBeenCalled();
    click("allow AI reflections");
    expect(harness.h.accepted).toBe(true); expect(harness.h.generate).not.toHaveBeenCalled();
    click("Generate my reflection"); expect(harness.h.generate).toHaveBeenCalledTimes(1);
  });
  it("keeps Continue readiness false through hydration, availability loading and generation", () => {
    Object.assign(harness.h.ai, { availabilityLoading: true, ready: false });
    expect(render().html).toContain("Preparing your reflection choices");
    expect(ready).toHaveBeenLastCalledWith(false);
    Object.assign(harness.h.ai, { availabilityLoading: false, status: "generating", ready: false }); harness.h.accepted = true;
    window.dispatchEvent(new Event("test-ai-change"));
    expect(render().html).toContain("Writing your reflection"); expect(ready).toHaveBeenLastCalledWith(false);
    Object.assign(harness.h.ai, { status: "shown", text: "Complete saved reflection.", paragraphs: ["Complete saved reflection."], ready: true });
    render(); expect(ready).toHaveBeenLastCalledWith(true);
  });
  it("clear removes the consented generation UI and closes the disclosure", () => {
    harness.h.accepted = true; expect(render().html).toContain("Generate my reflection");
    harness.h.accepted = false; window.dispatchEvent(new Event("test-clear-start"));
    const { html } = render();
    expect(html).not.toContain("Generate my reflection");
    expect(html).toContain("Read what an AI reflection involves");
    expect(harness.h.generate).not.toHaveBeenCalled();
  });
});
