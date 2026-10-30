#!/usr/bin/env python3
"""Native capacity races for the runner-owned, disposable PostgreSQL database.

This module prepares independent-backend evidence only when actually executed.
It makes no Auth, HTTP, provider or device request. Importing it opens nothing.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path


_base_path = Path(__file__).resolve().with_name("concurrency.py")
_spec = importlib.util.spec_from_file_location("bfa_p5_native_base", _base_path)
if _spec is None or _spec.loader is None:
    raise ImportError("Cannot load adjacent reviewed native fixture driver")
base = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(base)
literal, claim_sql, uid = base.literal, base.claim_sql, base.uid

CASE_NAMES = (
    "shared pool last slot across independent owners",
    "close commits before waiting create marker",
    "create marker commits before waiting close",
    "duplicate final evidence releases one slot once",
    "trusted contradiction quarantines a waiting replacement marker",
    "global operation identity contends across distinct pools",
    "claim pool wait crosses eligibility expiry",
    "marker pool wait crosses eligibility expiry",
    "marker operation wait crosses eligibility expiry",
)
EXPIRY_CASE_NAMES = (
    "claim pool wait crosses eligibility expiry",
    "marker pool wait crosses eligibility expiry",
    "marker operation wait crosses eligibility expiry",
)


class CapacityDriver(base.Driver):
    def blocked(self, waiter, holder) -> dict:
        self.check(waiter.pid != holder.pid, "Lock waiter and holder are distinct native backends")
        row = super().blocked(waiter, holder)
        # Retain the expected blocker explicitly; pg_blocking_pids is the proof.
        row["holderPid"] = holder.pid
        return row

    def pool(self, active_limit: int = 1) -> str:
        pool = uid()
        self.observer.query(
            "INSERT INTO bfa_p5_capacity.pools(pool_id,active_limit,unit_limit,reservation_units,enabled) "
            f"VALUES({literal(pool)},{active_limit},100,1,true);")
        return pool

    def capacity_fixture(self, pool: str, lifetime_ms: int = 600000) -> dict:
        f = self.fixture(lifetime_ms=lifetime_ms)
        f["pool"] = pool
        self.observer.query(
            "INSERT INTO bfa_p5_capacity.routes(owner_id,quota_policy_id,pool_id) "
            f"VALUES({literal(f['owner'])},{literal(f['policy'])},{literal(pool)});")
        return f

    def capacity_call(self, f: dict, operation: str = "claim", *, operation_id: str | None = None,
                      observation: dict | None = None) -> str:
        if operation in ("claim", "mark"):
            args = f"{literal(f['receipt'])},{claim_sql(f['claim'])}"
        else:
            args = f"{literal(f['cleanup'])},{claim_sql(f['claim'])}"
        if operation == "mark":
            if operation_id is None:
                raise ValueError("An explicit immutable operation identity is required")
            args += f",{literal(operation_id)},1"
        elif operation == "reconcile":
            if observation is None:
                raise ValueError("An exact fictional normalized observation is required")
            args += f",{literal(observation)}::jsonb"
        elif operation not in ("claim", "close"):
            raise ValueError("Unknown capacity fixture operation")
        return f"SELECT public.bfa_p5_capacity_{operation}({args})::text;"

    def pool_state(self, pool: str) -> dict:
        return json.loads(self.observer.scalar(
            "SELECT json_build_object('occupied',occupied,'held',held_units,'quarantined',quarantined)::text "
            f"FROM bfa_p5_capacity.pools WHERE pool_id={literal(pool)};"))

    def allocation(self, f: dict) -> dict | None:
        return json.loads(self.observer.scalar(
            "SELECT COALESCE((SELECT json_build_object('slotHeld',slot_held,'closed',closed,"
            "'operation',operation_id,'terminal',terminal,'session',session_id) "
            f"FROM bfa_p5_capacity.allocations WHERE claim_id={literal(f['claim']['claimId'])}), 'null'::json)::text;"))

    def retained(self, f: dict) -> None:
        self.check(self.state(f) == {"remaining": 9, "claims": 1, "held": 1, "attempts": 1},
                   "Original quota debited once and its cumulative hold retained")

    def admit(self, f: dict) -> None:
        self.ack(self.observer.query(self.capacity_call(f)), f, "claimed")
        self.retained(f)

    def mark(self, f: dict, operation: str) -> None:
        self.register(f, "inspect")
        self.ack(self.observer.query(self.capacity_call(f, "mark", operation_id=operation)), f, "marked")

    def pool_holder(self, pool: str):
        holder = self.session("capacity_pool_holder")
        # The row-only holder is deliberate fault injection, not a product writer.
        holder.query(f"BEGIN; SELECT pool_id FROM bfa_p5_capacity.pools WHERE pool_id={literal(pool)} FOR UPDATE;")
        return holder


def observation(operation: str, kind: str, session: str | None = None) -> dict:
    return {"evidenceId": uid(), "operationId": operation, "kind": kind, "sessionId": session}


def last_slot(d: CapacityDriver) -> None:
    pool = d.pool()
    first, second = d.capacity_fixture(pool), d.capacity_fixture(pool)
    d.check(first["owner"] != second["owner"], "Two owners share one immutable pool")
    winner, waiter = d.session("capacity_winner"), d.session("capacity_waiter")
    d.ack(winner.query("BEGIN; " + d.capacity_call(first)), first, "claimed")
    token = waiter.start(d.capacity_call(second))
    d.blocked(waiter, winner)
    winner.query("COMMIT;")
    d.ack(waiter.finish(token), second, "denied")
    d.retained(first)
    d.check(d.state(second) == {"remaining": 10, "claims": 0, "held": 0, "attempts": 0},
            "Losing owner has no partial claim, attempt winner or quota debit")
    d.check(d.allocation(second) is None, "Losing owner has no partial capacity allocation")
    d.check(d.pool_state(pool) == {"occupied": 1, "held": 1, "quarantined": False},
            "Exactly the final slot and one cumulative pool unit are committed")


def close_before_marker(d: CapacityDriver) -> None:
    pool = d.pool()
    f = d.capacity_fixture(pool)
    d.admit(f)
    d.register(f, "inspect")
    operation = uid()
    closer, marker = d.session("capacity_close_first"), d.session("capacity_late_mark")
    d.ack(closer.query("BEGIN; " + d.capacity_call(f, "close")), f, "closed")
    token = marker.start(d.capacity_call(f, "mark", operation_id=operation))
    d.blocked(marker, closer)
    closer.query("COMMIT;")
    d.ack(marker.finish(token), f, "closed")
    d.check(d.allocation(f) == {"slotHeld": False, "closed": True, "operation": None, "terminal": None, "session": None},
            "Committed close prevents the waiting create marker and releases only its never-started slot")
    d.check(d.pool_state(pool) == {"occupied": 0, "held": 1, "quarantined": False},
            "Pre-marker close retains cumulative pool units")
    d.retained(f)


def marker_before_close(d: CapacityDriver) -> None:
    pool = d.pool()
    f = d.capacity_fixture(pool)
    d.admit(f)
    d.register(f, "inspect")
    operation = uid()
    marker, closer = d.session("capacity_mark_first"), d.session("capacity_late_close")
    d.ack(marker.query("BEGIN; " + d.capacity_call(f, "mark", operation_id=operation)), f, "marked")
    token = closer.start(d.capacity_call(f, "close"))
    d.blocked(closer, marker)
    marker.query("COMMIT;")
    d.ack(closer.finish(token), f, "closed")
    d.check(d.allocation(f) == {"slotHeld": True, "closed": True, "operation": operation, "terminal": None, "session": None},
            "Committed marker keeps closed admission occupancy uncertain")
    d.check(d.pool_state(pool) == {"occupied": 1, "held": 1, "quarantined": False},
            "Close after marker releases neither occupancy nor cumulative pool units")
    d.retained(f)
    final = observation(operation, "ended", "fictional-marker-first")
    d.ack(d.observer.query(d.capacity_call(f, "reconcile", observation=final)), f, "terminal-recorded")
    d.check(d.pool_state(pool) == {"occupied": 0, "held": 1, "quarantined": False},
            "Later exact fictional finality releases only the slot")
    d.retained(f)


def duplicate_finality(d: CapacityDriver) -> None:
    pool = d.pool()
    f = d.capacity_fixture(pool)
    d.admit(f)
    operation = uid()
    d.mark(f, operation)
    final = observation(operation, "ended", "fictional-duplicate-finality")
    first, second = d.session("capacity_final_first"), d.session("capacity_final_duplicate")
    sql = d.capacity_call(f, "reconcile", observation=final)
    d.ack(first.query("BEGIN; " + sql), f, "terminal-recorded")
    token = second.start(sql)
    d.blocked(second, first)
    first.query("COMMIT;")
    d.ack(second.finish(token), f, "duplicate-evidence")
    d.check(d.pool_state(pool) == {"occupied": 0, "held": 1, "quarantined": False},
            "Competing exact finality releases the slot once without a negative counter or refund")
    d.check(d.observer.scalar(f"SELECT count(*) FROM bfa_p5_capacity.evidence WHERE pool_id={literal(pool)};") == "1",
            "The exact evidence identity has one durable observation")
    d.check(d.allocation(f) == {"slotHeld": False, "closed": True, "operation": operation,
                              "terminal": "ended", "session": "fictional-duplicate-finality"},
            "Finality and exact operation/session ownership remain terminal")
    d.retained(f)


def quarantine_pending_marker(d: CapacityDriver) -> None:
    pool = d.pool()
    old, replacement = d.capacity_fixture(pool), d.capacity_fixture(pool)
    d.admit(old)
    operation = uid()
    d.mark(old, operation)
    d.ack(d.observer.query(d.capacity_call(old, "reconcile", observation=observation(operation, "not-created"))), old, "terminal-recorded")
    d.admit(replacement)
    d.register(replacement, "inspect")
    reconciler, marker = d.session("capacity_contradiction"), d.session("capacity_replacement")
    contradiction = observation(operation, "created", "fictional-contradiction")
    d.ack(reconciler.query("BEGIN; " + d.capacity_call(old, "reconcile", observation=contradiction)), old, "quarantined")
    token = marker.start(d.capacity_call(replacement, "mark", operation_id=uid()))
    d.blocked(marker, reconciler)
    reconciler.query("COMMIT;")
    d.ack(marker.finish(token), replacement, "quarantined")
    d.check(d.pool_state(pool) == {"occupied": 1, "held": 2, "quarantined": True},
            "Committed contradiction blocks an already-reserved replacement without clearing counters")
    d.check(d.allocation(replacement)["operation"] is None, "Waiting replacement never receives a create marker")
    d.check(d.observer.scalar(f"SELECT count(*) FROM bfa_p5_capacity.conflicts WHERE pool_id={literal(pool)};") == "1",
            "Contradictory trusted observation is retained")
    d.retained(old)
    d.retained(replacement)
    d.ack(d.observer.query(d.capacity_call(replacement, "close")), replacement, "closed")
    d.check(d.pool_state(pool) == {"occupied": 0, "held": 2, "quarantined": True},
            "Exact cleanup remains available without clearing permanent quarantine or held units")


def operation_identity(d: CapacityDriver) -> None:
    pool_a, pool_b = d.pool(), d.pool()
    first, second = d.capacity_fixture(pool_a), d.capacity_fixture(pool_b)
    for f in (first, second):
        d.admit(f)
        d.register(f, "inspect")
    operation = uid()
    marker, waiter = d.session("capacity_operation_first"), d.session("capacity_operation_waiter")
    d.ack(marker.query("BEGIN; " + d.capacity_call(first, "mark", operation_id=operation)), first, "marked")
    token = waiter.start(d.capacity_call(second, "mark", operation_id=operation))
    row = d.blocked(waiter, marker)
    d.check(row["waitEvent"] == "advisory", "Distinct pools contend at the global operation advisory fence")
    marker.query("COMMIT;")
    d.ack(waiter.finish(token), second, "denied")
    d.check(d.observer.scalar(f"SELECT count(*) FROM bfa_p5_capacity.allocations WHERE operation_id={literal(operation)};") == "1",
            "Exactly one allocation owns the immutable global operation identity")
    d.check(d.allocation(first)["operation"] == operation and d.allocation(second)["operation"] is None,
            "Cross-pool operation collision cannot transfer the winner's marker")
    for pool, f in ((pool_a, first), (pool_b, second)):
        d.check(d.pool_state(pool) == {"occupied": 1, "held": 1, "quarantined": False},
                "Operation collision does not create or refund pool reservations")
        d.retained(f)
    d.ack(d.observer.query(d.capacity_call(second, "close")), second, "closed")
    d.check(d.pool_state(pool_b) == {"occupied": 0, "held": 1, "quarantined": False},
            "Unmarked losing allocation can close without refunding held units")


def wait_expiry(d: CapacityDriver, operation: str, lock: str) -> None:
    pool = d.pool()
    f = d.capacity_fixture(pool, lifetime_ms=4000)
    op_id = uid()
    if operation == "mark":
        d.admit(f)
        d.register(f, "inspect")
    if lock == "pool":
        holder = d.pool_holder(pool)
    else:
        holder = d.session("capacity_operation_holder")
        # Downstream-lock fault injection, never a suggested product lock order.
        holder.query("BEGIN; SELECT pg_advisory_xact_lock(hashtextextended("
                     f"'bfa_p5_capacity_operation:'||{literal(op_id)}::text,0));")
    waiter = d.session("capacity_expiring_" + operation)
    token = waiter.start(d.capacity_call(f, operation, operation_id=op_id if operation == "mark" else None))
    row = d.blocked(waiter, holder)
    if lock == "operation":
        d.check(row["waitEvent"] == "advisory", "Marker waits at the downstream operation fence")
    d.past(f["deadline"])
    holder.query("COMMIT;")
    d.ack(waiter.finish(token), f, "denied")
    d.check(d.observer.scalar(f"SELECT expired_ms IS NOT NULL FROM bfa_p5_voice.cleanup_owners WHERE cleanup_id={literal(f['cleanup'])};") == "t",
            "Eligibility expiry observed after the lock wait commits its terminal fence")
    if operation == "claim":
        d.check(d.state(f) == {"remaining": 10, "claims": 0, "held": 0, "attempts": 0},
                "Expired waiting claim creates no partial quota debit or attempt winner")
        d.check(d.allocation(f) is None, "Expired waiting claim creates no capacity allocation")
        expected_held = 0
    else:
        d.check(d.allocation(f) == {"slotHeld": False, "closed": True, "operation": None, "terminal": None, "session": None},
                "Expired waiting marker never starts and terminally releases its unmarked slot")
        d.retained(f)
        expected_held = 1
    d.check(d.pool_state(pool) == {"occupied": 0, "held": expected_held, "quarantined": False},
            "Expiry does not acquire capacity or refund previously held units")


def cases(driver: CapacityDriver) -> list[tuple[str, object]]:
    functions = (
        lambda: last_slot(driver),
        lambda: close_before_marker(driver),
        lambda: marker_before_close(driver),
        lambda: duplicate_finality(driver),
        lambda: quarantine_pending_marker(driver),
        lambda: operation_identity(driver),
        lambda: wait_expiry(driver, "claim", "pool"),
        lambda: wait_expiry(driver, "mark", "pool"),
        lambda: wait_expiry(driver, "mark", "operation"),
    )
    return list(zip(CASE_NAMES, functions, strict=True))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--psql", required=True)
    parser.add_argument("--socket", required=True)
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--database", default=base.DATABASE, choices=[base.DATABASE])
    parser.add_argument("--user", default="bfa_fixture_admin", choices=["bfa_fixture_admin"])
    parser.add_argument("--output", required=True)
    parser.add_argument("--log-dir")
    args = parser.parse_args()
    try:
        base.validate_connection_arguments(args)
    except ValueError as error:
        parser.error(str(error))
    driver = CapacityDriver(args)
    try:
        result = {"suite": "P5 disposable local PostgreSQL capacity concurrency",
                  "serverVersion": driver.observer.scalar("SHOW server_version;"),
                  "cases": [driver.run(name, fn) for name, fn in cases(driver)],
                  "limitations": ["Fictional protected local records, not production Auth or HTTP acceptance.",
                                  "Whole-operation observations are fictional normalized input, not authenticated provider finality.",
                                  "Pool/operation lock holders deliberately inject downstream contention; product writers must follow reviewed lock order.",
                                  "Generic reservation units are not money, a refund policy or paid dispatch permission."]}
        result["passed"] = sum(case["status"] == "passed" for case in result["cases"])
        result["failed"] = len(result["cases"]) - result["passed"]
        root = Path(__file__).resolve().parents[3]
        sources = [Path(__file__).resolve(), _base_path,
                   root / "docs/pilot/conversation/sql-drafts/p5-voice-admission.sql",
                   root / "docs/pilot/conversation/sql-drafts/p5-voice-capacity.sql"]
        result["sourceSha256"] = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps({"passed": result["passed"], "failed": result["failed"], "output": args.output}))
        return 1 if result["failed"] else 0
    finally:
        driver.observer.close()


if __name__ == "__main__":
    raise SystemExit(main())
