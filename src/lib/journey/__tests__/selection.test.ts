import { describe, expect, it } from "vitest";
import { getFirstJourneyDay } from "@/content/first-journey";
import { toggleSelection } from "../selection";

const day2 = getFirstJourneyDay(2)!;
const body = day2.questions.find((q) => q.id === "body")!;
const nothingIdx = body.options.findIndex((o) => o.id === "nothing");
const chestIdx = body.options.findIndex((o) => o.id === "chest");
const headIdx = body.options.findIndex((o) => o.id === "head");

describe("exclusive choice selection", () => {
  it("choosing the exclusive option clears the others", () => {
    expect(toggleSelection(body, [chestIdx, headIdx], nothingIdx)).toEqual([nothingIdx]);
  });

  it("choosing another option clears the exclusive one", () => {
    expect(toggleSelection(body, [nothingIdx], chestIdx)).toEqual([chestIdx]);
  });

  it("non-exclusive options still accumulate", () => {
    expect(toggleSelection(body, [chestIdx], headIdx)).toEqual([chestIdx, headIdx]);
  });

  it("toggling off removes just that option", () => {
    expect(toggleSelection(body, [chestIdx, headIdx], chestIdx)).toEqual([headIdx]);
  });

  it("single-select questions keep one-at-a-time behaviour", () => {
    expect(toggleSelection(day2.step, [1], 3)).toEqual([3]);
    expect(toggleSelection(day2.step, [3], 3)).toEqual([]);
  });
});

describe("Day 2 revision", () => {
  it("marks only the 'nothing' body option exclusive", () => {
    expect(body.options.filter((o) => o.exclusive).map((o) => o.id)).toEqual(["nothing"]);
  });

  it("labels the educational screen 'Listen'", () => {
    expect(day2.understand.label).toBe("Listen");
  });

  it("carries the physical-symptom note and neutral explore heading", () => {
    expect(body.info?.some((n) => n.term === "A note about physical symptoms")).toBe(true);
    expect(body.echo?.heading).toBe("What you noticed");
  });

  it("drops the redundant combined load option and the removed reflection line", () => {
    const load = day2.questions.find((q) => q.id === "load")!;
    expect(load.options.map((o) => o.id)).not.toContain("mixed");
    const underneath = day2.reflection.sections.find((s) => s.id === "underneath")!;
    expect(underneath.lines?.["mixed"]).toBeUndefined();
  });

  it("offers the safe sharing step with its caution", () => {
    const share = day2.step.options.find((o) => o.id === "share")!;
    expect(share.note).toMatch(/feels safe/i);
    const next = day2.reflection.sections.find((s) => s.id === "next")!;
    expect(next.lines?.["share"]).toBeTruthy();
  });

  it("avoids causal or promissory language in the revised copy", () => {
    const text = JSON.stringify(day2).toLowerCase();
    for (const phrase of [
      "grief and fear",
      "unsaid",
      "makes the load smaller",
      "no one else sees it",
      "tomorrow",
      "feet flat",
    ]) {
      expect(text, `unexpected phrase: ${phrase}`).not.toContain(phrase);
    }
  });

  it("offers an outward alternative in the reflection practice", () => {
    const steps = day2.practise.reflection.steps.join(" ").toLowerCase();
    expect(steps).toContain("five neutral things");
    expect(day2.practise.spiritual.scripture?.reference).toMatch(/Psalm 42/);
  });
});

describe("Day 3 revision", () => {
  const day3 = getFirstJourneyDay(3)!;
  const carrying = day3.questions.find((q) => q.id === "carrying")!;
  const shows = day3.questions.find((q) => q.id === "shows")!;
  const ids = (q: typeof carrying) => q.options.map((o) => o.id);
  const text = JSON.stringify(day3);

  it("removes the redundant 'mixed' option and adds regret and private", () => {
    expect(ids(carrying)).not.toContain("mixed");
    expect(ids(carrying)).toContain("regret");
    expect(ids(carrying)).toContain("private");
  });

  it("makes 'I would rather not name it here today' exclusive both ways", () => {
    const priv = ids(carrying).indexOf("private");
    const grief = ids(carrying).indexOf("grief");
    const fear = ids(carrying).indexOf("fear");
    expect(toggleSelection(carrying, [grief, fear], priv)).toEqual([priv]);
    expect(toggleSelection(carrying, [priv], grief)).toEqual([grief]);
  });

  it("makes 'not sure where it shows up' exclusive both ways", () => {
    const unclear = ids(shows).indexOf("unclear");
    const sleep = ids(shows).indexOf("sleep");
    expect(toggleSelection(shows, [sleep], unclear)).toEqual([unclear]);
    expect(toggleSelection(shows, [unclear], sleep)).toEqual([sleep]);
  });

  it("labels the educational screen 'Listen' and defines 'carrying'", () => {
    expect(day3.understand.label).toBe("Listen");
    expect(day3.understand.info?.some((n) => n.term.includes("carrying"))).toBe(true);
  });

  it("drops the 'illness' body wording and adds the physical-symptom note", () => {
    expect(shows.options.find((o) => o.id === "body")!.label).not.toMatch(/illness/i);
    expect(shows.info?.some((n) => n.term === "A note about physical symptoms")).toBe(true);
  });

  it("uses the One Honest Sentence practice with an outward alternative", () => {
    expect(day3.practise.reflection.title).toContain("One Honest Sentence");
    expect(day3.practise.reflection.steps.join(" ")).toContain("three neutral details");
    expect(day3.practise.reflection.steps.join(" ")).not.toMatch(/Let it go/);
  });

  it("avoids 'tomorrow' and confident causal claims", () => {
    for (const phrase of [
      "tomorrow",
      "genuinely unsafe rather than imagined",
      "keeps score",
      "system asking",
      "run the day",
      "usually a relief",
      "love with nowhere to put itself",
    ]) {
      expect(text.toLowerCase()).not.toContain(phrase.toLowerCase());
    }
  });

  it("keeps the skipped reflection path free of contradictory openings", () => {
    const hearing = day3.reflection.sections.find((s) => s.id === "hearing")!;
    const landing = day3.reflection.sections.find((s) => s.id === "underneath")!;
    expect(hearing.opening).toBeUndefined();
    expect(landing.opening).toBeUndefined();
  });

  it("keeps Psalm 13 and both practice pathways", () => {
    expect(day3.practise.spiritual.scripture?.reference).toContain("Psalm 13:1–2");
  });
});

describe("Day 3 wording refinement", () => {
  const day3 = getFirstJourneyDay(3)!;
  const carrying = day3.questions.find((q) => q.id === "carrying")!;
  const shows = day3.questions.find((q) => q.id === "shows")!;
  const text = JSON.stringify(day3);

  it("makes the 'unsure' word option exclusive both ways", () => {
    const idsList = carrying.options.map((o) => o.id);
    const unsure = idsList.indexOf("unsure");
    const grief = idsList.indexOf("grief");
    expect(toggleSelection(carrying, [grief], unsure)).toEqual([unsure]);
    expect(toggleSelection(carrying, [unsure], grief)).toEqual([grief]);
  });

  it("replaces public-facing 'Unresolved hurt' wording", () => {
    expect(text).not.toMatch(/Unresolved hurt/i);
    expect(text).not.toMatch(/unresolved hurt/);
    expect(carrying.options.find((o) => o.id === "hurt")!.label).toBe(
      "Hurt that still affects me — something painful still matters",
    );
  });

  it("uses the revised Locate prompt and non-shared-cause hint", () => {
    expect(shows.prompt).toContain("feel relevant");
    expect(shows.hint).toContain("does not mean those experiences share the same cause");
  });

  it("includes the refined One Honest Sentence wording", () => {
    const steps = day3.practise.reflection.steps.join(" ");
    expect(steps).toContain("Something I regret is");
    expect(steps).toContain("What feels heaviest today is");
    expect(steps).toContain("identifying details");
    expect(steps).toContain("using any sense");
  });

  it("uses the revised hold step and close heading", () => {
    expect(day3.step.options.find((o) => o.id === "hold")!.label).toContain(
      "without trying to solve it",
    );
    expect(day3.close.heading).toBe("One honest beginning");
  });
});
