import { describe, expect, it } from "vitest";
import { getFirstJourneyDay } from "@/content/first-journey";
import { screenKey, screensFor } from "@/content/journey-types";
import { toggleSelection } from "../selection";
import { buildReflection } from "../reflection-engine";

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

describe("Day 4 revision", () => {
  const day4 = getFirstJourneyDay(4)!;
  const q = (id: string) => day4.questions.find((x) => x.id === id)!;
  const response = q("response");
  const doorway = q("doorway");
  const purpose = q("purpose");
  const text = JSON.stringify(day4).toLowerCase();
  const idx = (question: typeof doorway, id: string) =>
    question.options.findIndex((o) => o.id === id);

  it("uses the standard shape and exactly the three revised questions", () => {
    expect(day4.shape).toBe("standard");
    expect(day4.questions.map((x) => x.id)).toEqual(["response", "doorway", "purpose"]);
  });

  it("makes the response question single-select with unsure and private", () => {
    expect(response.select).toBe("one");
    expect(response.options.map((o) => o.id)).toContain("unsure");
    expect(response.options.map((o) => o.id)).toContain("private");
  });

  it("makes doorway unclear and private exclusive in both directions", () => {
    for (const id of ["unclear", "private"]) {
      const ex = idx(doorway, id);
      const other = idx(doorway, "conflict");
      expect(toggleSelection(doorway, [other], ex)).toEqual([ex]);
      expect(toggleSelection(doorway, [ex], other)).toEqual([other]);
    }
  });

  it("makes purpose notfit, unsure and private exclusive in both directions", () => {
    for (const id of ["notfit", "unsure", "private"]) {
      const ex = idx(purpose, id);
      const other = idx(purpose, "energy");
      expect(toggleSelection(purpose, [other], ex)).toEqual([ex]);
      expect(toggleSelection(purpose, [ex], other)).toEqual([other]);
    }
  });

  it("keeps both practice paths substantial, with Mark 10:21 retained", () => {
    expect(day4.practise.reflection.steps.length).toBeGreaterThanOrEqual(5);
    expect(day4.practise.spiritual.steps.length).toBeGreaterThanOrEqual(5);
    expect(day4.practise.spiritual.scripture?.reference).toContain("Mark 10:21");
    const steps = day4.practise.reflection.steps.join(" ");
    expect(steps).toContain("what remains true");
    expect(steps).not.toMatch(/adult body/i);
    expect(steps).not.toMatch(/Resistance is not disagreement/i);
  });

  it("removes historical-origin, cost and change wording", () => {
    for (const phrase of [
      "when being seen was not safe",
      "only available answer to unpredictability",
      "responsible for others too early",
      "loosen it five percent",
      "usually develops",
      "often how people survive",
      "frequently grows",
      "tends to develop",
      "was the only option",
      "protective responses are usually answers",
      "tomorrow",
    ]) {
      expect(text, `unexpected phrase: ${phrase}`).not.toContain(phrase.toLowerCase());
    }
  });

  it("keeps the answer-driven sections free of contradictory openings", () => {
    for (const id of ["hearing", "underneath", "protected"]) {
      const section = day4.reflection.sections.find((s) => s.id === id)!;
      expect(section.opening).toBeUndefined();
      expect(section.unanswered.length).toBeGreaterThan(40);
    }
    expect(day4.reflection.sections.find((s) => s.id === "protected")!.unanswered).toMatch(
      /no need to manufacture an answer/i,
    );
  });

  it("carries the safe prepare-share step note", () => {
    const share = day4.step.options.find((o) => o.id === "prepare-share")!;
    expect(share.note).toMatch(/No need to send or say it today/i);
  });
  it("states the private response choice accurately", () => {
    const json = JSON.stringify(day4);
    expect(json).not.toContain("Nothing has been recorded");
    expect(json).not.toContain("nothing about it has been recorded");
    expect(json).toContain(
      "You chose not to name a response here. No response will be assumed from that choice, and the day continues.",
    );
    expect(json).toContain(
      "You chose not to name a response here. No response will be inferred from that choice.",
    );
  });
});

describe("Day 5 revision", () => {
  const day5 = getFirstJourneyDay(5)!;
  const q = (id: string) => day5.questions.find((x) => x.id === id)!;
  const forward = q("forward");
  const holdback = q("holdback");
  const text = JSON.stringify(day5).toLowerCase();
  const ids = (options: { id: string }[]) => options.map((o) => o.id);

  it("keeps the title, standard shape and the two question ids", () => {
    expect(day5.title).toBe("The Two Pulls Within You");
    expect(day5.shape).toBe("standard");
    expect(day5.motif).toBe("two-pulls");
    expect(day5.questions.map((x) => x.id)).toEqual(["forward", "holdback"]);
    expect(forward.echo).toBeTruthy();
    expect(holdback.echo).toBeUndefined();
  });

  it("makes both questions single-select", () => {
    expect(forward.select).toBe("one");
    expect(holdback.select).toBe("one");
  });

  it("preserves existing option ids and order, appending only the new ones", () => {
    expect(ids(forward.options)).toEqual([
      "honest",
      "rest",
      "limit",
      "repair",
      "help",
      "grieve",
      "live",
      "unclear",
      "none",
      "private",
    ]);
    expect(ids(holdback.options)).toEqual([
      "hurt",
      "others",
      "stability",
      "energy",
      "hope",
      "identity",
      "unknown",
      "ongoing",
      "none",
      "private",
    ]);
    expect(ids(day5.step.options)).toEqual(["thank", "tiny", "wait", "talk", "prepare"]);
  });

  it("defines ambivalence and 'a part of me' for a newcomer", () => {
    expect(day5.understand.label).toBe("Listen");
    const terms = (day5.understand.info ?? []).map((n) => n.term);
    expect(terms.some((t) => t.includes("ambivalence"))).toBe(true);
    expect(terms.some((t) => t.includes("part of me"))).toBe(true);
    expect(holdback.info?.some((n) => n.term.includes("still real"))).toBe(true);
  });

  it("uses an inclusive arrival with no prescribed posture or breathing", () => {
    const settle = (day5.arrive.settle ?? []).join(" ").toLowerCase();
    expect(settle).not.toContain("feet flat");
    expect(settle).not.toContain("both feet");
    expect(settle).not.toContain("stand up");
    expect(settle).not.toContain("through the nose");
    expect(settle).not.toContain("through the mouth");
    expect(settle).toContain("lying down");
  });

  it("echoes only the selected forward wish, with no inferred opposite", () => {
    const echo = forward.echo!;
    expect(echo.heading).toBe("What may be drawing you forward");
    for (const id of ids(forward.options)) {
      expect(echo.byOption[id], `missing echo: ${id}`).toBeTruthy();
    }
    const echoText = JSON.stringify(echo).toLowerCase();
    for (const phrase of [
      "fear that things will fall apart",
      "old lesson",
      "seen as difficult",
      "rejected again",
      "will not stop",
    ]) {
      expect(echoText, `unexpected phrase: ${phrase}`).not.toContain(phrase);
    }
    expect(echo.byOption["repair"]).toContain(
      "does not say anything about whether the relationship still matters",
    );
    expect(echo.closing).toContain("does not assume one exists");
  });

  it("removes confident, history-inventing and universal phrasing", () => {
    for (const phrase of [
      "remembers what change cost last time",
      "usually arrives with",
      "old lesson",
      "fear that once it starts it will not stop",
      "being hurt in a way you have already survived once",
      "who i have had to become in order to get through",
      "who you had to become",
      "usually protecting something that once mattered",
      "both are usually trying",
      "without giving it the final vote",
      "thank you. i understand why",
      "nothing is written down",
      "tomorrow",
      "you let two opposing things be true",
      "part of you is reaching",
      "holding the line",
      "both pulls were listened to",
    ]) {
      expect(text, `unexpected phrase: ${phrase}`).not.toContain(phrase.toLowerCase());
    }
  });

  it("keeps both practices substantial, with Mark 9:24 and safe exits", () => {
    expect(day5.practise.reflection.steps.length).toBeGreaterThanOrEqual(5);
    expect(day5.practise.spiritual.steps.length).toBeGreaterThanOrEqual(5);
    expect(day5.practise.spiritual.scripture?.reference).toContain("Mark 9:24");
    expect(day5.practise.spiritual.steps.join(" ")).toContain(
      "not being equated with unbelief",
    );
    expect(day5.practise.reflection.steps.join(" ")).toContain("stop and return to neutral");
    expect(day5.practise.reflection.notRequired).toContain("do not need to write or save");
    expect(day5.practise.either.toLowerCase()).toContain("neither");
  });

  it("carries the no-contact and safe-person notes", () => {
    expect(forward.options.find((o) => o.id === "repair")!.note).toMatch(
      /No contact, reconciliation or forgiveness is required/i,
    );
    expect(day5.step.options.find((o) => o.id === "talk")!.note).toMatch(/unsafe/i);
  });

  it("leaves answer-driven reflection sections without openings", () => {
    for (const id of ["hearing", "protected", "next"]) {
      const section = day5.reflection.sections.find((s) => s.id === id)!;
      expect(section.opening).toBeUndefined();
      expect(section.unanswered.length).toBeGreaterThan(40);
    }
    const care = day5.reflection.sections.find((s) => s.id === "care")!;
    expect(care.from).toBeUndefined();
    expect(care.title).toBe("What may need room");
    expect(care.title).not.toContain("both");
    expect(care.opening).toContain("No single pull has to decide today");
    expect(JSON.stringify(day5)).not.toContain("not an excuse");
  });

  it("produces an honest fully skipped reflection", () => {
    const built = buildReflection(day5, undefined);
    const body = built.sections.flatMap((s) => s.paragraphs).join(" ");
    expect(body).toContain("none will be attributed");
    expect(body).toContain("No motive, history or purpose will be assigned");
    expect(body).toContain("No step was chosen");
    expect(body.toLowerCase()).not.toContain("part of you is reaching");
    expect(body.toLowerCase()).not.toContain("both pulls");
    expect(built.closing).toContain("it is not a verdict");
  });

  it("maps only the selected ids on an answered path", () => {
    const answers = [
      `q.forward.${forward.options.findIndex((o) => o.id === "rest")}`,
      `q.holdback.${holdback.options.findIndex((o) => o.id === "ongoing")}`,
      `step.${day5.step.options.findIndex((o) => o.id === "wait")}`,
    ];
    const built = buildReflection(day5, answers);
    const body = built.sections.flatMap((s) => s.paragraphs).join(" ");
    expect(body).toContain("wish for genuine rest");
    expect(body).toContain("difficult, unfair, demanding or unsafe is still real");
    expect(body).toContain("revisit this at a later time");
    expect(body).not.toContain("wish for a needed limit");
    expect(body).not.toContain("risk of hoping");
  });

  it("stays out of Day 6 cost work and Day 9 rehearsal", () => {
    expect(text).not.toContain("what it is costing");
    expect(text).not.toContain("rehearse");
    expect(text).not.toContain("practise a different response");
    expect(day5.close.heading).toBe("Room for more than one truth");
    expect(day5.close.body.join(" ")).toContain("Day 6");
    expect(day5.close.carryForward).toBe(
      "More than one truth can be present, and I can choose my pace.",
    );
  });
});

describe("Day 6 revision", () => {
  const day6 = getFirstJourneyDay(6)!;
  const q = (id: string) => day6.questions.find((x) => x.id === id)!;
  const cost = q("cost");
  const protects = q("protects");
  const ids = (options: { id: string }[]) => options.map((o) => o.id);
  const text = JSON.stringify(day6).toLowerCase();

  it("keeps the canonical identity, shape and screen sequence", () => {
    expect(day6.title).toBe("What It Is Costing Now");
    expect(day6.motif).toBe("cost");
    expect(day6.shape).toBe("notice-first");
    expect(day6.descriptor).toBe("Noticing one present-day cost · about 12 minutes");
    expect(screensFor(day6).map(screenKey)).toEqual([
      "arrive",
      "q.cost",
      "e.cost",
      "understand",
      "q.protects",
      "practise",
      "step",
      "reflection",
      "close",
    ]);
    expect(day6.questions.map((x) => x.id)).toEqual(["cost", "protects"]);
    expect(day6.step.id).toBe("step");
  });

  it("makes both questions single-select", () => {
    expect(cost.select).toBe("one");
    expect(protects.select).toBe("one");
  });

  it("preserves existing option ids and order, appending only the new ones", () => {
    expect(ids(cost.options)).toEqual([
      "body",
      "energy",
      "closeness",
      "patience",
      "choices",
      "values",
      "meaning",
      "hope",
      "none",
      "unclear",
      "private",
    ]);
    expect(ids(protects.options)).toEqual([
      "peace",
      "functioning",
      "safe",
      "others",
      "predictable",
      "little",
      "belonging",
      "limits",
      "ongoing",
      "unclear",
      "private",
    ]);
    expect(ids(day6.step.options)).toEqual([
      "rest",
      "ask",
      "return",
      "notice",
      "support",
      "prepare",
    ]);
  });

  it("uses an inclusive, optional arrival with no prescribed posture or breathing", () => {
    const settle = (day6.arrive.settle ?? []).join(" ").toLowerCase();
    for (const phrase of ["jaw", "tongue", "full weight", "feet flat", "sit up", "through the nose"]) {
      expect(settle, `unexpected phrase: ${phrase}`).not.toContain(phrase);
    }
    expect(settle).toContain("any position that works for you");
    expect(text).not.toContain("yesterday");
    expect(text).not.toContain("tomorrow");
  });

  it("labels the educational screen 'Listen' and carries the shared physical-symptom note", () => {
    expect(day6.understand.label).toBe("Listen");
    const day2Note = getFirstJourneyDay(2)!
      .questions.find((x) => x.id === "body")!
      .info!.find((n) => n.term === "A note about physical symptoms")!;
    expect(cost.info).toEqual(expect.arrayContaining([day2Note]));
    const terms = (day6.understand.info ?? []).map((n) => n.term);
    expect(terms).toContain("What if the circumstances are still real?");
    expect(terms).toContain("Why look at cost at all?");
  });

  it("keeps both practices substantial with the corrected Matthew wording", () => {
    expect(day6.practise.reflection.steps.length).toBeGreaterThanOrEqual(6);
    expect(day6.practise.spiritual.steps.length).toBeGreaterThanOrEqual(6);
    expect(day6.practise.either.toLowerCase()).toContain("neither");
    expect(day6.practise.spiritual.scripture?.reference).toContain("Matthew 11:28–30");
    expect(day6.practise.spiritual.scripture?.body).toContain("gentle and humble in heart");
    expect(day6.practise.spiritual.scripture?.note).toContain("gentle and humble");
  });

  it("carries the safety notes on the step options", () => {
    expect(day6.step.options.find((o) => o.id === "ask")!.note).toMatch(/reasonably safe/i);
    expect(day6.step.options.find((o) => o.id === "ask")!.label).toMatch(
      /nothing must be sent or said today/i,
    );
    expect(day6.step.options.find((o) => o.id === "support")!.note).toMatch(/safe or available/i);
    expect(day6.step.options.find((o) => o.id === "return")!.label).toMatch(/no action today/i);
  });

  it("leaves answer-driven reflection sections without openings", () => {
    for (const id of ["hearing", "protected", "next"]) {
      const section = day6.reflection.sections.find((s) => s.id === id)!;
      expect(section.opening).toBeUndefined();
      expect(section.unanswered.length).toBeGreaterThan(40);
    }
    const care = day6.reflection.sections.find((s) => s.id === "care")!;
    expect(care.from).toBeUndefined();
    expect(care.opening).toContain("information, not failure");
  });

  it("produces an honest fully skipped reflection", () => {
    const built = buildReflection(day6, undefined);
    const body = built.sections.flatMap((s) => s.paragraphs).join(" ");
    expect(body).not.toContain("You named");
    expect(body).not.toContain("You also named");
    expect(body).toContain("No cost, cause or hidden meaning will be assigned");
    expect(body).toContain("Nothing about why this remains will be guessed");
    expect(body).toContain("No step was chosen");
    expect(built.closing).toContain("No conclusion has been reached");
  });

  it("states none, unclear and private cost paths accurately", () => {
    const echo = cost.echo!;
    for (const id of ids(cost.options)) {
      expect(echo.byOption[id], `missing echo: ${id}`).toBeTruthy();
    }
    expect(echo.byOption["none"]).toContain("do not need to invent one");
    expect(echo.byOption["unclear"]).toContain("no cause will be assigned");
    expect(echo.byOption["private"]).toContain("No particular cost or cause will be inferred");
    expect(JSON.stringify(day6)).not.toContain("Nothing has been recorded");
    expect(JSON.stringify(day6)).not.toContain("nothing about it has been recorded");
  });

  it("maps only the selected ids on an answered path", () => {
    const answers = [
      `q.cost.${cost.options.findIndex((o) => o.id === "energy")}`,
      `q.protects.${protects.options.findIndex((o) => o.id === "ongoing")}`,
      `step.${day6.step.options.findIndex((o) => o.id === "notice")}`,
    ];
    const built = buildReflection(day6, answers);
    const body = built.sections.flatMap((s) => s.paragraphs).join(" ");
    expect(body).toContain("reduced energy or capacity");
    expect(body).toContain("lack of safe alternatives");
    expect(body).toContain("keeps the pace yours");
    expect(body).not.toContain("less closeness");
    expect(body).not.toContain("A limit is not a moral failure");
  });

  it("removes forbidden old and inferential language", () => {
    for (const phrase of [
      "choose to keep paying",
      "puts the choice back",
      "usually there",
      "buying something",
      "smaller than the danger",
      "frequently what protection",
      "preventing disappointment",
      "when other people depend on you",
      "after unpredictability",
      "specific and unsparing",
    ]) {
      expect(text, `unexpected phrase: ${phrase}`).not.toContain(phrase);
    }
  });

  it("does not manufacture a cost on none, unclear or unanswered paths", () => {
    const practice = day6.practise.reflection.steps.join(" ");
    expect(practice).not.toContain("something is taking more from me than I want");
    expect(practice).toContain("If no clear cost came to mind, let that remain true");
    expect(practice).toContain("without linking it to this response");
    expect(day6.close.carryForward).toBe(
      "I can stay honest about what is clear and unclear without condemning myself or ignoring what is still real.",
    );
    const noneIdx = cost.options.findIndex((o) => o.id === "none");
    const built = buildReflection(day6, [`q.cost.${noneIdx}`]);
    const body = built.sections.flatMap((s) => s.paragraphs).join(" ");
    expect(body).toContain("do not need to invent one");
    expect(body).not.toContain("You named");
  });
});
