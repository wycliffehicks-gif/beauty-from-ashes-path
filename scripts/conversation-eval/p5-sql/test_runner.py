#!/usr/bin/env python3
"""Runner isolation/cleanup tests with explicit fake processes, not SQL evidence."""

import argparse
import contextlib
import copy
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
        if source == "p5-voice-capacity.sql" and (root / "fail-capacity-install").exists(): sys.exit(1)
        count = 57 if source == "p5-voice-admission-fixtures.sql" else (145 if source == "roles.sql" else 1)
        prefix = "BFA_SQL_PASS:"
        if source == "p5-voice-capacity-fixtures.sql": count, prefix = 129, "P5_CAPACITY_ASSERT:"
        if source == "capacity-roles.sql": count, prefix = 116, "P5_CAPACITY_ROLE_PASS:"
        if (root / "short-assertions").exists(): count = 1
        if source == "capacity-roles.sql" and (root / "short-capacity-assertions").exists(): count = 1
        for i in range(count): print("NOTICE: " + prefix + " synthetic harness unit fixture " + str(i) + "; NOT SQL execution")
'''
        for name in runner.BINARY_NAMES:
            path = self.bin / name
            path.write_text(fake)
            path.chmod(0o700)
        fixture = self.repo / "scripts/conversation-eval/p5-sql"
        fixture.mkdir(parents=True)
        paths = [
            fixture / "bootstrap.sql", fixture / "roles.sql", fixture / "run-local.py", fixture / "capacity-roles.sql",
            *(self.repo / "drizzle/migrations" / name for name in runner.MIGRATIONS),
            self.repo / "docs/pilot/conversation/sql-drafts/p5-voice-admission.sql",
            self.repo / "docs/pilot/conversation/sql-drafts/p5-voice-admission-fixtures.sql",
            self.repo / "docs/pilot/conversation/sql-drafts/p5-voice-capacity.sql",
            self.repo / "docs/pilot/conversation/sql-drafts/p5-voice-capacity-fixtures.sql",
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

        capacity_names = tuple("synthetic capacity case " + str(i) for i in range(9))
        (fixture / "capacity_concurrency.py").write_text(f'''import json, pathlib, sys
CASE_NAMES = {capacity_names!r}
EXPIRY_CASE_NAMES = {capacity_names[-3:]!r}
root=pathlib.Path({str(self.root)!r})
cases=[{{"name":name,"status":"passed","checks":["SYNTHETIC assertion; NOT SQL"],
         "barriers":[{{"pid":100+i,"holderPid":200+i,"blockers":[200+i],"state":"active","waitType":"Lock","waitEvent":"advisory"}}]}}
       for i,name in enumerate(CASE_NAMES)]
for case in cases:
    if case["name"] in EXPIRY_CASE_NAMES:
        case["checks"].append("Database wait barrier observed before expiry")
        case["barriers"].append({{"kind":"database-clock","deadlineMs":123,"observedMs":124}})
if (root / "missing-capacity-barrier").exists(): cases[0]["barriers"]=[]
pathlib.Path(sys.argv[sys.argv.index("--output")+1]).write_text(json.dumps({{"passed":len(cases),"failed":0,"cases":cases,"testDouble":True}}))
''')

    def tearDown(self):
        self.temp.cleanup()

    def make_run(self, *, capacity=False):
        return runner.LocalRun(self.repo, self.bin, self.root / "output", capacity=capacity)

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


    def test_default_path_does_not_require_or_execute_capacity_sources(self):
        fixture = self.repo / "scripts/conversation-eval/p5-sql"
        (fixture / "capacity_concurrency.py").unlink()
        (fixture / "capacity-roles.sql").unlink()
        run = self.make_run()
        with patch.object(runner.os, "geteuid", return_value=1000):
            self.assertEqual(run.run(), 0)
        self.assertFalse(run.result["capacityRequested"])
        self.assertFalse(run.result["nativeCapacityTestsExecuted"])
        self.assertFalse(any("capacity" in phase["name"] for phase in run.result["phases"]))
        self.assertFalse(any("capacity" in path for path in run.result["sourceSha256"]))

    def test_capacity_mode_runs_rollback_suites_before_committing_races(self):
        run = self.make_run(capacity=True)
        with patch.object(runner.os, "geteuid", return_value=1000):
            self.assertEqual(run.run(), 0)
        phases = [phase["name"] for phase in run.result["phases"]]
        selected = [phase for phase in phases if phase in (
            "rollback-empty", "capacity-install", "capacity-install-empty", "capacity-sequential",
            "capacity-sequential-rollback-empty", "capacity-roles", "capacity-roles-rollback-empty",
            "concurrency", "capacity-concurrency")]
        self.assertEqual(selected, ["rollback-empty", "capacity-install", "capacity-install-empty", "capacity-sequential",
                                  "capacity-sequential-rollback-empty", "capacity-roles", "capacity-roles-rollback-empty",
                                  "concurrency", "capacity-concurrency"])
        self.assertEqual(len(run.result["capacity-sequentialAssertions"]), 129)
        self.assertEqual(len(run.result["capacity-rolesAssertions"]), 116)
        self.assertEqual(run.result["capacityConcurrency"]["passed"], 9)
        self.assertTrue(run.result["nativeCapacityTestsExecuted"])
        self.assertFalse(self.running.exists())
        self.assertFalse(run.cluster.exists())

    def test_capacity_install_failure_cleans_up_and_skips_all_races(self):
        (self.root / "fail-capacity-install").touch()
        run = self.make_run(capacity=True)
        with patch.object(runner.os, "geteuid", return_value=1000):
            self.assertEqual(run.run(), 1)
        self.assertFalse(run.result["nativeCapacityTestsExecuted"])
        self.assertIn("capacity-install failed", run.result["error"])
        self.assertFalse(any("concurrency" in phase["name"] for phase in run.result["phases"]))
        self.assertFalse(self.running.exists())
        self.assertFalse(run.cluster.exists())

    def test_capacity_partial_role_evidence_fails_before_races_and_cleans_up(self):
        (self.root / "short-capacity-assertions").touch()
        run = self.make_run(capacity=True)
        with patch.object(runner.os, "geteuid", return_value=1000):
            self.assertEqual(run.run(), 1)
        self.assertIn("capacity-roles assertion evidence incomplete", run.result["error"])
        self.assertFalse(any("concurrency" in phase["name"] for phase in run.result["phases"]))
        self.assertFalse(self.running.exists())
        self.assertFalse(run.cluster.exists())

    def test_capacity_barrier_failure_cannot_pass_and_still_cleans_up(self):
        (self.root / "missing-capacity-barrier").touch()
        run = self.make_run(capacity=True)
        with patch.object(runner.os, "geteuid", return_value=1000):
            self.assertEqual(run.run(), 1)
        self.assertIn("missing observed lock barrier", run.result["error"])
        self.assertFalse(self.running.exists())
        self.assertFalse(run.cluster.exists())

    def test_capacity_missing_source_fails_without_starting_children(self):
        (self.repo / "scripts/conversation-eval/p5-sql/capacity-roles.sql").unlink()
        run = self.make_run(capacity=True)
        with patch.object(runner.os, "geteuid", return_value=1000):
            self.assertEqual(run.run(), 2)
        self.assertFalse(run.result["nativeCapacityTestsExecuted"])
        self.assertEqual(self.children(), [])

    def test_case_inventory_is_read_without_executing_source(self):
        source = self.repo / "scripts/conversation-eval/p5-sql/capacity_concurrency.py"
        sentinel = self.root / "must-not-exist"
        source.write_text("from pathlib import Path\nPath(" + repr(str(sentinel)) + ").touch()\nCASE_NAMES = tuple(str(i) for i in range(9))\n")
        with self.assertRaises(runner.HarnessError):
            runner.capacity_case_names(source)
        self.assertFalse(sentinel.exists())


class CapacityEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.names = tuple("reviewed case " + str(i) for i in range(9))
        self.evidence = {"passed":9,"failed":0,"cases":[
            {"name":name,"status":"passed","checks":["Actual fixture assertion label"],
             "barriers":[{"pid":101+i,"holderPid":201+i,"blockers":[201+i],"state":"active",
                          "waitType":"Lock","waitEvent":"advisory"}]}
            for i,name in enumerate(self.names)]}

    def test_complete_named_observed_lock_evidence_is_accepted(self):
        runner.validate_capacity_evidence(self.evidence, self.names)

    def test_incomplete_forged_or_failed_case_evidence_is_rejected(self):
        mutations = {
            "missing case": lambda e: e["cases"].pop(),
            "duplicate case": lambda e: e["cases"].__setitem__(1, copy.deepcopy(e["cases"][0])),
            "wrong name": lambda e: e["cases"][0].update(name="unreviewed replacement"),
            "wrong order": lambda e: e["cases"].reverse(),
            "failed despite totals": lambda e: e["cases"][0].update(status="failed"),
            "cleanup failure": lambda e: e["cases"][0].update(cleanupErrors=["failed worker close"]),
            "no assertions": lambda e: e["cases"][0].update(checks=[]),
            "no lock": lambda e: e["cases"][0].update(barriers=[]),
            "clock alone": lambda e: e["cases"][0].update(barriers=[{"kind":"database-clock","deadlineMs":2,"observedMs":3}]),
            "self blocker": lambda e: e["cases"][0]["barriers"][0].update(holderPid=101,blockers=[101]),
            "unobserved holder": lambda e: e["cases"][0]["barriers"][0].update(holderPid=999),
            "nonlocking wait": lambda e: e["cases"][0]["barriers"][0].update(waitType="Client"),
            "not active": lambda e: e["cases"][0]["barriers"][0].update(state="idle"),
            "boolean pid": lambda e: e["cases"][0]["barriers"][0].update(pid=True),
            "failed total": lambda e: e.update(failed=1),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                evidence = copy.deepcopy(self.evidence)
                mutate(evidence)
                with self.assertRaises(runner.HarnessError):
                    runner.validate_capacity_evidence(evidence, self.names)


    def test_expiry_evidence_requires_ordered_actual_clock_and_preexpiry_check(self):
        expiry = (self.names[-1],)
        valid = copy.deepcopy(self.evidence)
        case = valid["cases"][-1]
        case["checks"].append("Database wait barrier observed before expiry")
        case["barriers"].append({"kind":"database-clock","deadlineMs":100,"observedMs":101})
        runner.validate_capacity_evidence(valid, self.names, expiry)
        mutations = {
            "no clock": lambda c: c["barriers"].pop(),
            "clock before wait": lambda c: c["barriers"].reverse(),
            "before deadline": lambda c: c["barriers"][-1].update(observedMs=99),
            "boolean time": lambda c: c["barriers"][-1].update(deadlineMs=True),
            "no preexpiry assertion": lambda c: c["checks"].pop(),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                evidence = copy.deepcopy(valid)
                mutate(evidence["cases"][-1])
                with self.assertRaises(runner.HarnessError):
                    runner.validate_capacity_evidence(evidence, self.names, expiry)


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
