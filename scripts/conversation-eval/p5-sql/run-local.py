#!/usr/bin/env python3
"""Own an isolated native PostgreSQL cluster; never connect to a supplied DSN.

This is an offline fixture runner, not a migration/deployment command. It needs
ordinary nonroot PostgreSQL binaries. No root-check workaround is supported.
"""

from __future__ import annotations

import argparse
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
    def __init__(self, repo: Path, pg_bin: Path, output: Path):
        self.repo = repo.resolve()
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
            empty_check = """DO $$ DECLARE r record; n bigint; tables_seen integer:=0; BEGIN
              FOR r IN SELECT schemaname,tablename FROM pg_tables
                WHERE schemaname='bfa_p5_voice' OR (schemaname='public' AND tablename LIKE 'bfa_p3b_%') LOOP
                tables_seen:=tables_seen+1;
                EXECUTE format('SELECT count(*) FROM %I.%I',r.schemaname,r.tablename) INTO n;
                IF n<>0 THEN RAISE EXCEPTION 'Fixture rollback leaked rows in %.%',r.schemaname,r.tablename; END IF;
              END LOOP;
              IF tables_seen<>14 THEN RAISE EXCEPTION 'Expected fourteen fixture tables, found %',tables_seen; END IF;
            END $$;"""
            self.command("rollback-empty", self.psql("-c", empty_check))
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
    args = parser.parse_args(argv)
    try:
        run = LocalRun(Path(__file__).resolve().parents[3], args.pg_bin, args.output)
        code = run.run(args.preflight)
        print(json.dumps({"status": run.result["status"], "evidence": str(run.output / "result.json")}))
        return code
    except HarnessError as exc:
        print(str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
