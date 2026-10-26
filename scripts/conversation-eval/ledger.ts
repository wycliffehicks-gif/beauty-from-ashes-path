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
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { dirname } from "node:path";

export const EVAL_LEDGER_VERSION = 2;
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

export interface EvalLedgerBinding {
  readonly runId: string;
  readonly manifestSha256: string;
  readonly maxDispatchAttempts: number;
}

interface LedgerFile {
  version: number;
  budgetMicros: number;
  /** Exact run/manifest binding: reopening with a different approved cap,
   * run identity or manifest digest is refused WITHOUT rewriting state. */
  runId: string;
  manifestSha256: string;
  maxDispatchAttempts: number;
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
const validMaxDispatches = (n: unknown): n is number =>
  typeof n === "number" && Number.isSafeInteger(n) && n >= 1 && n <= 9;
const validBinding = (b: EvalLedgerBinding): boolean =>
  !!b && validId(b.runId) && /^[0-9a-f]{64}$/.test(b.manifestSha256) &&
  validMaxDispatches(b.maxDispatchAttempts);
const countedDispatch = (a: EvalAdmission): boolean =>
  a.state === "dispatched" || a.state === "uncertain" || a.state === "settled";
const caseIdentity = (a: Pick<EvalAdmission, "caseId" | "turnIndex" | "model">) =>
  `${a.caseId}:${a.turnIndex}:${a.model}`;
const outstanding = (admissions: readonly EvalAdmission[]): number =>
  admissions.reduce((sum, a) => sum + (a.state === "cancelled-before-dispatch" ? 0 :
    a.state === "settled" ? a.receipt!.chargedMicros : a.reservedMicros), 0);
const validIso = (v: unknown): v is string =>
  typeof v === "string" && Number.isFinite(Date.parse(v));

function validAdmission(a: unknown): a is EvalAdmission {
  if (!a || typeof a !== "object" || Array.isArray(a)) return false;
  const r = a as Record<string, unknown>;
  if (Object.keys(r).sort().join(",") !== "caseId,createdAtIso,model,receipt,requestId,reservedMicros,state,turnIndex,updatedAtIso") return false;
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
      Object.keys(receipt).sort().join(",") === "chargedMicros,receiptId" &&
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
  if (Object.keys(r).sort().join(",") !== "admissions,budgetMicros,manifestSha256,maxDispatchAttempts,runId,version") return false;
  if (
    r.version !== EVAL_LEDGER_VERSION ||
    !validMicros(r.budgetMicros) || r.budgetMicros === 0 ||
    !validMaxDispatches(r.maxDispatchAttempts) ||
    !validId(r.runId) ||
    typeof r.manifestSha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(r.manifestSha256) ||
    !Array.isArray(r.admissions) ||
    r.admissions.length > EVAL_LEDGER_MAX_ADMISSIONS ||
    !r.admissions.every(validAdmission) ||
    new Set((r.admissions as EvalAdmission[]).map((a) => a.requestId)).size !==
      r.admissions.length
  ) {
    return false;
  }
  // A provider receipt is bound to ONE request: no two settled admissions may
  // carry the same receipt identity.
  const receiptIds = (r.admissions as EvalAdmission[])
    .filter((a) => a.state === "settled")
    .map((a) => a.receipt!.receiptId);
  const admissions = r.admissions as EvalAdmission[];
  return new Set(receiptIds).size === receiptIds.length &&
    new Set(admissions.map(caseIdentity)).size === admissions.length &&
    admissions.filter(countedDispatch).length <= (r.maxDispatchAttempts as number) &&
    outstanding(admissions) <= (r.budgetMicros as number);
}

export class EvalLedgerError extends Error {
  readonly code: "locked" | "corrupt" | "binding-mismatch";
  constructor(code: "locked" | "corrupt" | "binding-mismatch") {
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
  private readonly path: string;
  private readonly now: () => string;
  private readonly budgetMicros: number;
  private readonly binding: EvalLedgerBinding;

  private constructor(path: string, budgetMicros: number, binding: EvalLedgerBinding, now: () => string) {
    this.path = path;
    this.budgetMicros = budgetMicros;
    this.binding = { ...binding };
    this.now = now;
  }

  /** Every open and transaction binds the same run, manifest, count and cap. */
  static open(
    path: string,
    budgetMicros: number,
    binding: EvalLedgerBinding,
    now: () => string = () => new Date().toISOString(),
  ): EvalLedger {
    if (!validMicros(budgetMicros) || budgetMicros === 0 || !validBinding(binding)) {
      throw new EvalLedgerError("corrupt");
    }
    const ledger = new EvalLedger(path, budgetMicros, binding, now);
    if (!existsSync(path)) {
      const lockPath = `${path}.lock`;
      let fd: number;
      try { fd = openSync(lockPath, "wx"); }
      catch { throw new EvalLedgerError("locked"); }
      try {
        // A competing creator may have completed between the existence check
        // and our lock acquisition. Never overwrite its authoritative state.
        if (!existsSync(path)) ledger.write({
          version: EVAL_LEDGER_VERSION, budgetMicros, ...binding, admissions: [],
        });
      } finally {
        closeSync(fd);
        unlinkSync(lockPath);
      }
    }
    ledger.read();
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
    if (parsed.budgetMicros !== this.budgetMicros ||
      parsed.runId !== this.binding.runId ||
      parsed.manifestSha256 !== this.binding.manifestSha256 ||
      parsed.maxDispatchAttempts !== this.binding.maxDispatchAttempts) {
      throw new EvalLedgerError("binding-mismatch");
    }
    return parsed;
  }

  private write(file: LedgerFile): void {
    const tmp = `${this.path}.tmp`;
    const fd = openSync(tmp, "w");
    try {
      writeSync(fd, JSON.stringify(file, null, 2) + "\n");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, this.path);
    const dirFd = openSync(dirname(this.path), "r");
    try { fsyncSync(dirFd); } finally { closeSync(dirFd); }
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
      if (next !== file) {
        if (!validFile(next)) throw new EvalLedgerError("corrupt");
        this.write(next);
      }
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
    return outstanding(this.read().admissions);
  }

  /** Includes uncertain and settled attempts; restarting never resets count. */
  dispatchedAttempts(): number {
    return this.read().admissions.filter(countedDispatch).length;
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
    return this.transact<EvalLedgerResult>((file) => {
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
      // Case identity is independent of request/evidence-directory identity.
      // No automatic retry, including a cancelled pre-dispatch reservation.
      if (file.admissions.some((a) => caseIdentity(a) === caseIdentity(input))) {
        return { file, result: { ok: false as const, code: "conflict" as const } };
      }
      if (file.admissions.length >= EVAL_LEDGER_MAX_ADMISSIONS ||
        file.admissions.filter(countedDispatch).length >= file.maxDispatchAttempts ||
        outstanding(file.admissions) + input.reservedMicros > file.budgetMicros) {
        return { file, result: { ok: false as const, code: "limit" as const } };
      }
      const nowIso = this.now();
      if (!validIso(nowIso)) throw new EvalLedgerError("corrupt");
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
    if (!validId(requestId)) return { ok: false, code: "invalid" };
    return this.transact<EvalLedgerResult>((file) => {
      const a = file.admissions.find((x) => x.requestId === requestId);
      if (!a) return { file, result: { ok: false as const, code: "invalid" as const } };
      if (a.state !== "reserved") return { file, result: { ok: false as const, code: "consumed" as const } };
      if (file.admissions.filter(countedDispatch).length >= file.maxDispatchAttempts) {
        return { file, result: { ok: false as const, code: "limit" as const } };
      }
      const next: EvalAdmission = { ...a, state: "dispatched", updatedAtIso: this.now() };
      return {
        file: { ...file, admissions: file.admissions.map((x) => x.requestId === requestId ? next : x) },
        result: { ok: true as const, admission: next, duplicate: false },
      };
    });
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
      return a; // terminal states acknowledge unchanged (duplicate)
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
    return this.transact<EvalLedgerResult>((file) => {
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
      if (file.admissions.some((x) => x.requestId !== requestId && x.receipt?.receiptId === receiptId)) {
        return { file, result: { ok: false as const, code: "receipt-conflict" as const } };
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
    return this.transact<EvalLedgerResult>((file) => {
      const a = file.admissions.find((x) => x.requestId === requestId);
      if (!a) return { file, result: { ok: false as const, code: "invalid" as const } };
      const next = step(a);
      if (!next) return { file, result: { ok: false as const, code: "consumed" as const } };
      if (next === a) {
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
