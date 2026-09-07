import { describe, expect, it } from "vitest";

import { getFirstJourneyDay } from "@/content/first-journey";
import { buildReflection } from "@/lib/journey/reflection-engine";
import {
  buildPrintableExport,
  buildReflectionExport,
} from "@/lib/journey/export";
import { reflectionSnapshot } from "@/lib/journey/reflection-restore";
import { emptyProgress, type JourneyProgress } from "@/lib/journey/progress";

const day1 = getFirstJourneyDay(1)!;
const day2 = getFirstJourneyDay(2)!;
const day3 = getFirstJourneyDay(3)!;
const day8 = getFirstJourneyDay(8)!;

function paragraphs(day: typeof day1, answers: string[], sectionId: string): string[] {
  return buildReflection(day, answers).sections.find((s) => s.id === sectionId)!.paragraphs;
}

describe("groundedness: unanswered days claim no activity", () => {
  it("Day 1 fully unanswered never claims words were given", () => {
    const text = buildReflection(day1, []).sections.flatMap((s) => s.paragraphs).join("\n");
    expect(text).not.toContain("You gave some words to what brought you here");
    expect(text).toContain("You left what brought you here unnamed");
    expect(text).not.toContain("You arrived as you were today");
  });

  it("Day 1 partially answered restores the opening only for the answered question", () => {
    const p = paragraphs(day1, ["q.brought:stuck"], "underneath");
    expect(p[0]).toContain("You gave some words to what brought you here");
    expect(p[1]).toContain("You named feeling stuck");
    // The unanswered "state" question keeps its unanswered wording only.
    const state = paragraphs(day1, ["q.brought:stuck"], "hearing");
    expect(state).toEqual([
      "You left how you arrived unnamed. You do not need to explain yourself for this reflection to meet you with care.",
    ]);
  });

  it("Day 1 hurt and hope lines stay within what the options actually say", () => {
    const lines = day1.reflection.sections.find((s) => s.id === "underneath")!.lines!;
    expect(lines.hurt).toBe("You named a hurt or unresolved experience that still affects you.");
    expect(lines.hope).toBe("You named wanting to feel more hope or possibility.");
    expect(lines.hurt).not.toMatch(/never been resolved/i);
    expect(lines.hope).not.toMatch(/without knowing how/i);
  });

  it("Day 2 fully unanswered claims neither noticing nor attention given", () => {
    const text = buildReflection(day2, []).sections.flatMap((s) => s.paragraphs).join("\n");
    expect(text).not.toContain("You noticed the following");
    expect(text).not.toMatch(/Attention was given/i);
    expect(text).not.toMatch(/attention you gave today already happened/i);
  });

  it("Day 2 close copy no longer asserts attention was given", () => {
    expect(day2.close.body.join(" ")).not.toMatch(/you gave this some attention/i);
  });

  it("Day 2 valid selected IDs still produce the authored opening and lines", () => {
    const p = paragraphs(day2, ["q.body:chest", "q.load:pressure"], "hearing");
    expect(p[0]).toBe("You noticed the following:");
    expect(p[1]).toContain("tightness, fullness or hollowness in your chest");
  });

  it("Day 3 summarising opening is withheld while nothing is selected", () => {
    const p = paragraphs(day3, [], "care");
    expect(p[0]).not.toContain("The word you selected and where you notice it");
    const answered = paragraphs(day3, [`q.${day3.questions[0]!.id}:${day3.questions[0]!.options[0]!.id}`], "care");
    expect(answered[0]).toContain("The word you selected and where you notice it");
  });

  it("every day still produces substantive text when fully unanswered", () => {
    for (let n = 1; n <= 10; n += 1) {
      const day = getFirstJourneyDay(n)!;
      const built = buildReflection(day, []);
      for (const section of built.sections) {
        expect(section.paragraphs.length).toBeGreaterThan(0);
        expect(section.paragraphs.join(" ").length).toBeGreaterThan(30);
      }
    }
  });
});

function progressWith(
  dayId: string,
  answers: string[],
  reflection?: { text: string; snapshot?: string },
): JourneyProgress {
  const day = getFirstJourneyDay(Number(dayId.replace("day-", "")))!;
  return {
    ...emptyProgress,
    completedDays: [dayId],
    answerSets: { [dayId]: { [day.answerMeaningVersion]: answers } },
    reflections: reflection ? { [dayId]: reflection.text } : {},
    reflectionSnapshots:
      reflection?.snapshot ? { [dayId]: reflection.snapshot } : {},
  };
}

const OFF = { hydrated: true, showSpiritual: false };
const ON = { hydrated: true, showSpiritual: true };

describe("export presentation and reflection consistency", () => {
  const spiritualStep = day8.questions.find((q) =>
    q.options.some((o) => o.spiritualOnly === true),
  )!;
  const spiritualOption = spiritualStep.options.find((o) => o.spiritualOnly === true)!;
  const spiritualToken = `q.${spiritualStep.id}:${spiritualOption.id}`;

  it("withholds a saved spiritual-only selection while spirituality is OFF", () => {
    const progress = progressWith("day-08", [spiritualToken]);
    const off = buildReflectionExport(progress, OFF);
    expect(off.text).not.toContain(spiritualOption.label);
    expect(off.summary.answerCount).toBe(0);

    const on = buildReflectionExport(progress, ON);
    expect(on.text).toContain(spiritualOption.label);
    expect(on.summary.answerCount).toBe(1);

    // off -> on -> off, reload-equivalent: raw storage is untouched throughout.
    const offAgain = buildReflectionExport(progress, OFF);
    expect(offAgain.text).toBe(off.text);
    expect(progress.answerSets["day-08"]![day8.answerMeaningVersion]).toEqual([spiritualToken]);
  });

  it("fails closed when the preference is unknown or unhydrated", () => {
    const progress = progressWith("day-08", [spiritualToken]);
    expect(buildReflectionExport(progress).text).not.toContain(spiritualOption.label);
    expect(
      buildReflectionExport(progress, { hydrated: false, showSpiritual: true }).text,
    ).not.toContain(spiritualOption.label);
  });

  it("exported reflection text matches the current presentation, not a stale snapshot", () => {
    const progress = progressWith("day-01", ["q.brought:stuck"], {
      text: "OLD SAVED REFLECTION TEXT",
      snapshot: "r2:deadbeef:stale",
    });
    const out = buildReflectionExport(progress, OFF);
    expect(out.text).not.toContain("OLD SAVED REFLECTION TEXT");
    expect(out.text).toContain("You named feeling stuck");
    expect(out.summary.reflectionCount).toBe(1);
  });

  it("an unchanged matching snapshot exports the exact words already read", () => {
    const answers = ["q.brought:stuck"];
    const saved = buildReflection(day1, answers);
    const savedText = saved.sections
      .flatMap((s) => [s.title, ...s.paragraphs])
      .join("\n\n");
    const full = [saved.intro, savedText, saved.closing].join("\n\n");
    const progress = progressWith("day-01", answers, {
      text: full,
      snapshot: reflectionSnapshot(day1, answers),
    });
    const out = buildReflectionExport(progress, OFF);
    expect(out.text).toContain(full);
  });

  it("a missing snapshot or missing reflection still exports current text", () => {
    const noSnapshot = progressWith("day-01", ["q.brought:loss"], { text: "older wording" });
    expect(buildReflectionExport(noSnapshot, OFF).text).toContain(
      "You named that something was lost",
    );

    const noReflection = progressWith("day-01", ["q.brought:loss"]);
    const out = buildReflectionExport(noReflection, OFF);
    expect(out.summary.reflectionCount).toBe(1);
    expect(out.text).toContain("Your reflection:");
  });

  it("missing answers export a grounded unanswered reflection and no selections", () => {
    const progress = progressWith("day-01", []);
    const out = buildReflectionExport(progress, OFF);
    expect(out.summary.answerCount).toBe(0);
    expect(out.text).not.toContain("Your selections:");
    expect(out.text).toContain("You left what brought you here unnamed");
  });

  it("selections stored under an older answer meaning are not relabelled", () => {
    const progress: JourneyProgress = {
      ...emptyProgress,
      completedDays: ["day-01"],
      answerSets: { "day-01": { v0: ["q.brought:stuck"] } },
      reflections: {},
      reflectionSnapshots: {},
    };
    const out = buildReflectionExport(progress, OFF);
    expect(out.summary.answerCount).toBe(0);
    expect(out.text).not.toContain("Your selections:");
  });

  it("never mutates or saves progress during export", () => {
    const progress = progressWith("day-08", [spiritualToken]);
    const before = JSON.stringify(progress);
    buildReflectionExport(progress, OFF);
    buildPrintableExport(progress, ON);
    expect(JSON.stringify(progress)).toBe(before);
  });

  it("printable output agrees with the text export and escapes markup", () => {
    const progress = progressWith("day-01", ["q.brought:stuck"]);
    const text = buildReflectionExport(progress, OFF);
    const print = buildPrintableExport(progress, OFF);
    expect(print.summary).toEqual(text.summary);
    expect(print.html).toContain("You named feeling stuck");
    expect(print.html).not.toContain("<script");

    const off = buildPrintableExport(progressWith("day-08", [spiritualToken]), OFF);
    expect(off.html).not.toContain(spiritualOption.label);

    // A restorable saved reflection carrying markup must be escaped, not rendered.
    const answers = ["q.brought:stuck"];
    const built = buildReflection(day1, answers);
    const withMarkup = [
      built.intro,
      ...built.sections.flatMap((s, i) => [
        s.title,
        ...(i === 0 ? ['<script>alert("x")</script> & more'] : []),
        ...s.paragraphs,
      ]),
      built.closing,
    ].join("\n\n");
    const escaped = buildPrintableExport(
      progressWith("day-01", answers, {
        text: withMarkup,
        snapshot: reflectionSnapshot(day1, answers),
      }),
      OFF,
    );
    expect(escaped.html).not.toContain("<script>");
    expect(escaped.html).toContain("&amp;");
    expect(escaped.html).toContain("&lt;script&gt;");
  });
});
