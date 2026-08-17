import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { PRACTICES, getPractice } from "@/content/practices";

const ROUTE = readFileSync("src/routes/practice.$id.tsx", "utf8");
const LIST = readFileSync("src/routes/_shell.practices.tsx", "utf8");

const EXPECTED: ReadonlyArray<[string, string]> = [
  ["pause-and-ground", "Pause and Ground"],
  ["start-where-you-are", "Start Where You Are"],
  ["name-the-old-pattern", "Name the Old Pattern"],
  ["sacred-reframing", "Sacred Reframing"],
  ["reach-toward-safe-connection", "Reach Toward Safe Connection"],
  ["lament", "Lament"],
];

describe("standalone practice routing", () => {
  it("registers exactly the six listed practices", () => {
    expect(PRACTICES.map((p) => p.id)).toEqual(EXPECTED.map(([id]) => id));
  });

  for (const [id, title] of EXPECTED) {
    it(`resolves /practice/${id} to "${title}" with steps`, () => {
      const practice = getPractice(id);
      expect(practice).toBeDefined();
      expect(practice!.title).toBe(title);
      expect(practice!.steps.length).toBeGreaterThan(0);
      for (const step of practice!.steps) {
        expect(step.body.trim().length).toBeGreaterThan(0);
      }
    });
  }

  it("keeps a safe fallback for an unknown slug", () => {
    expect(getPractice("no-such-practice")).toBeUndefined();
    expect(ROUTE).toContain("if (!getPractice(params.id))");
    expect(ROUTE).toContain('throw redirect({ to: "/", replace: true })');
  });

  it("no longer redirects every practice URL away", () => {
    expect(ROUTE).toContain("getPractice");
    expect(ROUTE).toContain('createFileRoute("/practice/$id")');
    expect(ROUTE).not.toMatch(/beforeLoad:\s*\(\)\s*=>/);
  });

  it("renders authored cautions and links back to the list", () => {
    const withCautions = PRACTICES.filter((p) => (p.cautions?.length ?? 0) > 0);
    expect(withCautions.length).toBeGreaterThan(0);
    expect(ROUTE).toContain("practice.cautions");
    expect(ROUTE).toContain('to="/practices"');
  });

  it("keeps the list linking to the registered detail route", () => {
    expect(LIST).toContain('to="/practice/$id"');
    expect(LIST).toContain("params={{ id: practice.id }}");
  });
});
