// Synthetic historical JSON only. No evaluator, ledger writer, credential or
// provider construction; these cases do not diagnose either actual run.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  auditHistoricalReceipt,
  auditHistoricalReceiptFiles,
  RECEIPT_AUDIT_KEYS,
  type ReceiptAuditBytes,
  type ReceiptAuditPaths,
} from "../../../../../scripts/conversation-eval/audit-receipt";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const NOW = "2026-11-25T12:00:00.000Z";
const DRAFT = "scripts/conversation-eval/draft-manifest.v1.json";
const SECRET = "synthetic-private-marker-never-a-credential";
function fixture(version = 3) {
  const manifest = JSON.parse(readFileSync(DRAFT, "utf8"));
  // Dates are deliberately historical; auditing grants no live authorization.
  manifest.approval = { reference: "SYNTHETIC", approvedBy: "fixture", approvedAtIso: NOW };
  manifest.expiresAtIso = "2026-11-25T13:00:00.000Z";
  const manifestBytes = JSON.stringify(manifest);
  const digest = hash(manifestBytes);
  const body = JSON.stringify({ synthetic: SECRET });
  const payloadHash = hash(body);
  const admitted = {
    requestId: "outer-second",
    caseId: "C05",
    turnIndex: 1,
    manifestSha256: digest,
    model: manifest.provider,
    admittedAtIso: NOW,
    requestPayloadSha256: payloadHash,
    inputBytes: Buffer.byteLength(body),
    exactRequestBody: body,
    reservedMicros: 9112,
    simulatedTransport: true,
  };
  const first = {
    requestId: "outer-first",
    caseId: "C05",
    turnIndex: 0,
    model: "gpt-6-luna",
    reservedMicros: 9112,
    state: "settled",
    receipt: { receiptId: "resp-first", chargedMicros: 23 },
    createdAtIso: NOW,
    updatedAtIso: NOW,
  };
  const second = {
    ...first,
    requestId: admitted.requestId,
    turnIndex: 1,
    state: "uncertain",
    receipt: null,
  };
  const records = {
    manifest,
    runStart: {
      manifestSha256: digest,
      manifest,
      runnerVersion: `bfa-conversation-eval-runner-v${version}`,
      simulatedTransport: true,
      startedAtIso: NOW,
    },
    ledger: {
      version: 2,
      budgetMicros: manifest.limits.maxUsdMicros,
      runId: `eval-${digest}`,
      manifestSha256: digest,
      maxDispatchAttempts: manifest.limits.maxDispatchAttempts,
      admissions: [first, second],
    },
    admitted,
    requestStart: {
      requestId: admitted.requestId,
      requestPayloadSha256: payloadHash,
      startedAtIso: NOW,
      state: "dispatch-claimed; outcome uncertain until response evidence",
    },
    turn: {
      caseId: "C05",
      turnIndex: 1,
      requestId: admitted.requestId,
      requestPayloadSha256: payloadHash,
      responseText: SECRET,
      responseSha256: hash(SECRET),
      outcome: "ledger-refused",
      ledgerState: "uncertain",
      estimatedChargeMicros: null,
      transportInvoked: true,
      exchange: {
        requestId: "different-service-request-id",
        requestedModel: "gpt-6-luna",
        requestPayloadSha256: payloadHash,
        didDispatch: true,
        reportedModel: "gpt-6-luna",
        serviceTier: "default",
        responseId: "resp-second",
        providerRequestId: "provider-header-private",
        usage: {
          inputTokens: 100,
          outputTokens: 20,
          totalTokens: 120,
          reasoningTokens: 0,
          cachedInputTokens: 0,
          cacheWriteTokens: null,
        },
        usageConsistent: true,
        latencyMs: 123,
        outcome: "complete",
      },
    },
  };
  return {
    records,
    bytes: (): ReceiptAuditBytes =>
      Object.fromEntries(
        RECEIPT_AUDIT_KEYS.map((key) => [key, JSON.stringify(records[key])]),
      ) as ReceiptAuditBytes,
  };
}
afterEach(() => vi.restoreAllMocks());

describe("historical P4 receipt audit", () => {
  for (const version of [2, 3])
    it(`reads v${version} evidence without misjoining the service request identity`, () => {
      const f = fixture(version);
      expect(auditHistoricalReceipt(f.bytes())).toMatchObject({
        status: "reviewed",
        causalProof: false,
        providerFinalityVerified: false,
        budgetReleaseAuthorized: false,
        checks: {
          runnerV2: version === 2,
          runnerV3: version === 3,
          responseIdLedgerCompatible: true,
          responseIdUsedByOtherRequest: false,
          chargeKnown: true,
          chargeWithinReservation: true,
          usageConsistentAndWithinLimits: true,
          finalLedgerUncertain: true,
          ledgerCountedDispatches: 2,
          knownTransportConflictsWithFinalNonDispatchState: false,
        },
      });
    });

  for (const responseId of ["r".repeat(129), "resp/with-slash"])
    it(`identifies the historical adapter/ledger identifier mismatch (${responseId.length})`, () => {
      const f = fixture();
      f.records.turn.exchange.responseId = responseId;
      expect(auditHistoricalReceipt(f.bytes())).toMatchObject({
        status: "reviewed",
        checks: {
          completeResponseRecorded: true,
          responseIdPresent: true,
          responseIdLedgerCompatible: false,
          responseIdUsedByOtherRequest: false,
          chargeWithinReservation: true,
        },
      });
    });

  it("distinguishes a receipt already settled to another request", () => {
    const f = fixture();
    f.records.turn.exchange.responseId = "resp-first";
    expect(auditHistoricalReceipt(f.bytes())).toMatchObject({
      checks: {
        responseIdLedgerCompatible: true,
        responseIdUsedByOtherRequest: true,
      },
    });
  });

  it("reports an excessive amount separately from ID compatibility", () => {
    const f = fixture();
    f.records.admitted.reservedMicros = 1;
    f.records.ledger.admissions[1].reservedMicros = 1;
    expect(auditHistoricalReceipt(f.bytes())).toMatchObject({
      checks: {
        responseIdLedgerCompatible: true,
        chargeKnown: true,
        chargeWithinReservation: false,
      },
    });
  });

  it("does not invent known usage from a saved consistent flag", () => {
    const f = fixture();
    f.records.turn.exchange.usage.totalTokens = 121;
    expect(auditHistoricalReceipt(f.bytes())).toMatchObject({
      checks: {
        usageConsistentRecorded: true,
        usageConsistentAndWithinLimits: false,
        chargeKnown: false,
        chargeWithinReservation: null,
      },
    });
  });

  it("does not restore upstream-invalid usage when sanitized optional counts are null", () => {
    const f = fixture();
    f.records.turn.exchange.usageConsistent = false;
    expect(auditHistoricalReceipt(f.bytes())).toMatchObject({
      checks: {
        usageConsistentRecorded: false,
        usageConsistentAndWithinLimits: false,
        chargeKnown: true,
      },
    });
  });

  for (const state of ["reserved", "cancelled-before-dispatch"])
    it(`reports final ${state} contradicting a recorded transport without claiming regression cause`, () => {
      const f = fixture();
      f.records.ledger.admissions[1].state = state;
      expect(auditHistoricalReceipt(f.bytes())).toMatchObject({
        causalProof: false,
        checks: {
          knownTransportConflictsWithFinalNonDispatchState: true,
          ledgerCountedDispatches: 1,
        },
      });
    });

  it("identical settled receipt is a match, not duplicate-use on another request", () => {
    const f = fixture();
    const second = f.records.ledger.admissions[1];
    Object.assign(second, {
      state: "settled",
      receipt: { receiptId: "resp-second", chargedMicros: 23 },
    });
    expect(auditHistoricalReceipt(f.bytes())).toMatchObject({
      checks: {
        responseIdUsedByOtherRequest: false,
        settledReceiptMatchesResponse: true,
        settledChargeMatchesRecomputed: true,
      },
    });
  });

  for (const mutate of [
    (f: ReturnType<typeof fixture>) => {
      f.records.runStart.manifestSha256 = "a".repeat(64);
    },
    (f: ReturnType<typeof fixture>) => {
      f.records.ledger.runId = "eval-foreign";
    },
    (f: ReturnType<typeof fixture>) => {
      f.records.ledger.budgetMicros++;
    },
  ])
    it("refuses mismatched manifest/run binding", () => {
      const f = fixture();
      mutate(f);
      expect(auditHistoricalReceipt(f.bytes())).toMatchObject({
        status: "refused",
        refusalCode: "manifest-run-mismatch",
        checks: null,
      });
    });

  for (const mutate of [
    (f: ReturnType<typeof fixture>) => {
      f.records.requestStart.requestId = "foreign";
    },
    (f: ReturnType<typeof fixture>) => {
      f.records.turn.caseId = "C07";
    },
    (f: ReturnType<typeof fixture>) => {
      f.records.admitted.exactRequestBody += " ";
    },
    (f: ReturnType<typeof fixture>) => {
      f.records.turn.responseText += "changed";
    },
    (f: ReturnType<typeof fixture>) => {
      f.records.turn.exchange.requestPayloadSha256 = "a".repeat(64);
    },
    (f: ReturnType<typeof fixture>) => {
      f.records.ledger.admissions.pop();
    },
  ])
    it("refuses mismatched or missing request/payload evidence", () => {
      const f = fixture();
      mutate(f);
      expect(auditHistoricalReceipt(f.bytes())).toMatchObject({
        status: "refused",
        refusalCode: "request-join-mismatch",
        checks: null,
      });
    });

  it("returns fixed allowlisted booleans/counts and no private strings, including parse errors", () => {
    const good = auditHistoricalReceipt(fixture().bytes());
    expect(Object.keys(good).sort()).toEqual([
      "auditVersion",
      "budgetReleaseAuthorized",
      "causalProof",
      "checks",
      "historicalCluesOnly",
      "providerFinalityVerified",
      "refusalCode",
      "status",
    ]);
    expect(
      Object.values(good.checks ?? {}).every(
        (value) => value === null || typeof value === "boolean" || typeof value === "number",
      ),
    ).toBe(true);
    for (const result of [good, auditHistoricalReceipt({ ...fixture().bytes(), turn: SECRET })]) {
      const serialized = JSON.stringify(result);
      for (const hidden of [
        SECRET,
        "outer-second",
        "resp-second",
        "provider-header-private",
        "different-service-request-id",
      ])
        expect(serialized).not.toContain(hidden);
    }
  });

  it("reads only explicit existing files, leaves every byte/name unchanged and never fetches", () => {
    const dir = mkdtempSync(join(tmpdir(), "bfa-receipt-audit-"));
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("network forbidden");
    });
    try {
      const bytes = fixture().bytes();
      const paths = Object.fromEntries(
        RECEIPT_AUDIT_KEYS.map((key) => [key, join(dir, `${key}.json`)]),
      ) as ReceiptAuditPaths;
      for (const key of RECEIPT_AUDIT_KEYS) writeFileSync(paths[key], bytes[key]);
      const names = readdirSync(dir);
      expect(auditHistoricalReceiptFiles(paths).status).toBe("reviewed");
      for (const key of RECEIPT_AUDIT_KEYS)
        expect(readFileSync(paths[key], "utf8")).toBe(bytes[key]);
      expect(readdirSync(dir)).toEqual(names);
      expect(
        auditHistoricalReceiptFiles({ ...paths, ledger: join(dir, "missing.json") }),
      ).toMatchObject({ status: "refused", refusalCode: "unreadable-or-oversized" });
      expect(readdirSync(dir)).toEqual(names);
      expect(fetch).not.toHaveBeenCalled();
      const symlink = join(dir, "symlink.json");
      symlinkSync(paths.ledger, symlink);
      expect(auditHistoricalReceiptFiles({ ...paths, ledger: symlink })).toMatchObject({
        status: "refused",
      });
      const fifo = join(dir, "pipe.json");
      execFileSync("mkfifo", [fifo]);
      expect(auditHistoricalReceiptFiles({ ...paths, ledger: fifo })).toMatchObject({
        status: "refused",
        refusalCode: "unreadable-or-oversized",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a later emitter version instead of silently dropping new evidence", () => {
    expect(auditHistoricalReceipt(fixture(4).bytes())).toMatchObject({
      status: "refused",
      refusalCode: "invalid-artifact",
    });
  });

  it("refuses oversized input and unrecognized artifact fields without echoing them", () => {
    expect(
      auditHistoricalReceipt({ ...fixture().bytes(), manifest: "x".repeat(65_537) }).status,
    ).toBe("refused");
    const f = fixture();
    expect(
      auditHistoricalReceipt({
        ...f.bytes(),
        turn: JSON.stringify({ ...f.records.turn, secret: SECRET }),
      }),
    ).toMatchObject({ status: "refused", checks: null });
  });
});
