#!/usr/bin/env python3
"""Exercise the proposed P5 SQL using independent local PostgreSQL sessions.

Only the disposable runner-created Unix-socket fixture database is accepted.
This is database evidence, not Auth, HTTP, provider or production acceptance.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import queue
import stat
import subprocess
import threading
import time
import uuid


DATABASE = "bfa_p5_offline_fixture"
TIMEOUT = 15.0


def uid() -> str:
    return str(uuid.uuid4())


def literal(value: object) -> str:
    if not isinstance(value, str):
        value = json.dumps(value, separators=(",", ":"))
    return "'" + value.replace("'", "''") + "'"


def claim_sql(claim: dict) -> str:
    return literal(claim) + "::jsonb"


class Session:
    def __init__(self, driver: "Driver", name: str):
        self.driver = driver
        self.name = "bfa_p5_" + name + "_" + uuid.uuid4().hex[:8]
        self.lines: queue.Queue[str | None] = queue.Queue()
        self.log = (driver.log_dir / (self.name + ".log")).open("w")
        env = driver.env | {"PGAPPNAME": self.name}
        self.process = subprocess.Popen(driver.command, stdin=subprocess.PIPE,
                                        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                        text=True, bufsize=1, env=env)
        driver.sessions.append(self)
        self.reader = threading.Thread(target=self._read, daemon=True)
        self.reader.start()
        self.pid = int(self.query("SELECT pg_backend_pid();")[0])

    def _read(self) -> None:
        assert self.process.stdout is not None
        for line in self.process.stdout:
            self.log.write(line)
            self.log.flush()
            self.lines.put(line.rstrip("\n"))
        self.lines.put(None)

    def start(self, sql: str) -> str:
        token = "END_" + uuid.uuid4().hex
        assert self.process.stdin is not None
        self.log.write("\n-- SENT SQL --\n" + sql + "\n")
        self.log.flush()
        self.process.stdin.write(sql + "\n\\echo " + token + "\n")
        self.process.stdin.flush()
        return token

    def finish(self, token: str, timeout: float = TIMEOUT) -> list[str]:
        deadline = time.monotonic() + timeout
        result = []
        while time.monotonic() < deadline:
            try:
                line = self.lines.get(timeout=max(0.01, deadline - time.monotonic()))
            except queue.Empty as error:
                raise AssertionError(f"{self.name}: response deadline exceeded") from error
            if line is None:
                raise AssertionError(f"{self.name}: psql exited before completion: {result}")
            if line == token:
                return result
            if line:
                result.append(line)
        raise AssertionError(f"{self.name}: response deadline exceeded")

    def query(self, sql: str) -> list[str]:
        return self.finish(self.start(sql))

    def scalar(self, sql: str) -> str:
        result = self.query(sql)
        if len(result) != 1:
            raise AssertionError(f"Expected one scalar, got {result}")
        return result[0]

    def close(self) -> None:
        try:
            if self.process.poll() is None:
                assert self.process.stdin is not None
                self.process.stdin.close()
                try:
                    self.process.wait(timeout=1)
                except subprocess.TimeoutExpired:
                    self.process.terminate()
                    try:
                        self.process.wait(timeout=2)
                    except subprocess.TimeoutExpired:
                        self.process.kill()
                        self.process.wait(timeout=2)
        finally:
            self.reader.join(timeout=2)
            if self.process.stdout is not None:
                self.process.stdout.close()
            self.log.close()


class Driver:
    def __init__(self, args: argparse.Namespace):
        self.log_dir = Path(args.log_dir or Path(args.output).parent / "concurrency-logs").resolve()
        self.log_dir.mkdir(parents=True, exist_ok=True)
        config = self.log_dir / ("empty-client-config-" + uuid.uuid4().hex)
        config.mkdir(mode=0o700)
        self.env = {
            "PATH": os.defpath, "LC_ALL": "C", "HOME": str(config),
            "PGSYSCONFDIR": str(config), "PGPASSFILE": str(config / "no-password-file"),
            "PGSERVICEFILE": str(config / "no-service-file"),
            "PGCONNECT_TIMEOUT": "5",
            "PGOPTIONS": "-c statement_timeout=12000 -c lock_timeout=10000 -c idle_in_transaction_session_timeout=18000",
        }
        self.command = [args.psql, "-X", "-A", "-t", "-q", "-w", "-v", "ON_ERROR_STOP=1",
                        "-h", args.socket, "-p", str(args.port), "-U", args.user,
                        "-d", DATABASE]
        self.sessions: list[Session] = []
        self.current: dict = {}
        try:
            self.observer = Session(self, "observer")
            guard = json.loads(self.observer.scalar("SELECT json_build_object('database',current_database(),"
                                               "'local',inet_server_addr() IS NULL,'user',current_user);"))
            if guard != {"database": DATABASE, "local": True, "user": "bfa_fixture_admin"}:
                raise ValueError(f"Unexpected local fixture identity: {guard}")
        except Exception:
            for session in reversed(self.sessions):
                session.close()
            raise

    def session(self, name: str) -> Session:
        return Session(self, name)

    def check(self, value: bool, label: str) -> None:
        if not value:
            raise AssertionError(label)
        self.current["checks"].append(label)

    def blocked(self, waiter: Session, holder: Session) -> dict:
        deadline = time.monotonic() + 5.0
        while time.monotonic() < deadline:
            result = self.observer.scalar(
                "SELECT COALESCE((SELECT json_build_object('pid',pid,'state',state,"
                "'waitType',wait_event_type,'waitEvent',wait_event,'blockers',pg_blocking_pids(pid)) "
                f"FROM pg_stat_activity WHERE pid={waiter.pid}), '{{}}'::json)::text;")
            row = json.loads(result)
            if row.get("state") == "active" and row.get("waitType") == "Lock" and holder.pid in row.get("blockers", []):
                self.current["barriers"].append(row)
                return row
            if waiter.process.poll() is not None:
                raise AssertionError("Worker exited before observed database lock barrier")
            time.sleep(0.025)
        raise AssertionError(f"No observed lock barrier: waiter {waiter.pid}, holder {holder.pid}, last {row}")

    def past(self, deadline_ms: int) -> None:
        before = int(self.observer.scalar("SELECT bfa_p5_voice.ms();"))
        self.check(before < deadline_ms, "Database wait barrier observed before expiry")
        timeout = time.monotonic() + 8.0
        while time.monotonic() < timeout:
            now = int(self.observer.scalar("SELECT bfa_p5_voice.ms();"))
            if now >= deadline_ms:
                self.current["barriers"].append({"kind": "database-clock", "deadlineMs": deadline_ms, "observedMs": now})
                return
            time.sleep(0.025)
        raise AssertionError("Database clock did not reach fixture expiry within bounded wait")

    def state(self, fixture: dict) -> dict:
        owner, policy = fixture["owner"], fixture["policy"]
        return json.loads(self.observer.scalar(
            "SELECT json_build_object("
            f"'remaining',(SELECT remaining_units FROM bfa_p5_voice.quotas WHERE owner_id={literal(owner)} AND policy_id={literal(policy)}),"
            f"'claims',(SELECT count(*) FROM bfa_p5_voice.claims WHERE owner_id={literal(owner)}),"
            f"'held',(SELECT COALESCE(sum(held_units),0) FROM bfa_p5_voice.claims WHERE owner_id={literal(owner)}),"
            f"'attempts',(SELECT count(*) FROM bfa_p5_voice.attempts WHERE owner_id={literal(owner)}))::text;"))

    def fixture(self, lifetime_ms: int = 600000, units: int = 10, shared: dict | None = None) -> dict:
        f = {"owner": uid(), "thread": uid(), "session": uid(), "attempt": uid(),
             "approval": uid(), "policy": uid(), "cleanup": uid(), "fingerprint": uuid.uuid4().hex + uuid.uuid4().hex}
        now = int(self.observer.scalar("SELECT bfa_p5_voice.ms();"))
        f["deadline"] = now + lifetime_ms
        if shared:
            for key in ("owner", "session", "policy", "deadline"):
                f[key] = shared[key]
        else:
            self.observer.query(
                f"INSERT INTO public.bfa_p3b_staging_accounts(user_id,admitted,expires_at) VALUES({literal(f['owner'])},true,to_timestamp({f['deadline']}/1000.0));"
                f"INSERT INTO bfa_p5_voice.session_fences VALUES({literal(f['owner'])},{literal(f['session'])},0,{f['deadline']},false);"
                f"INSERT INTO bfa_p5_voice.quotas VALUES({literal(f['owner'])},{literal(f['policy'])},{units},1,true);")
        self.observer.query(f"INSERT INTO public.bfa_p3b_threads(id,owner_id) VALUES({literal(f['thread'])},{literal(f['owner'])});")
        f["incarnation"] = self.observer.scalar(f"SELECT public.bfa_p5_voice_register_generation({literal(f['owner'])},{literal(f['thread'])});")
        self.observer.query(
            f"INSERT INTO bfa_p5_voice.approvals VALUES({literal(f['approval'])},repeat('b',64),{literal(f['owner'])},{literal(f['thread'])},{literal(f['incarnation'])},0,{literal(f['attempt'])},'developer-voice-session',{f['deadline']},false,{literal(f['policy'])});")
        issued = self.observer.scalar(f"SELECT public.bfa_p5_voice_register_issuance({literal(f['owner'])},{literal(f['thread'])},{literal(f['incarnation'])},0,{literal(f['fingerprint'])},{now},{f['deadline']});")
        self.check(issued == "t", "Fictional exact issuance registered")
        f["claim"] = {"claimId": uid(), "expiresAt": f["deadline"], "binding": {
            "ownerId": f["owner"], "threadId": f["thread"], "threadIncarnation": f["incarnation"],
            "threadRevision": 0, "attemptId": f["attempt"], "approvalId": f["approval"],
            "approvalDigest": "b" * 64, "scope": "developer-voice-session"}}
        self.register(f)
        return f

    def register(self, f: dict, operation: str = "claim") -> dict:
        self.observer.query(f"SELECT public.bfa_p5_voice_register_cleanup({literal(f['cleanup'])},{claim_sql(f['claim'])});")
        now = int(self.observer.scalar("SELECT bfa_p5_voice.ms();"))
        proof = {"receiptId": uid(), "operation": operation, "claim": f["claim"],
                 "cleanupId": f["cleanup"], "ownerSessionId": f["session"], "sessionVersion": 0,
                 "authorityFingerprint": f["fingerprint"], "identityExpiresAt": f["deadline"],
                 "verifiedAt": now, "expiresAt": min(now + 20000, f["deadline"]),
                 "effectiveExpiresAt": f["deadline"]}
        result = self.observer.scalar(f"SELECT COALESCE(public.bfa_p5_voice_register_proof({literal(proof)}::jsonb)::text,'null');")
        self.check(json.loads(result) == {k: proof[k] for k in ("receiptId", "operation", "claim", "expiresAt", "effectiveExpiresAt")}, "Exact operation proof registered")
        f["receipt"] = proof["receiptId"]
        return proof

    def call(self, f: dict, operation: str = "claim") -> str:
        handle = f["cleanup"] if operation == "close" else f["receipt"]
        return f"SELECT public.bfa_p5_voice_{operation}({literal(handle)},{claim_sql(f['claim'])})::text;"

    def ack(self, lines: list[str], f: dict, expected: str) -> None:
        self.check(len(lines) == 1 and json.loads(lines[0]) == {"state": expected, "claim": f["claim"]}, f"Exact {expected} acknowledgement")

    def owner_lock(self, f: dict) -> Session:
        holder = self.session("owner_holder")
        holder.query(f"BEGIN; SELECT pg_advisory_xact_lock(hashtextextended({literal(f['owner'])}::text,0));")
        return holder

    def run(self, name: str, fn) -> dict:
        self.current = {"name": name, "status": "running", "barriers": [], "checks": []}
        started = time.monotonic()
        start_index = len(self.sessions)
        try:
            fn()
            self.current["status"] = "passed"
        except Exception as error:  # Keep all independent case results for diagnosis.
            self.current["status"] = "failed"
            self.current["error"] = str(error)
        finally:
            for session in reversed(self.sessions[start_index:]):
                try:
                    session.close()
                except Exception as error:
                    self.current.setdefault("cleanupErrors", []).append(str(error))
                    self.current["status"] = "failed"
            self.current["elapsedMs"] = round((time.monotonic() - started) * 1000)
        return self.current


def duplicate_claims(d: Driver, last_unit: bool = False) -> None:
    first = d.fixture(units=1 if last_unit else 10)
    if last_unit:
        second = d.fixture(shared=first)
    else:
        second = copy.deepcopy(first)
        second["claim"]["claimId"], second["cleanup"] = uid(), uid()
        d.register(second)
    holder = d.owner_lock(first)
    a, b = d.session("claim_a"), d.session("claim_b")
    ta = a.start(d.call(first)); d.blocked(a, holder)
    tb = b.start(d.call(second)); d.blocked(b, holder)
    holder.query("COMMIT;")
    ra, rb = json.loads(a.finish(ta)[0]), json.loads(b.finish(tb)[0])
    d.check(ra["claim"] == first["claim"] and rb["claim"] == second["claim"], "Concurrent acknowledgements retain each caller's exact identity")
    expected = ["claimed", "denied"] if last_unit else ["claimed", "replayed"]
    d.check(sorted([ra["state"], rb["state"]]) == expected, "Exactly one concurrent claim wins")
    state = d.state(first)
    d.check(state == {"remaining": 0 if last_unit else 9, "claims": 1, "held": 1, "attempts": 1}, "Exactly one cumulative quota unit and winner, with no negative balance")
    loser, winner = (second, first) if ra["state"] == "claimed" else (first, second)
    d.ack(d.observer.query(d.call(loser, "close")), loser, "closed")
    d.check(d.observer.scalar(f"SELECT state FROM bfa_p5_voice.claims WHERE claim_id={literal(winner['claim']['claimId'])};") == "claimed", "Closing loser does not close committed winner")
    d.check(d.state(first)["held"] == 1, "Losing cleanup preserves winner's held unit")


def close_first(d: Driver) -> None:
    f = d.fixture()
    holder = d.owner_lock(f)
    closer, claimant = d.session("close_first"), d.session("late_claim")
    tc = closer.start(d.call(f, "close")); d.blocked(closer, holder)
    ta = claimant.start(d.call(f)); d.blocked(claimant, holder)
    d.blocked(claimant, closer)  # Observe queue order, do not assume scheduling.
    holder.query("COMMIT;")
    d.ack(closer.finish(tc), f, "closed")
    d.ack(claimant.finish(ta), f, "closed")
    d.check(d.state(f) == {"remaining": 10, "claims": 0, "held": 0, "attempts": 1}, "Close before claim creates no hold")
    d.check(d.observer.scalar(f"SELECT retired AND winner_claim_id IS NULL FROM bfa_p5_voice.attempts WHERE owner_id={literal(f['owner'])};") == "t", "Unused attempt stays terminally retired")


def claim_then_close(d: Driver) -> None:
    f = d.fixture()
    claimant = d.session("claim_commit")
    claimant.query("BEGIN; " + d.call(f))
    closer = d.session("cleanup_waiter")
    token = closer.start(d.call(f, "close")); d.blocked(closer, claimant)
    claimant.query("COMMIT;")
    d.ack(closer.finish(token), f, "closed")
    d.check(d.state(f) == {"remaining": 9, "claims": 1, "held": 1, "attempts": 1}, "Close after winning commit retains one cumulative hold")
    d.check(d.observer.scalar(f"SELECT state FROM bfa_p5_voice.claims WHERE claim_id={literal(f['claim']['claimId'])};") == "closed", "Committed winner terminally closes")
    d.ack(d.observer.query(d.call(f, "close")), f, "closed")
    d.check(d.state(f)["held"] == 1, "Deliberate duplicate close never refunds hold")


def expiry(d: Driver, lock: str) -> None:
    f = d.fixture(lifetime_ms=4000)
    holder = d.session(lock + "_expiry_holder")
    if lock == "owner":
        statement = f"SELECT pg_advisory_xact_lock(hashtextextended({literal(f['owner'])}::text,0));"
    elif lock == "thread":
        statement = f"SELECT id FROM public.bfa_p3b_threads WHERE id={literal(f['thread'])} FOR UPDATE;"
    else:
        statement = f"SELECT policy_id FROM bfa_p5_voice.quotas WHERE owner_id={literal(f['owner'])} AND policy_id={literal(f['policy'])} FOR UPDATE;"
    # Row-only holders intentionally inject contention without the owner lock.
    holder.query("BEGIN; " + statement)
    claimant = d.session(lock + "_expiry_claim")
    token = claimant.start(d.call(f)); d.blocked(claimant, holder)
    d.past(f["deadline"])
    holder.query("COMMIT;")
    d.ack(claimant.finish(token), f, "denied")
    d.check(d.state(f) == {"remaining": 10, "claims": 0, "held": 0, "attempts": 0}, "Expiry after lock wait creates no hold or attempt winner")
    d.check(d.observer.scalar(f"SELECT expired_ms IS NOT NULL FROM bfa_p5_voice.cleanup_owners WHERE cleanup_id={literal(f['cleanup'])};") == "t", "Expiry fence persists after semantic denial")
    d.ack(d.observer.query(d.call(f, "close")), f, "closed")


def revocation(d: Driver, kind: str) -> None:
    f = d.fixture()
    holder = d.owner_lock(f)
    claimant = d.session(kind + "_revocation_waiter")
    token = claimant.start(d.call(f)); d.blocked(claimant, holder)
    if kind == "session":
        mutation = f"UPDATE bfa_p5_voice.session_fences SET revoked=true WHERE owner_id={literal(f['owner'])};"
    elif kind == "allowlist":
        mutation = f"UPDATE public.bfa_p3b_staging_accounts SET admitted=false WHERE user_id={literal(f['owner'])};"
    else:
        mutation = f"UPDATE public.bfa_p3b_threads SET revision=revision+1 WHERE id={literal(f['thread'])};"
    holder.query(mutation + " COMMIT;")
    d.ack(claimant.finish(token), f, "denied")
    d.check(d.state(f)["held"] == 0, "Current committed lifecycle fence denies stale claim without hold")
    d.check(d.observer.scalar(f"SELECT invalidated_ms IS NOT NULL FROM bfa_p5_voice.cleanup_owners WHERE cleanup_id={literal(f['cleanup'])};") == "t", "Invalidation persists on exact cleanup identity")
    d.ack(d.observer.query(d.call(f, "close")), f, "closed")


def shorten_inspect(d: Driver) -> None:
    f = d.fixture()
    d.ack(d.observer.query(d.call(f)), f, "claimed")
    d.register(f, "inspect")
    holder = d.owner_lock(f)
    inspector = d.session("shortening_inspect")
    token = inspector.start(d.call(f, "inspect")); d.blocked(inspector, holder)
    holder.query(f"UPDATE bfa_p5_voice.approvals SET expires_ms=bfa_p5_voice.ms()-1 WHERE approval_id={literal(f['approval'])}; COMMIT;")
    d.ack(inspector.finish(token), f, "denied")
    d.check(d.observer.scalar(f"SELECT state FROM bfa_p5_voice.claims WHERE claim_id={literal(f['claim']['claimId'])};") == "expired", "Shortened current approval expires committed claim")
    d.observer.query(f"BEGIN; SELECT pg_advisory_xact_lock(hashtextextended({literal(f['owner'])}::text,0)); UPDATE bfa_p5_voice.approvals SET expires_ms={f['deadline']} WHERE approval_id={literal(f['approval'])}; COMMIT;")
    now = int(d.observer.scalar("SELECT bfa_p5_voice.ms();"))
    proof = {"receiptId": uid(), "operation": "inspect", "claim": f["claim"], "cleanupId": f["cleanup"],
             "ownerSessionId": f["session"], "sessionVersion": 0, "authorityFingerprint": f["fingerprint"],
             "identityExpiresAt": f["deadline"], "verifiedAt": now, "expiresAt": now + 20000,
             "effectiveExpiresAt": f["deadline"]}
    d.check(d.observer.scalar(f"SELECT public.bfa_p5_voice_register_proof({literal(proof)}::jsonb) IS NULL;") == "t", "Another process cannot revive observed expiry with longer authority")
    d.ack(d.observer.query(d.call(f, "close")), f, "closed")
    d.check(d.state(f)["held"] == 1, "Expired then closed claim retains uncertain held unit")


def discarded_results(d: Driver) -> None:
    f = d.fixture()
    # The receiving fixture deliberately discards these return values. This
    # exercises reconciliation of committed state, not a network failure.
    worker = d.session("discarded_ack")
    call = d.call(f).removeprefix("SELECT ").removesuffix("::text;")
    worker.query(f"DO $fixture$ BEGIN PERFORM {call}; END $fixture$;")
    d.check(d.state(f)["held"] == 1, "Discarded claim result still leaves committed hold")
    d.register(f)
    d.ack(d.observer.query(d.call(f)), f, "claimed")
    d.check(d.state(f)["held"] == 1, "Deliberate exact claim replay cannot reserve again")
    close = d.call(f, "close").removeprefix("SELECT ").removesuffix("::text;")
    worker.query(f"DO $fixture$ BEGIN PERFORM {close}; END $fixture$;")
    d.ack(d.observer.query(d.call(f, "close")), f, "closed")
    d.check(d.state(f)["held"] == 1, "Discarded close acknowledgement and exact retry retain hold")


def validate_connection_arguments(args: argparse.Namespace) -> None:
    """Refuse libpq multi-host syntax before any child can connect."""
    binary = Path(args.psql)
    socket = Path(args.socket)
    if not binary.is_absolute() or not binary.is_file() or not os.access(binary, os.X_OK):
        raise ValueError("--psql must be an absolute local executable path")
    # libpq interprets comma-separated host strings even when they start with '/'.
    if "," in args.socket or not socket.is_absolute() or socket.is_symlink() or not socket.is_dir():
        raise ValueError("Exactly one nonsymlink local Unix-socket directory is required")
    socket = socket.resolve()
    if "," in str(socket) or stat.S_IMODE(socket.stat().st_mode) != 0o700 or socket.stat().st_uid != os.geteuid():
        raise ValueError("The fixture socket directory must be private and owned by the current user")
    if not 1 <= args.port <= 65535 or args.database != DATABASE or args.user != "bfa_fixture_admin":
        raise ValueError("Only the disposable fixture database/user and a valid local port are accepted")
    args.socket = str(socket)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--psql", required=True)
    parser.add_argument("--socket", required=True)
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--database", default=DATABASE, choices=[DATABASE])
    parser.add_argument("--user", default="bfa_fixture_admin", choices=["bfa_fixture_admin"])
    parser.add_argument("--output", required=True)
    parser.add_argument("--log-dir")
    args = parser.parse_args()
    try:
        validate_connection_arguments(args)
    except ValueError as error:
        parser.error(str(error))
    driver = Driver(args)
    try:
        cases = [
            ("concurrent same-attempt claims and losing cleanup", lambda: duplicate_claims(driver)),
            ("concurrent cross-thread final quota unit", lambda: duplicate_claims(driver, True)),
            ("close queued before delayed claim", lambda: close_first(driver)),
            ("claim commits before queued close", lambda: claim_then_close(driver)),
            *[(f"{lock} lock wait crosses eligibility expiry", lambda lock=lock: expiry(driver, lock)) for lock in ("owner", "thread", "quota")],
            *[(f"{kind} revocation commits before waiting claim", lambda kind=kind: revocation(driver, kind)) for kind in ("session", "allowlist", "thread")],
            ("shortened approval persists across denied inspection and re-extension", lambda: shorten_inspect(driver)),
            ("discarded committed results reconcile without extra reservation or refund", lambda: discarded_results(driver)),
        ]
        result = {"suite": "P5 disposable local PostgreSQL concurrency", "serverVersion": driver.observer.scalar("SHOW server_version;"),
                  "cases": [driver.run(name, fn) for name, fn in cases],
                  "limitations": ["Fictional local admin fixtures, not production Auth or HTTP acceptance.",
                                  "Row-only holders deliberately inject contention; product writers must follow owner-first locking.",
                                  "Discarded SQL return values model missing acknowledgements; no network transport fault was injected.",
                                  "Generic cumulative quota units are not concurrent-session capacity or provider cost controls."]}
        result["passed"] = sum(case["status"] == "passed" for case in result["cases"])
        result["failed"] = len(result["cases"]) - result["passed"]
        sql_root = Path(__file__).resolve().parents[3] / "docs/pilot/conversation/sql-drafts"
        result["sqlSha256"] = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sql_root.glob("*.sql")}
        Path(args.output).parent.mkdir(parents=True, exist_ok=True)
        Path(args.output).write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps({"passed": result["passed"], "failed": result["failed"], "output": args.output}))
        return 1 if result["failed"] else 0
    finally:
        driver.observer.close()


if __name__ == "__main__":
    raise SystemExit(main())
