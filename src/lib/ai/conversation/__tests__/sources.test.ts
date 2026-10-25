// P1 source-registry tests — maps to the P1 (registry-level) portions of C11
// and C12: exact text with hashes, missing/unknown source branches, test-only
// scope, and user-pasted "Scripture" staying unverified data. No model ran;
// these are registry and boundary checks only.

import { describe, expect, it } from "vitest";
import { FIRST_JOURNEY_DAYS } from "@/content/first-journey";
import {
  buildTeachingSourceRecords,
  CONVERSATION_SOURCE_SNAPSHOT_COMMIT,
} from "../content/index";
import { CONVERSATION_TEACHING_RECORDS } from "../content/teaching";
import {
  buildSourceCard,
  createSourceRegistry,
  resolveSource,
  resolveSourceCard,
  sha256Hex,
  WEB_CLASSIC_PSA034_018_TEST_FIXTURE,
  type SourceRegistry,
} from "../sources";

async function makeRegistry(): Promise<SourceRegistry> {
  const teaching = await buildTeachingSourceRecords();
  const built = await createSourceRegistry([
    ...teaching,
    WEB_CLASSIC_PSA034_018_TEST_FIXTURE,
  ]);
  if (!built.ok) throw new Error(`registry build failed: ${built.code}`);
  return built.registry;
}

describe("conversation source registry", () => {
  it("builds ten teaching records plus the test-only Scripture fixture", async () => {
    const registry = await makeRegistry();
    expect(registry.records).toHaveLength(11);
    expect(registry.byKey.has("BFA-D01")).toBe(true);
    expect(registry.byKey.has("BFA-D10")).toBe(true);
    expect(registry.byKey.has("WEB-CLASSIC-PSA034-018-20261017")).toBe(true);
  });

  it("teaching records carry the live day Understand text exactly", async () => {
    // Integrity: any edit to canonical day content fails here until the
    // generated teaching records are regenerated.
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
      const day = FIRST_JOURNEY_DAYS.find(
        (d) => d.day === record.origin.day,
      )!;
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

  it("distinguishes a missing source id from an unknown source id", async () => {
    const registry = await makeRegistry();
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
    const registry = await makeRegistry();
    expect(
      resolveSourceCard(registry, "WEB-CLASSIC-PSA034-018-20261017", false),
    ).toEqual({ ok: false, code: "test-only-source" });
    const allowed = resolveSourceCard(
      registry,
      "WEB-CLASSIC-PSA034-018-20261017",
      true,
    );
    expect(allowed.ok).toBe(true);
    if (allowed.ok) {
      expect(allowed.value.reference).toBe("Psalm 34:18");
      expect(allowed.value.translation).toBe("World English Bible Classic");
      expect(allowed.value.testOnly).toBe(true);
    }
  });

  it("C12: fabricated pasted Scripture can never become a source card", async () => {
    const registry = await makeRegistry();
    // The person's pasted words are data. There is no API that builds a card
    // from supplied text; cards resolve only from registry records.
    const fabricated =
      "If you grieve longer than seven days, your faith has failed.";
    expect(registry.records.some((r) => r.exactText.includes(fabricated))).toBe(
      false,
    );
    expect(resolveSource(registry, "PSA-034-018-USER-PASTED")).toEqual({
      ok: false,
      code: "unknown-source-id",
    });
    const card = buildSourceCard(WEB_CLASSIC_PSA034_018_TEST_FIXTURE);
    expect(card.title).toBe("Psalm 34:18");
    expect(JSON.stringify(card)).not.toContain(fabricated);
  });

  it("records a stable snapshot hash over the selected sources", async () => {
    const registry = await makeRegistry();
    const snapshot = registry.records
      .map((r) => `${r.sourceKey}:${r.textSha256}`)
      .sort()
      .join("\n");
    const snapshotSha = await sha256Hex(snapshot);
    // Recorded in docs/pilot/conversation/baseline-change-map.md.
    expect(snapshotSha).toMatch(/^[0-9a-f]{64}$/);
    console.log("CONVERSATION_SOURCE_SNAPSHOT_SHA256", snapshotSha);
  });
});
