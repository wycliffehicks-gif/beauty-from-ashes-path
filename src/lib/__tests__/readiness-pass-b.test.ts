// Pass B regression locks: clinician-reviewed personalized-reflection wording
// for Day 1 and Days 6–10, plus a durable structural fingerprint of the whole
// canonical ten-day content.
//
// These tests deliberately separate two concerns:
//  - a small number of EXACT clinical safeguards that must never quietly
//    disappear in a later copy edit;
//  - a structural fingerprint that ignores prose entirely, so an authorized
//    wording change passes while an accidental change to a branch, ID, order,
//    selection mode, pathway or screen shape fails loudly.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { FIRST_JOURNEY_DAYS, getFirstJourneyDay } from "@/content/first-journey";
import { screenKey, screensFor, type JourneyDayContent } from "@/content/journey-types";

function day(n: number): JourneyDayContent {
  const d = getFirstJourneyDay(n);
  if (!d) throw new Error(`Day ${n} is missing from the canonical journey`);
  return d;
}

function section(n: number, id: string) {
  const s = day(n).reflection.sections.find((x) => x.id === id);
  if (!s) throw new Error(`Day ${n} has no reflection section "${id}"`);
  return s;
}

function line(n: number, sectionId: string, lineKey: string): string {
  const value = section(n, sectionId).lines?.[lineKey];
  if (typeof value !== "string") {
    throw new Error(`Day ${n} section "${sectionId}" has no line "${lineKey}"`);
  }
  return value;
}

/** Every string inside a day's personalized reflection object only. */
function reflectionStrings(n: number): string[] {
  const out: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(day(n).reflection);
  return out;
}

describe("Pass B — no human-listener titles anywhere", () => {
  it("uses the accepted descriptive titles for Days 1–3", () => {
    expect(section(1, "hearing").title).toBe("How you arrived");
    expect(section(2, "hearing").title).toBe("What you noticed");
    expect(section(3, "hearing").title).toBe("What you named");
  });

  it("never titles a personalized-reflection section as a listener", () => {
    for (const d of FIRST_JOURNEY_DAYS) {
      for (const s of d.reflection.sections) {
        expect(s.title).not.toContain("What I'm hearing");
        expect(s.title).not.toContain("What I\u2019m hearing");
      }
    }
  });
});

describe("Pass B — exact clinical safeguards", () => {
  it("Day 1 does not decide who is safe to tell", () => {
    expect(line(1, "next", "tell")).toContain(
      "Nothing has to be shared, and this reflection cannot decide who is safe.",
    );
  });

  it("Day 7 acknowledges a kinder response without requiring it to persist", () => {
    expect(line(7, "hearing", "kind")).toContain(
      "It can be acknowledged without requiring it to stay that way all the time.",
    );
  });

  it("Day 9 does not decide whether a rehearsed limit is safe or available", () => {
    expect(line(9, "hearing", "boundary")).toContain(
      "This reflection cannot decide whether using it would be safe or available in real life, and no use is required.",
    );
  });

  it("Day 10 does not decide whether contact or sharing would be safe", () => {
    expect(line(10, "care", "relationship")).toContain(
      "this reflection cannot decide whether contact would be safe.",
    );
    expect(line(10, "next", "conversation")).toContain(
      "this reflection cannot decide whether sharing would be safe.",
    );
  });

  it("Day 8 closing owes no further receiving and keeps boundaries intact", () => {
    const closing = day(8).reflection.closing;
    expect(closing).toContain("does not require receiving more");
    expect(closing).toContain(
      "Care, discernment, accountability and boundaries can remain together",
    );
  });

  it("Day 9 closing stays nonbinding and promises neither safety nor access", () => {
    const closing = day(9).reflection.closing;
    expect(closing).toContain("A rehearsal is a possibility, not a contract.");
    expect(closing).toContain("make another response safe");
    expect(closing).toContain("promise access under pressure");
  });

  it("Day 10 closing remains byte-exact", () => {
    expect(day(10).reflection.closing).toBe(
      "Whatever you chose\u2014or left open\u2014does not have to prove progress, readiness, safety, or what comes next. Whatever you could name\u2014or could not name\u2014matters. You deserve to be met with care without having to prove that it is serious enough.",
    );
  });
});

describe("Pass B — prohibited procedural or interpretive phrasing", () => {
  const FORBIDDEN = [
    "What I'm hearing",
    "What I\u2019m hearing",
    "can change how heavy a thing feels",
    "resource already present",
    "safety remains yours to judge",
    "Nothing here tells us",
    "Its content is not known or interpreted here",
    "This reflection uses only what was selected",
    "No inner response was selected",
  ];

  for (const n of [1, 6, 7, 8, 9, 10]) {
    it(`Day ${n} personalized reflection avoids all prohibited phrases`, () => {
      const strings = reflectionStrings(n);
      for (const phrase of FORBIDDEN) {
        for (const value of strings) {
          expect(value).not.toContain(phrase);
        }
      }
    });
  }
});

/**
 * Structural fingerprint. Prose values are deliberately excluded; only
 * identifiers, order, counts, selection semantics and pathway shape are hashed.
 */
function structuralFingerprint(): string {
  const shape = FIRST_JOURNEY_DAYS.map((d) => ({
    day: d.day,
    answerMeaning: d.answerMeaningVersion,
    motif: d.motif,
    flowShape: d.shape,
    hasPurpose: typeof d.arrive.purpose === "string" && d.arrive.purpose.length > 80,
    settleCount: d.arrive.settle?.length ?? 0,
    arriveBodyCount: d.arrive.body.length,
    understandBodyCount: d.understand.body.length,
    understandInfo: (d.understand.info ?? []).map((i) => i.term),
    questions: d.questions.map((q) => ({
      id: q.id,
      select: q.select,
      options: q.options.map((o) => ({
        id: o.id,
        exclusive: o.exclusive === true,
        spiritualOnly: o.spiritualOnly === true,
      })),

      info: (q.info ?? []).map((i) => i.term),
      echo: q.echo
        ? {
            byOption: Object.keys(q.echo.byOption).sort(),
            unanswered: true,
            closing: typeof q.echo.closing === "string",
          }
        : null,
    })),
    step: {
      id: d.step.id,
      select: d.step.select,
      options: d.step.options.map((o) => ({ id: o.id, exclusive: o.exclusive === true })),
      echo: d.step.echo ? Object.keys(d.step.echo.byOption).sort() : null,
    },
    practise: {
      paths: 2,
      reflectionSteps: d.practise.reflection.steps.length,
      reflectionScripture: typeof d.practise.reflection.scripture !== "undefined",
      spiritualSteps: d.practise.spiritual.steps.length,
      spiritualScripture: typeof d.practise.spiritual.scripture !== "undefined",
    },
    reflection: d.reflection.sections.map((s) => ({
      id: s.id,
      from: s.from ?? null,
      lines: s.lines ? Object.keys(s.lines).sort() : null,
      hasOpening: typeof s.opening === "string",
      hasUnanswered: typeof s.unanswered === "string",
    })),
    closeBodyCount: d.close.body.length,
    screens: screensFor(d).map(screenKey),
  }));
  return createHash("sha256").update(JSON.stringify(shape)).digest("hex");
}

describe("canonical ten-day structural fingerprint", () => {
  it("keeps day numbers and order", () => {
    expect(FIRST_JOURNEY_DAYS.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("matches the verified structure exactly", () => {
    // Verified fingerprint of the accepted ten-day structure at the Pass B
    // acceptance point. Prose is NOT hashed, so an authorized copy-only edit
    // leaves this unchanged. Any change to a day, question, option, branch,
    // selection mode, exclusivity, echo key, practice pathway, reflection
    // section, close-body count or screen order will fail this test.
    // Update ONLY with founder approval for a deliberate structural change.
    //
    // Updated in Pass B (daily clarity): the content shape gained a REQUIRED
    // arrive.purpose field, hashed here as a presence flag. No screen, screen
    // order, progress index, question/option ID, selection mode, echo branch,
    // practice pathway, reflection section or storage version changed.
    //
    // Updated in Pass C1 (Days 1-5 depth revision): Day 2 gained one STATIC
    // reflection section ("care", no `from`, no stored answer) and Day 3 lost
    // one duplicate info note now covered on Arrive. No day, screen, screen
    // order, progress index, question/option ID, selection mode, exclusivity,
    // echo branch, practice pathway or storage version changed.
    //
    // Updated in Pass C2A (answer-meaning firewall): every day now stamps its
    // answer SEMANTICS version, hashed here so a future meaning change cannot
    // pass silently. All ten days are "v1". No screen, screen order, progress
    // index, question/option/step ID, selection mode, exclusivity, echo branch,
    // practice pathway or reflection section changed.
    //
    // Updated in Pass C2C: Day 8 answer meaning is "v2", Day 9 gained one
    // static "care" reflection section and a routed-practice map keyed by its
    // existing q.practice option IDs, and Day 8 marks its Christian option as
    // presentation-only. No day, screen, screen order, progress index,
    // question/option/step ID, selection mode, exclusivity, echo branch,
    // storage version or answer identity changed.
    expect(structuralFingerprint()).toBe(
      "6ec61a2e627ede37d0dc3178eef0daacaa530e6cd63faa55cdc62a50d9e8ef66",
    );
  });
});
