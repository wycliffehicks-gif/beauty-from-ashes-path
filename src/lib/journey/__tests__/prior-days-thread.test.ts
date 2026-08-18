// Pass C2D — the optional Day 10 gathering of earlier coded choices.
//
// The engine is pure, deterministic and ephemeral: it interprets only the
// CURRENT answer-meaning set of each earlier day, runs the generic presentation
// filter before any decoding, never repairs a corrupt combination, and never
// outputs a raw option id.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { FIRST_JOURNEY_DAYS, getFirstJourneyDay } from "@/content/first-journey";
import type { JourneyDayContent } from "@/content/journey-types";
import { dayIdFor } from "@/content/journey";
import { answerKeyFor, buildReflection, reflectionToText } from "@/lib/journey/reflection-engine";
import {
  reflectionContentFingerprint,
  reflectionSnapshot,
} from "@/lib/journey/reflection-restore";
import { emptyProgress, type JourneyProgress } from "@/lib/journey/progress";
import { buildPriorDaysThread } from "@/lib/journey/prior-days-thread";

const day10 = getFirstJourneyDay(10)!;
const thread = day10.reflection.priorDaysThread!;
const ON = { hydrated: true, showSpiritual: true };
const OFF = { hydrated: true, showSpiritual: false };
const UNHYDRATED = { hydrated: false, showSpiritual: true };

function dayOf(n: number): JourneyDayContent {
  return FIRST_JOURNEY_DAYS.find((d) => d.day === n)!;
}

function keyFor(n: number, questionId: string): string {
  return answerKeyFor(dayOf(n), questionId);
}

function stable(n: number, questionId: string, optionId: string): string {
  return `${keyFor(n, questionId)}:${optionId}`;
}

function positional(n: number, questionId: string, index: number): string {
  return `${keyFor(n, questionId)}.${index}`;
}

function labelOf(n: number, questionId: string, optionId: string): string {
  const day = dayOf(n);
  const q = day.step.id === questionId ? day.step : day.questions.find((x) => x.id === questionId)!;
  return q.options.find((o) => o.id === optionId)!.label;
}

/** A progress object holding only the given current-meaning tokens. */
function progressWith(
  entries: { day: number; tokens: string[] }[],
  extra: Partial<JourneyProgress> = {},
): JourneyProgress {
  const answerSets: Record<string, Record<string, string[]>> = {};
  for (const entry of entries) {
    const day = dayOf(entry.day);
    answerSets[dayIdFor(day.day)] = {
      ...(answerSets[dayIdFor(day.day)] ?? {}),
      [day.answerMeaningVersion]: entry.tokens,
    };
  }
  return { ...emptyProgress, answerSets, ...extra };
}

function build(progress: JourneyProgress, opts = ON) {
  return buildPriorDaysThread(thread, progress, opts);
}

function paragraphs(progress: JourneyProgress, opts = ON): string {
  return build(progress, opts)
    .groups.map((g) => g.paragraph)
    .join(" ");
}

// ---------------------------------------------------------------------------
// Definition shape
// ---------------------------------------------------------------------------
describe("Day 10 prior-days thread definition", () => {
  it("carries the exact approved UI copy", () => {
    expect(thread.showLabel).toBe("Show earlier choices");
    expect(thread.hideLabel).toBe("Hide earlier choices");
    expect(thread.heading).toBe("Earlier choices, gathered without interpretation");
    expect(thread.intro).toBe(
      "These are choices made at different moments. They may or may not belong together, and they do not form a diagnosis, explanation or measure of progress. They do not show that a practice was attempted or that anything changed.",
    );
    expect(thread.empty).toBe(
      "No compatible earlier choices are available to gather. Nothing will be inferred.",
    );
  });

  it("defines exactly five groups in the approved order with exact templates", () => {
    expect(thread.groups).toHaveLength(5);
    expect(thread.groups.map((g) => g.title)).toEqual([
      "Starting points and words considered",
      "A possible response map",
      "Movement and caution",
      "Cost, context and care",
      "Care and rehearsal possibilities",
    ]);
    expect(thread.groups.map((g) => g.template)).toEqual([
      "Earlier choices included {clauses}. These selections may or may not refer to the same concern.",
      "For one possible response map, earlier choices included {clauses}. No origin or cause follows from them.",
      "Earlier choices about movement and caution included {clauses}. Neither selection decides what is wiser now.",
      "Earlier choices about present cost and care included {clauses}. They do not decide what caused anything or what should change.",
      "Earlier choices about receiving and rehearsal included {clauses}. This does not say that anything was received or practised.",
    ]);
    for (const group of thread.groups) {
      expect(group.template).toContain("{clauses}");
    }
  });

  it("scopes every source to a real Days 1-9 question with exact descriptors", () => {
    const flat = thread.groups.flatMap((g) => g.sources);
    expect(flat.map((s) => [s.day, s.from, s.descriptor])).toEqual([
      [1, "brought", "what brought you"],
      [2, "load", "what one day contained"],
      [3, "carrying", "a word you considered for what you might be carrying"],
      [4, "response", "a familiar response you selected"],
      [4, "purpose", "a possible purpose you considered"],
      [5, "forward", "a possible pull toward movement"],
      [5, "holdback", "a possible concern"],
      [6, "cost", "a possible present-day cost"],
      [6, "protects", "what may make change difficult or keep something in place"],
      [7, "need", "a more compassionate way of holding it"],
      [8, "route", "a possible source of already-safe care"],
      [8, "size", "an amount you considered"],
      [9, "practice", "a private rehearsal route you considered"],
    ]);
    for (const source of flat) {
      const day = dayOf(source.day);
      expect(day.day, "Days 1-9 only").toBeLessThan(10);
      const q =
        day.step.id === source.from
          ? day.step
          : day.questions.find((x) => x.id === source.from);
      expect(q, `missing question ${source.day}.${source.from}`).toBeTruthy();
      for (const id of [
        ...(source.privateIds ?? []),
        ...(source.unclearIds ?? []),
        ...(source.noneIds ?? []),
      ]) {
        expect(q!.options.some((o) => o.id === id), `unknown special ${id}`).toBe(true);
      }
    }
  });

  it("maps the exact special ids for each source", () => {
    const flat = thread.groups.flatMap((g) => g.sources);
    const find = (day: number, from: string) =>
      flat.find((s) => s.day === day && s.from === from)!;
    const shape = (day: number, from: string) => {
      const s = find(day, from);
      return [s.privateIds ?? null, s.unclearIds ?? null, s.noneIds ?? null];
    };
    expect(shape(1, "brought")).toEqual([["private"], null, null]);
    expect(shape(2, "load")).toEqual([null, null, null]);
    expect(shape(3, "carrying")).toEqual([["private"], ["unsure"], null]);
    expect(shape(4, "response")).toEqual([["private"], ["unsure"], null]);
    expect(shape(4, "purpose")).toEqual([["private"], ["unsure"], null]);
    expect(shape(5, "forward")).toEqual([["private"], ["unclear"], ["none"]]);
    expect(shape(5, "holdback")).toEqual([["private"], ["unknown"], ["none"]]);
    expect(shape(6, "cost")).toEqual([["private"], ["unclear"], ["none"]]);
    expect(shape(6, "protects")).toEqual([["private"], ["unclear"], null]);
    expect(shape(7, "need")).toEqual([["private"], ["unsure"], ["none"]]);
    expect(shape(8, "route")).toEqual([["private"], ["unclear"], ["none"]]);
    expect(shape(8, "size")).toEqual([["private"], ["unclear"], ["none"]]);
    expect(shape(9, "practice")).toEqual([["private"], ["unclear"], ["none"]]);
  });
});

// ---------------------------------------------------------------------------
// Clause rules
// ---------------------------------------------------------------------------
describe("prior-days thread clauses", () => {
  it("returns the exact empty copy when nothing is gatherable", () => {
    const view = build({ ...emptyProgress });
    expect(view.groups).toEqual([]);
    expect(view.empty).toBe(thread.empty);
    expect(view.heading).toBe(thread.heading);
    expect(view.intro).toBe(thread.intro);
  });

  it("quotes the exact canonical label for one substantive choice on every source", () => {
    const cases: [number, string, string][] = [
      [1, "brought", "stuck"],
      [2, "load", "feeling"],
      [3, "carrying", "grief"],
      [4, "response", "withdraw"],
      [4, "purpose", "conflict"],
      [5, "forward", "honest"],
      [5, "holdback", "hurt"],
      [6, "cost", "body"],
      [6, "protects", "peace"],
      [7, "need", "rest"],
      [8, "route", "self"],
      [8, "size", "tiny"],
      [9, "practice", "grounding"],
    ];
    for (const [n, from, optionId] of cases) {
      const text = paragraphs(progressWith([{ day: n, tokens: [stable(n, from, optionId)] }]));
      expect(text, `${n}.${from}`).toContain(`\u201C${labelOf(n, from, optionId)}\u201D`);
    }
  });

  it("summarizes more than one substantive multi-select choice without a main one", () => {
    const multis: [number, string, string, string][] = [
      [1, "brought", "stuck", "loss"],
      [2, "load", "feeling", "thoughts"],
      [3, "carrying", "grief", "fear"],
      [4, "purpose", "conflict", "criticism"],
    ];
    for (const [n, from, a, b] of multis) {
      const text = paragraphs(
        progressWith([{ day: n, tokens: [stable(n, from, a), stable(n, from, b)] }]),
      );
      expect(text, `${n}.${from}`).toContain(
        "more than one option was selected; none is treated as the main one",
      );
      expect(text).not.toContain(`\u201C${labelOf(n, from, a)}\u201D`);
    }
  });

  it("lets private dominate a substantive coexistence and corruption alike", () => {
    const withSubstantive = paragraphs(
      progressWith([{ day: 1, tokens: [stable(1, "brought", "stuck"), stable(1, "brought", "private")] }]),
    );
    expect(withSubstantive).toContain("what brought you: kept private");
    expect(withSubstantive).not.toContain("could not be summarized safely");

    const withUnknown = paragraphs(
      progressWith([{ day: 1, tokens: [`${keyFor(1, "brought")}:nope`, stable(1, "brought", "private")] }]),
    );
    expect(withUnknown).toContain("what brought you: kept private");
    expect(withUnknown).not.toContain("could not be summarized safely");
  });

  it("uses the exact unclear phrase and keeps a none label exact", () => {
    expect(
      paragraphs(progressWith([{ day: 3, tokens: [stable(3, "carrying", "unsure")] }])),
    ).toContain("a word you considered for what you might be carrying: left unclear");
    expect(
      paragraphs(progressWith([{ day: 5, tokens: [stable(5, "holdback", "unknown")] }])),
    ).toContain("a possible concern: left unclear");
    expect(
      paragraphs(progressWith([{ day: 5, tokens: [stable(5, "forward", "none")] }])),
    ).toContain(`a possible pull toward movement: \u201C${labelOf(5, "forward", "none")}\u201D`);
  });

  it("treats Day 4 notfit and Day 6 little as substantive", () => {
    expect(
      paragraphs(progressWith([{ day: 4, tokens: [stable(4, "purpose", "notfit")] }])),
    ).toContain(`\u201C${labelOf(4, "purpose", "notfit")}\u201D`);
    expect(
      paragraphs(progressWith([{ day: 6, tokens: [stable(6, "protects", "little")] }])),
    ).toContain(`\u201C${labelOf(6, "protects", "little")}\u201D`);
  });

  it("fails closed on every incompatible current combination", () => {
    const malformed = "stored choices could not be summarized safely";
    // unknown token
    expect(
      paragraphs(progressWith([{ day: 6, tokens: [`${keyFor(6, "cost")}:mystery`] }])),
    ).toContain(malformed);
    // duplicate token on a single-select
    expect(
      paragraphs(
        progressWith([{ day: 6, tokens: [stable(6, "cost", "body"), stable(6, "cost", "body")] }]),
      ),
    ).toContain(malformed);
    // two different tokens on a single-select
    expect(
      paragraphs(
        progressWith([{ day: 6, tokens: [stable(6, "cost", "body"), stable(6, "cost", "energy")] }]),
      ),
    ).toContain(malformed);
    // exclusive substantive coexisting on a multi-select
    expect(
      paragraphs(
        progressWith([
          { day: 4, tokens: [stable(4, "purpose", "notfit"), stable(4, "purpose", "conflict")] },
        ]),
      ),
    ).toContain(malformed);
    // unclear coexisting with a substantive
    expect(
      paragraphs(
        progressWith([
          { day: 3, tokens: [stable(3, "carrying", "grief"), stable(3, "carrying", "unsure")] },
        ]),
      ),
    ).toContain(malformed);
    // two specials together
    expect(
      paragraphs(
        progressWith([{ day: 5, tokens: [stable(5, "forward", "unclear"), stable(5, "forward", "none")] }]),
      ),
    ).toContain(malformed);
  });

  it("omits unanswered sources, ignores unrelated tokens and never prints a raw id", () => {
    const view = build(
      progressWith([
        { day: 9, tokens: [stable(9, "practice", "grounding"), "step:prepare", "q.other:x"] },
      ]),
    );
    expect(view.groups).toHaveLength(1);
    expect(view.groups[0]!.title).toBe("Care and rehearsal possibilities");
    expect(view.groups[0]!.paragraph).toContain(
      `a private rehearsal route you considered: \u201C${labelOf(9, "practice", "grounding")}\u201D`,
    );
    expect(view.groups[0]!.paragraph).not.toContain("grounding");
    expect(view.groups[0]!.paragraph).not.toContain("q.practice");
  });

  it("keeps group order fixed and joins clauses with a semicolon", () => {
    const view = build(
      progressWith([
        { day: 9, tokens: [stable(9, "practice", "grounding")] },
        { day: 1, tokens: [stable(1, "brought", "stuck")] },
        { day: 8, tokens: [stable(8, "size", "tiny")] },
      ]),
    );
    expect(view.groups.map((g) => g.id)).toEqual(["starting", "rehearsal"]);
    expect(view.groups[1]!.paragraph).toContain(
      `an amount you considered: \u201C${labelOf(8, "size", "tiny")}\u201D; a private rehearsal route you considered:`,
    );
    expect(view.groups.length).toBeLessThanOrEqual(5);
    expect(view.empty).toBeNull();
  });

  it("accepts the canonical decimal legacy form only", () => {
    const good = paragraphs(progressWith([{ day: 9, tokens: [positional(9, "practice", 0)] }]));
    expect(good).toContain(`\u201C${labelOf(9, "practice", "grounding")}\u201D`);
    for (const suffix of ["", "-0", "0e0", "00", "01", "999"]) {
      const text = paragraphs(
        progressWith([{ day: 9, tokens: [`${keyFor(9, "practice")}.${suffix}`] }]),
      );
      expect(text, `suffix ${suffix}`).toContain("stored choices could not be summarized safely");
    }
  });
});

// ---------------------------------------------------------------------------
// Meaning-version firewall and the optional Christian choice
// ---------------------------------------------------------------------------
describe("prior-days thread firewall", () => {
  it("never interprets the legacy answers mirror or an older answer set", () => {
    const poisoned: JourneyProgress = {
      ...emptyProgress,
      answers: {
        [dayIdFor(1)]: [stable(1, "brought", "loss")],
        [dayIdFor(6)]: [stable(6, "cost", "body")],
      },
      answerSets: {
        [dayIdFor(1)]: { v1: [stable(1, "brought", "stuck")] },
      },
    };
    const text = paragraphs(poisoned);
    expect(text).toContain(`\u201C${labelOf(1, "brought", "stuck")}\u201D`);
    expect(text).not.toContain(`\u201C${labelOf(1, "brought", "loss")}\u201D`);
    expect(text).not.toContain("a possible present-day cost");
  });

  it("gives a source-scoped older-wording notice and nothing more", () => {
    const day8 = dayOf(8);
    expect(day8.answerMeaningVersion).toBe("v2");
    const older: JourneyProgress = {
      ...emptyProgress,
      answerSets: { [dayIdFor(8)]: { v1: [stable(8, "route", "self")] } },
    };
    const text = paragraphs(older);
    expect(text).toContain(
      "a possible source of already-safe care: earlier choices used older wording and are not summarized here",
    );
    // The Day 8 size source shares the day but not the step, so it stays silent.
    expect(text).not.toContain("an amount you considered");
  });

  it("suppresses an older notice once the current meaning is adopted, even empty", () => {
    const adopted: JourneyProgress = {
      ...emptyProgress,
      answerSets: { [dayIdFor(8)]: { v1: [stable(8, "route", "self")], v2: [] } },
    };
    expect(build(adopted).groups).toEqual([]);

    const current: JourneyProgress = {
      ...emptyProgress,
      answerSets: {
        [dayIdFor(8)]: { v1: [stable(8, "route", "community")], v2: [stable(8, "route", "self")] },
      },
    };
    const text = paragraphs(current);
    expect(text).toContain(`\u201C${labelOf(8, "route", "self")}\u201D`);
    expect(text).not.toContain("older wording");
    expect(text).not.toContain(`\u201C${labelOf(8, "route", "community")}\u201D`);
  });

  it("withholds the Day 8 God choice while spiritual content is off or unhydrated", () => {
    const godLabel = labelOf(8, "route", "god");
    const godIndex = dayOf(8).questions
      .find((q) => q.id === "route")!
      .options.findIndex((o) => o.id === "god");

    for (const token of [stable(8, "route", "god"), positional(8, "route", godIndex)]) {
      const progress = progressWith([{ day: 8, tokens: [token] }]);
      for (const opts of [OFF, UNHYDRATED]) {
        const view = build(progress, opts);
        const text = view.groups.map((g) => g.paragraph).join(" ");
        expect(text).not.toContain(godLabel);
        expect(text).not.toContain("could not be summarized safely");
        expect(text).not.toContain("a possible source of already-safe care");
        expect(view.groups).toEqual([]);
        expect(view.empty).toBe(thread.empty);
      }
      // Hydrated and on, the canonical choice returns through the generic filter.
      expect(paragraphs(progress, ON)).toContain(`\u201C${godLabel}\u201D`);
      // Raw storage is untouched either way.
      expect(progress.answerSets[dayIdFor(8)]!["v2"]).toEqual([token]);
    }
  });

  it("leaves no older-version trace for a spiritual-capable source while off or unhydrated", () => {
    const godIndex = dayOf(8)
      .questions.find((q) => q.id === "route")!
      .options.findIndex((o) => o.id === "god");

    for (const token of [stable(8, "route", "god"), positional(8, "route", godIndex)]) {
      const older: JourneyProgress = {
        ...emptyProgress,
        answerSets: { [dayIdFor(8)]: { v1: [token] } },
      };
      for (const opts of [OFF, UNHYDRATED]) {
        const view = build(older, opts);
        const text = view.groups.map((g) => g.paragraph).join(" ");
        expect(text).not.toContain("a possible source of already-safe care");
        expect(text).not.toContain("older wording");
        expect(text).not.toContain("could not be summarized safely");
        expect(view.groups).toEqual([]);
        expect(view.empty).toBe(thread.empty);
      }
      // Hydrated and on, only the neutral source-scoped notice may appear.
      const onText = paragraphs(older, ON);
      expect(onText).toContain(
        "a possible source of already-safe care: earlier choices used older wording and are not summarized here",
      );
      expect(onText).not.toContain(labelOf(8, "route", "god"));
    }
  });

  it("conservatively suppresses an older nonspiritual token on the same spiritual-capable source", () => {
    const older: JourneyProgress = {
      ...emptyProgress,
      answerSets: { [dayIdFor(8)]: { v1: [stable(8, "route", "self")] } },
    };
    for (const opts of [OFF, UNHYDRATED]) {
      const view = build(older, opts);
      expect(view.groups).toEqual([]);
      expect(view.empty).toBe(thread.empty);
    }
    expect(paragraphs(older, ON)).toContain("earlier choices used older wording");
  });


  it("is deterministic and mutates nothing", () => {
    const progress = progressWith([
      { day: 1, tokens: [stable(1, "brought", "stuck")] },
      { day: 8, tokens: [stable(8, "route", "god"), stable(8, "size", "tiny")] },
    ]);
    const before = JSON.stringify(progress);
    const a = build(progress, OFF);
    const b = build(progress, OFF);
    expect(JSON.stringify(progress)).toBe(before);
    expect(a).toEqual(b);
    expect(JSON.stringify(thread)).toBe(JSON.stringify(day10.reflection.priorDaysThread));
  });

  it("uses no browser, storage, network, model, date or write API", () => {
    const source = readFileSync("src/lib/journey/prior-days-thread.ts", "utf8")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
      .join("\n");
    for (const forbidden of [
      "window",
      "document",
      "localStorage",
      "sessionStorage",
      "fetch(",
      "XMLHttpRequest",
      "Date.",
      "Math.random",
      "console.",
      "saveDay",
      "generateContent",
      "callModel",
    ]) {
      expect(source, `forbidden API: ${forbidden}`).not.toContain(forbidden);
    }
  });
});

// ---------------------------------------------------------------------------
// The thread stays outside every saved artefact
// ---------------------------------------------------------------------------
describe("prior-days thread stays out of the saved reflection", () => {
  it("adds nothing to the built reflection, its text, snapshot or fingerprint", () => {
    const answers = [
      `${answerKeyFor(day10, "different")}:harsh`,
      `${answerKeyFor(day10, "unfinished")}:grief`,
      "step:revisit",
    ];
    const text = reflectionToText(buildReflection(day10, answers));
    const proof = reflectionSnapshot(day10, answers);
    const combined = `${text} ${proof} ${reflectionContentFingerprint(day10)}`;
    for (const phrase of [
      thread.heading,
      thread.intro,
      thread.showLabel,
      thread.hideLabel,
      thread.empty,
      ...thread.groups.map((g) => g.title),
      ...thread.groups.flatMap((g) => g.sources.map((s) => s.descriptor)),
    ]) {
      expect(combined, `leaked: ${phrase}`).not.toContain(phrase);
    }
  });

  it("keeps the Day 10 fingerprint sensitive to its own revised next lines only", () => {
    const current = reflectionContentFingerprint(day10);
    const stale = reflectionContentFingerprint({
      ...day10,
      reflection: {
        ...day10.reflection,
        sections: day10.reflection.sections.map((s) =>
          s.id === "next"
            ? { ...s, lines: { ...(s.lines ?? {}), revisit: "You chose one day or practice you may return to." } }
            : s,
        ),
      },
    });
    expect(stale).not.toBe(current);
    // Adding or removing the thread definition cannot invalidate a saved copy.
    const withoutThread = reflectionContentFingerprint({
      ...day10,
      reflection: { ...day10.reflection, priorDaysThread: undefined },
    });
    expect(withoutThread).toBe(current);
  });

  it("locks the revised Day 10 next lines and keeps Day 10 at meaning v1", () => {
    expect(day10.answerMeaningVersion).toBe("v1");
    const next = day10.reflection.sections.find((s) => s.id === "next")!;
    expect(next.lines!["support"]).toBe(
      "You considered identifying one kind of support, accommodation, advocacy or practical care. No kind of support, contact or availability is being attributed to you.",
    );
    expect(next.lines!["conversation"]).toBe(
      "You considered preparing one sentence you might share. Nothing is assumed to have been prepared, sent or said, and this reflection cannot decide whether sharing would be safe.",
    );
    expect(next.lines!["limit"]).toBe(
      "You considered naming one limit or condition. No limit, action, safety or availability is being attributed to you.",
    );
    expect(next.lines!["rest"]).toBe(
      "You considered one realistic form of rest or reduced demand, if available. No rest or availability is being assumed.",
    );
    expect(next.lines!["kind"]).toBe(
      "You considered keeping one fair sentence available for a difficult moment. No sentence, practice or future use is being attributed to you.",
    );
    expect(next.lines!["revisit"]).toBe(
      "You considered returning to one day or practice. Nothing is assumed to have been chosen, scheduled or owed.",
    );
    expect(next.lines!["prepare"]).toBe(
      "You considered letting the journey end here with nothing outward required. No action or feeling is being attributed.",
    );
    // Unlisted lines are unchanged.
    expect(next.lines!["unavailable"]).toBe(
      "A step may matter, but none feels safe or available now. That limit is respected; you are not being asked to override it.",
    );
    expect(next.lines!["none"]).toBe(
      "No next step feels right or needed today. The journey can be complete without one.",
    );
    expect(next.lines!["private"]).toBe(
      "You kept how you are leaving private. That boundary is respected.",
    );
    expect(next.unanswered).toBe(
      "You did not choose a next step. The journey can end here without one.",
    );
  });

  it("is the only day carrying an optional gathering", () => {
    const carriers = FIRST_JOURNEY_DAYS.filter((d) => d.reflection.priorDaysThread).map(
      (d) => d.day,
    );
    expect(carriers).toEqual([10]);
  });
});

// ---------------------------------------------------------------------------
// UI contract on the existing reflection screen
// ---------------------------------------------------------------------------
describe("Day 10 disclosure UI contract", () => {
  const routeSource = readFileSync("src/routes/day.$day.tsx", "utf8");

  it("renders immediately after the reflection closing, hidden by default", () => {
    const closingAt = routeSource.indexOf("{built.closing}");
    const threadAt = routeSource.indexOf("<PriorDaysThreadDisclosure");
    expect(closingAt).toBeGreaterThan(0);
    expect(threadAt).toBeGreaterThan(closingAt);
    expect(routeSource).toContain("const [shown, setShown] = useState(false)");
  });

  it("uses one accessible toggle with the approved labels and unmounts its body", () => {
    expect(routeSource).toContain('aria-expanded={shown}');
    expect(routeSource).toContain('aria-controls="prior-days-thread"');
    expect(routeSource).toContain("min-h-[44px]");
    expect(routeSource).toContain("{shown ? definition.hideLabel : definition.showLabel}");
    expect(routeSource).toContain("{shown && view ? (");
  });

  it("waits for progress and preference hydration before it can present", () => {
    expect(routeSource).toContain("const ready = progress !== null && hydrated;");
    expect(routeSource).toContain("shown && ready");
  });

  it("neither saves nor transmits the gathered wording", () => {
    const start = routeSource.indexOf("function PriorDaysThreadDisclosure");
    const end = routeSource.indexOf("function ReflectionScreen");
    const body = routeSource.slice(start, end);
    for (const forbidden of [
      "localStorage",
      "sessionStorage",
      "saveDayReflection",
      "saveLocator",
      "saveReached",
      "markDayComplete",
      "fetch(",
      "navigate(",
    ]) {
      expect(body, `forbidden in disclosure: ${forbidden}`).not.toContain(forbidden);
    }
  });
});

// ---------------------------------------------------------------------------
// Atomic privacy disclosure
// ---------------------------------------------------------------------------
describe("privacy disclosure lands with the feature", () => {
  it("dates the Privacy Policy and describes the optional gathering accurately", () => {
    const privacy = readFileSync("src/routes/privacy.tsx", "utf8");
    expect(privacy).toContain('lastUpdated="August 17, 2026"');
    expect(privacy).toContain("Optional Day 10 earlier-choices view");
    expect(privacy).toContain("Show earlier choices");
    expect(privacy).toContain("is not saved in local");
    expect(privacy).toContain("artificial intelligence, analytics or any other");
    expect(privacy).toContain("disappears when you hide it, leave the page or");
  });

  it("says the same thing in the Settings privacy summary", () => {
    const settings = readFileSync("src/content/settings.ts", "utf8");
    expect(settings).toContain("Show earlier choices");
    expect(settings).toContain("is not saved or added to your reflection");
  });

  it("bumps the legal bundle exactly once for this change", async () => {
    const { LEGAL_BUNDLE_VERSION } = await import("@/lib/prefs");
    expect(LEGAL_BUNDLE_VERSION).toBe("2026-08-16.1");
  });
});
