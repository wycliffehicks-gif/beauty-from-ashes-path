import { describe, expect, it } from "vitest";
import {
  reserveFictionalAdmission, claimFictionalDispatch, stopFictionalAdmission,
  reconcileFictionalAdmission, type AdmissionBinding, type DurableAdmission,
  type AdmissionDecision,
} from "../service/durable-admission";

const binding: AdmissionBinding = {
  ownerId: "11111111-1111-4111-8111-111111111111",
  threadId: "22222222-2222-4222-8222-222222222222",
  requestId: "33333333-3333-4333-8333-333333333333",
  threadRevision: 0, mode: "text", fingerprint: "a".repeat(64),
};
const receiptId = "44444444-4444-4444-8444-444444444444";
function get(d: AdmissionDecision): DurableAdmission {
  if (!d.ok) throw new Error(d.code);
  return d.admission;
}
const reserved = () => get(reserveFictionalAdmission(binding, 1, 1, null));
const dispatched = () => get(claimFictionalDispatch(reserved(), binding, true, false));

describe("P3b pure fictional admission decisions (NOT database evidence)", () => {
  it("one integer allowance admits one reservation and zero balance refuses another", () => {
    expect(reserveFictionalAdmission(binding, 1, 1, null)).toMatchObject({ ok: true, balanceDelta: -1, dispatch: false });
    expect(reserveFictionalAdmission({ ...binding, requestId: receiptId }, 1, 0, null)).toEqual({ ok: false, code: "limit" });
  });
  it("identical request identity never reserves or authorizes a second dispatch", () => {
    const first = reserved();
    expect(reserveFictionalAdmission(binding, 1, 0, first)).toMatchObject({ ok: true, duplicate: true, balanceDelta: 0, dispatch: false });
    const claimed = get(claimFictionalDispatch(first, binding, true, false));
    expect(claimFictionalDispatch(claimed, binding, true, false)).toEqual({ ok: false, code: "consumed" });
  });
  it.each(["ownerId", "threadId", "requestId", "mode", "threadRevision", "fingerprint"] as const)("changed %s fails exact binding", (key) => {
    const different = { ...binding, [key]: key === "threadRevision" ? 1 : key === "mode" ? "voice" : key === "fingerprint" ? "b".repeat(64) : receiptId };
    expect(reserveFictionalAdmission(different, 1, 1, reserved())).toEqual({ ok: false, code: "conflict" });
  });
  it.each([[false, false], [true, true]])("unapproved owner/deletion refuses dispatch without mutation", (admitted, deleted) => {
    const original = reserved();
    expect(claimFictionalDispatch(original, binding, admitted, deleted)).toEqual({ ok: false, code: "stale" });
    expect(original.state).toBe("reserved");
  });
  it("pre-dispatch cancellation releases only once and cannot be dispatched/reconciled", () => {
    const stopped = stopFictionalAdmission(reserved());
    expect(stopped).toMatchObject({ ok: true, balanceDelta: 1 });
    const terminal = get(stopped);
    expect(stopFictionalAdmission(terminal)).toMatchObject({ ok: true, balanceDelta: 0 });
    expect(claimFictionalDispatch(terminal, binding, true, false)).toEqual({ ok: false, code: "consumed" });
    expect(reconcileFictionalAdmission(terminal, receiptId, 0)).toEqual({ ok: false, code: "consumed" });
  });
  it("timeout after possible dispatch retains reservation until reliable receipt", () => {
    const timedOut = get(stopFictionalAdmission(dispatched()));
    expect(timedOut.state).toBe("uncertain");
    expect(stopFictionalAdmission(timedOut)).toMatchObject({ ok: true, balanceDelta: 0, dispatch: false });
    expect(reconcileFictionalAdmission(timedOut, receiptId, 0)).toMatchObject({ ok: true, balanceDelta: 1, admission: { state: "settled" } });
  });
  it("late/duplicate/out-of-order receipts settle once and never reopen terminal state", () => {
    const terminal = get(reconcileFictionalAdmission(dispatched(), receiptId, 0));
    expect(reconcileFictionalAdmission(terminal, receiptId, 0)).toMatchObject({ ok: true, balanceDelta: 0, duplicate: true });
    expect(reconcileFictionalAdmission(terminal, receiptId, 1)).toEqual({ ok: false, code: "receipt-conflict" });
    expect(reconcileFictionalAdmission(terminal, binding.requestId, 0)).toEqual({ ok: false, code: "receipt-conflict" });
    expect(stopFictionalAdmission(terminal)).toMatchObject({ ok: true, balanceDelta: 0, admission: { state: "settled" } });
  });
  it("rejects fractional/negative/unsafe units and unexpected content fields", () => {
    for (const units of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(reserveFictionalAdmission(binding, units, 1, null)).toEqual({ ok: false, code: "invalid" });
    }
    expect(reserveFictionalAdmission({ ...binding, message: "SYNTHETIC_PRIVATE" } as AdmissionBinding, 1, 1, null)).toEqual({ ok: false, code: "invalid" });
  });
  it("ledger contains only non-content binding/state/units/receipt and detached copies", () => {
    const request = { ...binding };
    const admission = get(reserveFictionalAdmission(request, 1, 1, null));
    request.fingerprint = "b".repeat(64);
    expect(admission.binding.fingerprint).toBe("a".repeat(64));
    expect(Object.keys(admission).sort()).toEqual(["binding", "receipt", "reservedUnits", "state"]);
  });
});