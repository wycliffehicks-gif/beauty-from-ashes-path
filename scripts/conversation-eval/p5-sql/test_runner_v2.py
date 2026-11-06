#!/usr/bin/env python3
"""V2 runner/process-double and offline bridge tests; never native SQL evidence."""
from __future__ import annotations

import copy
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("p5_unchanged_runner_tests", HERE / "test_runner.py")
assert _spec is not None and _spec.loader is not None
legacy_tests = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(legacy_tests)
runner = legacy_tests.runner
CASE_NAMES = runner.v2_case_names(HERE / "v2_concurrency.py")
DRAIN_CASE_NAMES = runner.v2_drain_cases(HERE / "v2_concurrency.py", CASE_NAMES)


def valid_evidence() -> dict:
    """Clearly fictional report values exercise report rejection, not locks."""
    cases = []
    for index, name in enumerate(CASE_NAMES):
        observer, worker, holder = 1000 + index * 3, 1001 + index * 3, 1002 + index * 3
        identity = {"ownerId": "fictional-owner", "authSessionId": "fictional-auth-session",
                    "parentVersion": None if name in DRAIN_CASE_NAMES else 0,
                    "authorityFingerprint": "a" * 64, "issuedAt": 100000, "expiresAt": 700000,
                    "claim": {"claimId": "fictional-claim", "binding": {"ownerId": "fictional-owner"}, "expiresAt": 700000},
                    "cleanupId": "fictional-cleanup", "proof": None, "markRequest": None}
        if index in (2,3,4,5,8,9,10,11,12,13):
            proof = {"protocol":2,"receiptId":"fictional-receipt","operation":"claim" if index in (2,3,8,9) else "inspect",
                     "claim":copy.deepcopy(identity["claim"]),"cleanupId":identity["cleanupId"],"authSessionId":identity["authSessionId"],
                     "parentVersion":identity["parentVersion"],"authorityFingerprint":identity["authorityFingerprint"],
                     "identityExpiresAt":700000,"verifiedAt":100100,"expiresAt":110100,"effectiveExpiresAt":700000}
            identity["proof"] = proof
            if proof["operation"] == "inspect":
                identity["markRequest"]={"protocol":2,"proof":copy.deepcopy(proof),"operationId":"fictional-operation","expectedPoolVersion":1}
        case = {"name": name, "status": "passed", "checks": ["SYNTHETIC process-double assertion; NOT native SQL"],
                "barriers": [{"pid": worker, "holderPid": holder, "blockers": [holder],
                              "state": "active", "waitType": "Lock", "waitEvent": "advisory"}],
                "backendPids": [observer, worker, holder], "committedStateBefore": {"synthetic": "before"},
                "committedStateAfter": {"synthetic": "after"}, "identity": identity}
        if name in DRAIN_CASE_NAMES:
            drained = name == DRAIN_CASE_NAMES[1]
            events = (["lock-observed", "fixture-gate-closed", "legacy-call-completed", "drain-observed", "privileges-revoked",
                       "new-legacy-call-denied", "cleanup-completed"] if drained else
                      ["lock-observed", "fixture-gate-closed", "privileges-revoked", "not-drained-observed", "legacy-call-completed",
                       "new-legacy-call-denied", "cleanup-completed"])
            case["cutover"] = {"baselineStatus": "fail", "candidateStatus": "pass", "gateClosed": True,
                               "legacyWorkerPid": worker, "completedBeforeRevoke": drained, "newLegacyDenied": True,
                               "events": events, "drain": {"drained": drained, "trackedPids": [worker], "observed": [
                                   {"pid": worker, "state": "idle" if drained else "active",
                                    "xactStart": None if drained else "SYNTHETIC transaction time", "lockCount": 0 if drained else 1}]}}
        cases.append(case)
    return {"passed": len(cases), "failed": 0, "cases": cases, "deployable": False, "testDouble": True,
            "protocol":2,"caseInventoryVersion":1,"earlierAccounting":{"retained":True,"sha256":"a"*64,
                "tables":[table for table in runner.BASE_TABLES+runner.CAPACITY_TABLES+runner.V2_TABLES if not table.startswith("public.")]}}


class V2RunnerProcessTests(unittest.TestCase):
    def setUp(self):
        # Reuse only the unchanged test fixture setup, never its real runner CLI.
        self.fixture = legacy_tests.RunnerIsolationTests(methodName="runTest")
        self.fixture.setUp()
        self.root, self.repo, self.bin = self.fixture.root, self.fixture.repo, self.fixture.bin
        self.scripts = self.repo / "scripts/conversation-eval/p5-sql"
        for name in runner.V2_DRAFTS:
            (self.repo / "docs/pilot/conversation/sql-drafts" / name).write_text("-- SYNTHETIC installation source\n")
        for name in ("cutover-native-bridge.ts", "cutover-inventory.ts"):
            shutil.copyfile(HERE / name, self.scripts / name)
        self.runtime = self.bin / "bun"
        self.runtime.write_text("#!/bin/sh\n# SYNTHETIC executable; never Bun or a database\nexit 0\n")
        self.runtime.chmod(0o700)
        (self.root / "v2-evidence.json").write_text(json.dumps(valid_evidence()))
        (self.scripts / "v2_concurrency.py").write_text(f'''import hashlib,json,pathlib,sys
CASE_NAMES = {CASE_NAMES!r}
DRAIN_CASE_NAMES = {DRAIN_CASE_NAMES!r}
root=pathlib.Path({str(self.root)!r})
if (root / "fail-v2-child").exists(): sys.exit(1)
evidence=json.loads((root / "v2-evidence.json").read_text())
base=pathlib.Path(__file__).resolve().parent
names=("v2_concurrency.py","concurrency.py","capacity_concurrency.py","cutover-native-bridge.ts","cutover-inventory.ts")
evidence["sourceSha256"]={{"scripts/conversation-eval/p5-sql/"+name:hashlib.sha256((base/name).read_bytes()).hexdigest() for name in names}}
runtime=pathlib.Path(sys.argv[sys.argv.index("--runtime")+1])
evidence["runtime"]={{"path":str(runtime),"sha256":hashlib.sha256(runtime.read_bytes()).hexdigest(),"name":"bun","version":"0.0.0-synthetic"}}
if (root / "bad-v2-provenance").exists(): evidence["runtime"]["sha256"]="0"*64
pathlib.Path(sys.argv[sys.argv.index("--output")+1]).write_text(json.dumps(evidence))
''')

    def tearDown(self):
        self.fixture.tearDown()

    def make_run(self, **changes):
        options = {"v2": True, "v2_runtime": self.runtime}
        options.update(changes)
        return runner.LocalRun(self.repo, self.bin, self.root / "output", **options)

    def execute(self, run, **changes):
        with patch.object(runner.os, "geteuid", return_value=1000):
            return run.run(**changes)

    def test_direct_v2_child_cli_refuses_root_before_connection_or_driver(self):
        spec=importlib.util.spec_from_file_location("p5_v2_direct_guard_test",HERE/"v2_concurrency.py")
        assert spec is not None and spec.loader is not None
        native=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(native)
        argv=["v2_concurrency.py","--psql",str(self.bin/"psql"),"--socket",str(self.root/"socket"),
              "--port","55432","--runtime",str(self.runtime),"--bridge",str(HERE/"cutover-native-bridge.ts"),
              "--output",str(self.root/"unused-native-output.json")]
        with patch.object(sys,"argv",argv),patch.object(native.os,"geteuid",return_value=0), \
                patch.object(native.base,"validate_connection_arguments") as connection, \
                patch.object(native,"V2Driver") as driver,contextlib.redirect_stderr(io.StringIO()),self.assertRaises(SystemExit) as error:
            native.main()
        self.assertEqual(error.exception.code,2)
        connection.assert_not_called()
        driver.assert_not_called()
        self.assertEqual(self.fixture.children(),[])
        self.assertFalse((self.root/"unused-native-output.json").exists())

    def test_v2_requires_explicit_runtime_pair_and_rejects_external_database_options(self):
        for extra in (["--v2"], ["--v2-runtime", str(self.runtime)], ["--v2", "--v2-runtime", str(self.runtime), "--dsn", "remote.invalid"]):
            with self.subTest(extra=extra), contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                runner.main(["--pg-bin", str(self.bin), "--output", str(self.root / "output"), *extra])
        self.assertFalse((self.root / "output").exists())
        self.assertEqual(self.fixture.children(), [])

    def test_v2_root_refusal_starts_no_child_and_claims_no_attempt(self):
        run = self.make_run()
        with patch.object(runner.os, "geteuid", return_value=0):
            self.assertEqual(run.run(), 2)
        self.assertFalse(run.result["nativeV2PhaseAttempted"])
        self.assertFalse(run.result["nativeV2EvidenceAccepted"])
        self.assertEqual(self.fixture.children(), [])
        self.assertIsNone(run.cluster)

    def test_v2_preflight_hashes_exact_sources_and_runtime_without_execution(self):
        run = self.make_run()
        self.assertEqual(self.execute(run, preflight_only=True), 0)
        self.assertEqual(run.result["status"], "preflight_only")
        self.assertTrue(run.result["capacityRequested"])
        self.assertFalse(run.result["nativeV2PhaseAttempted"])
        self.assertFalse(run.result["nativeV2EvidenceAccepted"])
        self.assertEqual(run.result["v2Runtime"]["sha256"], hashlib.sha256(self.runtime.read_bytes()).hexdigest())
        for name in (*runner.V2_DRAFTS, "v2_concurrency.py", "cutover-inventory.ts", "cutover-native-bridge.ts"):
            self.assertTrue(any(path.endswith("/" + name) for path in run.result["sourceSha256"]))
        self.assertEqual(self.fixture.children(), [])

    def test_missing_v2_source_refuses_before_any_child(self):
        (self.scripts / "cutover-inventory.ts").unlink()
        run = self.make_run()
        self.assertEqual(self.execute(run), 2)
        self.assertFalse(run.result["nativeV2PhaseAttempted"])
        self.assertEqual(self.fixture.children(), [])

    def test_invalid_or_missing_runtime_refuses_before_any_child(self):
        for runtime in (None, Path("relative-bun"), self.root / "missing-bun", self.root):
            with self.subTest(runtime=runtime):
                output = self.root / ("out-" + str(len(list(self.root.glob('out-*')))))
                run = runner.LocalRun(self.repo, self.bin, output, v2=True, v2_runtime=runtime)
                self.assertEqual(self.execute(run), 2)
                self.assertEqual(self.fixture.children(), [])

    def test_v2_inventory_is_literal_and_not_executed_during_preflight(self):
        source = self.scripts / "v2_concurrency.py"
        sentinel = self.root / "not-executed"
        source.write_text("from pathlib import Path\nPath(" + repr(str(sentinel)) + ").touch()\nCASE_NAMES=tuple(str(i) for i in range(16))\n")
        run = self.make_run()
        self.assertEqual(self.execute(run), 2)
        self.assertFalse(sentinel.exists())
        self.assertEqual(self.fixture.children(), [])

    def test_v2_runs_complete_legacy_paths_then_new_cases_and_retains_provenance(self):
        run = self.make_run()
        self.assertEqual(self.execute(run), 0)
        names = [phase["name"] for phase in run.result["phases"]]
        self.assertLess(names.index("capacity-roles-rollback-empty"), names.index("v2-install-empty"))
        self.assertLess(names.index("v2-install-empty"), names.index("concurrency"))
        self.assertLess(names.index("concurrency"), names.index("capacity-concurrency"))
        self.assertLess(names.index("capacity-concurrency"), names.index("v2-concurrency"))
        self.assertEqual(run.result["concurrency"]["passed"], 12)
        self.assertEqual(run.result["capacityConcurrency"]["passed"], 9)
        self.assertEqual(run.result["v2Concurrency"]["passed"], 16)
        self.assertTrue(run.result["nativeV2PhaseAttempted"])
        self.assertTrue(run.result["nativeV2EvidenceAccepted"])
        self.assertFalse(self.fixture.running.exists())
        self.assertFalse(run.cluster.exists())

    def test_v2_keeps_isolated_environment_and_socket_arguments(self):
        run = self.make_run()
        with patch.dict(os.environ, {"PGHOST": "remote.invalid", "BUN_OPTIONS": "--preload /untrusted", "NODE_OPTIONS": "--require /untrusted", "DATABASE_URL": "SYNTHETIC_SECRET", "AWS_SECRET_ACCESS_KEY": "SYNTHETIC_SECRET"}):
            self.assertEqual(self.execute(run), 0)
        for child in self.fixture.children():
            self.assertNotIn("remote.invalid", json.dumps(child))
            self.assertNotIn("SYNTHETIC_SECRET", json.dumps(child))
            self.assertNotIn("BUN_OPTIONS", child["env"])
            self.assertNotIn("NODE_OPTIONS", child["env"])
        log = (run.output / "v2-concurrency.log").read_text()
        argv = json.loads(log.splitlines()[0].removeprefix("argv: "))
        self.assertEqual(argv[argv.index("--runtime") + 1], str(self.runtime.resolve()))
        self.assertEqual(argv[argv.index("--bridge") + 1], str(self.scripts / "cutover-native-bridge.ts"))
        self.assertEqual(argv[argv.index("--socket") + 1], str(run.cluster / "socket"))
        self.assertIn("-I", argv)

    def test_v2_install_failure_skips_all_races_and_cleans_owned_cluster(self):
        run = self.make_run()
        actual = run.command
        def fail(name, *args, **kwargs):
            if name == "v2-install-p5-voice-v2-parent-issuance":
                raise runner.HarnessError("SYNTHETIC v2 install failure")
            return actual(name, *args, **kwargs)
        with patch.object(run, "command", side_effect=fail):
            self.assertEqual(self.execute(run), 1)
        self.assertFalse(run.result["nativeV2PhaseAttempted"])
        self.assertFalse(any("concurrency" in phase["name"] for phase in run.result["phases"]))
        self.assertFalse(self.fixture.running.exists())
        self.assertFalse(run.cluster.exists())

    def test_v2_child_failure_records_attempt_without_acceptance_and_cleans_up(self):
        (self.root / "fail-v2-child").touch()
        run = self.make_run()
        self.assertEqual(self.execute(run), 1)
        self.assertTrue(run.result["nativeV2PhaseAttempted"])
        self.assertFalse(run.result["nativeV2EvidenceAccepted"])
        self.assertFalse(self.fixture.running.exists())
        self.assertFalse(run.cluster.exists())

    def test_v2_missing_barrier_rejects_partial_report_and_cleans_up(self):
        evidence = valid_evidence()
        evidence["cases"][0]["barriers"] = []
        (self.root / "v2-evidence.json").write_text(json.dumps(evidence))
        run = self.make_run()
        self.assertEqual(self.execute(run), 1)
        self.assertTrue(run.result["nativeV2PhaseAttempted"])
        self.assertFalse(run.result["nativeV2EvidenceAccepted"])
        self.assertIn("missing observed lock barrier", run.result["error"])
        self.assertFalse(self.fixture.running.exists())

    def test_v2_runtime_provenance_mismatch_fails_after_attempt(self):
        (self.root / "bad-v2-provenance").touch()
        run = self.make_run()
        self.assertEqual(self.execute(run), 1)
        self.assertTrue(run.result["nativeV2PhaseAttempted"])
        self.assertFalse(run.result["nativeV2EvidenceAccepted"])
        self.assertIn("runtime provenance", run.result["error"])
        self.assertFalse(self.fixture.running.exists())

    def test_default_and_capacity_paths_do_not_require_v2_files_or_runtime(self):
        (self.scripts / "v2_concurrency.py").unlink()
        (self.scripts / "cutover-native-bridge.ts").unlink()
        for capacity in (False, True):
            with self.subTest(capacity=capacity):
                run = runner.LocalRun(self.repo, self.bin, self.root / ("old-" + str(capacity)), capacity=capacity)
                self.assertEqual(self.execute(run), 0)
                self.assertFalse(run.result["v2Requested"])
                self.assertFalse(run.result["nativeV2PhaseAttempted"])
                self.assertFalse(any("v2" in phase["name"] for phase in run.result["phases"]))
                self.assertFalse(any("v2" in path or "cutover" in path for path in run.result["sourceSha256"]))

    def test_exact_v2_empty_inventory_has22_named_tables_and_no_extra_schema(self):
        expected = set(runner.BASE_TABLES + runner.CAPACITY_TABLES + runner.V2_TABLES)
        self.assertEqual(len(expected), 22)
        sql = runner.empty_table_check(True, True)
        for table in expected:
            self.assertIn("'" + table + "'", sql)
        self.assertIn("'bfa_p5_voice_v2'", sql)
        self.assertIn("seen IS DISTINCT FROM ARRAY[", sql)
        self.assertIn("IF n<>0 THEN", sql)
        self.assertNotIn("bfa_p5_voice_v2", runner.empty_table_check(True))


class V2EvidenceTests(unittest.TestCase):
    def test_complete_explicitly_synthetic_evidence_is_accepted_structurally(self):
        runner.validate_v2_evidence(valid_evidence(), CASE_NAMES, DRAIN_CASE_NAMES)

    def test_ambiguous_case_backend_identity_and_state_evidence_fails(self):
        mutations = {
            "missing": lambda e: e["cases"].pop(),
            "reordered": lambda e: e["cases"].reverse(),
            "failed": lambda e: e["cases"][0].update(status="failed"),
            "cleanup": lambda e: e["cases"][0].update(cleanupErrors=["SYNTHETIC failure"]),
            "permission": lambda e: e.update(deployable=True),
            "wrong protocol":lambda e:e.update(protocol=1),
            "boolean inventory":lambda e:e.update(caseInventoryVersion=True),
            "missing retained accounting":lambda e:e.pop("earlierAccounting"),
            "changed prior accounting":lambda e:e["earlierAccounting"].update(retained=False),
            "missing prior table":lambda e:e["earlierAccounting"]["tables"].pop(),
            "same backend": lambda e: e["cases"][0].update(backendPids=[1000,1001,1001]),
            "boolean backend": lambda e: e["cases"][0].update(backendPids=[True,1001,1002]),
            "missing observer": lambda e: e["cases"][0].update(backendPids=[1001,1002]),
            "foreign blocker": lambda e: e["cases"][0]["barriers"][0].update(blockers=[1002,777]),
            "observer blocks": lambda e: e["cases"][0]["barriers"][0].update(holderPid=1000,blockers=[1000]),
            "no before": lambda e: e["cases"][0].update(committedStateBefore={}),
            "no after": lambda e: e["cases"][0].update(committedStateAfter=None),
            "no identity": lambda e: e["cases"][0].update(identity=None),
            "renewed lifetime": lambda e: e["cases"][0]["identity"].update(expiresAt=1000001),
            "manufactured parent": lambda e: e["cases"][-1]["identity"].update(parentVersion=0),
            "missing v2 parent": lambda e: e["cases"][0]["identity"].update(parentVersion=None),
        }
        for label, change in mutations.items():
            with self.subTest(label=label):
                evidence = valid_evidence()
                change(evidence)
                with self.assertRaises(runner.HarnessError):
                    runner.validate_v2_evidence(evidence, CASE_NAMES, DRAIN_CASE_NAMES)

    def test_each_case_requires_its_exact_stage_proof_presence(self):
        for slot in (2,3,4,5,8,9,10,11,12,13):
            with self.subTest(slot=slot):
                evidence=valid_evidence()
                evidence["cases"][slot]["identity"].update(proof=None,markRequest=None)
                with self.assertRaises(runner.HarnessError):
                    runner.validate_v2_evidence(evidence,CASE_NAMES,DRAIN_CASE_NAMES)
        evidence=valid_evidence()
        evidence["cases"][0]["identity"]["proof"]=copy.deepcopy(evidence["cases"][2]["identity"]["proof"])
        with self.assertRaises(runner.HarnessError):
            runner.validate_v2_evidence(evidence,CASE_NAMES,DRAIN_CASE_NAMES)

    def test_exact_original_proof_and_marker_cannot_change_or_renew(self):
        evidence = valid_evidence()
        identity = evidence["cases"][4]["identity"]
        proof = {"protocol":2,"receiptId":"fictional-receipt","operation":"inspect","claim":copy.deepcopy(identity["claim"]),
                 "cleanupId":identity["cleanupId"],"authSessionId":identity["authSessionId"],"parentVersion":identity["parentVersion"],
                 "authorityFingerprint":identity["authorityFingerprint"],"identityExpiresAt":700000,"verifiedAt":100100,
                 "expiresAt":110100,"effectiveExpiresAt":700000}
        identity["proof"] = proof
        identity["markRequest"] = {"protocol":2,"proof":copy.deepcopy(proof),"operationId":"fictional-operation","expectedPoolVersion":1}
        runner.validate_v2_evidence(evidence, CASE_NAMES, DRAIN_CASE_NAMES)
        mutations = {
            "foreign cleanup":lambda i:i["proof"].update(cleanupId="foreign"),
            "new proof start":lambda i:i["proof"].update(verifiedAt=100101),
            "old proof age":lambda i:i["proof"].update(expiresAt=130101),
            "renewed ceiling":lambda i:i["proof"].update(effectiveExpiresAt=700001),
            "wrong operation":lambda i:i["proof"].update(operation="claim"),
            "new parent":lambda i:i["proof"].update(parentVersion=1),
            "peeled proof":lambda i:i["proof"].pop("protocol"),
            "boolean protocol":lambda i:i["proof"].update(protocol=True),
            "zero pool version":lambda i:i["markRequest"].update(expectedPoolVersion=0),
        }
        for label, change in mutations.items():
            with self.subTest(label=label):
                changed = copy.deepcopy(evidence)
                change(changed["cases"][4]["identity"])
                with self.assertRaises(runner.HarnessError):
                    runner.validate_v2_evidence(changed, CASE_NAMES, DRAIN_CASE_NAMES)

    def test_revocation_alone_cannot_replace_exact_drain_order_and_observation(self):
        mutations = {
            "open gate":lambda c:c.update(gateClosed=False),
            "baseline passed":lambda c:c.update(baselineStatus="pass"),
            "candidate failed":lambda c:c.update(candidateStatus="fail"),
            "wrong order":lambda c:c["events"].reverse(),
            "unproven deny":lambda c:c.update(newLegacyDenied=False),
            "wrong worker":lambda c:c.update(legacyWorkerPid=1),
            "empty observation":lambda c:c["drain"].update(observed=[]),
            "running drained worker":lambda c:c["drain"]["observed"][0].update(state="active"),
            "drained active transaction":lambda c:c["drain"]["observed"][0].update(xactStart="still-open"),
            "drained locks":lambda c:c["drain"]["observed"][0].update(lockCount=1),
            "boolean locks":lambda c:c["drain"]["observed"][0].update(lockCount=False),
            "extra tracked worker":lambda c:c["drain"]["trackedPids"].append(9999),
        }
        for label, change in mutations.items():
            with self.subTest(label=label):
                evidence = valid_evidence()
                change(evidence["cases"][-1]["cutover"])
                with self.assertRaises(runner.HarnessError):
                    runner.validate_v2_evidence(evidence, CASE_NAMES, DRAIN_CASE_NAMES)
        evidence = valid_evidence()
        evidence["cases"][-2]["cutover"]["drain"]["observed"][0].update(state="idle",xactStart=None,lockCount=0)
        with self.assertRaises(runner.HarnessError):
            runner.validate_v2_evidence(evidence, CASE_NAMES, DRAIN_CASE_NAMES)

    def test_source_and_runtime_evidence_must_match_preflight(self):
        names = ("v2_concurrency.py","concurrency.py","capacity_concurrency.py","cutover-native-bridge.ts","cutover-inventory.ts")
        sources = {"scripts/conversation-eval/p5-sql/"+name:"a"*64 for name in names}
        runtime = {"path":"/owned/bun","sha256":"b"*64}
        evidence = {"sourceSha256":sources,"runtime":runtime|{"name":"bun","version":"1.2.3"}}
        runner.validate_v2_provenance(evidence,sources,runtime)
        for field,value in (("path","/untrusted/bun"),("sha256","c"*64),("name","node"),("version","unknown")):
            changed=copy.deepcopy(evidence)
            changed["runtime"][field]=value
            with self.subTest(field=field),self.assertRaises(runner.HarnessError):
                runner.validate_v2_provenance(changed,sources,runtime)
        changed=copy.deepcopy(evidence)
        changed["sourceSha256"].pop(next(iter(sources)))
        with self.assertRaises(runner.HarnessError):
            runner.validate_v2_provenance(changed,sources,runtime)


class OfflineBridgeTests(unittest.TestCase):
    def setUp(self):
        configured = os.environ.get("BFA_P5_BUN_EXECUTABLE")
        if not configured:
            self.skipTest("Explicit BFA_P5_BUN_EXECUTABLE absent; no runtime autodiscovery")
        self.runtime=Path(configured)
        if not self.runtime.is_absolute() or not self.runtime.is_file() or not os.access(self.runtime,os.X_OK):
            self.fail("Explicit bridge runtime must be an absolute existing executable")
        self.temp=tempfile.TemporaryDirectory(prefix="bfa-offline-bridge-test-")
        self.root=Path(self.temp.name)
        self.config=self.root/"config"
        self.config.mkdir(mode=0o700)
        self.bridge=self.root/"cutover-native-bridge.ts"
        for name in ("cutover-native-bridge.ts","cutover-inventory.ts"):
            shutil.copyfile(HERE/name,self.root/name)
        self.bunfig=self.config/"empty-bunfig.toml"
        self.bunfig.write_text("telemetry = false\npreload = []\n")
        self.env=runner.isolated_environment(self.config)|{"DO_NOT_TRACK":"1"}

    def tearDown(self):
        if hasattr(self,"temp"):
            self.temp.cleanup()

    def invoke(self,payload:bytes,*extra:str):
        return subprocess.run([str(self.runtime),"--no-env-file","--no-install","--config="+str(self.bunfig),str(self.bridge),*extra],
                              input=payload,stdout=subprocess.PIPE,stderr=subprocess.PIPE,cwd=self.config,env=self.env,timeout=15,check=False)

    def test_actual_offline_bridge_describes_existing_manifest_without_client(self):
        result=self.invoke(b'{"operation":"describe"}')
        self.assertEqual(result.returncode,0,result.stderr.decode())
        parsed=json.loads(result.stdout)
        self.assertFalse(parsed["deployable"])
        self.assertEqual(parsed["protocol"],1)
        self.assertEqual(parsed["runtime"]["name"],"bun")
        self.assertEqual(len(parsed["functions"]),60)
        self.assertEqual(sum(row["category"]=="legacy-enable" for row in parsed["functions"]),9)
        self.assertTrue(parsed["catalogSql"].lstrip().startswith("WITH app_roles"))
        self.assertEqual(result.stderr,b"")

    def test_actual_bridge_evaluator_fails_missing_catalog_without_deployment_claim(self):
        result=self.invoke(json.dumps({"operation":"evaluate","trustedOwnerRole":"bfa_fixture_admin","catalog":{"functions":[],"roles":[],"schemas":[]}}).encode())
        self.assertEqual(result.returncode,0,result.stderr.decode())
        parsed=json.loads(result.stdout)
        self.assertEqual(parsed["report"]["catalogStatus"],"fail")
        self.assertFalse(parsed["report"]["deployable"])
        self.assertFalse(parsed["deployable"])
        self.assertTrue(parsed["report"]["issues"])

    def test_actual_bridge_rejects_malformed_oversized_and_extra_input_without_echo(self):
        payloads=(b"",b"[]",b'{"operation":"unknown"}',b'{"operation":"describe","secret":"SYNTHETIC_SECRET"}',b"x"*1048577)
        for payload in payloads:
            with self.subTest(size=len(payload)):
                result=self.invoke(payload)
                self.assertNotEqual(result.returncode,0)
                self.assertEqual(result.stdout,b"")
                self.assertEqual(result.stderr,b"Offline cutover bridge rejected the request.\n")
        extra=self.invoke(b'{"operation":"describe"}',"--unexpected")
        self.assertNotEqual(extra.returncode,0)
        self.assertEqual(extra.stdout,b"")

    def test_actual_bridge_ignores_hostile_dotenv_bunfig_and_inherited_runtime_options(self):
        sentinel=self.root/"must-not-exist"
        preload=self.root/"hostile-preload.ts"
        preload.write_text("import {writeFileSync} from 'node:fs';writeFileSync("+json.dumps(str(sentinel))+",'SYNTHETIC preload ran');throw Error('SYNTHETIC_SECRET');")
        (self.config/"bunfig.toml").write_text("preload = ["+json.dumps(str(preload))+"]\n")
        (self.config/".env").write_text("BUN_OPTIONS=--preload "+str(preload)+"\nSYNTHETIC_SECRET=not-real\n")
        with patch.dict(os.environ,{"BUN_OPTIONS":"--preload "+str(preload),"NODE_OPTIONS":"--require "+str(preload)}):
            result=self.invoke(b'{"operation":"describe"}')
        self.assertEqual(result.returncode,0,result.stderr.decode())
        self.assertFalse(sentinel.exists())
        self.assertNotIn(b"SYNTHETIC_SECRET",result.stdout+result.stderr)


if __name__=="__main__":
    unittest.main(verbosity=2)
