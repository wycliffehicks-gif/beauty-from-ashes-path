// Source regression: canonical app code must never read a day's coded answers
// straight out of the frozen legacy mirror. Only the versioned helpers may be
// used, so a future revision of a day's questions can never be answered with
// selections that belonged to an older meaning.
//
// The legacy `progress.answers` map is compatibility/rollback state. It is read
// only inside the progress store's own upgrade and fallback code.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ROUTE_FILES = [
  "src/routes/day.$day.tsx",
  "src/routes/day.$day.reflection.tsx",
  "src/routes/_shell.index.tsx",
  "src/routes/_shell.journey.tsx",
  "src/routes/_shell.settings.tsx",
];

const OTHER_CANONICAL_FILES = [
  "src/lib/journey/reflection-restore.ts",
  "src/lib/journey/reflection-engine.ts",
  "src/lib/journey/resume.ts",
  "src/lib/journey/screen-access.ts",
];

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("canonical code never reads the legacy answers mirror", () => {
  it("holds for every route file", () => {
    for (const path of [...ROUTE_FILES, ...OTHER_CANONICAL_FILES]) {
      const src = read(path);
      expect(src).not.toMatch(/progress\s*\.\s*answers\s*\[/);
      expect(src).not.toMatch(/\.answers\[dayId\]/);
    }
  });

  it("keeps the day flow on the versioned helpers", () => {
    const src = read("src/routes/day.$day.tsx");
    expect(src).toContain("answersForDay(progress, content)");
    expect(src).toContain("hasPendingAnswerMeaningRevision(progress, content)");
    expect(src).toContain("adoptCurrentAnswerMeaning(content)");
    expect(src).toContain("saveDayAnswers(content, next)");
  });

  it("keeps the legacy mirror readable only by store compatibility code", () => {
    const src = read("src/lib/journey/progress.ts");
    // Exactly one legacy read remains, inside the store's own fallback helper.
    const reads = src.match(/progress\.answers\?\.\[dayId\]/g) ?? [];
    expect(reads).toHaveLength(1);
  });

  it("keeps the frozen pre-v4 meaning map out of current content", () => {
    const src = read("src/lib/journey/answer-meaning.ts");
    expect(src).not.toContain("first-journey");
    expect(src).toContain("Object.freeze");
  });
});
