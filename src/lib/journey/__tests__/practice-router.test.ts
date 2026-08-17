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
import {
  answerKeyFor,
  buildReflection,
  selectedOptionIds,
} from "@/lib/journey/reflection-engine";
import { answersSnapshot, reflectionSnapshot } from "@/lib/journey/reflection-restore";

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
      "where:many",
    ]);
    expect(screensFor(day9).map(screenKey)).toEqual([
      "arrive",
      "understand",
      "q.practice",
      "e.practice",
      "q.where",
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
      "self",
      "body",
      "reality",
      "values",
      "creativity",
      "person",
      "community",
      "god",
      "other",
      "unclear",
      "none",
      "private",
    ]);
    expect(godIndex).toBe(7);
    expect(route.options[godIndex]!.spiritualOnly).toBe(true);
    for (const n of [1, 2, 3, 4, 5, 6, 7, 9, 10]) {
      for (const q of [...day(n).questions, day(n).step]) {
        for (const o of q.options) expect(o.spiritualOnly, `${n}.${q.id}.${o.id}`).toBeUndefined();
      }
    }
  });

  it("withholds the stable and legacy token while unhydrated or off, without deleting it", () => {
    for (const token of [godToken, `q.route.${godIndex}`]) {
      const raw = ["q.size:tiny", token, "step.1"];
      const frozen = [...raw];
      for (const opts of [
        { hydrated: false, showSpiritual: true },
        { hydrated: false, showSpiritual: false },
        { hydrated: true, showSpiritual: false },
      ]) {
        const shown = presentationAnswers(day8, raw, opts);
        expect(shown).not.toContain(token);
        expect(shown).toEqual(["q.size:tiny", "step.1"]);
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
      expect(visible.map((v) => v.option.id)).toEqual([
      "self",
      "body",
      "reality",
      "values",
      "creativity",
      "person",
      "community",
      "other",
      "unclear",
      "none",
      "private",
    ]);
      // Canonical indexes are preserved, never reindexed.
      expect(visible.map((v) => v.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11]);
    }
    const on = presentationOptions(route, { hydrated: true, showSpiritual: true });
    expect(on.map((v) => v.index)).toEqual(route.options.map((_, i) => i));
    expect(on[7]!.option.id).toBe("god");
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

// ---------------------------------------------------------------- fail closed
//
// A route-owned token is recognized as belonging to the route step BEFORE it is
// decoded, so an invalid same-question token can never be silently dropped.

describe("Day 9 routed practice fails closed on corrupt route-scoped tokens", () => {
  const practiceKey = answerKeyFor(day9, "practice");
  const optionCount = day9.questions.find((q) => q.id === "practice")!.options.length;

  it("keeps resolving every existing valid route", () => {
    for (const id of ROUTED_IDS) {
      expect(resolvedRouteOptionId(day9, [`${practiceKey}:${id}`]), id).toBe(id);
    }
  });

  it("falls back for a valid token plus an unknown same-step token", () => {
    const answers = [`${practiceKey}:grounding`, `${practiceKey}:not-a-real-option`];
    expect(resolvedRouteOptionId(day9, answers)).toBeNull();
    expect(resolvePractice(day9, answers).reflection).toBe(day9.practise.reflection);
  });

  it("falls back for a valid token plus an out-of-range positional token", () => {
    const answers = [`${practiceKey}:grounding`, `${practiceKey}.${optionCount + 5}`];
    expect(resolvedRouteOptionId(day9, answers)).toBeNull();
    expect(resolvePractice(day9, answers).routedBy).toBeNull();
  });

  it("falls back for a duplicated valid route token", () => {
    const answers = [`${practiceKey}:boundary`, `${practiceKey}:boundary`];
    expect(resolvedRouteOptionId(day9, answers)).toBeNull();
    expect(resolvePractice(day9, answers).reflection).toBe(day9.practise.reflection);
  });

  it("falls back for unknown-only and malformed route-owned tokens", () => {
    expect(resolvedRouteOptionId(day9, [`${practiceKey}:`])).toBeNull();
    expect(resolvedRouteOptionId(day9, [`${practiceKey}.-1`])).toBeNull();
    expect(resolvedRouteOptionId(day9, [`${practiceKey}.x`])).toBeNull();
  });

  it("lets unrelated question and step tokens pass without blocking one clean route", () => {
    const answers = [
      "q.where:private",
      `${answerKeyFor(day9, day9.step.id)}:${day9.step.options[0]!.id}`,
      `${practiceKey}:lament`,
      "junk",
    ];
    const frozen = [...answers];
    expect(resolvedRouteOptionId(day9, answers)).toBe("lament");
    expect(answers).toEqual(frozen);
  });

  it("locks the routed source as exactly q.practice", () => {
    expect(day9.practise.route!.from).toBe("practice");
    expect(practiceKey).toBe("q.practice");
  });
});

// ------------------------------------- off / unhydrated presentation surfaces

describe("Day 8 optional Christian choice is absent from every presentation surface", () => {
  const raw = ["q.size:tiny", "q.route:god", "step.1"];
  const route = day8.questions.find((q) => q.id === "route")!;

  for (const opts of [
    { hydrated: false, showSpiritual: true },
    { hydrated: false, showSpiritual: false },
    { hydrated: true, showSpiritual: false },
  ]) {
    const label = `hydrated=${opts.hydrated} showSpiritual=${opts.showSpiritual}`;

    it(`shows no selected option, Echo line, snapshot or proof (${label})`, () => {
      const frozen = [...raw];
      const shown = presentationAnswers(day8, raw, opts);

      // No selected option on the route question.
      expect(selectedOptionIds(day8, "route", shown)).toEqual([]);
      expect(presentationOptions(route, opts).some((v) => v.option.id === "god")).toBe(false);

      // No Echo or reflection line.
      const text = buildReflection(day8, shown)
        .sections.flatMap((s) => s.paragraphs)
        .join(" ");
      expect(text).not.toContain("from God");

      // No trace in the answer snapshot or the reflection proof path.
      expect(answersSnapshot(shown)).not.toContain("god");
      expect(reflectionSnapshot(day8, shown)).not.toContain("god");
      expect(reflectionSnapshot(day8, shown)).not.toBe(reflectionSnapshot(day8, raw));

      // Raw storage is untouched, byte for byte.
      expect(raw).toEqual(frozen);
    });
  }

  it("restores the choice on every surface once hydrated and on", () => {
    const on = { hydrated: true, showSpiritual: true };
    const shown = presentationAnswers(day8, raw, on);
    expect(shown).toEqual(raw);
    expect(selectedOptionIds(day8, "route", shown)).toEqual(["god"]);
    expect(presentationOptions(route, on).some((v) => v.option.id === "god")).toBe(true);
    expect(answersSnapshot(shown)).toContain("god");
    const text = buildReflection(day8, shown)
      .sections.flatMap((s) => s.paragraphs)
      .join(" ");
    expect(text).toContain("from God");
  });
});
