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

describe("Day 7 revision", () => {
  const day7 = getFirstJourneyDay(7)!;
  
  const q = (id: string) => day7.questions.find((x) => x.id === id)!;
  const tone = q("tone");
  const need = q("need");
  const ids = (options: { id: string }[]) => options.map((o) => o.id);
  const text = JSON.stringify(day7).toLowerCase();

  it("keeps the canonical identity, shape and screen sequence", () => {
    expect(day7.title).toBe("A More Compassionate Way to Hold It");
    expect(day7.motif).toBe("compassion");
    expect(day7.shape).toBe("standard");
    expect(day7.descriptor).toBe("Holding truth without self-attack · about 12 minutes");
    expect(day7.theme).toBe(
      "Truth, context, dignity and responsibility held together without self-attack.",
    );
    expect(screensFor(day7).map(screenKey)).toEqual([
      "arrive",
      "understand",
      "q.tone",
      "e.tone",
      "q.need",
      "practise",
      "step",
      "reflection",
      "close",
    ]);
    expect(day7.questions.map((x) => x.id)).toEqual(["tone", "need"]);
    expect(day7.step.id).toBe("step");
  });

  it("makes both questions single-select", () => {
    expect(tone.select).toBe("one");
    expect(need.select).toBe("one");
  });

  it("locks the positional option ids", () => {
    expect(ids(tone.options)).toEqual([
      "harsh",
      "dismissive",
      "impatient",
      "anxious",
      "silent",
      "mixed",
      "kind",
      "none",
      "unclear",
      "private",
    ]);
    expect(ids(need.options)).toEqual([
      "rest",
      "acknowledged",
      "notalone",
      "permission",
      "patience",
      "safety",
      "forgiveness",
      "unsure",
      "none",
      "private",
    ]);
    expect(ids(day7.step.options)).toEqual([
      "sentence",
      "catch",
      "body",
      "receive",
      "prepare",
    ]);
  });

  it("labels the educational screen 'Listen' and explains the terms for a newcomer", () => {
    expect(day7.understand.label).toBe("Listen");
    const understand = day7.understand.body.join(" ");
    expect(understand).toContain("An inner response is whatever happens inside");
    expect(understand).toContain("no verbal inner voice");
    const terms = (day7.understand.info ?? []).map((n) => n.term);
    expect(terms).toContain("What does “hold it” mean?");
    expect(terms).toContain("What if compassion feels false or undeserved?");
    expect(terms).toContain("What if I have hurt someone?");
  });

  it("uses an inclusive arrival with no prescribed touch, posture, breathing or relaxation", () => {
    expect(day7.arrive.lead).toBe(
      "Facing what is true does not require turning yourself into the enemy.",
    );
    const settle = (day7.arrive.settle ?? []).join(" ");
    expect(settle).toContain("any position that works for you");
    expect(settle).toContain(
      "You do not need to touch your body, change your breathing, relax or feel settled.",
    );
    for (const phrase of ["put one hand", "let two breaths", "breathing slow", "sit up", "feet flat"]) {
      expect(text, `unexpected phrase: ${phrase}`).not.toContain(phrase);
    }
  });

  it("gives every tone option an echo that infers no history, cause or purpose", () => {
    const echo = tone.echo!;
    expect(echo.heading).toBe("What you noticed about the inner response");
    for (const id of ids(tone.options)) {
      expect(echo.byOption[id], `missing echo: ${id}`).toBeTruthy();
    }
    expect(echo.byOption["silent"]).toContain("not proof of trauma");
    expect(echo.byOption["none"]).toContain("none needs to be invented");
    expect(echo.byOption["unclear"]).toContain("no hidden meaning");
    expect(echo.byOption["private"]).toContain("no tone, cause, purpose or history will be inferred");
    expect(echo.unanswered).toBe(
      "You continued without naming an inner response. No tone, cause, purpose or history will be assigned.",
    );
    expect(echo.closing).toContain("no correction is required today");
    expect(JSON.stringify(day7)).not.toContain("nothing was recorded");
    expect(text).not.toContain("nothing has been recorded");
  });

  it("keeps both practices substantial and equal, with consent and the full Isaiah verse", () => {
    expect(day7.practise.reflection.steps.length).toBeGreaterThanOrEqual(6);
    expect(day7.practise.spiritual.steps.length).toBeGreaterThanOrEqual(6);
    const either = day7.practise.either.toLowerCase();
    expect(either).toContain("either, both or neither");
    expect(either).toContain("read");
    expect(either).toContain("stop");
    expect(day7.practise.spiritual.scripture?.reference).toBe(
      "Isaiah 42:3 (World English Bible)",
    );
    expect(day7.practise.spiritual.scripture?.body).toBe(
      "He won't break a bruised reed. He won't quench a dimly burning wick. He will faithfully bring justice.",
    );
    expect(day7.practise.spiritual.scripture?.note).toContain("not a description of you as damaged");
    expect(day7.practise.reflection.steps.join(" ")).toContain("wordless act of non-hostility");
    expect(day7.practise.reflection.steps.join(" ")).toContain(
      "No touch, posture, breathing, relaxation or bodily sensation is required",
    );
  });

  it("leaves the answer-driven reflection sections without openings", () => {
    for (const id of ["hearing", "care", "next"]) {
      const section = day7.reflection.sections.find((s) => s.id === id)!;
      expect(section.opening).toBeUndefined();
      expect(section.from).toBeTruthy();
      expect(section.unanswered.length).toBeGreaterThan(60);
    }
    for (const section of day7.reflection.sections) {
      const question = section.from === "step" ? day7.step : q(section.from!);
      for (const option of question.options) {
        expect(section.lines?.[option.id], `missing line: ${section.id}/${option.id}`).toBeTruthy();
      }
    }
  });

  it("invents nothing on a fully skipped path", () => {
    const built = buildReflection(day7, undefined);
    const body = built.sections.flatMap((s) => s.paragraphs).join(" ");
    expect(body).not.toContain("You noticed");
    expect(body).not.toContain("You considered");
    expect(body).toContain("No inner response was selected");
    expect(body).toContain("No more compassionate way of holding this was selected");
    expect(body).toContain("No step was selected");
    expect(built.closing).toContain("do not establish why this inner response exists");
  });

  it("states private, unclear and none paths accurately", () => {
    const privateIdx = tone.options.findIndex((o) => o.id === "private");
    const unclearIdx = need.options.findIndex((o) => o.id === "unsure");
    const built = buildReflection(day7, [`q.tone.${privateIdx}`, `q.need.${unclearIdx}`]);
    const body = built.sections.flatMap((s) => s.paragraphs).join(" ");
    expect(body).toContain("saved on this device");
    expect(body).toContain("no underlying need will be guessed at");
    expect(body).not.toContain("nothing was recorded");

    const noneIdx = need.options.findIndex((o) => o.id === "none");
    const noneBody = buildReflection(day7, [`q.need.${noneIdx}`])
      .sections.flatMap((s) => s.paragraphs)
      .join(" ");
    expect(noneBody).toContain("That absence stays as it is");
  });

  it("maps only the selected ids on an answered path", () => {
    const answers = [
      `q.tone.${tone.options.findIndex((o) => o.id === "silent")}`,
      `q.need.${need.options.findIndex((o) => o.id === "notalone")}`,
      `step.${day7.step.options.findIndex((o) => o.id === "catch")}`,
    ];
    const body = buildReflection(day7, answers)
      .sections.flatMap((s) => s.paragraphs)
      .join(" ");
    expect(body).toContain("more wordless");
    expect(body).toContain("support may matter");
    expect(body).toContain("without arguing with it");
    expect(body).not.toContain("runs harsh or shaming");
    expect(body).not.toContain("minimises it or compares it away");
    expect(body).not.toContain("without judging it. Nothing grants you that");
  });

  it("removes the old inferential, shaming and outcome-promising language", () => {
    for (const phrase of [
      "most people are gentler",
      "defended people",
      "i have been doing my best",
      "borrowed",
      "somebody spoke that way first",
      "trained to do",
      "bounce back",
      "trying to prevent harm",
      "never modelled",
      "reserve",
      "recovery rarely",
      "let someone near",
      "you are allowed to give it",
      "most effective first move",
      "makes change possible",
      "tomorrow",
      "barely holding on",
      "deserved to break",
      "should try harder",
      "damaged things",
      "rather than corrected",
      "you should",
    ]) {
      expect(text, `unexpected phrase: ${phrase}`).not.toContain(phrase);
    }
  });

  it("applies the final acceptance wording corrections", () => {
    const understandBody = day7.understand.body.join(" ");
    expect(understandBody).toContain(
      "Neither possibility tells us why your inner response developed, and a more compassionate response does not guarantee that anything will change.",
    );
    expect(understandBody).toContain(
      "Some difficulties are shaped by choices; others arise partly or largely from circumstances",
    );
    expect(understandBody).toContain("caregiving demands");
    expect(text).toContain(
      "without treating self-punishment as the same thing as accountability or repair",
    );
    expect(text).toContain(
      "that does not require approving of the feeling or acting on it.",
    );
    expect(text).toContain(
      "and no explanation or hidden meaning will be assigned",
    );
    expect(text).toContain("what it says about your worth");
    expect(text).toContain(
      "this question can remain: can what is true be held while some of the contempt, dismissal or pressure is left out?",
    );

    for (const phrase of [
      "it does not mean you are defended",
      "caregiving, discrimination, unsafe conditions and limited resources are not chosen",
      "proof that you are good",
      "nothing grants you that",
      "read as avoidance",
      "what you deserve",
      "you spent some time near a question",
    ]) {
      expect(text, `unexpected phrase: ${phrase}`).not.toContain(phrase);
    }
  });

  it("keeps Day 8 at its canonical boundary", () => {
    const day8 = getFirstJourneyDay(8)!;
    expect(day8.title).toBe("Reconnect With What Matters");
    expect(day8.motif).toBe("reconnect");
    expect(day8.shape).toBe("practise-mid");
    expect(day8.questions.map((q) => q.id)).toEqual(["route", "size"]);
    expect(day8.arrive.lead).toBe(
      "Reconnection is not going back, and it never means returning to harm.",
    );
    expect(day8.close.carryForward).toBe(
      "What matters can be met in a way that is small, safe, and mine to choose.",
    );
  });
});

describe("Day 8 revision", () => {
  const day8 = getFirstJourneyDay(8)!;
  const route = day8.questions.find((q) => q.id === "route")!;
  const size = day8.questions.find((q) => q.id === "size")!;

  const allText = (): string =>
    [
      day8.theme,
      day8.descriptor,
      day8.arrive.lead,
      ...day8.arrive.body,
      ...(day8.arrive.settle ?? []),
      day8.understand.heading,
      ...day8.understand.body,
      ...(day8.understand.info ?? []).flatMap((i) => [i.term, i.explanation]),
      ...day8.questions.flatMap((q) => [
        q.prompt,
        q.hint ?? "",
        ...q.options.map((o) => o.label),
        ...(q.echo ? Object.values(q.echo.byOption) : []),
        q.echo?.unanswered ?? "",
        q.echo?.closing ?? "",
      ]),
      day8.practise.heading,
      day8.practise.intro,
      day8.practise.either,
      ...[day8.practise.reflection, day8.practise.spiritual].flatMap((p) => [
        p.title,
        p.summary,
        ...p.steps,
        p.notRequired,
        p.scripture?.body ?? "",
        p.scripture?.note ?? "",
      ]),
      day8.step.prompt,
      ...day8.step.options.map((o) => o.label),
      day8.reflection.intro,
      ...day8.reflection.sections.flatMap((s) => [
        s.title,
        s.opening ?? "",
        ...Object.values(s.lines ?? {}),
        s.unanswered,
      ]),
      day8.reflection.closing,
      day8.close.heading,
      ...day8.close.body,
      day8.close.carryForward,
    ].join("\n");

  it("preserves the canonical identity and exact nine-screen order", () => {
    expect(day8.day).toBe(8);
    expect(day8.title).toBe("Reconnect With What Matters");
    expect(day8.motif).toBe("reconnect");
    expect(day8.shape).toBe("practise-mid");
    expect(day8.step.id).toBe("step");
    expect(screensFor(day8).map(screenKey)).toEqual([
      "arrive",
      "understand",
      "q.route",
      "e.route",
      "practise",
      "q.size",
      "step",
      "reflection",
      "close",
    ]);
  });

  it("keeps single-select and exact positional ID order, appending only", () => {
    expect(route.select).toBe("one");
    expect(size.select).toBe("one");
    expect(day8.step.select).toBe("one");
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
    expect(size.options.map((o) => o.id)).toEqual([
      "tiny",
      "small",
      "moderate",
      "rehearse",
      "unclear",
      "none",
      "private",
    ]);
    expect(day8.step.options.map((o) => o.id)).toEqual([
      "act",
      "message",
      "outside",
      "own",
      "rehearse",
      "unclear",
      "none",
      "private",
    ]);
  });

  it("defines reconnection for a newcomer and rules out going back", () => {
    const arrive = day8.arrive.body.join(" ");
    expect(arrive).toContain("making a little room for one thread that matters to you now");
    expect(arrive).toContain("long-standing");
    expect(arrive).toContain("newly emerging");
    expect(arrive).toContain("not yet clear");
    expect(arrive).toContain("does not mean restoring an earlier, untouched version of yourself");
    expect(arrive).toContain("a new way of being with yourself");
    expect(arrive).toContain("a story that is not finished");
    expect(arrive).toContain("returning to an unsafe person, place or community");
    expect(arrive).toContain("proving progress");
    expect(arrive).toContain("pretending that pain is over");
    expect(arrive).toContain("real limit on access, not a personal failure");
    for (const factor of [
      "Grief",
      "illness",
      "disability",
      "exhaustion",
      "caregiving",
      "discrimination",
      "unsafe circumstances",
    ]) {
      expect(arrive, factor).toContain(factor);
    }
  });

  it("keeps arrival optional and free of vision, breath, posture and forced-positive assumptions", () => {
    const settle = (day8.arrive.settle ?? []).join(" ");
    expect(settle).toContain("optional");
    expect(settle).toContain("Reading on is a complete way to begin");
    expect(settle).toContain("whichever is available to you");
    for (const phrase of [
      "Look up",
      "furthest point",
      "eyes",
      "breathing",
      "breath",
      "posture",
      "genuinely fine",
      "relax",
      "picture",
    ]) {
      expect(settle.toLowerCase(), phrase).not.toContain(phrase.toLowerCase());
    }
  });

  it("explains what matters, values, new form and safe enough", () => {
    const u = [
      day8.understand.heading,
      ...day8.understand.body,
      ...(day8.understand.info ?? []).flatMap((i) => [i.term, i.explanation]),
    ].join(" ");
    expect(u).toContain("A value is a chosen quality or direction");
    expect(u).toContain("not a task to complete");
    expect(u).toContain("approached in a new form");
    expect(u).toContain("does not have to be available outwardly today");
    expect(u).toContain("Safe enough for this amount of contact");
    expect(u).toContain("respects a no or a limit");
    expect(u).toContain("does not require you to disclose anything");
    expect(u).toContain("use your vulnerability against you");
    expect(u).toContain("If safety is uncertain, no contact is required");
    expect(u).toContain(
      "Nothing here requires contact, disclosure, reconciliation, forgiveness, public action, a bodily response, hope, clarity or change.",
    );
    expect(u).not.toContain("a professional can be that person");
    expect(u).not.toContain("Small and real beats large and imagined");
  });

  it("echoes every route option and closes branch-neutrally", () => {
    const byOption = route.echo!.byOption;
    for (const option of route.options) {
      expect(byOption[option.id], option.id).toBeTruthy();
    }
    expect(Object.keys(byOption).sort()).toEqual(route.options.map((o) => o.id).sort());
    expect(byOption["person"]).toContain("No contact and no disclosure are required");
    expect(byOption["god"]).not.toContain("in whatever form");
    expect(byOption["god"]).toContain("does not assume prayer");
    expect(byOption["private"]).toContain("saved on this device");
    expect(byOption["none"]).toContain("left intact");
    expect(byOption["unclear"]).toContain("No direction will be guessed for you");
    expect(route.echo!.closing).not.toContain("Whatever you chose");
    expect(route.echo!.closing).toContain("Anything held here can be small, private, or set down");
    expect(route.echo!.unanswered).toContain("nothing will be chosen on your behalf");
  });

  it("keeps the practice screen branch-neutral for unanswered, unclear, none and private", () => {
    const practice = [
      day8.practise.heading,
      day8.practise.intro,
      day8.practise.either,
      ...day8.practise.reflection.steps,
      ...day8.practise.spiritual.steps,
    ].join(" ");
    expect(day8.practise.intro).toContain("whether or not a direction was selected");
    expect(practice).toContain("one you are holding privately, or none in particular");
    expect(practice).toContain("let the absence stay");
    for (const phrase of [
      "the direction you chose",
      "Take the direction you chose",
      "the direction you selected",
    ]) {
      expect(practice, phrase).not.toContain(phrase);
    }
  });

  it("offers equal-depth practices with either/both/neither and read-only consent", () => {
    expect(day8.practise.either).toContain("Either, both, or neither");
    expect(day8.practise.either).toContain("Reading only is complete");
    expect(day8.practise.either).toContain("stopping at any point is complete");
    expect(day8.practise.reflection.steps.length).toBeGreaterThanOrEqual(6);
    expect(day8.practise.spiritual.steps.length).toBeGreaterThanOrEqual(6);
    const r = day8.practise.reflection;
    expect(r.steps.join(" ")).toContain("what quality or meaning it holds for you now");
    expect(r.steps.join(" ")).toContain("met in a new form");
    expect(r.steps.join(" ")).toContain("holding an object, making one mark");
    expect(r.steps.join(" ")).toContain("left uninterpreted here");
    expect(r.steps.join(" ")).toContain("claims no change and no progress");
    expect(r.notRequired).toContain("No contact, message, explanation, plan, visualisation");
  });

  it("quotes Luke 24:15 in full WEB wording with a story-specific note", () => {
    const scripture = day8.practise.spiritual.scripture!;
    expect(scripture.reference).toBe("Luke 24:15 (World English Bible)");
    expect(scripture.body).toBe(
      "While they talked and questioned together, Jesus himself came near, and went with them.",
    );
    expect(scripture.note).toContain(
      "while the walkers are still talking and questioning",
    );
    expect(scripture.note).toContain("not a promise about what you must feel");
    const spiritual = [
      ...day8.practise.spiritual.steps,
      day8.practise.spiritual.notRequired,
      scripture.note,
    ].join(" ");
    expect(spiritual).not.toContain("reprimand");
    expect(spiritual).toContain("Reading only is a complete way to do this");
    expect(spiritual).toContain("silence can be the whole practice");
    expect(spiritual).toContain("Doubt, anger, numbness, distance and spiritual struggle");
    expect(day8.practise.spiritual.notRequired).toContain("you may leave this path entirely");
  });

  it("keeps message and outside steps safe, optional and accessible", () => {
    const labels = Object.fromEntries(day8.step.options.map((o) => [o.id, o.label]));
    expect(labels["message"]).toContain("safe enough");
    expect(labels["message"]).toContain("sending it is optional");
    expect(labels["outside"]).toMatch(/^Spend a moment/);
    expect(labels["outside"]).toContain("window");
    expect(labels["outside"]).toContain("memory");
    expect(labels["outside"]).toContain("another point of contact within reach");
    expect(labels["act"]).not.toContain("I identified");
    expect(labels["rehearse"]).not.toMatch(/rehears/i);
    expect(labels["none"]).toContain("will not force one");
  });

  it("has no unconditional reflection openings and maps every option to a line", () => {
    for (const section of day8.reflection.sections) {
      expect(section.opening, section.id).toBeUndefined();
      expect(section.unanswered.length, section.id).toBeGreaterThan(80);
    }
    const pairs: Array<[string, string[]]> = [
      ["hearing", route.options.map((o) => o.id)],
      ["care", size.options.map((o) => o.id)],
      ["next", day8.step.options.map((o) => o.id)],
    ];
    for (const [sectionId, ids] of pairs) {
      const section = day8.reflection.sections.find((s) => s.id === sectionId)!;
      for (const id of ids) {
        expect(section.lines?.[id], `${sectionId}.${id}`).toBeTruthy();
      }
      expect(Object.keys(section.lines ?? {}).sort()).toEqual([...ids].sort());
    }
  });

  it("invents nothing on the fully skipped reflection path", () => {
    const built = buildReflection(day8, undefined);
    const text = built.sections.flatMap((s) => s.paragraphs).join(" ");
    expect(text).toContain("No thread was selected, and none will be assigned");
    expect(text).toContain("No amount was selected");
    expect(text).toContain("No step was selected");
    for (const phrase of [
      "You chose",
      "you learned",
      "you moved",
      "courage",
      "progress",
      "widen",
    ]) {
      expect(text.toLowerCase(), phrase).not.toContain(phrase.toLowerCase());
    }
  });

  it("reflects one exact answered positional path and excludes adjacent options", () => {
    const answers = ["q.route.5", "q.size.2", "step.1"];
    const text = buildReflection(day8, answers)
      .sections.flatMap((s) => s.paragraphs)
      .join(" ");
    expect(text).toContain("One person who may be safe enough was selected");
    expect(text).toContain("One small outward action, if safe and realistic");
    expect(text).toContain("Drafting one brief message to someone safe enough");
    expect(text).not.toContain("Creativity, beauty, learning or nature was selected");
    expect(text).not.toContain("A community, culture, tradition or place of belonging was selected");
    expect(text).not.toContain("A few private minutes, or one small moment, was selected");
    expect(text).not.toContain("Keeping it inward — remembered");
    expect(text).not.toContain("Making one small, safe space");
  });

  it("keeps unclear, none and private paths accurate about local storage", () => {
    const unclear = buildReflection(day8, ["q.route.9", "q.size.4", "step.5"])
      .sections.flatMap((s) => s.paragraphs)
      .join(" ");
    expect(unclear).toContain("That uncertainty is left as it is");
    expect(unclear).toContain("It stays uncertain here");
    expect(unclear).toContain("No step will be chosen for you");

    const none = buildReflection(day8, ["q.route.10", "q.size.5", "step.6"])
      .sections.flatMap((s) => s.paragraphs)
      .join(" ");
    expect(none).toContain("That absence is left intact");
    expect(none).toContain("without being treated as failure");
    expect(none).toContain("none will be pressed or inferred");

    const priv = buildReflection(day8, ["q.route.11", "q.size.6", "step.7"])
      .sections.flatMap((s) => s.paragraphs)
      .join(" ");
    expect(priv).toContain("A private direction was selected");
    expect(priv).toContain("saved on this device");
    expect(priv).toContain("A private amount was selected");
    expect(priv).toContain("A private step was selected");
    expect(priv).not.toContain("nothing was recorded");
  });

  it("closes truthfully and without claiming choice, action or progress", () => {
    const close = [day8.close.heading, ...day8.close.body, day8.close.carryForward].join(" ");
    expect(close).toContain("Reconnection is not going back, not returning to harm");
    expect(close).toContain("proving progress");
    expect(close).toContain("held inwardly, kept private, or left alone");
    expect(close).toContain("Day 9");
    expect(close).toContain("practising a different response");
    expect(close).not.toContain("Tomorrow");
    expect(day8.close.carryForward).toBe(
      "What matters can be met in a way that is small, safe, and mine to choose.",
    );
    expect(day8.reflection.closing).toContain(
      "do not establish why something matters to you, why it became distant, whether reconnection is possible, or what will change",
    );
  });

  it("removes inferential, outcome-promising, time-dependent and Day 9 overlap phrases", () => {
    const text = allText();
    for (const phrase of [
      "Long difficulty tends to narrow life",
      "Small and real beats large and imagined",
      "Whatever you chose",
      "You chose a direction and made it small enough",
      "Tomorrow",
      "postpone",
      "most immediately felt",
      "shuts down first",
      "courage",
      "restore",
      "widen",
      "changes the input",
      "usually begins",
      "not an excuse",
      "still counts",
      "right amount",
      "right size",
      "legitimate",
      "not a lesser one",
      "Decide when",
      "first sentence",
      "rehearse it instead",
      "proof that you are good",
      "for it to count as yours",
      "medication",
      "only you hold that information",
      "right answer",
      "Go to a window",
      "not a lesser option",
      "complete outcome",
      "One thread, held as it is",
      "This page can only reflect selections",
      "Either counts as contact",
      "estimated on your behalf",
    ]) {
      expect(text.toLowerCase(), `unexpected phrase: ${phrase}`).not.toContain(
        phrase.toLowerCase(),
      );
    }
  });

  it("leaves Day 7 and Day 9 at their canonical boundaries", () => {
    const day7 = getFirstJourneyDay(7)!;
    expect(day7.title).toBe("A More Compassionate Way to Hold It");
    expect(day7.motif).toBe("compassion");
    expect(day7.questions.map((q) => q.id)).toEqual(["tone", "need"]);
    expect(day7.close.carryForward).toBe(
      "I can face what is true without turning myself into the enemy.",
    );

    const day9 = getFirstJourneyDay(9)!;
    expect(day9.title).toBe("Practise a Different Response");
    expect(day9.motif).toBe("practise");
    expect(day9.shape).toBe("standard");
    expect(day9.arrive.lead).toBe(
      "A different response can be tried privately before you decide whether it belongs in real life.",
    );
    expect(day9.understand.heading).toBe("Rehearsal is a possibility, not a promise");
  });
  it("applies the final acceptance cleanup wording", () => {
    expect(route.prompt).toContain("if anything");
    expect(route.echo!.heading).toBe("Room for what is clear — and what is not");
    expect(day8.step.prompt).toContain("if anything");
    expect(day8.step.hint).toMatch(/^One choice if one fits/);

    const echoes = route.echo!.byOption;
    expect(echoes["body"]).not.toContain("medication");
    expect(echoes["body"]).toContain("No sensation, movement, or improvement is expected");
    expect(echoes["person"]).toContain("no contact is required");
    expect(echoes["person"]).not.toContain("right answer");
    expect(echoes["creativity"]).toContain(
      "Contact may mean making something or simply noticing",
    );
    expect(echoes["creativity"]).not.toContain("counts as contact");

    const note = day8.understand.info!.map((i) => i.explanation).join(" ");
    expect(note).not.toContain("only you hold that information");
    expect(note).toContain("This app cannot decide whether a particular person is safe");
    expect(note).toContain("another route can be chosen instead");

    const understand = day8.understand.body.join(" ");
    expect(understand).toContain("a rule imposed on you, or a test you have to pass");
    expect(understand).toContain("It can remain yours without that explanation");
    expect(day8.arrive.body.join(" ")).toContain("one small moment of contact");

    expect(day8.reflection.sections[0]!.title).toBe("The thread — or what remained open");
    expect(day8.reflection.intro).toBe(
      "This reflection uses only what was selected; it will not fill in what was left open.",
    );
    expect(day8.close.heading).toBe("Held without force");

    const skipped = buildReflection(day8, [])
      .sections.flatMap((s) => s.paragraphs)
      .join(" ");
    expect(skipped).toContain("The direction simply remains open");
    expect(skipped).toContain("What is available remains open");
    expect(skipped).not.toContain("This page can only reflect selections");
    expect(skipped).not.toContain("complete outcome");
  });
});

// ---------------------------------------------------------------------------
// Day 9 revision — "Practise a Different Response"
// Private rehearsal of one possible response, with safety and choice intact.
// ---------------------------------------------------------------------------
describe("Day 9 revision", () => {
  const day9 = getFirstJourneyDay(9)!;
  const practice = day9.questions.find((q) => q.id === "practice")!;
  const where = day9.questions.find((q) => q.id === "where")!;
  const allText9 = () =>
    [
      day9.theme,
      day9.descriptor,
      day9.arrive.lead,
      ...day9.arrive.body,
      ...(day9.arrive.settle ?? []),
      day9.understand.heading,
      ...day9.understand.body,
      ...(day9.understand.info ?? []).flatMap((i) => [i.term, i.explanation]),
      ...day9.questions.flatMap((q) => [
        q.prompt,
        q.hint ?? "",
        ...q.options.map((o) => o.label),
        ...(q.echo ? [q.echo.heading, q.echo.unanswered, q.echo.closing ?? ""] : []),
        ...(q.echo ? Object.values(q.echo.byOption) : []),
      ]),
      day9.practise.heading,
      day9.practise.intro,
      day9.practise.either,
      day9.practise.reflection.title,
      day9.practise.reflection.summary,
      ...day9.practise.reflection.steps,
      day9.practise.reflection.notRequired,
      day9.practise.spiritual.title,
      day9.practise.spiritual.summary,
      ...day9.practise.spiritual.steps,
      day9.practise.spiritual.notRequired,
      day9.practise.spiritual.scripture?.note ?? "",
      day9.step.prompt,
      day9.step.hint ?? "",
      ...day9.step.options.map((o) => o.label),
      day9.reflection.intro,
      ...day9.reflection.sections.flatMap((s) => [
        s.title,
        s.opening ?? "",
        s.unanswered,
        ...Object.values(s.lines ?? {}),
      ]),
      day9.reflection.closing,
      day9.close.heading,
      ...day9.close.body,
      day9.close.carryForward,
    ].join(" ");

  it("preserves identity, descriptor and the exact nine-screen sequence", () => {
    expect(day9.day).toBe(9);
    expect(day9.title).toBe("Practise a Different Response");
    expect(day9.motif).toBe("practise");
    expect(day9.shape).toBe("standard");
    expect(day9.theme).toBe(
      "Trying one possible response privately, with safety and choice intact.",
    );
    expect(day9.descriptor).toBe("A small private rehearsal · about 12 minutes");
    expect(day9.understand.label).toBe("Listen");
    expect(day9.questions.map((q) => q.id)).toEqual(["practice", "where"]);
    expect(day9.step.id).toBe("step");
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

  it("keeps practice and step single-select and where multi-select", () => {
    expect(practice.select).toBe("one");
    expect(day9.step.select).toBe("one");
    expect(where.select).toBe("many");
  });

  it("keeps exact positional ids with append-only additions", () => {
    expect(practice.options.map((o) => o.id)).toEqual([
      "grounding",
      "unsent",
      "boundary",
      "support",
      "lament",
      "prepare",
      "loosen",
      "unclear",
      "none",
      "private",
    ]);
    expect(where.options.map((o) => o.id)).toEqual([
      "home",
      "work",
      "family",
      "friend",
      "self",
      "faith",
      "private",
      "other",
      "unclear",
      "none",
    ]);
    expect(day9.step.options.map((o) => o.id)).toEqual([
      "again",
      "sentence",
      "use",
      "ground",
      "support",
      "prepare",
      "unclear",
      "none",
      "private",
    ]);
  });

  it("makes where private, unclear and none exclusive in both directions", () => {
    const idx = (id: string) => where.options.findIndex((o) => o.id === id);
    const home = idx("home");
    const work = idx("work");
    for (const id of ["private", "unclear", "none"]) {
      const ex = idx(id);
      expect(where.options[ex]!.exclusive, id).toBe(true);
      expect(toggleSelection(where, [home, work], ex)).toEqual([ex]);
      expect(toggleSelection(where, [ex], home)).toEqual([home]);
    }
    expect(where.options[idx("other")]!.exclusive).toBeUndefined();
  });

  it("echoes every practice option branch-neutrally and leaves gaps intact", () => {
    const byOption = practice.echo!.byOption;
    expect(Object.keys(byOption).sort()).toEqual(practice.options.map((o) => o.id).sort());
    for (const option of practice.options) {
      expect(byOption[option.id], option.id).toBeTruthy();
      expect(byOption[option.id]!.length, option.id).toBeGreaterThan(60);
    }
    expect(byOption["boundary"]).toContain(
      "does not establish whether a limit is overdue, safe, available, or ready",
    );
    expect(byOption["support"]).toContain("No person, disclosure, or request is identified");
    expect(byOption["lament"]).toContain("No history, cause, or required emotional release");
    expect(byOption["loosen"]).toContain("No old pattern, reason, or outcome is inferred");
    expect(byOption["private"]).toContain("saved on this device");
    expect(byOption["unclear"]).toContain("left as it is");
    expect(byOption["none"]).toContain("left intact");
    expect(practice.echo!.heading).toBe("Room for what is clear — and what is not");
    expect(practice.echo!.unanswered).toContain(
      "nothing will be chosen or inferred on your behalf",
    );
    expect(practice.echo!.unanswered).toContain("may simply be read");
    expect(practice.echo!.byOption["none"]).toContain("No explanation or pressure is added");
    expect(practice.echo!.unanswered.length).toBeGreaterThan(80);
    expect(practice.echo!.closing).toContain("can stay private, be revised later, be set aside");
    expect(practice.hint).toContain("One choice if one fits");
    expect(practice.hint).toContain("read");
    expect(where.hint).toContain("stay general");
  });

  it("keeps both practice panels branch-neutral, consenting and useful with no selection", () => {
    const panels = [
      day9.practise.heading,
      day9.practise.intro,
      day9.practise.either,
      ...day9.practise.reflection.steps,
      ...day9.practise.spiritual.steps,
    ].join(" ");
    expect(day9.practise.heading).toBe("Two ways to rehearse without committing to act");
    expect(day9.practise.intro).toBe(
      "You do not need a clear response or setting to read or use either path. Everything may stay general, private, unclear, or unanswered.",
    );
    expect(day9.practise.either).toBe(
      "You may use either path, both paths, or neither. You may simply read, stop at any point, or leave the exercise unfinished.",
    );
    expect(day9.practise.reflection.summary).toContain(
      "without deciding to use it in real life",
    );
    expect(day9.practise.spiritual.summary).toBe(
      "A Christian path for bringing one manageable concern and one possible response before God, without treating prayer as a promise or command.",
    );
    expect(day9.practise.spiritual.steps.join(" ")).toContain(
      "leaving safety and real-world use undecided",
    );
    expect(panels).toContain("keep this entirely general");
    for (const phrase of [
      "whichever practice you chose",
      "the practice you chose",
      "the practice you selected",
    ]) {
      expect(panels.toLowerCase(), phrase).not.toContain(phrase.toLowerCase());
    }
  });

  it("gives both paths therapeutic parity and quotes Psalm 62:8 in full", () => {
    expect(day9.practise.reflection.steps.length).toBeGreaterThanOrEqual(7);
    expect(day9.practise.spiritual.steps.length).toBeGreaterThanOrEqual(7);
    const r = day9.practise.reflection.steps.join(" ");
    const s = day9.practise.spiritual.steps.join(" ");
    for (const text of [r, s]) {
      expect(text).toMatch(/orient outward/i);
      expect(text).toMatch(/only its opening moment|only the opening/i);
      expect(text).toMatch(/reading (only|this step only)|Reading only is available/i);
    }
    expect(r).toContain("usable, incomplete, unclear, unavailable, or unwise");
    expect(r).toContain("discomfort is not proof of growth");
    expect(s).toContain("not a vow, not a divine command or direction");
    expect(s).toContain("Prayer does not replace real-world help or planning");

    const scripture = day9.practise.spiritual.scripture!;
    expect(scripture.reference).toBe("Psalm 62:8 (World English Bible)");
    expect(scripture.body).toBe(
      "Trust in him at all times, you people. Pour out your heart before him. God is a refuge for us. Selah.",
    );
    expect(scripture.note).toContain("psalmist's invitation");
    expect(scripture.note).toContain("does not promise that refuge will be felt");

    for (const notRequired of [
      day9.practise.reflection.notRequired,
      day9.practise.spiritual.notRequired,
    ]) {
      for (const term of [
        "confrontation",
        "disclosure",
        "sending a message",
        "contact",
        "real-world test",
        "emotional release",
        "decision",
        "outcome",
      ]) {
        expect(notRequired.toLowerCase(), term).toContain(term);
      }
      expect(notRequired.toLowerCase()).toContain("stop");
    }
  });

  it("has no unconditional openings and a line for every retained or appended id", () => {
    for (const section of day9.reflection.sections) {
      expect(section.opening, section.id).toBeUndefined();
      expect(section.unanswered.length, section.id).toBeGreaterThan(80);
    }
    const pairs: Array<[string, string[]]> = [
      ["hearing", practice.options.map((o) => o.id)],
      ["underneath", where.options.map((o) => o.id)],
      ["next", day9.step.options.map((o) => o.id)],
    ];
    for (const [sectionId, ids] of pairs) {
      const section = day9.reflection.sections.find((s) => s.id === sectionId)!;
      for (const id of ids) {
        expect(section.lines?.[id], `${sectionId}.${id}`).toBeTruthy();
      }
      expect(Object.keys(section.lines ?? {}).sort()).toEqual([...ids].sort());
    }
    expect(day9.reflection.sections.map((s) => s.title)).toEqual([
      "The response — or what remained open",
      "The setting — or what remained open",
      "How today was completed — or left open",
    ]);
  });

  it("claims nothing on the fully skipped reflection path", () => {
    const text = buildReflection(day9, [])
      .sections.flatMap((s) => s.paragraphs)
      .join(" ");
    expect(text).toContain("No response was selected here, and none will be assigned");
    expect(text).toContain("No setting was selected here, and none will be assigned");
    expect(text).toContain("No step was selected here, and none will be added");
    for (const phrase of [
      "You chose",
      "You located",
      "You rehearsed",
      "practising at all",
      "progress",
      "ready",
      "courage",
    ]) {
      expect(text.toLowerCase(), phrase).not.toContain(phrase.toLowerCase());
    }
  });

  it("reflects one answered positional path and excludes adjacent options", () => {
    const text = buildReflection(day9, ["q.practice.2", "q.where.1", "step.4"])
      .sections.flatMap((s) => s.paragraphs)
      .join(" ");
    expect(text).toContain("Rehearsing a limit or a delay was selected");
    expect(text).toContain("Work was selected as a setting that came to mind");
    expect(text).toContain("Identifying support you might want before any real-world action");
    expect(text).not.toContain("Rehearsing asking for one kind of support was selected");
    expect(text).not.toContain("Putting private words");
    expect(text).not.toContain("Home was selected");
    expect(text).not.toContain("Keeping one accessible outward-orienting cue");
  });

  it("keeps unclear, none and private paths accurate about local storage", () => {
    const unclear = buildReflection(day9, ["q.practice.7", "q.where.8", "step.6"])
      .sections.flatMap((s) => s.paragraphs)
      .join(" ");
    expect(unclear).toContain("That uncertainty is left as it is");
    expect(unclear).toContain("It stays uncertain here");
    expect(unclear).toContain("no step will be chosen for you");

    const none = buildReflection(day9, ["q.practice.8", "q.where.9", "step.7"])
      .sections.flatMap((s) => s.paragraphs)
      .join(" ");
    expect(none).toContain("That absence is left intact");
    expect(none).toContain("No particular setting was selected");
    expect(none).toContain("none will be pressed or inferred");

    const priv = buildReflection(day9, ["q.practice.9", "q.where.6", "step.8"])
      .sections.flatMap((s) => s.paragraphs)
      .join(" ");
    expect(priv).toContain("A private choice was selected");
    expect(priv).toContain("Keeping the setting unspecified was selected");
    expect(priv).toContain("A private step was selected");
    expect(priv.match(/saved on this device/g)!.length).toBe(3);
    expect(priv).not.toContain("nothing was recorded");
  });

  it("keeps a legacy home + private setting combination noncontradictory", () => {
    const text = buildReflection(day9, ["q.where.0", "q.where.6"])
      .sections.flatMap((s) => s.paragraphs)
      .join(" ");
    expect(text).toContain("Home was selected as a setting that came to mind");
    expect(text).toContain("Keeping the setting unspecified was selected");
    expect(text).not.toContain("No setting was selected");
    expect(text).not.toContain("no named setting");
  });

  it("closes without claiming selection, rehearsal, action, readiness or progress", () => {
    const close = [day9.close.heading, ...day9.close.body, day9.close.carryForward].join(" ");
    expect(day9.close.heading).toBe("Possibility, not a promise");
    expect(day9.close.body[0]).toBe(
      "Whether you rehearsed a response, read the practice, kept your response private, or left everything open, no real-world action was required, and none is required now.",
    );
    expect(close).toContain("no real-world action was required");
    expect(close).toContain("does not guarantee access under pressure");
    expect(close).toContain("does not make a situation safe");
    expect(close).toContain("Day 10");
    expect(close).not.toContain("Tomorrow");
    expect(close).not.toContain("tomorrow");
    expect(day9.close.carryForward).toBe(
      "I can rehearse a possibility without promising to use it.",
    );
    expect(day9.reflection.closing).toContain("A rehearsal is information, not a contract");
    expect(day9.reflection.closing).toContain(
      "whether another response is safe or available to you",
    );
  });

  it("removes posture, forced-sense, causal, universal and outcome-promising language", () => {
    const text = allText9();
    for (const phrase of [
      "New responses are practised long before they are performed",
      "Under pressure, people do what they have practised",
      "new response usually fails",
      "Rehearsal changes that",
      "more possible later",
      "without risk",
      "without having to risk anything",
      "feet be flat",
      "feet flat",
      "hands be still",
      "how you are breathing",
      "slow breath",
      "five things you can see",
      "four you can hear",
      "three you can touch",
      "two you can smell",
      "Tightening is expected",
      "Usually the answer is",
      "end the conversation and leave",
      "Whatever you chose",
      "Nothing is missed",
      "You chose a practice",
      "You located",
      "Practising at all already changes",
      "You rehearsed something new",
      "Tomorrow",
      "most habitual",
      "old roles reassert",
      "raises the stakes",
      "practise last",
      "assumed to be unwelcome",
      "cost of a limit can feel higher",
      "nothing was recorded",
      "later this week",
      "next time",
      "calm down",
      "must forgive",
      "should forgive",
      "guarantees",
    ]) {
      expect(text.toLowerCase(), `unexpected phrase: ${phrase}`).not.toContain(
        phrase.toLowerCase(),
      );
    }
  });

  it("applies the final acceptance cleanup wording", () => {
    expect(day9.arrive.settle!.at(-1)).toBe(
      "You may simply read, and you may stop at any point. No particular feeling or response is required.",
    );

    expect(day9.step.prompt).toBe("How, if at all, would you like to leave this practice?");
    expect(day9.step.hint).toBe(
      "You may choose one if it fits, simply read, or leave this open.",
    );
    const stepLabel = (id: string) => day9.step.options.find((o) => o.id === id)!.label;
    expect(stepLabel("again")).toBe(
      "Read one possible response, or try its opening once, privately",
    );
    expect(stepLabel("sentence")).toBe(
      "Shorten or revise one possible sentence until it sounds like me",
    );
    expect(stepLabel("prepare")).toBe("Leave the exercise here, with nothing more required");

    const next = day9.reflection.sections.find((s) => s.id === "next")!;
    expect(next.lines!["again"]).toBe(
      "Reading or privately trying the opening of one possible response was selected. It remains a possibility, and nothing outward follows from it.",
    );
    expect(next.lines!["prepare"]).toBe(
      "Leaving the exercise here was selected. Nothing more is implied or required by this step.",
    );

    const text = allText9();
    for (const phrase of [
      "at the same depth",
      "Both paths below work",
      "today's rehearsal",
      "the response once more",
      "reading or rehearsing was enough",
      "today was rehearsed",
      "message sent",
      "and no change is required",
    ]) {
      expect(text.toLowerCase(), `unexpected phrase: ${phrase}`).not.toContain(
        phrase.toLowerCase(),
      );
    }
  });


  it("leaves Day 8 and Day 10 at their canonical boundaries", () => {
    const day8b = getFirstJourneyDay(8)!;
    expect(day8b.title).toBe("Reconnect With What Matters");
    expect(day8b.motif).toBe("reconnect");
    expect(day8b.shape).toBe("practise-mid");
    expect(day8b.close.heading).toBe("Held without force");
    expect(day8b.close.carryForward).toBe(
      "What matters can be met in a way that is small, safe, and mine to choose.",
    );

    const day10 = getFirstJourneyDay(10)!;
    expect(day10.title).toBe("Carry It Forward");
    expect(day10.motif).toBe("carry");
    expect(day10.shape).toBe("notice-first");
    expect(day10.descriptor).toBe("Gathering the journey · about 15 minutes");
    expect(day10.arrive.lead).toBe(
      "This is the last day of the First Journey. It completes a ten-day container without claiming that your healing is complete.",
    );
  });
});

// ---------------------------------------------------------------------------
// Day 10 revision — "Carry It Forward"
// Integration and a complete stopping place, without manufactured progress.
// ---------------------------------------------------------------------------
describe("Day 10 revision", () => {
  const day10 = getFirstJourneyDay(10)!;
  const different = day10.questions.find((q) => q.id === "different")!;
  const unfinished = day10.questions.find((q) => q.id === "unfinished")!;
  const idx = (q: { options: { id: string }[] }, id: string) =>
    q.options.findIndex((o) => o.id === id);
  const answer = (key: string, i: number) => `${key}.${i}`;

  const allText10 = () =>
    [
      day10.theme,
      day10.descriptor,
      day10.arrive.lead,
      ...day10.arrive.body,
      ...(day10.arrive.settle ?? []),
      day10.understand.heading,
      ...day10.understand.body,
      ...(day10.understand.info ?? []).flatMap((i) => [i.term, i.explanation]),
      ...day10.questions.flatMap((q) => [
        q.prompt,
        q.hint ?? "",
        ...q.options.flatMap((o) => [o.label, o.note ?? ""]),
        ...(q.echo
          ? [
              q.echo.heading,
              ...Object.values(q.echo.byOption),
              q.echo.unanswered,
              q.echo.closing ?? "",
            ]
          : []),
      ]),
      day10.practise.heading,
      day10.practise.intro,
      day10.practise.either,
      ...[day10.practise.reflection, day10.practise.spiritual].flatMap((p) => [
        p.title,
        p.summary,
        ...p.steps,
        p.notRequired,
        p.scripture?.reference ?? "",
        p.scripture?.body ?? "",
        p.scripture?.note ?? "",
      ]),
      day10.step.prompt,
      day10.step.hint ?? "",
      ...day10.step.options.flatMap((o) => [o.label, o.note ?? ""]),
      day10.reflection.intro,
      ...day10.reflection.sections.flatMap((s) => [
        s.title,
        s.opening ?? "",
        ...Object.values(s.lines ?? {}),
        s.unanswered,
      ]),
      day10.reflection.closing,
      day10.close.heading,
      ...day10.close.body,
      day10.close.carryForward,
    ].join(" ");

  it("locks identity, structure and the nine-screen sequence", () => {
    expect(day10.day).toBe(10);
    expect(day10.title).toBe("Carry It Forward");
    expect(day10.theme).toBe(
      "Integration and a complete stopping place without manufactured progress, forced closure, or required action.",
    );
    expect(day10.motif).toBe("carry");
    expect(day10.shape).toBe("notice-first");
    expect(day10.descriptor).toBe("Gathering the journey · about 15 minutes");
    expect(day10.understand.label).toBe("Listen");
    expect(day10.questions.map((q) => q.id)).toEqual(["different", "unfinished"]);
    expect(day10.step.id).toBe("step");
    expect(screensFor(day10).map(screenKey)).toEqual([
      "arrive",
      "q.different",
      "e.different",
      "understand",
      "q.unfinished",
      "practise",
      "step",
      "reflection",
      "close",
    ]);
  });

  it("keeps honest selection contracts with exact positional options", () => {
    expect(different.select).toBe("many");
    expect(unfinished.select).toBe("many");
    expect(day10.step.select).toBe("one");

    expect(different.options.map((o) => o.id)).toEqual([
      "protective",
      "named",
      "twopulls",
      "cost",
      "harsh",
      "small",
      "notalone",
      "nothing",
      "unclear",
      "private",
    ]);
    expect(unfinished.options.map((o) => o.id)).toEqual([
      "grief",
      "relationship",
      "limit",
      "support",
      "self",
      "faith",
      "rest",
      "unclear",
      "outside",
      "none",
      "private",
    ]);
    expect(day10.step.options.map((o) => o.id)).toEqual([
      "support",
      "conversation",
      "limit",
      "rest",
      "kind",
      "revisit",
      "prepare",
      "unavailable",
      "unclear",
      "none",
      "private",
    ]);

    const exclusive = (q: { options: { id: string; exclusive?: boolean }[] }) =>
      q.options.filter((o) => o.exclusive).map((o) => o.id);
    expect(exclusive(different)).toEqual(["unclear", "private"]);
    expect(exclusive(unfinished)).toEqual(["unclear", "outside", "none", "private"]);
    expect(exclusive(day10.step)).toEqual(["unavailable", "unclear", "none", "private"]);
  });

  it("keeps arrival inclusive and free of bodily or closure requirements", () => {
    expect(day10.arrive.lead).toBe(
      "This is the last day of the First Journey. It completes a ten-day container without claiming that your healing is complete.",
    );
    const arrive = [...day10.arrive.body, ...(day10.arrive.settle ?? [])].join(" ");
    expect(arrive).toContain("mainly read");
    expect(arrive).toContain("Any position that works");
    expect(arrive).toContain("Simply reading is complete");
    expect(arrive).toContain("arrived here directly");
    expect(arrive).toContain("No one path is treated here as more complete than another.");
    expect(arrive).toContain("no clear meaning is required");
    expect(arrive).toContain(
      "Reaching this page does not have to prove healing, readiness, insight, attention, courage, or progress.",
    );
    expect(arrive).toContain("no relaxation, calm, gratitude, emotional response, or sense of closure is required");
    for (const phrase of [
      "sit for a moment",
      "let one breath out",
      "breathe",
      "relax your",
      "close your eyes",
      "feel your feet",
      "same person who opened Day 1",
      "with a little more information",
      "You have spent ten days",
    ]) {
      expect(arrive.toLowerCase(), `unexpected phrase: ${phrase}`).not.toContain(
        phrase.toLowerCase(),
      );
    }
  });

  it("restores the integration and new-life teaching with real constraints", () => {
    expect(day10.understand.heading).toBe(
      "A journey can be complete while healing remains unfinished",
    );
    const teach = [
      ...day10.understand.body,
      ...(day10.understand.info ?? []).flatMap((i) => [i.term, i.explanation]),
    ].join(" ");
    expect(teach).toContain("By integration, we mean allowing pieces of experience");
    expect(teach).toContain("not going back to an untouched earlier self");
    expect(teach).toContain(
      "does not mean carrying it alone, calling harm good, suppressing lament, pretending the ashes never existed",
    );
    for (const constraint of [
      "grief",
      "illness",
      "disability",
      "caregiving",
      "discrimination",
      "unsafe conditions",
      "financial pressure",
      "power",
      "relationships",
      "limited resources",
      "limited support",
    ]) {
      expect(teach.toLowerCase(), `missing constraint: ${constraint}`).toContain(
        constraint.toLowerCase(),
      );
    }
    expect(teach).toContain("It is not automatically a personal failure");
    expect(teach).toContain("The First Journey is complete here");
    const terms = (day10.understand.info ?? []).map((i) => i.term);
    expect(terms).toEqual([
      "What does integration mean?",
      "What does ‘carry it forward’ mean?",
      "What if nothing changed?",
      "What if I feel more unsettled?",
      "Do I have to continue after this?",
    ]);
    expect(teach).toContain("worsening is not treated here as a necessary phase of healing");
    expect(teach).toContain("Support & Safety");
  });

  it("gives every gathered idea a substantive, branch-accurate echo", () => {
    const echo = different.echo!;
    expect(echo.heading).toBe("What may be worth keeping — or leaving here");
    expect(Object.keys(echo.byOption).sort()).toEqual(
      different.options.map((o) => o.id).sort(),
    );
    for (const [id, line] of Object.entries(echo.byOption)) {
      expect(line.length, `short echo: ${id}`).toBeGreaterThan(60);
    }
    expect(echo.byOption["protective"]).toContain(
      "This choice does not tell us where it came from",
    );
    expect(echo.byOption["named"]).toContain("does not tell us that anything has become");
    expect(echo.byOption["twopulls"]).toContain("any particular conflict is alive in you");
    expect(echo.byOption["cost"]).toContain("where blame belongs");
    expect(echo.byOption["harsh"]).toContain("accountability remains possible");
    expect(echo.byOption["small"]).toContain("does not tell us that any step has happened");
    expect(echo.byOption["notalone"]).toContain(
      "does not tell us what support exists, who is safe, or what you can reach",
    );
    expect(echo.byOption["nothing"]).toContain(
      "An idea may resonate without becoming a finished outcome",
    );
    expect(echo.byOption["nothing"]).not.toContain(
      "No particular thread feels worth carrying",
    );
    expect(echo.byOption["unclear"]).toContain("Uncertainty stays uncertainty");
    expect(echo.byOption["private"]).toContain("saved on this device");
    expect(echo.byOption["private"]).toContain("remains yours");
    expect(echo.byOption["private"]).not.toContain("nothing was recorded");
    expect(echo.unanswered).toBe(
      "You continued without selecting a thread. Nothing will be chosen, interpreted, or summarised on your behalf.",
    );
    expect(echo.closing).toBe(
      "A thread may be kept, revised, set down, or left unclear. None becomes a promise or proof of change.",
    );
  });

  it("gives both practices equal depth and the same integration movement", () => {
    const { reflection: nonreligious, spiritual } = day10.practise;
    expect(day10.practise.heading).toBe("Two ways to gather without forcing closure");
    expect(day10.practise.either).toBe(
      "You may use either path, both paths, or neither. You may simply read, stop at any point, or leave the practice unfinished.",
    );
    expect(nonreligious.steps.length).toBeGreaterThanOrEqual(7);
    expect(spiritual.steps.length).toBeGreaterThanOrEqual(7);
    expect(nonreligious.title).toBe(
      "Integration Practice — what to keep, what to leave open, and what may support you",
    );
    expect(spiritual.title).toBe(
      "Scripture & Spiritual Reflection — blessing without forced closure",
    );

    for (const path of [nonreligious, spiritual]) {
      const text = [...path.steps, path.notRequired].join(" ").toLowerCase();
      expect(text).toContain("unfinished");
      expect(text).toContain("support");
      expect(text).toContain("accommodation");
      expect(text).toContain("advocacy");
      expect(text).toContain("boundary");
      expect(text).toContain("waiting");
      expect(text).toContain("outward");
      expect(text).toContain("reading");
      expect(text).toContain("or any outcome");
    }
    expect(nonreligious.steps[0]).toContain("No touch, posture change, breathing change");
    expect(spiritual.scripture!.reference).toBe("Numbers 6:24–26 (World English Bible)");
    expect(spiritual.scripture!.body).toBe(
      "Yahweh bless you, and keep you. Yahweh make his face to shine on you, and be gracious to you. Yahweh lift up his face toward you, and give you peace.",
    );
    expect(spiritual.scripture!.note).toBe(
      "This ancient priestly blessing from Israel’s Scriptures entrusts people to God’s keeping, grace, attentive presence, and shalom. It is not a forecast that pain, danger, illness, grief, or circumstances will change, and it should not silence lament or replace practical care.",
    );
    expect(spiritual.scripture!.note).not.toContain("A blessing asks for");
    expect(spiritual.steps.join(" ")).toContain(
      "may be set aside without any spiritual judgment",
    );
    expect(spiritual.notRequired).toContain("receiving the blessing");
  });

  it("keeps the reflection answer-driven with complete line coverage", () => {
    expect(day10.reflection.intro).toBe(
      "This reflection stays with what you chose—or left open—today. It does not fill in earlier days or decide what the journey meant for you.",
    );
    expect(day10.reflection.sections.map((s) => [s.id, s.title, s.from])).toEqual([
      ["hearing", "What may be carried — or left here", "different"],
      ["care", "What remains unfinished — or unnamed", "unfinished"],
      ["next", "How the journey was left — or left open", "step"],
    ]);
    const sources = { different, unfinished, step: day10.step };
    for (const section of day10.reflection.sections) {
      expect(section.opening).toBeUndefined();
      const source = sources[section.from as keyof typeof sources];
      expect(Object.keys(section.lines ?? {}).sort()).toEqual(
        source.options.map((o) => o.id).sort(),
      );
      for (const [id, line] of Object.entries(section.lines ?? {})) {
        expect(line.length, `short line: ${section.id}.${id}`).toBeGreaterThan(60);
      }
      expect(section.unanswered.length).toBeGreaterThan(60);
    }
    expect(day10.reflection.closing).toBe(
      "Whatever you chose—or left open—does not have to prove progress, readiness, safety, or what comes next.",
    );
  });

  it("invents nothing on a fully skipped path", () => {
    const text = buildReflection(day10, [])
      .sections.flatMap((s) => s.paragraphs)
      .join(" ");
    expect(text).toContain(
      "You left the first question open. Nothing is being chosen or interpreted for you.",
    );
    expect(text).toContain("You did not name an unfinished place. Nothing needs to be added.");
    expect(text).toContain(
      "You did not choose a next step. The journey can end here without one.",
    );
    for (const phrase of [
      "ten days of honest attention",
      "you have gathered",
      "you noticed",
      "you practised",
      "you stayed",
      "you understood",
      "you disclosed",
      "will surface when it is ready",
      "most practical next thing",
      "screens having been navigated",
      "engagement",
    ]) {
      expect(text.toLowerCase(), `unexpected phrase: ${phrase}`).not.toContain(
        phrase.toLowerCase(),
      );
    }
  });

  it("reflects only the selected options on an answered path", () => {
    const answers = [
      answer("q.different", idx(different, "harsh")),
      answer("q.unfinished", idx(unfinished, "grief")),
      answer("step", idx(day10.step, "revisit")),
    ];
    const text = buildReflection(day10, answers)
      .sections.flatMap((s) => s.paragraphs)
      .join(" ");
    expect(text).toContain("truth and responsibility do not require self-attack");
    expect(text).toContain("You named grief, loss, or mourning");
    expect(text).toContain("You chose one day or practice you may return to");
    expect(text).not.toContain("a small or preparatory response");
    expect(text).not.toContain("something relational that remains unresolved");
    expect(text).not.toContain("one fair sentence");
    expect(text).not.toContain("You left the first question open");
  });

  it("keeps private, unclear, outside-control and unavailable paths accurate", () => {
    const answers = [
      answer("q.different", idx(different, "private")),
      answer("q.unfinished", idx(unfinished, "outside")),
      answer("step", idx(day10.step, "unavailable")),
    ];
    const text = buildReflection(day10, answers)
      .sections.flatMap((s) => s.paragraphs)
      .join(" ");
    expect(text).toContain("what was held privately remains yours");
    expect(text).toContain("That privacy choice is saved on this device");
    expect(text).toContain("no private content is known or inferred");
    expect(text).toContain("responsibility is not handed back to you");
    expect(text).toContain("none feels safe or available now");
    expect(text.toLowerCase()).not.toContain("nothing was recorded");

    const quiet = buildReflection(day10, [
      answer("q.different", idx(different, "unclear")),
      answer("q.unfinished", idx(unfinished, "none")),
      answer("step", idx(day10.step, "unclear")),
    ])
      .sections.flatMap((s) => s.paragraphs)
      .join(" ");
    expect(quiet).toContain("That uncertainty stays uncertainty here");
    expect(quiet).toContain("That is left exactly as it is");
    expect(quiet).toContain("That uncertainty stays as uncertainty");
  });

  it("keeps legacy many-answer arrays coherent for Q1 and Q2", () => {
    const legacyQ1 = (positions: number[]) =>
      buildReflection(
        day10,
        positions.map((p) => answer("q.different", p)),
      )
        .sections.flatMap((s) => s.paragraphs)
        .join(" ");

    for (const positions of [
      [0, 7],
      [7, 0],
      [0, 1, 2, 3, 4, 5, 6, 7],
    ]) {
      const text = legacyQ1(positions);
      expect(text).toContain("may have helped you cope");
      expect(text).toContain("An idea may resonate without becoming a finished outcome");
      expect(text).not.toContain("No particular thread feels worth carrying");
      expect(text).not.toContain("You left the first question open");
    }

    const full = legacyQ1([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(full).toContain("putting words to something");
    expect(full).toContain("more than one pull or truth");
    expect(full).toContain("what support exists");

    const alone = legacyQ1([7]);
    expect(alone).toContain("nothing feels settled or complete right now");
    expect(alone).toContain("An idea may resonate without becoming a finished outcome");

    const q2 = buildReflection(
      day10,
      [0, 1, 2, 3, 4, 5, 6, 7].map((p) => answer("q.unfinished", p)),
    )
      .sections.flatMap((s) => s.paragraphs)
      .join(" ");
    expect(q2).toContain("You named grief, loss, or mourning");
    expect(q2).toContain("something relational that remains unresolved");
    expect(q2).toContain("cannot or do not want to name");
    expect(q2).not.toContain("You did not name an unfinished place");
  });

  it("treats a restored legacy many state as valid and normalizes a fresh exclusive click", () => {
    const legacy = [0, 1, 2, 3, 4, 5, 6, 7];
    // A legacy many array stays a many state when a further non-exclusive option
    // is toggled — no collapse to a single choice.
    expect(toggleSelection(different, legacy, 1)).toEqual([0, 2, 3, 4, 5, 6, 7]);
    const unclearIdx = idx(different, "unclear");
    // A fresh exclusive click normalizes according to existing shared behaviour.
    expect(toggleSelection(different, legacy, unclearIdx)).toEqual([unclearIdx]);
    expect(toggleSelection(different, [unclearIdx], 0)).toEqual([0]);
  });

  it("closes with permission and no continuation pressure", () => {
    expect(day10.close.heading).toBe("A complete stopping place");
    expect(day10.close.body[0]).toBe(
      "You may have answered, kept things private, simply read, or left everything open. None of those paths has to prove healing, progress, readiness, or meaning.",
    );
    expect(day10.close.body[1]).toContain("Unfinished is not the same as failed.");
    expect(day10.close.body[2]).toContain("you owe the app no repetition or continuation");
    expect(day10.close.body[2]).toContain("Support & Safety");
    expect(day10.close.carryForward).toBe(
      "I can let this journey be complete without forcing myself to be finished.",
    );
  });

  it("guards every forbidden old, inferential or outcome phrase", () => {
    const text = allText10();
    for (const phrase of [
      "selected structured responses",
      "screens having been navigated",
      "is established",
      "is assigned",
      "is claimed",
      "Today’s selections",
      "the right next step",
      "the right place",
      "No particular thread feels worth carrying",
      "You have spent ten days",
      "same person who opened Day 1",
      "with a little more information",
      "Let one breath out slowly",
      "make something visible",
      "give it a name",
      "make one small movement possible",
      "long avoided",
      "heavier before it feels lighter",
      "understanding sometimes arrives weeks later",
      "first practical relief",
      "removes a great deal",
      "puts the choice back",
      "single most useful",
      "only one that holds",
      "worth more than most insights",
      "will surface when it is ready",
      "will keep. It does not expire",
      "most practical next thing",
      "can shift more than several days",
      "accumulates quietly",
      "choose and rehearse",
      "Only one — the rest can wait",
      "shrink it until",
      "what, when",
      "picture the moment",
      "make it specific",
      "mean it as a step, not a delay",
      "step you are carrying out",
      "without being asked",
      "the right next place",
      "I began where I was",
      "I stayed with what was true",
      "Ten days of honest attention",
      "A blessing asks for",
      "you are healed",
      "you will feel",
    ]) {
      expect(text.toLowerCase(), `unexpected phrase: ${phrase}`).not.toContain(
        phrase.toLowerCase(),
      );
    }
  });

  it("leaves Days 6 to 9 at their accepted canonical boundaries", () => {
    const day6 = getFirstJourneyDay(6)!;
    expect(day6.title).toBe("What It Is Costing Now");
    expect(day6.motif).toBe("cost");
    const day7 = getFirstJourneyDay(7)!;
    expect(day7.close.carryForward).toBe(
      "I can face what is true without turning myself into the enemy.",
    );
    const day8 = getFirstJourneyDay(8)!;
    expect(day8.close.heading).toBe("Held without force");
    const day9 = getFirstJourneyDay(9)!;
    expect(day9.title).toBe("Practise a Different Response");
    expect(day9.understand.heading).toBe("Rehearsal is a possibility, not a promise");
    expect(day9.close.carryForward).toBe(
      "I can rehearse a possibility without promising to use it.",
    );
  });
});
