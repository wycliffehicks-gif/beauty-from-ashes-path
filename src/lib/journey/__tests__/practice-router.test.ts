// Pass C2C — routed practice resolution and presentation-answer filtering.
//
// Both helpers are pure: no storage, no content mutation, no inference. These
// tests lock Day 9's seven mapped rehearsals, the safety fallback for every
// open or unusable selection, and the rule that a dormant Christian selection
// stays on device while producing nothing on screen.

import { describe, expect, it } from "vitest";

import { getFirstJourneyDay } from "@/content/first-journey";
import { screenKey, screensFor, type JourneyDayContent } from "@/content/journey-types";
import {
  isSpiritualOnlyToken,
  presentationAnswers,
  presentationOptions,
} from "@/lib/journey/presentation-answers";
import { resolvePractice, resolvedRouteOptionId } from "@/lib/journey/practice-router";
import { buildReflection } from "@/lib/journey/reflection-engine";

function day(n: number): JourneyDayContent {
  const d = getFirstJourneyDay(n);
  if (!d) throw new Error(`Day ${n} is missing`);
  return d;
}

const day8 = day(8);
const day9 = day(9);

const ROUTED_IDS = [
  "grounding",
  "unsent",
  "boundary",
  "support",
  "lament",
  "prepare",
  "loosen",
] as const;

describe("Day 9 routed practice", () => {
  it("maps exactly the seven substantive rehearsal options", () => {
    const route = day9.practise.route!;
    expect(route.from).toBe("practice");
    expect(Object.keys(route.reflectionByOption).sort()).toEqual([...ROUTED_IDS].sort());
  });

  it("resolves each routed option to its own distinct mapped path", () => {
    const titles = new Set<string>();
    for (const id of ROUTED_IDS) {
      const resolved = resolvePractice(day9, [`q.practice:${id}`]);
      expect(resolved.routedBy, id).toBe(id);
      expect(resolved.reflection, id).toBe(day9.practise.route!.reflectionByOption[id]);
      expect(resolved.reflection.steps.length, id).toBeGreaterThan(3);
      titles.add(resolved.reflection.title);
      // One shared Christian path, unless a specific one is explicitly mapped.
      expect(resolved.spiritual, id).toBe(
        day9.practise.route!.spiritualByOption?.[id] ?? day9.practise.spiritual,
      );
    }
    expect(titles.size).toBe(ROUTED_IDS.length);
  });

  it("uses the required safety fallback for open, unknown and corrupt input", () => {
    const fallbacks: Array<[string, string[] | undefined]> = [
      ["unanswered", []],
      ["undefined", undefined],
      ["unclear", ["q.practice:unclear"]],
      ["none", ["q.practice:none"]],
      ["private", ["q.practice:private"]],
      ["unknown option", ["q.practice:not-a-real-option"]],
      ["unknown step", ["q.nope:grounding"]],
      ["malformed", ["", "q.practice", "q.practice:"]],
      ["multiple", ["q.practice:grounding", "q.practice:unsent"]],
      ["mixed multiple", ["q.practice:grounding", "q.practice:none"]],
    ];
    for (const [label, answers] of fallbacks) {
      const resolved = resolvePractice(day9, answers);
      expect(resolved.routedBy, label).toBeNull();
      expect(resolved.reflection, label).toBe(day9.practise.reflection);
      expect(resolved.spiritual, label).toBe(day9.practise.spiritual);
    }
  });

  it("is order-independent and never mutates its input", () => {
    const answers = ["step.1", "q.where:private", "q.practice:boundary"];
    const frozen = [...answers];
    const a = resolvePractice(day9, answers);
    const b = resolvePractice(day9, [...answers].reverse());
    expect(a.routedBy).toBe("boundary");
    expect(b.routedBy).toBe("boundary");
    expect(a.reflection).toBe(b.reflection);
    expect(answers).toEqual(frozen);
  });

  it("returns the day's own paths for every unrouted day", () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 10]) {
      const d = day(n);
      expect(d.practise.route).toBeUndefined();
      const resolved = resolvePractice(d, ["q.state:heavy"]);
      expect(resolved.routedBy, `day ${n}`).toBeNull();
      expect(resolved.reflection, `day ${n}`).toBe(d.practise.reflection);
    }
    expect(resolvedRouteOptionId(day(1), [])).toBeNull();
  });

  it("adds no Day 9 screen, ID, selection mode, meaning version or storage change", () => {
    expect(day9.answerMeaningVersion).toBe("v1");
    expect(day9.arrive.lead).toBe(
      "A different response can be tried privately before you decide whether it belongs in real life.",
    );
    expect(day9.questions.map((q) => `${q.id}:${q.select}`)).toEqual([
      "practice:one",
      "where:one",
    ]);
    expect(screensFor(day9).map(screenKey)).toEqual([
      "arrive",
      "understand",
      "q.practice",
      "e.practice",
      "q.where",
      "e.where",
      "practise",
      "step",
      "reflection",
      "close",
    ]);
  });
});

describe("optional Christian choices stay dormant while spirituality is off", () => {
  const godToken = "q.route:god";
  const godIndex = day8.questions
    .find((q) => q.id === "route")!
    .options.findIndex((o) => o.id === "god");

  it("marks only Day 8 route.god, at its unchanged canonical position", () => {
    const route = day8.questions.find((q) => q.id === "route")!;
    expect(route.options.map((o) => o.id)).toEqual([
      "person",
      "help",
      "comfort",
      "god",
      "unclear",
    ]);
    expect(godIndex).toBe(3);
    expect(route.options[godIndex]!.spiritualOnly).toBe(true);
    for (const n of [1, 2, 3, 4, 5, 6, 7, 9, 10]) {
      for (const q of [...day(n).questions, day(n).step]) {
        for (const o of q.options) expect(o.spiritualOnly, `${n}.${q.id}.${o.id}`).toBeUndefined();
      }
    }
  });

  it("withholds the stable and legacy token while unhydrated or off, without deleting it", () => {
    for (const token of [godToken, `q.route.${godIndex}`]) {
      const raw = ["q.notice:softening", token, "step.1"];
      const frozen = [...raw];
      for (const opts of [
        { hydrated: false, showSpiritual: true },
        { hydrated: false, showSpiritual: false },
        { hydrated: true, showSpiritual: false },
      ]) {
        const shown = presentationAnswers(day8, raw, opts);
        expect(shown).not.toContain(token);
        expect(shown).toEqual(["q.notice:softening", "step.1"]);
      }
      expect(raw).toEqual(frozen);
      expect(isSpiritualOnlyToken(day8, token)).toBe(true);
      expect(
        presentationAnswers(day8, raw, { hydrated: true, showSpiritual: true }),
      ).toEqual(frozen);
    }
  });

  it("passes other and malformed tokens through untouched", () => {
    const raw = ["q.route:person", "q.route:", "junk", "q.route.99"];
    expect(presentationAnswers(day8, raw, { hydrated: true, showSpiritual: false })).toEqual(raw);
    expect(presentationAnswers(day8, undefined, { hydrated: true, showSpiritual: false })).toEqual(
      [],
    );
  });

  it("hides the choice on screen until preferences are hydrated and on", () => {
    const route = day8.questions.find((q) => q.id === "route")!;
    for (const opts of [
      { hydrated: false, showSpiritual: true },
      { hydrated: true, showSpiritual: false },
    ]) {
      const visible = presentationOptions(route, opts);
      expect(visible.map((v) => v.option.id)).toEqual(["person", "help", "comfort", "unclear"]);
      // Canonical indexes are preserved, never reindexed.
      expect(visible.map((v) => v.index)).toEqual([0, 1, 2, 4]);
    }
    const on = presentationOptions(route, { hydrated: true, showSpiritual: true });
    expect(on.map((v) => v.index)).toEqual([0, 1, 2, 3, 4]);
    expect(on[3]!.option.id).toBe("god");
  });

  it("produces no Christian Echo, reflection or snapshot line while off", () => {
    const raw = ["q.route:god"];
    const off = presentationAnswers(day8, raw, { hydrated: true, showSpiritual: false });
    const echo = day8.questions.find((q) => q.id === "route")!.echo!;
    expect(echo.byOption["god"]).toBeTruthy();
    const offText = buildReflection(day8, off)
      .sections.flatMap((s) => s.paragraphs)
      .join(" ");
    expect(offText).not.toContain(echo.byOption["god"]!);
    const onText = buildReflection(day8, raw)
      .sections.flatMap((s) => s.paragraphs)
      .join(" ");
    expect(onText).not.toBe(offText);
  });
});
