// Focused locks for two confirmed defects:
//  A. optional-Christian content leaking while spiritual reflection is OFF;
//  B. categorical crisis-line confidentiality claims.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { getFirstJourneyDay } from "@/content/first-journey";
import type { JourneyDayContent, Question } from "@/content/journey-types";
import {
  presentationAnswers,
  presentationOptions,
} from "@/lib/journey/presentation-answers";
import { answerKeyFor } from "@/lib/journey/reflection-engine";

function day(n: number): JourneyDayContent {
  const d = getFirstJourneyDay(n);
  if (!d) throw new Error(`Day ${n} missing`);
  return d;
}

function question(n: number, id: string): Question {
  const q = day(n).questions.find((x) => x.id === id);
  if (!q) throw new Error(`Day ${n} has no question "${id}"`);
  return q;
}

const OFF = { hydrated: true, showSpiritual: false };
const ON = { hydrated: true, showSpiritual: true };

describe("A — Day 1 has no God clause on the distant option", () => {
  const q = question(1, "brought");
  const option = q.options.find((o) => o.id === "distant")!;

  it("keeps the id and uses the revised label", () => {
    expect(option.label).toBe("I feel distant — from people or from myself");
  });

  it("uses the revised echo, with no God reference", () => {
    const echo = day(1).reflection.sections
      .flatMap((s) => Object.values(s.lines ?? {}))
      .join(" ");
    expect(echo).toContain("You named feeling distant — from people or from yourself.");
    expect(echo).not.toContain("or from God");
  });

  it("is visible with spiritual preference off", () => {
    const ids = presentationOptions(q, OFF).map(({ option: o }) => o.id);
    expect(ids).toContain("distant");
  });
});

describe("A — Day 10 faith option is spiritual-only", () => {
  const q = question(10, "unfinished");
  const faith = q.options.find((o) => o.id === "faith")!;

  it("keeps its id and label", () => {
    expect(faith.label).toBe("Questions about faith, God, meaning, or belonging");
    expect(faith.spiritualOnly).toBe(true);
  });

  it("is hidden while off and restored while on, order preserved", () => {
    expect(presentationOptions(q, OFF).map(({ option: o }) => o.id)).not.toContain("faith");
    const onIds = presentationOptions(q, ON).map(({ option: o }) => o.id);
    expect(onIds).toContain("faith");
    expect(onIds).toEqual(q.options.map((o) => o.id));
  });

  it("makes a stored selection dormant while off and unchanged while on", () => {
    const key = answerKeyFor(day(10), "unfinished");
    const stored = [`${key}:faith`];
    expect(presentationAnswers(day(10), stored, OFF)).toEqual([]);
    expect(presentationAnswers(day(10), stored, ON)).toEqual(stored);
    // no storage migration: the raw array is untouched
    expect(stored).toEqual([`${key}:faith`]);
  });

  it("keeps the faith echo available for the opted-in path", () => {
    const echoes = day(10)
      .reflection.sections.flatMap((s) => Object.values(s.lines ?? {}))
      .join(" ");
    expect(echoes).toContain("questions about faith, God, meaning, or belonging");
  });
});

describe("A — generic Day 10 close has no faith-struggle phrase", () => {
  it("keeps a grammatical sentence without 'faith struggle'", () => {
    const body = day(10).close.body.join(" ");
    expect(body).not.toContain("faith struggle");
    expect(body).toContain(
      "Grief, questions, limits, responsibilities, harm, illness and circumstances may remain. Unfinished is not the same as failed.",
    );
  });
});

describe("B — crisis-line confidentiality caveats", () => {
  const support = readFileSync("src/routes/_shell.support.tsx", "utf8");
  const important = readFileSync("src/routes/important-information.tsx", "utf8");
  const flat = (s: string) => s.replace(/\s+/g, " ");

  it("Support & Safety states the caveat and drops the categorical claim", () => {
    expect(flat(support)).toContain(
      "These services describe their support as free and confidential; limits may apply when immediate safety is at risk.",
    );
    expect(flat(support)).not.toContain("these lines are free and confidential");
  });

  it("Important Information states the 9-8-8 caveat", () => {
    expect(flat(important)).toContain(
      "the 9-8-8 Suicide Crisis Helpline in Canada is available 24/7 by phone or text. The service describes its support as free and confidential; limits may apply when immediate safety is at risk.",
    );
    expect(flat(important)).not.toContain("free, confidential and available 24/7");
  });

  it("keeps the emergency and 988 call/text links intact", () => {
    expect(important).toContain('href="tel:911"');
    expect(important).toContain('href="tel:988"');
    expect(important).toContain('href="sms:988"');
  });
});
