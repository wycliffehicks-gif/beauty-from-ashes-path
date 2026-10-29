#!/usr/bin/env python3
"""Runner isolation/cleanup tests with explicit fake processes, not SQL evidence."""

import argparse
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location("p5_local_runner", Path(__file__).with_name("run-local.py"))
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
concurrency_spec = importlib.util.spec_from_file_location("p5_concurrency", Path(__file__).with_name("concurrency.py"))
concurrency = importlib.util.module_from_spec(concurrency_spec)
concurrency_spec.loader.exec_module(concurrency)


class RunnerIsolationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="bfa-runner-unit-")
        self.root = Path(self.temp.name)
        self.repo = self.root / "repo"
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.capture = self.root / "children.jsonl"
        self.running = self.root / "fake-running"
        fake = f'''#!{sys.executable}
import json, os, pathlib, sys
root = pathlib.Path({str(self.root)!r})
with (root / "children.jsonl").open("a") as f:
    f.write(json.dumps({{"argv": sys.argv, "env": dict(os.environ)}}) + "\\n")
name = pathlib.Path(sys.argv[0]).name
running = root / "fake-running"
if name == "initdb":
    pathlib.Path(sys.argv[sys.argv.index("-D") + 1]).mkdir()
elif name == "pg_ctl":
    op = sys.argv[-1]
    if op == "start":
        running.write_text("synthetic test server marker")
        sys.exit(1 if (root / "fail-start").exists() else 0)
    if op == "stop":
        if (root / "fail-stop").exists(): sys.exit(1)
        running.unlink(missing_ok=True)
    if op == "status": sys.exit(0 if running.exists() else 3)
elif name == "postgres":
    print("TEST DOUBLE; NOT PostgreSQL")
elif name == "psql":
    if "-c" in sys.argv:
        sql = sys.argv[sys.argv.index("-c") + 1]
        if "SELECT version()" in sql: print("TEST DOUBLE; NOT PostgreSQL")
        elif "current_database()=" in sql: print("t")
    if "-f" in sys.argv:
        source = pathlib.Path(sys.argv[sys.argv.index("-f")+1]).name
        count = 57 if source == "p5-voice-admission-fixtures.sql" else (145 if source == "roles.sql" else 1)
        if (root / "short-assertions").exists(): count = 1
        for i in range(count): print("NOTICE: BFA_SQL_PASS: synthetic harness unit fixture " + str(i) + "; NOT SQL execution")
'''
        for name in runner.BINARY_NAMES:
            path = self.bin / name
            path.write_text(fake)
            path.chmod(0o700)
        fixture = self.repo / "scripts/conversation-eval/p5-sql"
        fixture.mkdir(parents=True)
        paths = [
            fixture / "bootstrap.sql", fixture / "roles.sql", fixture / "run-local.py",
            *(self.repo / "drizzle/migrations" / name for name in runner.MIGRATIONS),
            self.repo / "docs/pilot/conversation/sql-drafts/p5-voice-admission.sql",
            self.repo / "docs/pilot/conversation/sql-drafts/p5-voice-admission-fixtures.sql",
        ]
        for path in paths:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("-- fixture only for runner unit tests\n")
        (fixture / "concurrency.py").write_text(f'''import json, pathlib, sys
root=pathlib.Path({str(self.root)!r})
count=1 if (root / "incomplete-concurrency").exists() else 12
cases=[{{"name":"synthetic case "+str(i),"status":"passed"}} for i in range(count)]
if (root / "failed-concurrency-case").exists(): cases[0]["status"]="failed"
pathlib.Path(sys.argv[sys.argv.index("--output")+1]).write_text(json.dumps({{"passed":count,"failed":0,"cases":cases,"testDouble":True}}))
''')

    def tearDown(self):
        self.temp.cleanup()

    def make_run(self):
        return runner.LocalRun(self.repo, self.bin, self.root / "output")

    def children(self):
        return [json.loads(line) for line in self.capture.read_text().splitlines()] if self.capture.exists() else []

    def test_root_refusal_spawns_nothing_and_records_unavailable(self):
        run = self.make_run()
        with patch.object(runner.os, "geteuid", return_value=0):
            self.assertEqual(run.run(), 2)
        self.assertEqual(run.result["status"], "unavailable")
        self.assertFalse(run.result["nativeDatabaseTestsExecuted"])
        self.assertEqual(self.children(), [])
        self.assertIsNone(run.cluster)

    def test_preflight_never_claims_database_execution(self):
        run = self.make_run()
        with patch.object(runner.os, "geteuid", return_value=1000):
            self.assertEqual(run.run(preflight_only=True), 0)
        self.assertEqual(run.result["status"], "preflight_only")
        self.assertFalse(run.result["nativeDatabaseTestsExecuted"])
        self.assertEqual(self.children(), [])

    def test_hostile_environment_cannot_redirect_children_or_open_tcp(self):
        run = self.make_run()
        poison = {"PGHOST": "remote.invalid", "PGDATABASE": "production", "PGUSER": "real-user", "PGPASSWORD": "SYNTHETIC_SECRET",
                  "PGSERVICE": "real", "PGOPTIONS": "-c search_path=attacker", "DATABASE_URL": "postgres://remote.invalid/real",
                  "PYTHONPATH": "/untrusted", "AWS_SECRET_ACCESS_KEY": "SYNTHETIC_SECRET", "HOME": "/untrusted", "PATH": "/untrusted"}
        with patch.object(runner.os, "geteuid", return_value=1000), patch.dict(os.environ, poison):
            self.assertEqual(run.run(), 0)
        for child in self.children():
            encoded = json.dumps(child)
            self.assertNotIn("SYNTHETIC_SECRET", encoded)
            self.assertNotIn("remote.invalid", encoded)
            self.assertNotIn("/untrusted", encoded)
            self.assertNotIn("PGSERVICE", child["env"])
            if Path(child["argv"][0]).name == "psql":
                args = child["argv"]
                self.assertEqual(args[args.index("-h") + 1], str(run.cluster / "socket"))
                self.assertIn(args[args.index("-d") + 1], [runner.DATABASE, "postgres"])
                self.assertEqual(args[args.index("-U") + 1], runner.DB_USER)
                self.assertIn("-X", args)
                self.assertIn("-w", args)
        start = next(c for c in self.children() if Path(c["argv"][0]).name == "pg_ctl" and c["argv"][-1] == "start")
        self.assertIn("listen_addresses=''", start["argv"][start["argv"].index("-o") + 1])
        self.assertIn("unix_socket_permissions=0700", start["argv"][start["argv"].index("-o") + 1])
        self.assertFalse(run.cluster.exists())
        self.assertFalse(self.running.exists())

    def test_failed_start_still_stops_a_partially_started_server(self):
        (self.root / "fail-start").touch()
        run = self.make_run()
        with patch.object(runner.os, "geteuid", return_value=1000):
            self.assertEqual(run.run(), 1)
        self.assertEqual(run.result["status"], "failed")
        self.assertFalse(run.result["nativeDatabaseTestsExecuted"])
        self.assertEqual(run.result["cleanup"]["status"], "removed")
        self.assertFalse(self.running.exists())
        self.assertFalse(run.cluster.exists())
        self.assertFalse(any(p["name"] == "draft-install" for p in run.result["phases"]))

    def test_unconfirmed_shutdown_retains_owned_data_and_fails_run(self):
        (self.root / "fail-stop").touch()
        run = self.make_run()
        try:
            with patch.object(runner.os, "geteuid", return_value=1000):
                self.assertEqual(run.run(), 1)
            self.assertEqual(run.result["status"], "failed")
            self.assertEqual(run.result["cleanup"]["status"], "retained_unconfirmed")
            self.assertTrue(run.cluster.is_dir())
            self.assertTrue(self.running.exists())
        finally:
            # This is our known synthetic unit-test directory, never a server.
            if run.cluster and run.cluster.exists():
                shutil.rmtree(run.cluster)

    def test_interrupt_after_start_runs_cleanup(self):
        run = self.make_run()
        actual = run.command

        def interrupt(name, *args, **kwargs):
            if name == "bootstrap":
                raise KeyboardInterrupt()
            return actual(name, *args, **kwargs)

        with patch.object(runner.os, "geteuid", return_value=1000), patch.object(run, "command", side_effect=interrupt):
            self.assertEqual(run.run(), 1)
        self.assertEqual(run.result["status"], "interrupted")
        self.assertFalse(self.running.exists())
        self.assertFalse(run.cluster.exists())

    def test_nonempty_output_and_output_symlink_are_rejected(self):
        target = self.root / "kept"
        target.mkdir()
        sentinel = target / "keep.txt"
        sentinel.write_text("preserve")
        with self.assertRaises(runner.HarnessError):
            runner.LocalRun(self.repo, self.bin, target)
        link = self.root / "linked"
        link.symlink_to(target, target_is_directory=True)
        with self.assertRaises(runner.HarnessError):
            runner.LocalRun(self.repo, self.bin, link)
        self.assertEqual(sentinel.read_text(), "preserve")
        self.assertEqual(self.children(), [])

    def test_incomplete_assertion_evidence_fails_and_stops_cluster(self):
        (self.root / "short-assertions").touch()
        run = self.make_run()
        with patch.object(runner.os, "geteuid", return_value=1000):
            self.assertEqual(run.run(), 1)
        self.assertIn("assertion evidence incomplete", run.result["error"])
        self.assertFalse(self.running.exists())
        self.assertFalse(run.cluster.exists())

    def test_partial_concurrency_report_cannot_claim_complete_success(self):
        (self.root / "incomplete-concurrency").touch()
        run = self.make_run()
        with patch.object(runner.os, "geteuid", return_value=1000):
            self.assertEqual(run.run(), 1)
        self.assertIn("all twelve", run.result["error"])
        self.assertFalse(self.running.exists())

    def test_failing_case_cannot_hide_behind_zero_failed_summary(self):
        (self.root / "failed-concurrency-case").touch()
        run = self.make_run()
        with patch.object(runner.os, "geteuid", return_value=1000):
            self.assertEqual(run.run(), 1)
        self.assertIn("all twelve", run.result["error"])
        self.assertFalse(self.running.exists())

    def test_comma_in_owned_temporary_path_cannot_redirect_libpq(self):
        run = self.make_run()
        cluster = self.root / "owned,remote.invalid"
        cluster.mkdir(mode=0o700)
        with patch.object(runner.os, "geteuid", return_value=1000), patch.object(runner.tempfile, "mkdtemp", return_value=str(cluster)):
            self.assertEqual(run.run(), 1)
        self.assertIn("multi-host commas", run.result["error"])
        self.assertEqual(self.children(), [])
        self.assertFalse(cluster.exists())

    def test_no_external_connection_option_is_accepted(self):
        for option in ("--dsn", "--host", "--database", "--socket"):
            with self.subTest(option=option), contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as exc:
                runner.main(["--pg-bin", str(self.bin), "--output", str(self.root / "output"), option, "remote.invalid"])
            self.assertEqual(exc.exception.code, 2)
        self.assertEqual(self.children(), [])
        self.assertFalse((self.root / "output").exists())


class ConnectionGuardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="bfa-connection-guard-")
        self.root = Path(self.temp.name)
        self.socket = self.root / "socket"
        self.socket.mkdir(mode=0o700)

    def tearDown(self):
        self.temp.cleanup()

    def args(self, **changes):
        values = dict(psql=sys.executable, socket=str(self.socket), port=55432,
                      database="bfa_p5_offline_fixture", user="bfa_fixture_admin")
        values.update(changes)
        return argparse.Namespace(**values)

    def test_private_single_local_socket_is_accepted_without_connecting(self):
        with patch.object(concurrency.subprocess, "Popen") as child:
            args = self.args()
            concurrency.validate_connection_arguments(args)
            self.assertEqual(args.socket, str(self.socket.resolve()))
            child.assert_not_called()

    def test_existing_comma_directory_cannot_be_a_libpq_multihost_string(self):
        path = self.root / "socket,remote.invalid"
        path.mkdir(mode=0o700)
        with patch.object(concurrency.subprocess, "Popen") as child:
            with self.assertRaises(ValueError):
                concurrency.validate_connection_arguments(self.args(socket=str(path)))
            child.assert_not_called()

    def test_resolved_parent_comma_cannot_enable_remote_fallback(self):
        parent = self.root / "parent,remote.invalid"
        parent.mkdir(mode=0o700)
        (parent / "socket").mkdir(mode=0o700)
        alias = self.root / "alias"
        alias.symlink_to(parent, target_is_directory=True)
        with self.assertRaises(ValueError):
            concurrency.validate_connection_arguments(self.args(socket=str(alias / "socket")))

    def test_shared_or_symlink_socket_is_rejected(self):
        self.socket.chmod(0o755)
        with self.assertRaises(ValueError):
            concurrency.validate_connection_arguments(self.args())
        self.socket.chmod(0o700)
        link = self.root / "linked"
        link.symlink_to(self.socket, target_is_directory=True)
        with self.assertRaises(ValueError):
            concurrency.validate_connection_arguments(self.args(socket=str(link)))

    def test_remote_host_and_nonfixture_identity_are_rejected(self):
        for options in ({"socket":"remote.invalid"}, {"database":"production"},
                        {"user":"actual-user"}, {"port":0}):
            with self.subTest(options=options), self.assertRaises(ValueError):
                concurrency.validate_connection_arguments(self.args(**options))


if __name__ == "__main__":
    unittest.main(verbosity=2)
