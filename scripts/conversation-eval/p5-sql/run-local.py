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
CAPACITY_ASSERTIONS = {"capacity-sequential": (129, "P5_CAPACITY_ASSERT:"),
                       "capacity-roles": (116, "P5_CAPACITY_ROLE_PASS:")}
BASE_TABLES = tuple(sorted([
    *("bfa_p5_voice." + name for name in ("generations", "owner_clocks", "session_fences", "issuances", "quotas", "approvals", "cleanup_owners", "proofs", "attempts", "claims")),
    *("public.bfa_p3b_" + name for name in ("staging_accounts", "threads", "allowances", "admissions")),
]))
CAPACITY_TABLES = tuple("bfa_p5_capacity." + name for name in ("pools", "routes", "allocations", "evidence", "sessions", "conflicts"))
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


def empty_table_check(include_capacity: bool = False) -> str:
    """Exact names, not just a count: a missing table cannot be hidden by an extra."""
    expected = sorted(BASE_TABLES + (CAPACITY_TABLES if include_capacity else ()))
    names = ",".join("'" + name + "'" for name in expected)
    return """DO $$ DECLARE r record; n bigint; seen text[]:=ARRAY[]::text[]; BEGIN
      FOR r IN SELECT schemaname,tablename FROM pg_tables
        WHERE schemaname IN ('bfa_p5_voice','bfa_p5_capacity')
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
    def __init__(self, repo: Path, pg_bin: Path, output: Path, *, capacity: bool = False):
        self.repo = repo.resolve()
        self.capacity = capacity
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
            "capacityRequested": capacity,
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
    args = parser.parse_args(argv)
    try:
        run = LocalRun(Path(__file__).resolve().parents[3], args.pg_bin, args.output, capacity=args.capacity)
        code = run.run(args.preflight)
        print(json.dumps({"status": run.result["status"], "evidence": str(run.output / "result.json")}))
        return code
    except HarnessError as exc:
        print(str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
