/** P3b content-free fictional-unit ledger decisions.
 * Execute decisions inside a database transaction; this is NOT a store,
 * principal verifier, provider adapter or proof of atomic persistence.
 */
import { z } from "zod";

const OpaqueId = z.string().uuid();
const Units = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const AdmissionBindingSchema = z.object({
  ownerId: OpaqueId,
  threadId: OpaqueId,
  threadRevision: Units,
  requestId: OpaqueId,
  mode: z.enum(["text", "voice"]),
  // Keyed digest supplied only by a verified server adapter. Never raw text.
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
export type AdmissionBinding = z.infer<typeof AdmissionBindingSchema>;
export type AdmissionState = "reserved" | "dispatched" | "uncertain" |
  "settled" | "cancelled-before-dispatch";
export interface DurableAdmission {
  readonly binding: AdmissionBinding;
  readonly reservedUnits: number;
  readonly state: AdmissionState;
  readonly receipt: { readonly receiptId: string; readonly chargedUnits: number } | null;
}
export type AdmissionRefusal = "invalid" | "unavailable" | "conflict" | "limit" |
  "consumed" | "stale" | "receipt-conflict";
type Failure = { readonly ok: false; readonly code: AdmissionRefusal };
export type AdmissionDecision = Failure | {
  readonly ok: true;
  readonly admission: DurableAdmission;
  readonly balanceDelta: number;
  readonly dispatch: boolean;
  readonly duplicate: boolean;
};

const validUnits = (n: number): boolean => Units.safeParse(n).success;
function sameBinding(a: AdmissionBinding, b: AdmissionBinding): boolean {
  return a.ownerId === b.ownerId && a.threadId === b.threadId &&
    a.threadRevision === b.threadRevision && a.requestId === b.requestId &&
    a.mode === b.mode && a.fingerprint === b.fingerprint;
}
function validRecord(a: DurableAdmission): boolean {
  return AdmissionBindingSchema.safeParse(a.binding).success && validUnits(a.reservedUnits) &&
    a.reservedUnits > 0 && ["reserved", "dispatched", "uncertain", "settled",
      "cancelled-before-dispatch"].includes(a.state) &&
    (a.state === "settled"
      ? a.receipt !== null && OpaqueId.safeParse(a.receipt.receiptId).success &&
        validUnits(a.receipt.chargedUnits) && a.receipt.chargedUnits <= a.reservedUnits
      : a.receipt === null);
}
function success(a: DurableAdmission, delta = 0, dispatch = false, duplicate = false): AdmissionDecision {
  return { ok: true, admission: structuredClone(a), balanceDelta: delta, dispatch, duplicate };
}

/** Caller MUST verify staging principal/ownership BEFORE looking up ledger data.
 * The database chooses units/balance, never the client. Duplicate admissions
 * acknowledge the existing identity; they never authorize another dispatch.
 */
export function reserveFictionalAdmission(
  binding: AdmissionBinding,
  serverUnits: number,
  serverBalance: number,
  existing: DurableAdmission | null,
): AdmissionDecision {
  if (!AdmissionBindingSchema.safeParse(binding).success || !validUnits(serverUnits) ||
      serverUnits === 0 || !validUnits(serverBalance)) return { ok: false, code: "invalid" };
  if (existing) {
    if (!validRecord(existing)) return { ok: false, code: "unavailable" };
    if (!sameBinding(existing.binding, binding) || existing.reservedUnits !== serverUnits)
      return { ok: false, code: "conflict" };
    return success(existing, 0, false, true);
  }
  if (serverBalance < serverUnits) return { ok: false, code: "limit" };
  return success({ binding: structuredClone(binding), reservedUnits: serverUnits,
    state: "reserved", receipt: null }, -serverUnits);
}

/** A row lock/CAS must commit this transition BEFORE any dispatch. A consumed
 * ticket cannot be dispatched again. Explicit retry requires a NEW identity.
 */
export function claimFictionalDispatch(
  admission: DurableAdmission,
  current: AdmissionBinding,
  ownerStillAdmitted: boolean,
  threadDeleted: boolean,
): AdmissionDecision {
  if (!validRecord(admission) || !AdmissionBindingSchema.safeParse(current).success)
    return { ok: false, code: "invalid" };
  if (!ownerStillAdmitted || threadDeleted || !sameBinding(admission.binding, current))
    return { ok: false, code: "stale" };
  if (admission.state !== "reserved") return { ok: false, code: "consumed" };
  return success({ ...admission, state: "dispatched" }, 0, true);
}

/** Confirmed cancellation before dispatch can release once. Anything after
 * possible dispatch stays reserved: timeout/disconnect/deletion is not a receipt.
 */
export function stopFictionalAdmission(admission: DurableAdmission): AdmissionDecision {
  if (!validRecord(admission)) return { ok: false, code: "invalid" };
  switch (admission.state) {
    case "reserved": return success({ ...admission, state: "cancelled-before-dispatch" }, admission.reservedUnits);
    case "dispatched": return success({ ...admission, state: "uncertain" });
    default: return success(admission, 0, false, true);
  }
}

/** Trusted server reconciliation only. Late identical receipts acknowledge the
 * same terminal state; changed receipts never refund twice or reopen it.
 */
export function reconcileFictionalAdmission(
  admission: DurableAdmission,
  receiptId: string,
  chargedUnits: number,
): AdmissionDecision {
  if (!validRecord(admission) || !OpaqueId.safeParse(receiptId).success ||
      !validUnits(chargedUnits) || chargedUnits > admission.reservedUnits)
    return { ok: false, code: "invalid" };
  if (admission.state === "settled") {
    return admission.receipt?.receiptId === receiptId && admission.receipt.chargedUnits === chargedUnits
      ? success(admission, 0, false, true) : { ok: false, code: "receipt-conflict" };
  }
  if (admission.state !== "dispatched" && admission.state !== "uncertain")
    return { ok: false, code: "consumed" };
  return success({ ...admission, state: "settled", receipt: { receiptId, chargedUnits } },
    admission.reservedUnits - chargedUnits);
}