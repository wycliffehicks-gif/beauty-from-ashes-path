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

  it("only stages 1–3 are interactive in this block", () => {
    const interactive = WEEK_01_SESSION.stages
      .filter((s) => s.status === "interactive")
      .map((s) => s.key);
    expect(interactive).toEqual(["arrival", "noticing", "naming"]);
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
