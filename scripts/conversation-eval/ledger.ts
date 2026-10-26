// Conversation P4 evaluator — durable single-host admission ledger.
//
// SCOPE LIMIT (explicit): this is a SINGLE-HOST, SHARED-FILE ledger for the
// isolated evaluator only. Cross-process exclusion comes from an atomically
// created lock file; every mutation is lock → re-read → apply → atomic
// rename → unlock. It is NOT a distributed or production store. It fails
// CLOSED on a held lock, corruption or ambiguous state, and never breaks a
// lock automatically.
//
// Semantics mirror the P3b durable admission rules: duplicate request
// identities acknowledge without a second reservation or dispatch; a claimed
// dispatch cannot be re-claimed; stopping after possible dispatch keeps an
// UNCERTAIN hold until trusted reconciliation; identical receipts are
// idempotent, changed receipts conflict, and nothing refunds twice. The v5
// ledger is never reused: this ledger has its own file, version and shape.
//
// Content-free: request/case identities, model, micro-USD amounts and state
// only — never message or response text.

import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from "node:fs";

export const EVAL_LEDGER_VERSION = 1;
export const EVAL_LEDGER_MAX_ADMISSIONS = 10_000;

export type EvalAdmissionState =
  | "reserved"
  | "dispatched"
  | "uncertain"
  | "settled"
  | "cancelled-before-dispatch";

export interface EvalAdmission {
  readonly requestId: string;
  readonly caseId: string;
  readonly turnIndex: number;
  readonly model: string;
  readonly reservedMicros: number;
  readonly state: EvalAdmissionState;
  readonly receipt: { readonly receiptId: string; readonly chargedMicros: number } | null;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
}

interface LedgerFile {
  version: number;
  budgetMicros: number;
  admissions: EvalAdmission[];
}

export type EvalLedgerRefusal =
  | "invalid"
  | "locked"
  | "corrupt"
  | "conflict"
  | "limit"
  | "consumed"
  | "receipt-conflict";

export type EvalLedgerResult =
  | { readonly ok: true; readonly admission: EvalAdmission; readonly duplicate: boolean }
  | { readonly ok: false; readonly code: EvalLedgerRefusal };

const MICROS = /^[0-9]+$/;
const validMicros = (n: unknown): n is number =>
  typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n <= 1_000_000_000_000;
const validId = (v: unknown): v is string =>
  typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(v);
const validIso = (v: unknown): v is string =>
  typeof v === "string" && Number.isFinite(Date.parse(v));

function validAdmission(a: unknown): a is EvalAdmission {
  if (!a || typeof a !== "object" || Array.isArray(a)) return false;
  const r = a as Record<string, unknown>;
  const states: EvalAdmissionState[] = [
    "reserved",
    "dispatched",
    "uncertain",
    "settled",
    "cancelled-before-dispatch",
  ];
  if (
    !validId(r.requestId) ||
    !validId(r.caseId) ||
    !Number.isSafeInteger(r.turnIndex) ||
    (r.turnIndex as number) < 0 ||
    !validId(r.model) ||
    !validMicros(r.reservedMicros) ||
    (r.reservedMicros as number) === 0 ||
    !states.includes(r.state as EvalAdmissionState) ||
    !validIso(r.createdAtIso) ||
    !validIso(r.updatedAtIso)
  ) {
    return false;
  }
  if (r.state === "settled") {
    const receipt = r.receipt as Record<string, unknown> | null;
    return (
      !!receipt &&
      validId(receipt.receiptId) &&
      validMicros(receipt.chargedMicros) &&
      (receipt.chargedMicros as number) <= (r.reservedMicros as number)
    );
  }
  return r.receipt === null;
}

function validFile(f: unknown): f is LedgerFile {
  if (!f || typeof f !== "object" || Array.isArray(f)) return false;
  const r = f as Record<string, unknown>;
  return (
    r.version === EVAL_LEDGER_VERSION &&
    validMicros(r.budgetMicros) &&
    Array.isArray(r.admissions) &&
    r.admissions.length <= EVAL_LEDGER_MAX_ADMISSIONS &&
    r.admissions.every(validAdmission) &&
    new Set((r.admissions as EvalAdmission[]).map((a) => a.requestId)).size ===
      r.admissions.length
  );
}

export class EvalLedgerError extends Error {
  readonly code: "locked" | "corrupt";
  constructor(code: "locked" | "corrupt") {
    super(`ledger-${code}`);
    this.name = "EvalLedgerError";
    this.code = code;
  }
}

/**
 * Durable evaluator ledger. Construct with open(); every operation is one
 * locked transaction. NEVER reuse the v5 ledger file.
 */
export class EvalLedger {
  private constructor(
    private readonly path: string,
    private readonly now: () => string,
  ) {}

  /** Create the ledger file if absent (budget fixed at creation); load it. */
  static open(path: string, budgetMicros: number, now: () => string = () => new Date().toISOString()): EvalLedger {
    if (!validMicros(budgetMicros) || budgetMicros === 0) {
      throw new EvalLedgerError("corrupt");
    }
    if (!existsSync(path)) {
      const initial: LedgerFile = { version: EVAL_LEDGER_VERSION, budgetMicros, admissions: [] };
      // 'wx' fails if another creator raced us — fail closed, never overwrite.
      const fd = openSync(path, "wx");
      try {
        writeSync(fd, JSON.stringify(initial, null, 2) + "\n");
      } finally {
        closeSync(fd);
      }
    }
    const ledger = new EvalLedger(path, now);
    ledger.read(); // Validates immediately: corruption fails closed at open.
    return ledger;
  }

  private read(): LedgerFile {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(this.path, "utf8"));
    } catch {
      throw new EvalLedgerError("corrupt");
    }
    if (!validFile(parsed)) throw new EvalLedgerError("corrupt");
    return parsed;
  }

  private write(file: LedgerFile): void {
    const tmp = `${this.path}.tmp`;
    const fd = openSync(tmp, "w");
    try {
      writeSync(fd, JSON.stringify(file, null, 2) + "\n");
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, this.path);
  }

  /** One locked transaction. A pre-existing lock fails closed. */
  private transact<T>(fn: (file: LedgerFile) => { file: LedgerFile; result: T }): T {
    const lockPath = `${this.path}.lock`;
    let lockFd: number;
    try {
      lockFd = openSync(lockPath, "wx");
    } catch {
      throw new EvalLedgerError("locked");
    }
    try {
      const file = this.read();
      const { file: next, result } = fn(file);
      if (next !== file) this.write(next);
      return result;
    } finally {
      closeSync(lockFd);
      try {
        unlinkSync(lockPath);
      } catch {
        // A missing lock at unlock means external interference; next open fails closed.
      }
    }
  }

  admissions(): readonly EvalAdmission[] {
    return this.read().admissions;
  }

  /** Outstanding = held by non-terminal admissions plus settled charges. */
  outstandingMicros(): number {
    return this.read().admissions.reduce((sum, a) => {
      if (a.state === "cancelled-before-dispatch") return sum;
      if (a.state === "settled") return sum + (a.receipt?.chargedMicros ?? 0);
      return sum + a.reservedMicros;
    }, 0);
  }

  reserve(input: {
    requestId: string;
    caseId: string;
    turnIndex: number;
    model: string;
    reservedMicros: number;
  }): EvalLedgerResult {
    if (
      !validId(input.requestId) ||
      !validId(input.caseId) ||
      !Number.isSafeInteger(input.turnIndex) ||
      input.turnIndex < 0 ||
      !validId(input.model) ||
      !validMicros(input.reservedMicros) ||
      input.reservedMicros === 0 ||
      !MICROS.test(String(input.reservedMicros))
    ) {
      return { ok: false, code: "invalid" };
    }
    return this.transact((file) => {
      const existing = file.admissions.find((a) => a.requestId === input.requestId);
      if (existing) {
        const same =
          existing.caseId === input.caseId &&
          existing.turnIndex === input.turnIndex &&
          existing.model === input.model &&
          existing.reservedMicros === input.reservedMicros;
        return {
          file,
          result: same
            ? { ok: true as const, admission: existing, duplicate: true }
            : { ok: false as const, code: "conflict" as const },
        };
      }
      const outstanding = file.admissions.reduce((sum, a) => {
        if (a.state === "cancelled-before-dispatch") return sum;
        if (a.state === "settled") return sum + (a.receipt?.chargedMicros ?? 0);
        return sum + a.reservedMicros;
      }, 0);
      if (outstanding + input.reservedMicros > file.budgetMicros) {
        return { file, result: { ok: false as const, code: "limit" as const } };
      }
      const nowIso = this.now();
      const admission: EvalAdmission = {
        requestId: input.requestId,
        caseId: input.caseId,
        turnIndex: input.turnIndex,
        model: input.model,
        reservedMicros: input.reservedMicros,
        state: "reserved",
        receipt: null,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };
      return {
        file: { ...file, admissions: [...file.admissions, admission] },
        result: { ok: true as const, admission, duplicate: false },
      };
    });
  }

  /** reserved → dispatched, once. A consumed ticket cannot dispatch again. */
  claim(requestId: string): EvalLedgerResult {
    return this.transition(requestId, (a) =>
      a.state === "reserved"
        ? { ...a, state: "dispatched" as const, updatedAtIso: this.now() }
        : null,
    );
  }

  /**
   * Stop/timeout: reserved → cancelled-before-dispatch (release once);
   * dispatched → uncertain (the reservation is RETAINED; abort never proves
   * unpaid cancellation). Terminal states acknowledge unchanged.
   */
  stop(requestId: string): EvalLedgerResult {
    return this.transition(requestId, (a) => {
      if (a.state === "reserved") {
        return { ...a, state: "cancelled-before-dispatch" as const, updatedAtIso: this.now() };
      }
      if (a.state === "dispatched") {
        return { ...a, state: "uncertain" as const, updatedAtIso: this.now() };
      }
      return { ...a, updatedAtIso: a.updatedAtIso };
    });
  }

  /**
   * Trusted reconciliation only. Identical receipts are idempotent; changed
   * receipts conflict; cancelled reservations can never be settled; no
   * double refund and no reopening terminal state.
   */
  reconcile(requestId: string, receiptId: string, chargedMicros: number): EvalLedgerResult {
    if (!validId(receiptId) || !validMicros(chargedMicros)) {
      return { ok: false, code: "invalid" };
    }
    return this.transact((file) => {
      const a = file.admissions.find((x) => x.requestId === requestId);
      if (!a) return { file, result: { ok: false as const, code: "invalid" as const } };
      if (chargedMicros > a.reservedMicros) {
        return { file, result: { ok: false as const, code: "invalid" as const } };
      }
      if (a.state === "settled") {
        const same =
          a.receipt?.receiptId === receiptId && a.receipt.chargedMicros === chargedMicros;
        return {
          file,
          result: same
            ? { ok: true as const, admission: a, duplicate: true }
            : { ok: false as const, code: "receipt-conflict" as const },
        };
      }
      if (a.state !== "dispatched" && a.state !== "uncertain") {
        return { file, result: { ok: false as const, code: "consumed" as const } };
      }
      const next: EvalAdmission = {
        ...a,
        state: "settled",
        receipt: { receiptId, chargedMicros },
        updatedAtIso: this.now(),
      };
      return {
        file: {
          ...file,
          admissions: file.admissions.map((x) => (x.requestId === requestId ? next : x)),
        },
        result: { ok: true as const, admission: next, duplicate: false },
      };
    });
  }

  private transition(
    requestId: string,
    step: (a: EvalAdmission) => EvalAdmission | null,
  ): EvalLedgerResult {
    if (!validId(requestId)) return { ok: false, code: "invalid" };
    return this.transact((file) => {
      const a = file.admissions.find((x) => x.requestId === requestId);
      if (!a) return { file, result: { ok: false as const, code: "invalid" as const } };
      const next = step(a);
      if (!next) return { file, result: { ok: false as const, code: "consumed" as const } };
      if (next === a || next.updatedAtIso === a.updatedAtIso) {
        return { file, result: { ok: true as const, admission: a, duplicate: true } };
      }
      return {
        file: {
          ...file,
          admissions: file.admissions.map((x) => (x.requestId === requestId ? next : x)),
        },
        result: { ok: true as const, admission: next, duplicate: false },
      };
    });
  }
}
