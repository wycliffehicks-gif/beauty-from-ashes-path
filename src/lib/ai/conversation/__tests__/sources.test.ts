// P1 source-registry tests — maps to the P1 (registry-level) portions of C11
// and C12: exact text with hashes, missing/unknown source branches, test-only
// scope, registry-only card resolution, immutability, and user-pasted
// "Scripture" staying unverified data. No model ran; these are registry and
// boundary checks only.

import { describe, expect, it } from "vitest";
import { FIRST_JOURNEY_DAYS } from "@/content/first-journey";
import {
  buildTeachingSourceRecords,
  CONVERSATION_SOURCE_SNAPSHOT_COMMIT,
} from "../content/index";
import { CONVERSATION_TEACHING_RECORDS } from "../content/teaching";
import {
  createSourceRegistry,
  resolveRegistrySource,
  resolveSource,
  sha256Hex,
  WEB_CLASSIC_PSA034_018_TEST_FIXTURE,
  type ConversationSourceRecord,
  type SourceRegistry,
} from "../sources";

async function productionRegistry(): Promise<SourceRegistry> {
  const teaching = await buildTeachingSourceRecords();
  const built = await createSourceRegistry(teaching);
  if (!built.ok) throw new Error(`registry build failed: ${built.code}`);
  return built.registry;
}

async function evaluationRegistry(): Promise<SourceRegistry> {
  const teaching = await buildTeachingSourceRecords();
  const built = await createSourceRegistry([
    ...teaching,
    WEB_CLASSIC_PSA034_018_TEST_FIXTURE,
  ]);
  if (!built.ok) throw new Error(`registry build failed: ${built.code}`);
  return built.registry;
}

describe("conversation source registry", () => {
  it("the production registry is exactly the ten teaching records", async () => {
    const registry = await productionRegistry();
    expect(registry.records).toHaveLength(10);
    expect(registry.getRecord("BFA-D01")).toBeDefined();
    expect(registry.getRecord("BFA-D10")).toBeDefined();
    expect(registry.getRecord("WEB-CLASSIC-PSA034-018-20261017")).toBeUndefined();
  });

  it("the evaluation registry adds the test fixture explicitly", async () => {
    const registry = await evaluationRegistry();
    expect(registry.records).toHaveLength(11);
    expect(registry.getRecord("WEB-CLASSIC-PSA034-018-20261017")).toBeDefined();
  });

  it("teaching records carry the live day Understand text exactly", async () => {
    for (const record of CONVERSATION_TEACHING_RECORDS) {
      const day = FIRST_JOURNEY_DAYS.find((d) => d.day === record.day);
      expect(day, `day ${record.day} exists`).toBeDefined();
      expect(record.title).toBe(day!.title);
      expect(record.understandHeading).toBe(day!.understand.heading);
      expect(record.understandBody).toEqual(day!.understand.body);
    }
  });

  it("teaching records contain no questions, practices or reflections", async () => {
    const teaching = await buildTeachingSourceRecords();
    for (const record of teaching) {
      const day = FIRST_JOURNEY_DAYS.find((d) => d.day === record.origin.day)!;
      for (const question of day.questions) {
        expect(record.exactText).not.toContain(question.prompt);
      }
      expect(record.exactText).not.toContain(day.practise.heading);
      expect(record.exactText).not.toContain(day.reflection.intro);
      expect(record.testOnly).toBe(false);
      expect(record.reviewStatus).toBe("approved-guided-content");
      expect(record.sourceCommit).toBe(CONVERSATION_SOURCE_SNAPSHOT_COMMIT);
    }
  });

  it("the Scripture fixture matches its catalog hash and stays test-only", async () => {
    const fixture = WEB_CLASSIC_PSA034_018_TEST_FIXTURE;
    expect(await sha256Hex(fixture.exactText)).toBe(fixture.textSha256);
    expect(fixture.textSha256).toBe(
      "90de249bb42fe65090a1b552003bc552fc378556dba75f4c5be6a914a450d4bc",
    );
    expect(fixture.testOnly).toBe(true);
    expect(fixture.reviewStatus).toBe("verified-test-fixture-only");
    expect(fixture.origin.translation).toBe("World English Bible Classic");
  });

  it("rejects a testOnly downgrade of the Scripture fixture", async () => {
    const downgraded = { ...WEB_CLASSIC_PSA034_018_TEST_FIXTURE, testOnly: false };
    const built = await createSourceRegistry([downgraded]);
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.code).toBe("invalid-record");
  });

  it("rejects Scripture records without exact reference/translation provenance", async () => {
    const noProvenance = {
      ...WEB_CLASSIC_PSA034_018_TEST_FIXTURE,
      sourceKey: "WEB-CLASSIC-PSA034-019-20261017",
      origin: { file: "https://ebible.org/eng-web/PSA034.htm" },
    };
    const built = await createSourceRegistry([noProvenance]);
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.code).toBe("invalid-record");
  });

  it("does not admit pending-review records", async () => {
    const teaching = await buildTeachingSourceRecords();
    const pending: ConversationSourceRecord = {
      ...teaching[0],
      sourceKey: "BFA-D01-PENDING",
      reviewStatus: "provisional-review-pending",
    };
    const built = await createSourceRegistry([pending]);
    expect(built).toEqual({
      ok: false,
      code: "pending-review-not-admissible",
      sourceKey: "BFA-D01-PENDING",
    });
  });

  it("rejects duplicate keys and hash mismatches", async () => {
    const teaching = await buildTeachingSourceRecords();
    const duplicate = await createSourceRegistry([teaching[0], teaching[0]]);
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.code).toBe("duplicate-source-key");

    const tampered = await createSourceRegistry([
      { ...teaching[0], exactText: `${teaching[0].exactText} tampered` },
    ]);
    expect(tampered.ok).toBe(false);
    if (!tampered.ok) expect(tampered.code).toBe("hash-mismatch");
  });

  it("deep-freezes admitted records and their nested arrays", async () => {
    const registry = await productionRegistry();
    const record = registry.getRecord("BFA-D01")!;
    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(record.origin)).toBe(true);
    expect(Object.isFrozen(record.limitations)).toBe(true);
    expect(Object.isFrozen(registry.records)).toBe(true);
    expect(() => {
      (record as { spiritualClassification: string }).spiritualClassification =
        "christian-scripture";
    }).toThrow();
    expect(record.spiritualClassification).toBe("nonreligious-teaching");
  });

  it("encapsulates the record map so forged records cannot be injected", async () => {
    const registry = await productionRegistry();
    // There is no public map to write to; resolution only reads validated records.
    expect(registry.getRecord("FORGED-SOURCE")).toBeUndefined();
    expect(resolveSource(registry, "FORGED-SOURCE")).toEqual({
      ok: false,
      code: "unknown-source-id",
    });
  });

  it("distinguishes a missing source id from an unknown source id", async () => {
    const registry = await productionRegistry();
    expect(resolveSource(registry, null)).toEqual({
      ok: false,
      code: "missing-source-id",
    });
    expect(resolveSource(registry, undefined)).toEqual({
      ok: false,
      code: "missing-source-id",
    });
    expect(resolveSource(registry, "BFA-D99")).toEqual({
      ok: false,
      code: "unknown-source-id",
    });
  });

  it("blocks the test-only fixture unless test sources are explicitly allowed", async () => {
    const registry = await evaluationRegistry();
    expect(
      resolveRegistrySource(registry, "WEB-CLASSIC-PSA034-018-20261017", false),
    ).toEqual({ ok: false, code: "test-only-source" });
    const allowed = resolveRegistrySource(
      registry,
      "WEB-CLASSIC-PSA034-018-20261017",
      true,
    );
    expect(allowed.ok).toBe(true);
    if (allowed.ok) {
      expect(allowed.value.card.reference).toBe("Psalm 34:18");
      expect(allowed.value.card.translation).toBe("World English Bible Classic");
      expect(allowed.value.card.testOnly).toBe(true);
      expect(allowed.value.excerpt.exactText).toContain("Yahweh is near");
      // The display card projection carries no exact text.
      expect("exactText" in allowed.value.card).toBe(false);
    }
  });

  it("C12: fabricated pasted Scripture can never resolve to a source", async () => {
    const registry = await evaluationRegistry();
    const fabricated =
      "If you grieve longer than seven days, your faith has failed.";
    expect(registry.records.some((r) => r.exactText.includes(fabricated))).toBe(
      false,
    );
    expect(resolveSource(registry, "PSA-034-018-USER-PASTED")).toEqual({
      ok: false,
      code: "unknown-source-id",
    });
    // A record's hash verifies supplied bytes only; attribution comes from
    // recorded provenance, which the fabricated text lacks entirely.
    const fabricatedHash = await sha256Hex(fabricated);
    expect(fabricatedHash).not.toBe(
      WEB_CLASSIC_PSA034_018_TEST_FIXTURE.textSha256,
    );
  });

  it("records stable production and evaluation snapshot hashes", async () => {
    const snapshotOf = async (registry: SourceRegistry) =>
      sha256Hex(
        registry.records
          .map((r) => JSON.stringify(r))
          .sort()
          .join("\n"),
      );
    const production = await snapshotOf(await productionRegistry());
    const evaluation = await snapshotOf(await evaluationRegistry());
    expect(production).toMatch(/^[0-9a-f]{64}$/);
    expect(evaluation).toMatch(/^[0-9a-f]{64}$/);
    expect(production).not.toBe(evaluation);
    // Recorded in docs/pilot/conversation/baseline-change-map.md.
    console.log("CONVERSATION_SOURCE_SNAPSHOT_PRODUCTION_SHA256", production);
    console.log("CONVERSATION_SOURCE_SNAPSHOT_EVALUATION_SHA256", evaluation);
  });
});
