// Focused locks for one bounded correction batch:
//  1. Day 9's "where" faith setting is presentation-gated by the spiritual
//     preference, without touching storage or the reflection mapping.
//  2. The Canadian emergency guidance and its action labels are accurate about
//     911 availability.
//  3. Privacy / persistence wording is truthful about local storage.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { getFirstJourneyDay } from "@/content/first-journey";
import type { JourneyDayContent } from "@/content/journey-types";
import { CA_REGION } from "@/content/crisis-registry";
import { PRIVACY_CONFIDENTIALITY_POINTS, PRIVACY_SUMMARY_POINTS } from "@/content/settings";
import { AGREEMENT_COPY, OPENING_SCREENS } from "@/content/opening";
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

const OFF = { hydrated: true, showSpiritual: false };
const ON = { hydrated: true, showSpiritual: true };
const UNHYDRATED = { hydrated: false, showSpiritual: true };

describe("1 — Day 9 faith setting is spiritual-only", () => {
  const nine = day(9);
  const where = nine.questions.find((q) => q.id === "where")!;
  const faith = where.options.find((o) => o.id === "faith")!;
  const key = answerKeyFor(nine, "where");
  const token = `${key}:faith`;

  it("keeps the existing id, label, order and marker", () => {
    expect(faith.label).toBe("In my faith or spiritual life");
    expect(where.options.indexOf(faith)).toBe(5);
    expect(faith.spiritualOnly).toBe(true);
  });

  it("hides the option while spiritual content is off", () => {
    const off = presentationOptions(where, OFF).map(({ option }) => option.id);
    expect(off).not.toContain("faith");
    const on = presentationOptions(where, ON).map(({ option }) => option.id);
    expect(on).toContain("faith");
    expect(presentationOptions(where, UNHYDRATED).map(({ option }) => option.id)).not.toContain(
      "faith",
    );
  });

  it("withholds a previously saved faith answer while off, and returns it when on", () => {
    const raw = [`${answerKeyFor(nine, "response")}:unclear`, token];
    const frozen = [...raw];

    expect(presentationAnswers(nine, raw, OFF)).not.toContain(token);
    expect(presentationAnswers(nine, raw, ON)).toEqual(frozen);
    // toggle off, then on again — storage is never rewritten
    expect(presentationAnswers(nine, raw, OFF)).not.toContain(token);
    expect(presentationAnswers(nine, raw, ON)).toContain(token);
    expect(raw).toEqual(frozen);
  });

  it("keeps the faith reflection line, reachable only when it is presentable", () => {
    const section = nine.reflection.sections.find((s) => s.id === "underneath")!;
    expect(section.from).toBe("where");
    expect(section.lines?.faith).toContain("Faith or spiritual life came to mind");
  });
});

describe("2 — accurate Canadian 911 wording", () => {
  it("uses the approved emergency guidance and keeps tel 911", () => {
    expect(CA_REGION.emergencyGuidance).toBe(
      "If you are in immediate danger, call 911 where it is available, go to your nearest emergency department, or use your local emergency service. Emergency numbers can differ by location.",
    );
    expect(CA_REGION.emergencyTel).toBe("911");
  });

  it("labels the Support & Safety action exactly", () => {
    const src = readFileSync("src/routes/_shell.support.tsx", "utf8");
    expect(src).toContain("Call 911 where available");
  });

  it("uses the approved Important Information sentence", () => {
    const src = readFileSync("src/routes/important-information.tsx", "utf8");
    expect(src).toContain("If safety is at immediate risk, call");
    expect(src).toContain("where it is available, use your local emergency service, or go to your");
  });

  it("preserves the crisis-line confidentiality qualification and 9-8-8 details", () => {
    const support = readFileSync("src/routes/_shell.support.tsx", "utf8");
    expect(support).toContain("limits may apply when");
    const nine88 = CA_REGION.crisisLines.find((l) => l.name.startsWith("9-8-8"))!;
    expect(nine88.tel).toBe("988");
    expect(nine88.sms).toBe("988");
  });
});

describe("3 — truthful local-storage wording", () => {
  function normalize(src: string): string {
    return src.replace(/\s+/g, " ").trim();
  }

  it("Privacy notice drops the tautological opening and uses the exact qualified wording", () => {
    const src = readFileSync("src/routes/privacy.tsx", "utf8");
    expect(src).not.toContain("The app stores locally stored journey information");
    const normalized = normalize(src);
    expect(normalized).toContain(
      "When browser storage is available, the app keeps the following journey information in this browser on this device. If storage is unavailable, this information may exist only in the current tab and can be lost when that tab closes or reloads:",
    );
  });

  it("Privacy notice replaces the overbroad closing paragraph with the exact qualified wording", () => {
    const src = readFileSync("src/routes/privacy.tsx", "utf8");
    expect(src).not.toContain("Everything above stays on this device and browser");
    const normalized = normalize(src);
    expect(normalized).toContain(
      "When browser storage is available, the journey information above stays in this browser on this device. If storage is unavailable, it may exist only in the current tab and can be lost when that tab closes or reloads. This journey information is not sent to Resurgence Therapeutics, is not stored on its server, and is not connected to an account, database or visitor analytics.",
    );
  });

  it("Agreement screen drops the overbroad 'nothing is sent anywhere' clause", () => {
    expect(AGREEMENT_COPY.automatedProcessingSentence).not.toContain("nothing is sent anywhere");
    expect(AGREEMENT_COPY.automatedProcessingSentence).toBe(
      "Your personalized reflection is assembled on this device from the wording written for that day and the responses you select. It is put together automatically, it is not read by a person, and your selected responses and personalized reflection are not sent to Resurgence Therapeutics.",
    );
  });

  it("How-it-works screen uses the exact qualified saved-place wording", () => {
    const howItWorks = OPENING_SCREENS.find((s) => s.key === "how-it-works")!;
    const point = howItWorks.points!.find((p) => p.includes("Your place is saved"))!;
    expect(point).not.toContain("otherwise it may last only in the current tab");
    expect(point).toBe(
      "Your place is saved on this device when browser storage is available, so you can leave and return. If storage is unavailable, it may exist only in the current tab and can be lost when that tab closes or reloads.",
    );
  });

  it("Settings Privacy & Confidentiality summary uses the exact qualified first bullet", () => {
    expect(PRIVACY_SUMMARY_POINTS[0]).not.toContain(
      "Everything this app saves stays in this browser, on this device only",
    );
    expect(PRIVACY_SUMMARY_POINTS[0]).toBe(
      "When browser storage is available, everything this app saves stays in this browser on this device. If storage is unavailable, information may exist only in the current tab and can be lost when that tab closes or reloads.",
    );
  });

  it("Settings Clear or Restart description uses the exact qualified wording", () => {
    const src = readFileSync("src/routes/_shell.settings.tsx", "utf8");
    const normalized = normalize(src);
    expect(normalized).not.toContain(
      "Everything this app saves stays in this browser, on this device only: your saved place",
    );
    expect(normalized).toContain(
      "When browser storage is available, this app keeps your saved place, selected choices, personalized reflections, finished days, preferences and recorded agreement in this browser on this device. If storage is unavailable, information may exist only in the current tab and can be lost when that tab closes or reloads. Choosing Clear or restart my journey asks the app to remove its saved journey information and return you to the opening. If removal cannot be confirmed, the app will tell you.",
    );
  });

  it("preserves the truthful no-account, no-server, no-analytics and fonts statements", () => {
    const src = readFileSync("src/routes/privacy.tsx", "utf8");
    expect(src).toContain("does not require you to create an account");
    expect(src.toLowerCase()).toContain("google fonts");
    expect(PRIVACY_SUMMARY_POINTS.some((p) => p.includes("no analytics"))).toBe(true);
  });
});
