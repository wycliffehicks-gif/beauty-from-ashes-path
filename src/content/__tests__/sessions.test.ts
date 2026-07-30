import { describe, expect, it } from "vitest";
import {
  SESSION_STAGE_ORDER,
  WEEK_01_SESSION,
  getSession,
  getStage,
} from "@/content/sessions";

describe("week 1 session content model", () => {
  it("declares the full eleven-stage sequence in order", () => {
    expect(SESSION_STAGE_ORDER).toEqual([
      "arrival",
      "noticing",
      "naming",
      "exploration",
      "meaning",
      "attunement",
      "reconnection",
      "embodied",
      "integration",
      "one-honest-step",
      "close",
    ]);
  });

  it("session stages match the canonical order exactly", () => {
    expect(WEEK_01_SESSION.stages.map((s) => s.key)).toEqual(SESSION_STAGE_ORDER);
  });

  it("every stage of the full session is interactive", () => {
    const interactive = WEEK_01_SESSION.stages
      .filter((s) => s.status === "interactive")
      .map((s) => s.key);
    expect(interactive).toEqual([...SESSION_STAGE_ORDER]);
  });

  it("stage 7 offers two complete routes, with neither preselected", () => {
    const reconnection = WEEK_01_SESSION.stages.find((s) => s.key === "reconnection")!;
    expect(reconnection.routes?.map((r) => r.id)).toEqual(["meaning", "christian"]);
    const christian = reconnection.routes?.find((r) => r.id === "christian")!;
    expect(christian.modes?.length).toBeGreaterThan(2);
    expect(christian.scripture).toBeTruthy();
    const plain = reconnection.routes?.find((r) => r.id === "meaning")!;
    expect(plain.scripture).toBeUndefined();
    expect(plain.prayer).toBeUndefined();
    expect(plain.exercise.stems.length).toBeGreaterThan(1);
  });

  it("stage 8 offers practices that are never required", () => {
    const embodied = WEEK_01_SESSION.stages.find((s) => s.key === "embodied")!;
    expect(embodied.practices?.length).toBeGreaterThanOrEqual(5);
    for (const p of embodied.practices ?? []) {
      expect(p.safety.length).toBeGreaterThan(10);
    }
  });

  it("stage 10 offers small steps across approved categories", () => {
    const step = WEEK_01_SESSION.stages.find((s) => s.key === "one-honest-step")!;
    expect(step.steps?.length).toBeGreaterThanOrEqual(8);
    expect(step.steps?.some((s) => s.category === "none")).toBe(true);
  });


  it("stage 4 lays out the three movements: pull forward, pull back, protector", () => {
    const exploration = WEEK_01_SESSION.stages.find((s) => s.key === "exploration")!;
    expect(exploration.groups?.map((g) => g.id)).toEqual([
      "pull-forward",
      "pull-back",
      "protector",
    ]);
    for (const g of exploration.groups!) {
      expect(g.teach.length).toBeGreaterThan(40);
      // every movement offers its own scoped low-pressure answers
      for (const kind of ["mixed", "numb", "unsure", "prefer-not", "none"]) {
        expect(g.choices.some((c) => c.id.endsWith(kind))).toBe(true);
      }
    }
    // choice ids are unique across the whole stage so selections cannot collide
    const ids = exploration.groups!.flatMap((g) => g.choices.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("stage 4 offers very-little-energy, not-today and support exits", () => {
    const exploration = WEEK_01_SESSION.stages.find((s) => s.key === "exploration")!;
    const behaviours = exploration.branchOptions?.map((b) => b.behaviour) ?? [];
    expect(behaviours).toContain("shorten");
    expect(behaviours).toContain("grounding-close");
    expect(behaviours).toContain("support");
  });

  it("stage 5 separates what helped then from what it may cost now", () => {
    const meaning = WEEK_01_SESSION.stages.find((s) => s.key === "meaning")!;
    expect(meaning.groups?.map((g) => g.id)).toEqual(["function", "cost"]);
    expect(meaning.practice?.body.length).toBeGreaterThan(40);
    // never asks the person to condemn a survival strategy
    const text = JSON.stringify(meaning).toLowerCase();
    for (const bad of ["unhealthy", "bad habit", "must stop", "you need to", "wrong of you"]) {
      expect(text).not.toContain(bad);
    }
  });

  it("stage 5 keeps an explicit 'it may still be necessary' option", () => {
    const meaning = WEEK_01_SESSION.stages.find((s) => s.key === "meaning")!;
    const ids = meaning.groups!.flatMap((g) => g.choices.map((c) => c.id));
    expect(ids).toContain("fn-still-necessary");
    expect(ids).toContain("cost-none-yet");
  });

  it("stage 6 contains no spiritual content — spirituality belongs to stage 7", () => {
    const attunement = WEEK_01_SESSION.stages.find((s) => s.key === "attunement")!;
    expect(JSON.stringify(attunement)).not.toMatch(
      /\b(god|jesus|scripture|bible|pray|prayer|psalm)\b/i,
    );
  });


  it("every planned stage still states its purpose", () => {
    for (const s of WEEK_01_SESSION.stages) {
      expect(s.purpose.length).toBeGreaterThan(20);
    }
  });

  it("interactive stages teach at the point of need and offer a practice", () => {
    for (const key of ["arrival", "noticing", "naming"] as const) {
      const s = getStage(WEEK_01_SESSION, key)!;
      expect(s.teach && s.teach.length).toBeGreaterThan(80);
      expect(s.practice?.body.length).toBeGreaterThan(40);
      expect(s.heading).toBeTruthy();
    }
  });

  it("states the 30–60 minute, pausable framing", () => {
    expect(WEEK_01_SESSION.duration).toMatch(/30/);
    expect(WEEK_01_SESSION.duration).toMatch(/60/);
    expect(WEEK_01_SESSION.duration.toLowerCase()).toContain("pause");
  });

  it("arrival offers the five low-pressure readiness options with safe behaviours", () => {
    const arrival = getStage(WEEK_01_SESSION, "arrival")!;
    const ids = arrival.readiness!.map((r) => r.id);
    expect(ids).toEqual([
      "have-space",
      "try-gently",
      "very-little-energy",
      "not-today",
      "need-support",
    ]);
    const byId = Object.fromEntries(arrival.readiness!.map((r) => [r.id, r.behaviour]));
    expect(byId["very-little-energy"]).toBe("shorten");
    expect(byId["not-today"]).toBe("grounding-close");
    expect(byId["need-support"]).toBe("support");
  });

  it("noticing covers body, emotion, thought, energy and connection plus gentle options", () => {
    const noticing = getStage(WEEK_01_SESSION, "noticing")!;
    const ids = noticing.choices!.map((c) => c.id);
    for (const prefix of ["body-", "emotion-", "thought-", "energy-", "connection-"]) {
      expect(ids.some((i) => i.startsWith(prefix))).toBe(true);
    }
    for (const gentle of ["mixed", "numb", "unsure", "prefer-not", "none"]) {
      expect(ids).toContain(gentle);
    }
  });

  it("naming offers the approved categories and low-pressure exits", () => {
    const naming = getStage(WEEK_01_SESSION, "naming")!;
    const ids = naming.choices!.map((c) => c.id);
    for (const expected of [
      "grief",
      "truth-self",
      "boundary",
      "ask-help",
      "relationship",
      "decision",
      "transition",
      "no-words",
      "unsure",
      "private",
      "not-today",
    ]) {
      expect(ids).toContain(expected);
    }
    expect(naming.optionalText).toBeDefined();
  });

  it("attunement copy stays tentative", () => {
    for (const s of WEEK_01_SESSION.stages) {
      if (!s.attunement) continue;
      expect(s.attunement).toMatch(/\b(may|might|perhaps|it sounds like)\b/i);
    }
  });

  it("getSession resolves by id", () => {
    expect(getSession("week-01")?.week).toBe(1);
    expect(getSession("week-99")).toBeUndefined();
  });
});
