// Pass B — daily clarity and experiential foundation regression locks.
//
// Covers: the required Arrive purpose and where it renders; unchanged screen
// keys, order, IDs and selection modes; exact Day 1 wording; the ambiguous
// "heavy" audit; the default-open core practice with opt-in spiritual path; and
// the optional, unpersisted post-practice check with its containment and
// orientation branches.

import { describe, expect, it } from "vitest";

import { FIRST_JOURNEY_DAYS, getFirstJourneyDay } from "@/content/first-journey";
import { screenKey, screensFor, type JourneyDayContent } from "@/content/journey-types";
import { OPENING_SCREENS } from "@/content/opening";
import { ABOUT_JOURNEY } from "@/content/settings";
import {
  ARRIVE_PURPOSE_HEADING,
  PRACTICE_BOTH_OPEN_NOTE,
  PRACTICE_CHECK_NUMB,
  PRACTICE_CHECK_OPTIONS,
  PRACTICE_CHECK_PLAIN_NOTE,
  PRACTICE_CHECK_PRIVATE_NOTE,
  PRACTICE_CHECK_PROMPT,
  PRACTICE_CHECK_STIRRED,
  PRACTICE_SINGLE_INTRO,
} from "@/routes/day.$day";

async function readSource(relativePath: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  return readFile(new URL(`../../../${relativePath}`, import.meta.url), "utf8");
}

function day(n: number): JourneyDayContent {
  const d = getFirstJourneyDay(n);
  if (!d) throw new Error(`Day ${n} is missing`);
  return d;
}

const PURPOSES: Record<number, string> = {
  1: "Starting with one honest picture of the present can reduce the pressure to solve everything. Today helps you notice what needs attention, what you hope may become different, and what has already helped you keep going.",
  2: "A body sensation, an emotion, a thought and pressure can feel like one blur, yet each may need a different response. Separating them can make your next step more accurate and kinder.",
  3: "Naming one manageable part of an experience can make it less vague and easier to respond to. Naming is not diagnosis, and it does not fix what happened.",
  4: "A familiar response may make more sense when you see what happens before it, what it tries to protect and what it affects now. Understanding is not excusing harm; it creates more room for choice.",
  5: "Wanting change and wanting safety can exist together. Hearing both sides can reduce self-attack and show what would make one next step more workable.",
  6: "A response can have helped you survive and still cost you something now. Honouring both truths can make room to grieve the cost and look for a safer replacement.",
  7: "Shame can turn pain or mistakes into a verdict about who you are. Separating what happened or what you did from your worth can support honesty, responsibility and dignity together.",
  8: "Some people can face pain more easily than they can receive safe kindness, help, compassion or grace. Noticing your reaction can help you choose what feels safe enough to let in.",
  9: "Insight becomes more usable when a new response is practised before it is needed. Private rehearsal can reveal what fits, what needs changing and what support would make it safer.",
  10: "Looking back can reveal a thread: what you noticed, what protected you, what it cost, what matters now and what step may come next. Integration does not mean everything is resolved.",
};

describe("required Arrive purpose", () => {
  it("every day carries a nontrivial purpose", () => {
    expect(FIRST_JOURNEY_DAYS).toHaveLength(10);
    for (const d of FIRST_JOURNEY_DAYS) {
      expect(typeof d.arrive.purpose).toBe("string");
      expect(d.arrive.purpose.trim().length).toBeGreaterThan(80);
      expect(d.arrive.purpose).not.toBe(d.arrive.lead);
    }
  });

  it("uses the exact clinically reviewed statement for each day", () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      expect(day(n).arrive.purpose).toBe(PURPOSES[n]);
    }
  });

  it("renders under the exact label, after the lead and before any settling invitation", async () => {
    const src = await readSource("src/routes/day.$day.tsx");
    expect(ARRIVE_PURPOSE_HEADING).toBe("Why this day matters");
    const lead = src.indexOf("content.arrive.lead");
    const purpose = src.indexOf("content.arrive.purpose");
    const settle = src.indexOf("content.arrive.settle");
    expect(lead).toBeGreaterThan(-1);
    expect(purpose).toBeGreaterThan(lead);
    expect(settle).toBeGreaterThan(purpose);
    // Therapeutic copy role: minimum 18px ramp.
    expect(src).toContain('<p className="bfa-copy text-foreground">{content.arrive.purpose}</p>');
  });

  it("adds no screen: Arrive remains one screen per day", () => {
    for (const d of FIRST_JOURNEY_DAYS) {
      const keys = screensFor(d).map(screenKey);
      expect(keys.filter((k) => k === "arrive")).toHaveLength(1);
      expect(keys[0]).toBe("arrive");
      expect(keys).not.toContain("purpose");
    }
  });
});

describe("stateful structure is unchanged", () => {
  it("keeps one arrive/understand/practise/step/reflection/close per day, in order", () => {
    for (const d of FIRST_JOURNEY_DAYS) {
      const keys = screensFor(d).map(screenKey);
      for (const k of ["understand", "practise", "step", "reflection", "close"]) {
        expect(keys.filter((x) => x === k)).toHaveLength(1);
      }
      expect(keys[keys.length - 1]).toBe("close");
      expect(keys.indexOf("reflection")).toBe(keys.length - 2);
      expect(keys.indexOf("step")).toBe(keys.length - 3);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("keeps every question and step ID with its selection mode", () => {
    const seen: Record<number, string[]> = {};
    for (const d of FIRST_JOURNEY_DAYS) {
      seen[d.day] = d.questions.map((q) => `${q.id}:${q.select}`);
      expect(["one", "many"]).toContain(d.step.select);
      for (const q of [...d.questions, d.step]) {
        expect(q.options.length).toBeGreaterThan(1);
        for (const o of q.options) expect(o.id).toMatch(/^[a-z0-9-]+$/);
      }
    }
    expect(seen[1]).toContain("state:one");
    expect(day(1).questions[0]!.options.map((o) => o.id)).toContain("heavy");
  });
});

describe("Day 1 exact clarity wording", () => {
  const d1 = () => day(1);

  it("names the ten-day journey", () => {
    expect(d1().arrive.body[0]).toContain("This is the first day of the 10-day journey.");
    expect(d1().arrive.body.join(" ")).not.toContain("first day of a short journey");
  });

  it("uses the permissive breath invitation", () => {
    expect(d1().arrive.settle?.join(" ")).toContain(
      "If breathing feels comfortable, take one easy breath in. As you breathe out, let the exhale be slightly longer. Do not force it. If breath focus is uncomfortable, keep your attention on the room.",
    );
  });

  it("replaces vague small-day language with the exact permission", () => {
    const all = JSON.stringify(d1());
    expect(all).toContain(
      "You do not need to accomplish much today. One honest choice\u2014or simply reading\u2014can be enough.",
    );
    expect(all).not.toContain("today can be small");
  });
});

describe("no bare ambiguous heaviness in canonical client copy", () => {
  /** Contexts where the word is explicitly a described body sensation or Scripture. */
  const ALLOWED = [
    "Arms and legs \u2014 heavy or restless",
    "heaviness or restlessness in your arms or legs",
    "heavily burdened",
  ];

  function strings(value: unknown, out: string[] = []): string[] {
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
    else if (value && typeof value === "object") {
      Object.values(value).forEach((v) => strings(v, out));
    }
    return out;
  }

  it("keeps the stable option ID heavy without assuming the metaphor", () => {
    const state = day(1).questions.find((q) => q.id === "state")!;
    const heavy = state.options.find((o) => o.id === "heavy")!;
    expect(heavy.label).toBe("Emotionally weighed down or worn out");
  });

  it("has no unexplained heavy/heaviness wording in the ten days", () => {
    const suspects = strings(FIRST_JOURNEY_DAYS)
      .filter((s) => /heav/i.test(s))
      .filter((s) => !ALLOWED.some((a) => s.includes(a)));
    expect(suspects).toEqual([]);
  });

  it("defines carrying on Welcome and drops jargon from the About copy", () => {
    const welcome = OPENING_SCREENS.find((s) => s.key === "welcome")!;
    expect(welcome.points.join(" ")).toMatch(/emotional or spiritual strain/i);
    expect(ABOUT_JOURNEY).not.toMatch(/feel heavy/i);
    expect(ABOUT_JOURNEY).toContain("emotionally weighed down");
  });
});

describe("core practice is visible by default and spiritual stays opt-in", () => {
  it("uses the exact spirituality-off intro", () => {
    expect(PRACTICE_SINGLE_INTRO).toBe(
      "The practice is open below. You may try all of it, use only one step, read without doing it, or stop at any point.",
    );
  });

  it("opens the nonreligious practice by default and never the spiritual one", async () => {
    const src = await readSource("src/routes/day.$day.tsx");
    expect(src).toContain("const [reflectionOpen, setReflectionOpen] = useState(true);");
    expect(src).toContain("const [spiritualOpen, setSpiritualOpen] = useState(false);");
    expect(src).toContain("path={content.practise.reflection}");
    expect(src).toContain("isOpen={reflectionOpen}");
    expect(src).toContain("isOpen={spiritualOpen}");
    // The Christian panel is still gated behind the hydrated preference.
    expect(src).toContain("const showSpiritual = prefsHydrated && prefs.showSpiritual;");
  });

  it("makes both equal paths clear when spirituality is on", () => {
    expect(PRACTICE_BOTH_OPEN_NOTE).toContain("already open");
    expect(PRACTICE_BOTH_OPEN_NOTE).toContain("Christian path instead");
    expect(PRACTICE_BOTH_OPEN_NOTE).toContain("Nothing opens or plays on its own.");
  });
});

describe("optional local post-practice check", () => {
  it("uses the exact label and the six options", () => {
    expect(PRACTICE_CHECK_PROMPT).toBe(
      "If you tried any part of a practice, what do you notice now?",
    );
    expect(PRACTICE_CHECK_OPTIONS.map((o) => o.label)).toEqual([
      "A little clearer",
      "About the same",
      "More stirred up",
      "Numb or far away",
      "Unclear",
      "Keep this private",
    ]);
  });

  it("never persists, transmits or reflects the choice", async () => {
    const src = await readSource("src/routes/day.$day.tsx");
    const start = src.indexOf("function PostPracticeCheck()");
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf("\n}\n", start));
    for (const forbidden of [
      "localStorage",
      "sessionStorage",
      "fetch(",
      "saveDayAnswers",
      "savePrefs",
      "setPrefs",
      "saveLocator",
      "saveReached",
      "saveDayReflection",
      "navigate(",
      "console.",
      "search:",
    ]) {
      expect(body).not.toContain(forbidden);
    }
    expect(body).toContain("useState<PracticeCheckId | null>(null)");
  });

  it("never blocks Continue: the Practice screen keeps its plain continue action", async () => {
    const src = await readSource("src/routes/day.$day.tsx");
    expect(src).toContain(
      "return shell(<PractiseScreen content={content} />, { onContinue: onNext });",
    );
  });

  it("leaves the private option uninterpreted", () => {
    expect(PRACTICE_CHECK_PRIVATE_NOTE).toContain("Nothing is recorded");
    expect(PRACTICE_CHECK_PRIVATE_NOTE).toContain("nothing here interprets it");
    expect(PRACTICE_CHECK_PLAIN_NOTE).toContain("Nothing is saved");
  });

  it("contains a stirred-up response without diagnosis, breathing or claims about healing", () => {
    const text = [
      PRACTICE_CHECK_STIRRED.heading,
      ...PRACTICE_CHECK_STIRRED.steps,
      PRACTICE_CHECK_STIRRED.note,
    ].join(" ");
    expect(text).toContain("Stop the exercise");
    expect(text).toContain("eyes open");
    expect(text).toMatch(/name several ordinary things you can see/i);
    expect(text).toMatch(/support under your feet or body/i);
    expect(text).toMatch(/steadier/i);
    expect(text).toMatch(/one option, not something you must do/i);
    expect(text).not.toMatch(/breath|breathe|inhale|exhale/i);
    expect(text).not.toMatch(/dissociat|disorder|diagnos|symptom of/i);
    expect(text).not.toMatch(/proves|means it is working|sign of healing/i);
  });

  it("orients outward for numb or far away, without diagnosis or breathing", () => {
    const text = [
      PRACTICE_CHECK_NUMB.heading,
      ...PRACTICE_CHECK_NUMB.steps,
      PRACTICE_CHECK_NUMB.note,
    ].join(" ");
    expect(text).toContain("eyes open");
    expect(text).toContain("stop the exercise");
    expect(text).toMatch(/date and the place/i);
    expect(text).toMatch(/colour.*shape.*sound/i);
    expect(text).toMatch(/immediate in-person help/i);
    expect(text).not.toMatch(/breath|breathe|inhale|exhale/i);
    expect(text).not.toMatch(/dissociat|disorder|diagnos/i);
  });

  it("offers Return home and Support & Safety in both branches", async () => {
    const src = await readSource("src/routes/day.$day.tsx");
    const start = src.indexOf("function PostPracticeCheck()");
    const body = src.slice(start);
    expect(body).toContain("Return home");
    expect(body).toContain('to="/support"');
    expect(body).toContain('aria-pressed={choice === o.id}');
    expect(body).toContain("min-h-[48px]");
  });

  it("no reflection assumes a practice was done", () => {
    for (const d of FIRST_JOURNEY_DAYS) {
      const text = JSON.stringify(d.reflection);
      expect(text).not.toMatch(/because you did the practice|now that you have practised/i);
    }
  });
});
