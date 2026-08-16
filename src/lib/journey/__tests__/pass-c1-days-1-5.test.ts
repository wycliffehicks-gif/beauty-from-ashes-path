// Pass C1 — clinically reviewed Days 1–5 depth revision.
//
// These tests lock the exact approved replacements, the retained structural
// contract (IDs, select modes, question order, screen order), the new STATIC
// Day 2 reflection section, the gentler/read-only routes, and the safety
// boundaries the revision must not cross. Days 6–10 are untouched by this pass.

import { describe, it, expect } from "vitest";
import { FIRST_JOURNEY_DAYS, getFirstJourneyDay } from "@/content/first-journey";
import type { JourneyDayContent } from "@/content/journey-types";
import { buildReflection } from "@/lib/journey/reflection-engine";
import {
  reflectionSnapshot,
  resolveReflection,
} from "@/lib/journey/reflection-restore";

const days: JourneyDayContent[] = [1, 2, 3, 4, 5].map((n) => getFirstJourneyDay(n)!);
const day = (n: number): JourneyDayContent => getFirstJourneyDay(n)!;

function allText(d: JourneyDayContent) {
  return JSON.stringify(d);
}

describe("Pass C1 — retained structure for Days 1–5", () => {
  it("keeps every question ID, order and select mode", () => {
    const expected: Record<number, [string, string][]> = {
      1: [
        ["state", "one"],
        ["brought", "many"],
      ],
      2: [
        ["body", "many"],
        ["load", "many"],
      ],
      3: [
        ["carrying", "many"],
        ["shows", "many"],
      ],
      4: [
        ["response", "one"],
        ["doorway", "many"],
        ["purpose", "many"],
      ],
      5: [
        ["forward", "one"],
        ["holdback", "one"],
      ],
    };
    for (const d of days) {
      expect(d.questions.map((q) => [q.id, q.select])).toEqual(expected[d.day]);
      expect(d.step.id).toBe("step");
      expect(d.step.select).toBe("one");
    }
  });

  it("keeps the option IDs that carry stored answer meaning", () => {
    expect(day(1).questions[0]!.options.map((o) => o.id)).toEqual([
      "heavy",
      "tense",
      "flat",
      "restless",
      "tender",
      "steady",
      "unsure",
    ]);
    expect(day(1).questions[1]!.options.map((o) => o.id)).toEqual([
      "stuck",
      "loss",
      "hurt",
      "tired",
      "distant",
      "shame",
      "hope",
      "private",
    ]);
    expect(day(2).questions[1]!.options.map((o) => o.id)).toEqual([
      "feeling",
      "thoughts",
      "pressure",
      "selfpressure",
      "tiredness",
      "flat",
    ]);
    expect(day(3).step.options.map((o) => o.id)).toEqual([
      "hold",
      "write",
      "tell",
      "kind",
      "prepare",
    ]);
    expect(day(4).step.options.map((o) => o.id)).toEqual([
      "notice",
      "sentence",
      "reminder",
      "prepare-share",
      "settle",
    ]);
    expect(day(5).step.options.map((o) => o.id)).toEqual([
      "thank",
      "tiny",
      "wait",
      "talk",
      "prepare",
    ]);
  });

  it("preserves Pass B arrive.purpose on every revised day", () => {
    for (const d of days) {
      expect(d.arrive.purpose.trim().length).toBeGreaterThan(80);
    }
  });

  it("keeps Days 6–10 present and untouched in shape", () => {
    expect(FIRST_JOURNEY_DAYS.map((d: JourneyDayContent) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe("Pass C1 — Day 1 exact replacements", () => {
  const d = day(1);

  it("uses the simple-map understanding block", () => {
    expect(d.understand.heading).toBe("A simple map, not a demand to change");
    expect(d.understand.body[0]).toBe(
      "People postpone difficult things for many reasons: fear, exhaustion, uncertainty, limited support, present demands, or a response that has helped them cope. Delay is not proof of laziness or unwillingness.",
    );
    expect(d.understand.body[1]).toContain("Where am I now?");
    expect(d.understand.body[2]).toContain("The purpose is orientation, not breakthrough.");
  });

  it("defines a protective response as a possibility, not praise, blame or diagnosis", () => {
    expect(d.understand.info?.[0]!.explanation).toBe(
      "A protective response is something that may help a person cope, preserve safety, reduce pain or keep functioning. It may still be needed in some circumstances. The word is a possibility, not praise, blame or diagnosis.",
    );
  });

  it("closes the state echo without demanding change", () => {
    expect(d.questions[0]!.echo!.closing).toBe(
      "Whatever is here right now is enough to begin with. Nothing has to change first.",
    );
  });

  it("uses the revised 'brought' labels while keeping their IDs", () => {
    const label = (id: string) =>
      d.questions[1]!.options.find((o) => o.id === id)!.label;
    expect(label("stuck")).toBe("I feel stuck and cannot yet see a way forward");
    expect(label("hurt")).toBe("A hurt or unresolved experience still affects me");
    expect(label("shame")).toBe("I feel shame or painful self-blame");
    expect(label("hope")).toBe("I want to feel more hope or possibility");
  });

  it("opens the reflection practice outwardly and ends without solving", () => {
    const steps = d.practise.reflection.steps;
    expect(steps).toHaveLength(6);
    expect(steps[0]).toContain("Begin outwardly");
    expect(steps[1]).toContain("No event, person or history needs to be named.");
    expect(steps[4]).toContain("Name one resource that has helped you reach today");
    expect(steps[5]).toContain("I can begin here without solving this today");
    expect(d.practise.reflection.notRequired).toBe(
      "Gentler route: choose only one sentence stem. Read-only route: read the stems without answering. No writing, disclosure, decision or action is required.",
    );
  });

  it("uses the revised Psalm 139 opening and voluntary-invitation note", () => {
    const s = d.practise.spiritual.scripture!;
    expect(s.reference).toBe("Psalm 139:1, 23 (World English Bible)");
    expect(s.body).toContain("you have searched me, and you know me");
    expect(s.note).toContain("voluntary invitation, not surveillance");
    expect(d.practise.spiritual.steps).toHaveLength(5);
    expect(d.practise.spiritual.steps[3]).toContain("No answer or outcome is promised.");
  });

  it("reads the two starting-map pieces together in the care section", () => {
    const care = d.reflection.sections.find((s) => s.id === "care")!;
    expect(care.from).toBeUndefined();
    expect(care.opening).toContain("two parts of a starting map");
    expect(care.opening).toContain("not an explanation of your life");
  });

  it("qualifies the 'tell' step with a safe-person note", () => {
    const note = d.step.options.find((o) => o.id === "tell")!.note!;
    expect(note).toContain("consistently respected your limits");
    expect(note).toContain("cannot decide who is safe");
    expect(note).toContain("preparing a sentence without sharing it counts");
  });
});

describe("Pass C1 — Day 2 exact replacements", () => {
  const d = day(2);

  it("widens the feeling label without changing its ID", () => {
    const feeling = d.questions[1]!.options.find((o) => o.id === "feeling")!;
    expect(feeling.label).toBe(
      "A feeling—sadness or grief, fear, anger, shame, loneliness, longing, relief or hope",
    );
  });

  it("offers equally complete outward and inward routes and a sorting step", () => {
    const steps = d.practise.reflection.steps;
    expect(steps[0]).toBe(
      "Choose a route. Outward attention and inward attention are equally complete.",
    );
    expect(steps[2]).toContain("only if workable");
    expect(steps[3]).toContain("‘A body signal is…’");
    expect(steps[5]).toContain("No response has to be chosen or completed today.");
    expect(d.practise.reflection.notRequired).toContain("Gentler route: use only the outward step.");
    expect(d.practise.reflection.notRequired).toContain(
      "not calmness, insight or symptom change",
    );
  });

  it("does not require moving from despair to hope on demand", () => {
    expect(d.practise.spiritual.steps[2]).toBe(
      "If you wish, name one feeling, question or need before God. You do not have to move from despair to hope on demand.",
    );
    expect(d.practise.spiritual.scripture!.reference).toContain("Psalm 42");
  });

  it("adds a STATIC care section immediately before the next-step section", () => {
    const ids = d.reflection.sections.map((s) => s.id);
    expect(ids).toEqual(["hearing", "underneath", "care", "next"]);
    const care = d.reflection.sections.find((s) => s.id === "care")!;
    expect(care.title).toBe("What the distinction may offer");
    expect(care.from).toBeUndefined();
    expect(care.lines).toBeUndefined();
    expect(care.opening).toContain("One does not prove the cause of the other.");
    expect(care.unanswered).toBe(
      "No connection will be assumed. Sensation, emotion, thought and pressure can remain unclear or separate today.",
    );
  });

  it("renders the static care section whether or not anything was answered", () => {
    for (const answers of [[], ["q.body:0", "q.load:1"]]) {
      const built = buildReflection(d, answers);
      const care = built.sections.find((s) => s.id === "care")!;
      expect(care.paragraphs[0]).toContain("two separate pieces of information");
    }
  });

  it("refines the step labels and notes without changing their IDs", () => {
    const opt = (id: string) => d.step.options.find((o) => o.id === id)!;
    expect(opt("checkin").label).toBe(
      "Do one brief check-in later, if repeated checking feels helpful rather than increasing anxiety",
    );
    expect(opt("ease").label).toBe(
      "If comfortable, experiment with softening my jaw, shoulders or hands once",
    );
    expect(opt("share").note).toContain("shown respect for your limits");
    expect(opt("share").note).toContain("preparing the sentence counts");
  });

  it("softens the next-step reflection lines for ease and rest", () => {
    const next = d.reflection.sections.find((s) => s.id === "next")!;
    expect(next.lines!.ease).toBe(
      "If comfortable, softening one held place is one small experiment. No result is required.",
    );
    expect(next.lines!.rest).toBe(
      "A brief period of rest may be a practical response to tiredness or overload; it does not have to solve the day.",
    );
  });
});

describe("Pass C1 — Day 3 exact replacements", () => {
  const d = day(3);

  it("defines carrying on Arrive and drops the duplicate info note", () => {
    expect(d.arrive.body[0]).toContain("By ‘carrying,’ this journey means grief, worry");
    expect(d.arrive.body[2]).toContain("all valid routes");
    expect(d.understand.info?.some((n) => n.term.includes("carrying"))).toBe(false);
    expect(d.understand.info?.some((n) => n.term.includes("diagnosis"))).toBe(true);
    expect(
      d.questions[1]!.info?.some((n) => n.term === "A note about physical symptoms"),
    ).toBe(true);
  });

  it("uses the revised Locate prompt", () => {
    expect(d.questions[1]!.prompt).toBe(
      "Where, if anywhere, do you notice its presence or effects in life right now?",
    );
  });

  it("offers workable forms and stops after one sentence", () => {
    const steps = d.practise.reflection.steps;
    expect(steps).toHaveLength(6);
    expect(steps[1]).toContain("Nothing has to be shared today.");
    expect(steps[3]).toContain("Do not add details unless you freely choose");
    expect(steps[5]).toContain("Reorient to ordinary details");
    expect(d.practise.reflection.notRequired).toBe(
      "Gentler route: choose a word without making a sentence. Read-only route: read the stems and leave them unanswered. No fuller story, body focus, disclosure, insight, relief or action is required.",
    );
  });

  it("keeps lament open-ended", () => {
    expect(d.practise.spiritual.steps).toHaveLength(4);
    expect(d.practise.spiritual.steps[3]).toContain(
      "Resolution, praise and certainty are not required.",
    );
    expect(d.practise.spiritual.scripture!.reference).toContain("Psalm 13");
  });

  it("frames the care section as a modest map with no cause", () => {
    const care = d.reflection.sections.find((s) => s.id === "care")!;
    expect(care.opening).toContain("do not establish a cause");
    expect(care.opening).toContain("modest map");
  });

  it("qualifies the 'tell' step with a safe-person note", () => {
    const note = d.step.options.find((o) => o.id === "tell")!.note!;
    expect(note).toContain("without pressure, retaliation or misuse");
    expect(note).toContain("Preparing the sentence counts.");
  });
});

describe("Pass C1 — Day 4 exact replacements", () => {
  const d = day(4);

  it("describes a pattern without identity or diagnosis", () => {
    expect(d.understand.body[0]).toBe(
      "A pattern means a response that tends to return in certain situations. It describes what happens; it is not an identity or diagnosis.",
    );
    expect(d.understand.body[1]).toContain("Protection may still be necessary where danger");
    expect(d.understand.body[2]).toContain("No origin memory is required.");
  });

  it("maps the response in the present, without an origin story", () => {
    expect(d.practise.reflection.title).toBe(
      "Reflection Practice — map one response with compassion",
    );
    expect(d.practise.reflection.summary).toContain("without requiring an origin story or change");
    const steps = d.practise.reflection.steps;
    expect(steps).toHaveLength(6);
    expect(steps[2]).toContain("I do not know what keeps this going.");
    expect(steps[3]).toContain("A present cost does not prove the response is unnecessary.");
    expect(d.practise.reflection.notRequired).toContain("Gentler route: complete only");
    expect(d.practise.reflection.notRequired).toContain("Read-only route");
  });

  it("keeps Mark 10:21 with love before any decision", () => {
    expect(d.practise.spiritual.steps).toHaveLength(5);
    expect(d.practise.spiritual.steps[1]).toContain("loves before the young man decides anything");
    expect(d.practise.spiritual.steps[4]).toContain("No release or outcome is required.");
    expect(d.practise.spiritual.scripture!.reference).toContain("Mark 10:21");
  });

  it("reads the working map without diagnosis in the care section", () => {
    const care = d.reflection.sections.find((s) => s.id === "care")!;
    expect(care.opening).toContain("working map—not a diagnosis or origin story");
  });

  it("asks for a small way to remember the map without forcing change", () => {
    expect(d.step.prompt).toBe(
      "What is one small way to remember this map without forcing change?",
    );
    expect(d.step.options.find((o) => o.id === "prepare-share")!.note).toContain(
      "Preparing counts.",
    );
  });
});

describe("Pass C1 — Day 5 exact replacements", () => {
  const d = day(5);

  it("explains capacity as brief, safe contact rather than pressure", () => {
    expect(d.understand.body).toHaveLength(4);
    expect(d.understand.body[2]).toContain("Capacity grows through brief, safe contact—not pressure");
    expect(d.understand.body[2]).toContain("part of wise pacing");
    expect(d.understand.body[3]).toContain("does not require finding two pulls");
  });

  it("lets both pulls speak without debating or deciding", () => {
    const steps = d.practise.reflection.steps;
    expect(steps).toHaveLength(7);
    expect(steps[3]).toContain("If only one is present, name only that one.");
    expect(steps[4]).toContain("without debating, solving or choosing");
    expect(steps[6]).toContain("I do not have to settle this today");
    expect(d.practise.reflection.notRequired).toContain("Gentler route: name only one pull.");
    expect(d.practise.reflection.notRequired).toContain("Read-only route");
  });

  it("keeps Mark 9:24 without equating caution with unbelief", () => {
    expect(d.practise.spiritual.steps).toHaveLength(5);
    expect(d.practise.spiritual.steps[2]).toContain("not being equated with unbelief");
    expect(d.practise.spiritual.steps[4]).toContain("No answer or action is required.");
    expect(d.practise.spiritual.scripture!.reference).toContain("Mark 9:24");
  });

  it("frames the care section as a decision map, not a verdict", () => {
    const care = d.reflection.sections.find((s) => s.id === "care")!;
    expect(care.from).toBeUndefined();
    expect(care.opening).toContain("decision map");
    expect(care.opening).toContain("does not establish which direction is wiser");
  });

  it("qualifies the 'talk' step with a safe-person note", () => {
    const note = d.step.options.find((o) => o.id === "talk")!.note!;
    expect(note).toContain("No need to share today.");
    expect(note).toContain("consistently respected your limits");
  });
});

describe("Pass C1 — safety boundaries across Days 1–5", () => {
  it("keeps gentler and read-only participation explicit in every practice", () => {
    for (const d of days) {
      const nr = d.practise.reflection.notRequired;
      expect(nr, `day ${d.day}`).toMatch(/Gentler route|gentler/);
      expect(nr, `day ${d.day}`).toMatch(/Read-only route|read-only/i);
    }
  });

  it("never assumes the practice was completed in a reflection", () => {
    for (const d of days) {
      for (const answers of [[], ["q.state:0"], ["q.state:6", "step:0"]]) {
        const text = JSON.stringify(buildReflection(d, answers));
        expect(text, `day ${d.day}`).not.toMatch(/you (did|completed|finished|carried out) the practice/i);
        expect(text, `day ${d.day}`).not.toMatch(/because you practised/i);
        expect(text, `day ${d.day}`).not.toMatch(/after (you )?completing the (practice|exercise)/i);
      }
    }
  });

  it("uses no earliest-memory, forced disclosure, forgiveness or growth-through-distress wording", () => {
    for (const d of days) {
      const text = allText(d);
      for (const banned of [
        /earliest memory/i,
        /first time (you|it) (ever )?happened/i,
        /you must (share|tell|disclose|forgive|reconcile|confront)/i,
        /you (have to|need to) forgive/i,
        /must reconcile/i,
        /confront (them|him|her|the person)/i,
        /discomfort (is|means|proves) (growth|healing|progress)/i,
        /the more it hurts/i,
      ]) {
        expect(text, `day ${d.day} :: ${banned}`).not.toMatch(banned);
      }
    }
  });

  it("keeps safe-person guidance non-directive wherever sharing is offered", () => {
    for (const d of days) {
      for (const option of d.step.options) {
        if (!option.note) continue;
        if (!/share|sentence|person|prepar/i.test(option.note)) continue;
        expect(option.note, `day ${d.day} ${option.id}`).not.toMatch(/you should (tell|share)/i);
      }
    }
  });
});

describe("Pass C1 — reflection snapshot invalidation for Days 1–5", () => {
  it("rejects a saved reflection written under superseded wording and rebuilds", () => {
    for (const d of days) {
      const answers: string[] = [];
      const stale = {
        text: "An older reflection saved before Pass C1.",
        snapshot: "r2:deadbeef:none",
      };
      const resolved = resolveReflection(d, answers, stale);
      expect(resolved.restored, `day ${d.day}`).toBe(false);
      expect(resolved.replaceSaved, `day ${d.day}`).toBe(true);
      expect(resolved.snapshot, `day ${d.day}`).toBe(reflectionSnapshot(d, answers));
      expect(resolved.text, `day ${d.day}`).not.toContain("An older reflection");
    }
  });

  it("restores an exact save written under current wording", () => {
    for (const d of days) {
      const answers: string[] = [];
      const fresh = resolveReflection(d, answers, {});
      const again = resolveReflection(d, answers, {
        text: fresh.text,
        snapshot: fresh.snapshot,
      });
      expect(again.restored, `day ${d.day}`).toBe(true);
      expect(again.replaceSaved, `day ${d.day}`).toBe(false);
    }
  });
});
