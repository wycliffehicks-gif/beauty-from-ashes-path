#!/usr/bin/env python3
"""Own an isolated native PostgreSQL cluster; never connect to a supplied DSN.

This is an offline fixture runner, not a migration/deployment command. It needs
ordinary nonroot PostgreSQL binaries. No root-check workaround is supported.
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import time


DATABASE = "bfa_p5_offline_fixture"
DB_USER = "bfa_fixture_admin"
PORT = "55432"
BINARY_NAMES = ("initdb", "pg_ctl", "postgres", "psql")
EXPECTED_ASSERTIONS = {"sequential": 57, "roles": 145}
EXPECTED_CONCURRENCY_CASES = 12
EXPECTED_CAPACITY_CASES = 9
EXPECTED_V2_CASES = 16
CAPACITY_ASSERTIONS = {"capacity-sequential": (129, "P5_CAPACITY_ASSERT:"),
                       "capacity-roles": (116, "P5_CAPACITY_ROLE_PASS:")}
BASE_TABLES = tuple(sorted([
    *("bfa_p5_voice." + name for name in ("generations", "owner_clocks", "session_fences", "issuances", "quotas", "approvals", "cleanup_owners", "proofs", "attempts", "claims")),
    *("public.bfa_p3b_" + name for name in ("staging_accounts", "threads", "allowances", "admissions")),
]))
CAPACITY_TABLES = tuple("bfa_p5_capacity." + name for name in ("pools", "routes", "allocations", "evidence", "sessions", "conflicts"))
V2_TABLES = ("bfa_p5_voice_v2.auth_parents", "bfa_p5_voice_v2.issuance_auth_bindings")
V2_DRAFTS = (
    "p5-voice-reads.sql",
    "p5-voice-preissue-read.sql",
    "p5-voice-session-provision.sql",
    "p5-voice-session-revoke.sql",
    "p5-voice-v2-parent-issuance.sql",
    "p5-voice-v2-preissue.sql",
    "p5-voice-v2-current.sql",
    "p5-voice-v2-cleanup.sql",
    "p5-voice-v2-proof.sql",
    "p5-voice-v2-capacity.sql",
    "p5-voice-v2-mark.sql",
)
MIGRATIONS = (
    "0000_p3b_locked_conversation_foundation.sql",
    "0001_p3b_revoke_inherited_browser_grants.sql",
    "0002_p3b_transactional_staging_boundary.sql",
    "0003_p3b_no_automatic_transaction_retry.sql",
    "0004_p3b_lock_expiry_argument_guards.sql",
    "0005_p3b_explicit_pending_work_fence.sql",
)


class HarnessError(RuntimeError):
    pass


def _literal_names(source: Path, variable: str, count: int) -> tuple[str, ...]:
    """Read the reviewed literal inventory without executing a helper module."""
    try:
        tree = ast.parse(source.read_text(encoding="utf-8"))
        declarations = [node.value for node in tree.body if isinstance(node, ast.Assign)
                        and any(isinstance(target, ast.Name) and target.id == variable
                                for target in node.targets)]
        if len(declarations) != 1:
            raise ValueError("Expected exactly one literal " + variable)
        names = ast.literal_eval(declarations[0])
        if (not isinstance(names, tuple) or len(names) != count
                or any(not isinstance(name, str) or not name.strip() for name in names)
                or len(set(names)) != len(names)):
            raise ValueError(f"{variable} must contain {count} distinct nonempty strings")
        return names
    except (OSError, SyntaxError, ValueError) as exc:
        raise HarnessError("Invalid capacity case inventory: " + str(exc)) from exc


def capacity_case_names(source: Path) -> tuple[str, ...]:
    return _literal_names(source, "CASE_NAMES", EXPECTED_CAPACITY_CASES)


def capacity_expiry_cases(source: Path, cases: tuple[str, ...]) -> tuple[str, ...]:
    names = _literal_names(source, "EXPIRY_CASE_NAMES", 3)
    if not set(names).issubset(cases):
        raise HarnessError("Capacity expiry cases must be in the reviewed case inventory")
    return names


def validate_capacity_evidence(evidence: object, expected: tuple[str, ...], expiry_cases: tuple[str, ...] = ()) -> None:
    """Never accept totals alone or a nominally passed case without observed locks."""
    if not isinstance(evidence, dict):
        raise HarnessError("Capacity concurrency evidence must be an object")
    cases = evidence.get("cases")
    if (type(evidence.get("passed")) is not int or evidence["passed"] != len(expected)
            or type(evidence.get("failed")) is not int or evidence["failed"] != 0
            or not isinstance(cases, list) or len(cases) != len(expected)
            or any(not isinstance(case, dict) for case in cases)
            or tuple(case.get("name") for case in cases) != expected):
        raise HarnessError("Capacity concurrency requires every exact ordered case name and passing totals")
    for case in cases:
        checks = case.get("checks")
        barriers = case.get("barriers")
        if (case.get("status") != "passed" or case.get("cleanupErrors")
                or not isinstance(checks, list) or not checks
                or any(not isinstance(label, str) or not label.strip() for label in checks)
                or not isinstance(barriers, list)):
            raise HarnessError("Capacity case missing passing assertions or cleanup evidence: " + case["name"])
        locks = [barrier for barrier in barriers if isinstance(barrier, dict) and barrier.get("waitType") == "Lock"]
        if not locks:
            raise HarnessError("Capacity case missing observed lock barrier: " + case["name"])
        for barrier in locks:
            pid, holder, blockers = barrier.get("pid"), barrier.get("holderPid"), barrier.get("blockers")
            if (type(pid) is not int or type(holder) is not int or pid <= 0 or holder <= 0
                    or pid == holder or barrier.get("state") != "active"
                    or not isinstance(barrier.get("waitEvent"), str) or not barrier["waitEvent"]
                    or not isinstance(blockers, list) or holder not in blockers
                    or any(type(blocker) is not int or blocker <= 0 for blocker in blockers)):
                raise HarnessError("Capacity case has invalid observed blocker identity: " + case["name"])
        if case["name"] in expiry_cases:
            clocks = [barrier for barrier in barriers if isinstance(barrier, dict) and barrier.get("kind") == "database-clock"]
            if (not clocks or "Database wait barrier observed before expiry" not in checks
                    or barriers.index(locks[0]) >= barriers.index(clocks[0])):
                raise HarnessError("Capacity expiry case missing ordered database-clock evidence: " + case["name"])
            for clock in clocks:
                deadline, observed = clock.get("deadlineMs"), clock.get("observedMs")
                if (type(deadline) is not int or type(observed) is not int or deadline <= 0 or observed < deadline):
                    raise HarnessError("Capacity expiry case has invalid database-clock evidence: " + case["name"])



def v2_case_names(source: Path) -> tuple[str, ...]:
    return _literal_names(source, "CASE_NAMES", EXPECTED_V2_CASES)


def v2_drain_cases(source: Path, cases: tuple[str, ...]) -> tuple[str, ...]:
    names = _literal_names(source, "DRAIN_CASE_NAMES", 2)
    if names != cases[-2:]:
        raise HarnessError("V2 cutover cases must be the exact final two reviewed cases")
    return names


def validate_v2_evidence(evidence: object, expected: tuple[str, ...], drain_cases: tuple[str, ...]) -> None:
    """Require recorded backend contention and explicit bounded drain evidence.

    These structural checks cannot authenticate a fabricated report or turn
    process doubles into native acceptance. Actual assertions live in the
    source-hashed native module and its owned database sessions.
    """
    if len(expected) != EXPECTED_V2_CASES or drain_cases != expected[-2:]:
        raise HarnessError("V2 evidence requires the complete reviewed inventory")
    validate_capacity_evidence(evidence, expected)
    assert isinstance(evidence, dict)
    if (evidence.get("deployable") is not False or type(evidence.get("protocol")) is not int
            or evidence["protocol"] != 2 or type(evidence.get("caseInventoryVersion")) is not int
            or evidence["caseInventoryVersion"] != 1):
        raise HarnessError("V2 evidence must match protocol/inventory and remain explicitly nondeployable")
    accounting = evidence.get("earlierAccounting")
    accounting_tables = set(table for table in BASE_TABLES + CAPACITY_TABLES + V2_TABLES if not table.startswith("public."))
    if (not isinstance(accounting, dict) or accounting.get("retained") is not True
            or not isinstance(accounting.get("tables"), list) or len(accounting["tables"]) != len(accounting_tables)
            or any(not isinstance(table, str) for table in accounting["tables"])
            or set(accounting["tables"]) != accounting_tables or not isinstance(accounting.get("sha256"), str)
            or re.fullmatch(r"[0-9a-f]{64}", accounting["sha256"]) is None):
        raise HarnessError("V2 evidence lacks its complete retained earlier-accounting snapshot")
    for case in evidence["cases"]:
        name = case["name"]
        pids = case.get("backendPids")
        if (not isinstance(pids, list) or len(pids) < 3
                or any(type(pid) is not int or pid <= 0 for pid in pids)
                or len(set(pids)) != len(pids)):
            raise HarnessError("V2 case lacks distinct observer and worker backends: " + name)
        for lock in case["barriers"]:
            if isinstance(lock, dict) and lock.get("waitType") == "Lock":
                if (lock["pid"] not in pids[1:] or lock["holderPid"] not in pids[1:]
                        or any(pid not in pids for pid in lock["blockers"])):
                    raise HarnessError("V2 blocker is not an owned distinct worker: " + name)
        for field in ("committedStateBefore", "committedStateAfter"):
            if not isinstance(case.get(field), dict) or not case[field]:
                raise HarnessError("V2 case lacks exact committed-state observation: " + name)
        identity = case.get("identity")
        if (not isinstance(identity, dict)
                or set(identity) != {"ownerId", "authSessionId", "parentVersion", "authorityFingerprint",
                                     "issuedAt", "expiresAt", "claim", "cleanupId", "proof", "markRequest"}
                or any(not isinstance(identity.get(field), str) or not identity[field]
                       for field in ("ownerId", "authSessionId", "authorityFingerprint", "cleanupId"))
                or (identity["parentVersion"] is not None if name in drain_cases
                    else type(identity["parentVersion"]) is not int or identity["parentVersion"] < 0)
                or type(identity["issuedAt"]) is not int or identity["issuedAt"] < 0
                or type(identity["expiresAt"]) is not int
                or not 0 < identity["expiresAt"] - identity["issuedAt"] <= 900000
                or not isinstance(identity["claim"], dict) or not identity["claim"]):
            raise HarnessError("V2 case lacks immutable issuance/ownership identity: " + name)
        proof = identity["proof"]
        slot = expected.index(name)
        if slot in (0, 1, 6, 7):
            if proof is not None or identity["markRequest"] is not None:
                raise HarnessError("Issuance race must not invent later proof/marker evidence: " + name)
        elif slot in (2, 3, 8, 9):
            if not isinstance(proof, dict) or proof.get("operation") != "claim" or identity["markRequest"] is not None:
                raise HarnessError("Proof race requires the original claim proof only: " + name)
        elif slot in (4, 5, 10, 11, 12, 13):
            if not isinstance(proof, dict) or proof.get("operation") != "inspect" or identity["markRequest"] is None:
                raise HarnessError("Marker race requires its original inspect proof and marker request: " + name)
        if name in drain_cases and (proof is not None or identity["markRequest"] is not None):
            raise HarnessError("Legacy cutover evidence must not manufacture v2 proof ownership: " + name)
        if proof is not None:
            if (not isinstance(proof, dict)
                    or set(proof) != {"protocol", "receiptId", "operation", "claim", "cleanupId", "authSessionId",
                                      "parentVersion", "authorityFingerprint", "identityExpiresAt", "verifiedAt",
                                      "expiresAt", "effectiveExpiresAt"}
                    or type(proof["protocol"]) is not int or proof["protocol"] != 2
                    or proof["claim"] != identity["claim"]
                    or any(proof[field] != identity[field] for field in ("cleanupId", "authSessionId", "parentVersion", "authorityFingerprint"))
                    or proof["operation"] not in ("claim", "inspect")
                    or not isinstance(proof["receiptId"], str) or not proof["receiptId"]
                    or any(type(proof[field]) is not int for field in ("verifiedAt", "expiresAt", "effectiveExpiresAt", "identityExpiresAt"))
                    or not 0 <= proof["verifiedAt"] < proof["expiresAt"] <= proof["effectiveExpiresAt"] <= identity["expiresAt"]
                    or proof["expiresAt"] - proof["verifiedAt"] > 30000
                    or proof["effectiveExpiresAt"] > proof["identityExpiresAt"]):
                raise HarnessError("V2 case lacks the exact original fresh proof: " + name)
        mark = identity["markRequest"]
        if mark is not None:
            if (not isinstance(mark, dict) or set(mark) != {"protocol", "proof", "operationId", "expectedPoolVersion"}
                    or type(mark["protocol"]) is not int or mark["protocol"] != 2
                    or proof is None or mark["proof"] != proof or proof["operation"] != "inspect"
                    or not isinstance(mark["operationId"], str) or not mark["operationId"]
                    or type(mark["expectedPoolVersion"]) is not int or mark["expectedPoolVersion"] <= 0):
                raise HarnessError("V2 case lacks the exact original marker identity: " + name)
        if name not in drain_cases:
            continue
        cutover = case.get("cutover")
        drained = name == drain_cases[1]
        events = (["lock-observed", "fixture-gate-closed", "legacy-call-completed", "drain-observed", "privileges-revoked",
                   "new-legacy-call-denied", "cleanup-completed"] if drained else
                  ["lock-observed", "fixture-gate-closed", "privileges-revoked", "not-drained-observed", "legacy-call-completed",
                   "new-legacy-call-denied", "cleanup-completed"])
        if (not isinstance(cutover, dict) or cutover.get("baselineStatus") != "fail"
                or cutover.get("candidateStatus") != "pass" or cutover.get("gateClosed") is not True
                or cutover.get("completedBeforeRevoke") is not drained
                or cutover.get("newLegacyDenied") is not True or cutover.get("events") != events
                or type(cutover.get("legacyWorkerPid")) is not int or cutover["legacyWorkerPid"] not in pids[1:]):
            raise HarnessError("V2 cutover case lacks the exact gate/revoke/completion ordering: " + name)
        drain = cutover.get("drain")
        worker = cutover["legacyWorkerPid"]
        if (not isinstance(drain, dict) or drain.get("drained") is not drained
                or drain.get("trackedPids") != [worker] or not isinstance(drain.get("observed"), list)
                or len(drain["observed"]) != 1 or not isinstance(drain["observed"][0], dict)):
            raise HarnessError("V2 cutover case lacks a bounded tracked-worker drain observation: " + name)
        observation = drain["observed"][0]
        if (observation.get("pid") != worker or type(observation.get("pid")) is not int
                or type(observation.get("lockCount")) is not int or observation["lockCount"] < 0):
            raise HarnessError("V2 cutover drain has invalid worker/lock identity: " + name)
        if drained:
            if observation.get("state") != "idle" or observation.get("xactStart") is not None or observation["lockCount"] != 0:
                raise HarnessError("V2 drained worker still has active transaction/locks: " + name)
        elif (observation.get("state") != "active" or not isinstance(observation.get("xactStart"), str)
                or not observation["xactStart"] or observation["lockCount"] <= 0):
            raise HarnessError("V2 non-drained case lacks the still-running transaction: " + name)


def validate_v2_provenance(evidence: dict, sources: dict[str, str], runtime: dict[str, str]) -> None:
    names = ("v2_concurrency.py", "concurrency.py", "capacity_concurrency.py", "cutover-native-bridge.ts", "cutover-inventory.ts")
    expected = {"scripts/conversation-eval/p5-sql/" + name: sources["scripts/conversation-eval/p5-sql/" + name] for name in names}
    if evidence.get("sourceSha256") != expected:
        raise HarnessError("V2 subprocess source provenance does not match preflight hashes")
    observed = evidence.get("runtime")
    if (not isinstance(observed, dict) or set(observed) != {"path", "sha256", "name", "version"}
            or observed.get("path") != runtime["path"] or observed.get("sha256") != runtime["sha256"]
            or observed.get("name") != "bun" or not isinstance(observed.get("version"), str)
            or re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+(?:[-+][a-zA-Z0-9.-]+)?", observed["version"]) is None):
        raise HarnessError("V2 subprocess runtime provenance does not match the explicit executable")


def empty_table_check(include_capacity: bool = False, include_v2: bool = False) -> str:
    """Exact names, not just a count: a missing table cannot be hidden by an extra."""
    expected = sorted(BASE_TABLES + (CAPACITY_TABLES if include_capacity or include_v2 else ())
                      + (V2_TABLES if include_v2 else ()))
    schemas = "'bfa_p5_voice','bfa_p5_capacity'" + (",'bfa_p5_voice_v2'" if include_v2 else "")
    names = ",".join("'" + name + "'" for name in expected)
    return """DO $$ DECLARE r record; n bigint; seen text[]:=ARRAY[]::text[]; BEGIN
      FOR r IN SELECT schemaname,tablename FROM pg_tables
        WHERE schemaname IN (""" + schemas + """)
           OR (schemaname='public' AND tablename LIKE 'bfa_p3b_%')
        ORDER BY schemaname,tablename LOOP
        seen:=array_append(seen,r.schemaname||'.'||r.tablename);
        EXECUTE format('SELECT count(*) FROM %I.%I',r.schemaname,r.tablename) INTO n;
        IF n<>0 THEN RAISE EXCEPTION 'Fixture rollback leaked rows in %.%',r.schemaname,r.tablename; END IF;
      END LOOP;
      IF seen IS DISTINCT FROM ARRAY[""" + names + """]::text[] THEN
        RAISE EXCEPTION 'Fixture table inventory mismatch: %',seen;
      END IF;
    END $$;"""


def prepare_output(path: Path) -> Path:
    """Never overwrite a previous run or follow an output-directory symlink."""
    if not path.is_absolute() or path.is_symlink():
        raise HarnessError("--output must be an absolute, nonsymlink directory")
    if path.exists():
        if not path.is_dir() or any(path.iterdir()):
            raise HarnessError("--output must be new or empty")
    else:
        path.mkdir(parents=True, mode=0o700)
    return path.resolve()


def isolated_environment(config: Path) -> dict[str, str]:
    # Do not inherit HOME, PATH, PG*, cloud keys, Python injection or loader vars.
    # Empty explicit config paths also defeat system/user libpq service files.
    return {
        "PATH": os.defpath,
        "LANG": "C",
        "LC_ALL": "C",
        "HOME": str(config),
        "PGSYSCONFDIR": str(config),
        "PGPASSFILE": str(config / "absent.pgpass"),
        "PGSERVICEFILE": str(config / "absent.pg_service.conf"),
        "PGCONNECT_TIMEOUT": "5",
    }


class LocalRun:
    def __init__(self, repo: Path, pg_bin: Path, output: Path, *, capacity: bool = False,
                 v2: bool = False, v2_runtime: Path | None = None):
        self.repo = repo.resolve()
        if v2_runtime is not None and not v2:
            raise HarnessError("--v2-runtime is only accepted with --v2")
        self.capacity = capacity or v2
        self.v2 = v2
        self.v2_runtime = v2_runtime
        self.v2_cases: tuple[str, ...] = ()
        self.v2_drain_cases: tuple[str, ...] = ()
        self.capacity_cases: tuple[str, ...] = ()
        self.capacity_expiry_cases: tuple[str, ...] = ()
        self.pg_bin = pg_bin
        self.output = prepare_output(output)
        self.fixture_dir = self.repo / "scripts/conversation-eval/p5-sql"
        self.draft_dir = self.repo / "docs/pilot/conversation/sql-drafts"
        self.cluster: Path | None = None
        self.environment: dict[str, str] = {}
        self.start_attempted = False
        self.result: dict = {
            "suite": "p5-native-postgresql",
            "status": "not_run",
            "database": DATABASE,
            "scope": "disposable Unix-socket-only cluster; no connected database",
            "nativeDatabaseTestsExecuted": False,
            "capacityRequested": self.capacity,
            "v2Requested": v2,
            "nativeV2PhaseAttempted": False,
            "nativeV2EvidenceAccepted": False,
            "nativeCapacityTestsExecuted": False,
            "sourceSha256": {},
            "phases": [],
            "cleanup": {"status": "not_needed"},
        }

    def save_result(self):
        (self.output / "result.json").write_text(
            json.dumps(self.result, indent=2) + "\n", encoding="utf-8"
        )

    def sources(self) -> list[Path]:
        return [
            self.fixture_dir / "bootstrap.sql",
            *(self.repo / "drizzle/migrations" / name for name in MIGRATIONS),
            self.draft_dir / "p5-voice-admission.sql",
            self.draft_dir / "p5-voice-admission-fixtures.sql",
            self.fixture_dir / "roles.sql",
            self.fixture_dir / "concurrency.py",
            self.fixture_dir / "run-local.py",
            *([self.draft_dir / "p5-voice-capacity.sql",
               self.draft_dir / "p5-voice-capacity-fixtures.sql",
               self.fixture_dir / "capacity-roles.sql",
               self.fixture_dir / "capacity_concurrency.py"] if self.capacity else []),
            *([*(self.draft_dir / name for name in V2_DRAFTS),
               self.fixture_dir / "v2_concurrency.py",
               self.fixture_dir / "cutover-inventory.ts",
               self.fixture_dir / "cutover-native-bridge.ts"] if self.v2 else []),
        ]

    def preflight(self) -> list[str]:
        problems = []
        if not hasattr(os, "geteuid") or os.geteuid() == 0:
            problems.append("Native initdb/postgres require a nonroot OS user; no bypass is supported")
        if not self.pg_bin.is_absolute() or not self.pg_bin.is_dir():
            problems.append("--pg-bin must be an absolute directory containing PostgreSQL binaries")
        else:
            self.pg_bin = self.pg_bin.resolve()
            for name in BINARY_NAMES:
                if not (self.pg_bin / name).is_file() or not os.access(self.pg_bin / name, os.X_OK):
                    problems.append(f"Missing executable: {name}")
        for path in self.sources():
            if not path.is_file():
                problems.append(f"Missing fixture source: {path.relative_to(self.repo)}")
            else:
                self.result["sourceSha256"][str(path.relative_to(self.repo))] = hashlib.sha256(path.read_bytes()).hexdigest()
        if self.capacity:
            try:
                source = self.fixture_dir / "capacity_concurrency.py"
                self.capacity_cases = capacity_case_names(source)
                self.capacity_expiry_cases = capacity_expiry_cases(source, self.capacity_cases)
            except HarnessError as exc:
                problems.append(str(exc))
        if self.v2:
            if (self.v2_runtime is None or not self.v2_runtime.is_absolute()
                    or not self.v2_runtime.is_file() or not os.access(self.v2_runtime, os.X_OK)):
                problems.append("--v2 requires an explicit absolute executable --v2-runtime Bun path")
            else:
                self.v2_runtime = self.v2_runtime.resolve()
                self.result["v2Runtime"] = {"path": str(self.v2_runtime),
                    "sha256": hashlib.sha256(self.v2_runtime.read_bytes()).hexdigest()}
            try:
                source = self.fixture_dir / "v2_concurrency.py"
                self.v2_cases = v2_case_names(source)
                self.v2_drain_cases = v2_drain_cases(source, self.v2_cases)
            except HarnessError as exc:
                problems.append(str(exc))
        self.result["preflight"] = {"status": "unavailable" if problems else "ready", "reasons": problems}
        return problems

    def command(self, name: str, argv: list[str], *, timeout: int = 90, check: bool = True) -> subprocess.CompletedProcess:
        log = self.output / f"{name}.log"
        started = time.monotonic()
        phase = {"name": name, "status": "running", "log": log.name}
        self.result["phases"].append(phase)
        self.save_result()
        try:
            with log.open("w", encoding="utf-8") as stream:
                stream.write("argv: " + json.dumps(argv) + "\n")
                stream.flush()
                child = subprocess.run(
                    argv, cwd=self.cluster or self.output, env=self.environment,
                    stdin=subprocess.DEVNULL, stdout=stream, stderr=subprocess.STDOUT,
                    text=True, timeout=timeout, check=False,
                )
            phase.update(status="passed" if child.returncode == 0 else "failed", exitCode=child.returncode)
            if check and child.returncode:
                raise HarnessError(f"{name} failed; see {log.name}")
            return child
        except subprocess.TimeoutExpired as exc:
            phase.update(status="failed", error="bounded subprocess timeout")
            raise HarnessError(f"{name} exceeded its timeout") from exc
        except OSError as exc:
            phase.update(status="failed", error=str(exc))
            raise
        finally:
            phase["elapsedMs"] = round((time.monotonic() - started) * 1000)
            self.save_result()

    def psql(self, *args: str, database: str = DATABASE) -> list[str]:
        assert self.cluster is not None
        return [str(self.pg_bin / "psql"), "-X", "-w", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1",
                "-h", str(self.cluster / "socket"), "-p", PORT, "-U", DB_USER, "-d", database, *args]

    def sql_file(self, name: str, path: Path):
        self.command(name, self.psql("-f", str(path)))

    def query(self, name: str, sql: str) -> str:
        self.command(name, self.psql("-c", sql))
        # First log line is argv, not database output.
        return "\n".join((self.output / f"{name}.log").read_text().splitlines()[1:]).strip()

    def shutdown(self):
        assert self.cluster is not None
        data = self.cluster / "data"
        confirmed_stopped = not self.start_attempted
        if self.start_attempted:
            # A failed/timed-out pg_ctl start may still have spawned postgres.
            # Try both bounded shutdown modes, then require status=3 (not running).
            for mode in ("fast", "immediate"):
                try:
                    self.command(f"stop-{mode}", [str(self.pg_bin / "pg_ctl"), "-D", str(data), "-w", "-t", "15", "-m", mode, "stop"], timeout=25, check=False)
                    status = self.command(f"status-after-{mode}", [str(self.pg_bin / "pg_ctl"), "-D", str(data), "status"], timeout=10, check=False)
                    if status.returncode == 3:
                        confirmed_stopped = True
                        break
                except (OSError, HarnessError):
                    continue
        log = self.cluster / "postgres.log"
        if log.is_file():
            shutil.copyfile(log, self.output / "postgres.log")
        if confirmed_stopped:
            shutil.rmtree(self.cluster)
            self.result["cleanup"] = {"status": "removed", "serverStopped": True}
        else:
            self.result["cleanup"] = {"status": "retained_unconfirmed", "directory": str(self.cluster), "serverStopped": False}
            self.result["status"] = "failed"
            self.result["error"] = "Shutdown could not be confirmed; owned temporary cluster retained"
        self.save_result()

    def run(self, preflight_only: bool = False) -> int:
        if self.preflight():
            self.result["status"] = "unavailable"
            self.save_result()
            return 2
        if preflight_only:
            self.result["status"] = "preflight_only"
            self.save_result()
            return 0
        self.cluster = Path(tempfile.mkdtemp(prefix="bfa-p5-sql-")).resolve()
        os.chmod(self.cluster, 0o700)
        for name in ("config", "socket"):
            (self.cluster / name).mkdir(mode=0o700)
        self.environment = isolated_environment(self.cluster / "config")
        self.result["status"] = "running"
        try:
            if "," in str(self.cluster):
                raise HarnessError("Owned temporary path cannot contain libpq multi-host commas")
            self.command("postgres-version", [str(self.pg_bin / "postgres"), "--version"], timeout=10)
            self.command("initdb", [str(self.pg_bin / "initdb"), "-D", str(self.cluster / "data"), "--username", DB_USER,
                                    "--auth-local=trust", "--auth-host=reject", "--encoding=UTF8", "--no-locale"], timeout=60)
            options = f"-k {shlex.quote(str(self.cluster / 'socket'))} -p {PORT} -c listen_addresses='' -c unix_socket_permissions=0700 -c logging_collector=off"
            self.start_attempted = True
            self.command("start", [str(self.pg_bin / "pg_ctl"), "-D", str(self.cluster / "data"), "-l", str(self.cluster / "postgres.log"),
                                   "-o", options, "-w", "-t", "20", "start"], timeout=30)
            self.command("create-fixture-db", self.psql("-c", f"CREATE DATABASE {DATABASE};", database="postgres"))
            self.result["serverVersion"] = self.query("server-version", "SELECT version();")
            guard = self.query("local-guard", "SELECT current_database()='bfa_p5_offline_fixture' AND inet_server_addr() IS NULL AND current_user='bfa_fixture_admin' AND current_setting('listen_addresses')='';")
            if guard != "t":
                raise HarnessError("Isolated local cluster identity check failed")
            self.sql_file("bootstrap", self.fixture_dir / "bootstrap.sql")
            for name in MIGRATIONS:
                self.sql_file("migration-" + name[:4], self.repo / "drizzle/migrations" / name)
            self.sql_file("draft-install", self.draft_dir / "p5-voice-admission.sql")
            self.result["nativeDatabaseTestsExecuted"] = True
            for phase, path in (("sequential", self.draft_dir / "p5-voice-admission-fixtures.sql"), ("roles", self.fixture_dir / "roles.sql")):
                self.sql_file(phase, path)
                labels = re.findall(r"BFA_SQL_PASS:\s*(.+)", (self.output / f"{phase}.log").read_text())
                self.result[phase + "Assertions"] = labels
                if len(labels) != EXPECTED_ASSERTIONS[phase]:
                    raise HarnessError(f"{phase} assertion evidence incomplete: expected {EXPECTED_ASSERTIONS[phase]}, got {len(labels)}")
            self.command("rollback-empty", self.psql("-c", empty_table_check()))
            if self.capacity:
                # Both rollback suites precede committing concurrency cases. The
                # latter deliberately retain fictional rows as case evidence.
                self.sql_file("capacity-install", self.draft_dir / "p5-voice-capacity.sql")
                self.command("capacity-install-empty", self.psql("-c", empty_table_check(True)))
                self.result["nativeCapacityTestsExecuted"] = True
                for phase, path in (("capacity-sequential", self.draft_dir / "p5-voice-capacity-fixtures.sql"),
                                    ("capacity-roles", self.fixture_dir / "capacity-roles.sql")):
                    self.sql_file(phase, path)
                    count, prefix = CAPACITY_ASSERTIONS[phase]
                    labels = re.findall(re.escape(prefix) + r"\s*(.+)", (self.output / f"{phase}.log").read_text())
                    self.result[phase + "Assertions"] = labels
                    if len(labels) != count:
                        raise HarnessError(f"{phase} assertion evidence incomplete: expected {count}, got {len(labels)}")
                    self.command(phase + "-rollback-empty", self.psql("-c", empty_table_check(True)))
            if self.v2:
                # Install before committing any race fixtures so the complete
                # 22-table inventory can be checked empty. The old 21 cases
                # still run first; no cutover revocation occurs until v2 cases.
                for name in V2_DRAFTS:
                    self.sql_file("v2-install-" + Path(name).stem, self.draft_dir / name)
                self.command("v2-install-empty", self.psql("-c", empty_table_check(True, True)))
            concurrency_result = self.output / "concurrency.json"
            self.command("concurrency", [sys.executable, "-I", str(self.fixture_dir / "concurrency.py"),
                                         "--psql", str(self.pg_bin / "psql"), "--socket", str(self.cluster / "socket"), "--port", PORT,
                                         "--database", DATABASE, "--user", DB_USER, "--output", str(concurrency_result),
                                         "--log-dir", str(self.output / "concurrency-logs")], timeout=240)
            evidence = json.loads(concurrency_result.read_text())
            cases = evidence.get("cases", [])
            if (evidence.get("failed") != 0 or evidence.get("passed") != EXPECTED_CONCURRENCY_CASES
                    or not isinstance(cases, list) or len(cases) != EXPECTED_CONCURRENCY_CASES
                    or any(not isinstance(case, dict) or case.get("status") != "passed"
                           or not isinstance(case.get("name"), str) for case in cases)
                    or len({case.get("name") for case in cases}) != EXPECTED_CONCURRENCY_CASES):
                raise HarnessError("Concurrency subprocess did not report all twelve distinct passing cases")
            self.result["concurrency"] = {"passed": evidence["passed"], "failed": evidence["failed"], "evidence": "concurrency.json"}
            if self.capacity:
                capacity_result = self.output / "capacity-concurrency.json"
                self.command("capacity-concurrency", [sys.executable, "-I", str(self.fixture_dir / "capacity_concurrency.py"),
                             "--psql", str(self.pg_bin / "psql"), "--socket", str(self.cluster / "socket"), "--port", PORT,
                             "--database", DATABASE, "--user", DB_USER, "--output", str(capacity_result),
                             "--log-dir", str(self.output / "capacity-concurrency-logs")], timeout=240)
                capacity_evidence = json.loads(capacity_result.read_text())
                validate_capacity_evidence(capacity_evidence, self.capacity_cases, self.capacity_expiry_cases)
                self.result["capacityConcurrency"] = {"passed": capacity_evidence["passed"], "failed": capacity_evidence["failed"],
                                                      "evidence": capacity_result.name}
            if self.v2:
                assert self.v2_runtime is not None
                v2_result = self.output / "v2-concurrency.json"
                self.result["nativeV2PhaseAttempted"] = True
                self.command("v2-concurrency", [sys.executable, "-I", str(self.fixture_dir / "v2_concurrency.py"),
                             "--psql", str(self.pg_bin / "psql"), "--socket", str(self.cluster / "socket"), "--port", PORT,
                             "--database", DATABASE, "--user", DB_USER, "--output", str(v2_result),
                             "--log-dir", str(self.output / "v2-concurrency-logs"),
                             "--runtime", str(self.v2_runtime),
                             "--bridge", str(self.fixture_dir / "cutover-native-bridge.ts")], timeout=360)
                v2_evidence = json.loads(v2_result.read_text())
                validate_v2_evidence(v2_evidence, self.v2_cases, self.v2_drain_cases)
                validate_v2_provenance(v2_evidence, self.result["sourceSha256"], self.result["v2Runtime"])
                self.result["nativeV2EvidenceAccepted"] = True
                self.result["v2Concurrency"] = {"passed": v2_evidence["passed"], "failed": v2_evidence["failed"],
                                                "evidence": v2_result.name}
            self.result["status"] = "passed"
        except KeyboardInterrupt:
            self.result.update(status="interrupted", error="Interrupted; shutdown attempted")
        except (OSError, ValueError, HarnessError) as exc:
            self.result.update(status="failed", error=str(exc))
        finally:
            self.shutdown()
        return 0 if self.result["status"] == "passed" else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin", required=True, type=Path, help="absolute directory containing installed native PostgreSQL binaries")
    parser.add_argument("--output", required=True, type=Path, help="absolute new/empty evidence directory")
    parser.add_argument("--preflight", action="store_true", help="check prerequisites only; never report database tests as passed")
    parser.add_argument("--capacity", action="store_true", help="also install and check the inactive capacity extension and its native contention cases")
    parser.add_argument("--v2", action="store_true", help="also prepare/run the exact v2 native cases; implies --capacity")
    parser.add_argument("--v2-runtime", type=Path, help="with --v2 only: absolute existing Bun executable for the offline cutover bridge")
    args = parser.parse_args(argv)
    if args.v2 != (args.v2_runtime is not None):
        parser.error("--v2 and an explicit --v2-runtime must be supplied together")
    try:
        run = LocalRun(Path(__file__).resolve().parents[3], args.pg_bin, args.output, capacity=args.capacity,
                       v2=args.v2, v2_runtime=args.v2_runtime)
        code = run.run(args.preflight)
        print(json.dumps({"status": run.result["status"], "evidence": str(run.output / "result.json")}))
        return code
    except HarnessError as exc:
        print(str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
