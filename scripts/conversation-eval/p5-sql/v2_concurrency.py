#!/usr/bin/env python3
"""Prepared v2 races for the runner-owned disposable native PostgreSQL cluster.

Import opens no connection. Fictional SQL metadata is not Auth or sealed issuer
provenance. The unchanged v33 composition tests cover the real local crypto
path separately. Only observed independent-backend locks can pass these cases.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess


_CAPACITY_PATH = Path(__file__).resolve().with_name("capacity_concurrency.py")
_SPEC = importlib.util.spec_from_file_location("bfa_p5_native_capacity", _CAPACITY_PATH)
if _SPEC is None or _SPEC.loader is None:
    raise ImportError("Cannot load adjacent reviewed native capacity driver")
capacity = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(capacity)
base = capacity.base
literal, claim_sql, uid = base.literal, base.claim_sql, base.uid
SOURCE_CREATED_AT = "2001-02-03T04:05:06.123456Z"
MAX_BRIDGE_BYTES = 1024 * 1024

CASE_NAMES = (
    "parent revocation commits before waiting v2 issuance",
    "v2 issuance commits before waiting parent revocation",
    "parent revocation commits before waiting v2 proof",
    "v2 proof commits before waiting parent revocation",
    "parent revocation commits before waiting v2 marker",
    "v2 marker commits before waiting parent revocation",
    "legacy revocation commits before waiting v2 issuance",
    "v2 issuance commits before waiting legacy revocation",
    "legacy revocation commits before waiting v2 proof",
    "v2 proof commits before waiting legacy revocation",
    "legacy revocation commits before waiting v2 marker",
    "v2 marker commits before waiting legacy revocation",
    "exact close commits before waiting v2 marker",
    "v2 marker commits before waiting exact close",
    "legacy enabling call already running survives EXECUTE revoke",
    "drained fixture candidate denies new legacy enabling calls",
)
DRAIN_CASE_NAMES = (
    "legacy enabling call already running survives EXECUTE revoke",
    "drained fixture candidate denies new legacy enabling calls",
)


def json_call(expression: str) -> str:
    return f"SELECT COALESCE(({expression})::text,'null');"


def issuance_sql(f: dict) -> str:
    return json_call("public.bfa_p5_v2_register_issuance("
                     f"{literal(f['owner'])},{literal(f['session'])},0,"
                     f"{literal(f['thread'])},{literal(f['incarnation'])},0,"
                     f"{literal(f['fingerprint'])},{f['issued']},{f['deadline']},"
                     f"{f['issued']},{f['deadline']})")


def issuance_receipt(f: dict) -> dict:
    return {"protocol": 2, "ownerId": f["owner"], "authSessionId": f["session"],
            "parentVersion": 0, "threadId": f["thread"],
            "threadIncarnation": f["incarnation"], "threadRevision": 0,
            "authorityFingerprint": f["fingerprint"], "issuedAt": f["issued"],
            "expiresAt": f["deadline"], "revoked": False}


def proof_value(f: dict, operation: str, verified_at: int) -> dict:
    if operation not in ("claim", "inspect"):
        raise ValueError("Exact supported proof operation required")
    return {"protocol": 2, "receiptId": uid(), "operation": operation,
            "claim": copy.deepcopy(f["claim"]), "cleanupId": f["cleanup"],
            "authSessionId": f["session"], "parentVersion": 0,
            "authorityFingerprint": f["fingerprint"],
            "identityExpiresAt": f["deadline"], "verifiedAt": verified_at,
            "expiresAt": min(verified_at + 20000, f["deadline"]),
            "effectiveExpiresAt": f["deadline"]}


def proof_sql(proof: dict) -> str:
    return json_call(f"public.bfa_p5_v2_register_proof({literal(proof)}::jsonb)")


def cleanup_sql(f: dict, verified_at: int) -> str:
    return json_call("public.bfa_p5_v2_register_cleanup("
                     f"{literal(f['cleanup'])},{claim_sql(f['claim'])},"
                     f"{literal(f['session'])},0,{literal(f['fingerprint'])},"
                     f"{verified_at},{f['deadline']})")


def marker_value(proof: dict) -> dict:
    return {"protocol": 2, "proof": copy.deepcopy(proof),
            "operationId": uid(), "expectedPoolVersion": 1}


def marker_sql(request: dict) -> str:
    return json_call(f"public.bfa_p5_v2_capacity_mark({literal(request)}::jsonb)")


def claim_v2_sql(proof: dict) -> str:
    return json_call(f"public.bfa_p5_v2_capacity_claim({literal(proof)}::jsonb)")


def revoke_sql(f: dict, kind: str) -> str:
    if kind not in ("parent", "legacy"):
        raise ValueError("Explicit parent or legacy revocation required")
    name = "bfa_p5_v2_revoke_parent" if kind == "parent" else "bfa_p5_voice_revoke_session"
    return json_call(f"public.{name}({literal(f['owner'])},{literal(f['session'])})")


class V2Driver(capacity.CapacityDriver):
    def __init__(self, args: argparse.Namespace):
        self.runtime = str(Path(args.runtime).resolve())
        self.bridge_path = Path(args.bridge).resolve()
        expected = Path(__file__).resolve().with_name("cutover-native-bridge.ts")
        if self.bridge_path != expected or not expected.is_file():
            raise ValueError("Only the adjacent reviewed cutover bridge is accepted")
        if not Path(args.runtime).is_absolute() or not Path(self.runtime).is_file() or not os.access(self.runtime, os.X_OK):
            raise ValueError("An explicit absolute executable Bun runtime is required")
        super().__init__(args)
        self.bridge_config_dir = Path(self.env["HOME"])
        self.bunfig = self.bridge_config_dir / "bunfig.toml"
        self.bunfig.write_text("telemetry = false\npreload = []\n", encoding="utf-8")
        try:
            described = self.bridge({"operation": "describe"})
            if (described.get("inventoryVersion") != 1
                    or not isinstance(described.get("catalogSql"), str)
                    or not isinstance(described.get("functions"), list)
                    or len(described["functions"]) != 60):
                raise ValueError("Exact reviewed catalog inventory unavailable")
            self.catalog_sql = described["catalogSql"]
            self.inventory = described["functions"]
            self.runtime_identity = described["runtime"]
            self.legacy_enablers = [item for item in self.inventory if item.get("category") == "legacy-enable"]
            if len(self.legacy_enablers) != 9:
                raise ValueError("Exact nine legacy enablers required")
        except Exception:
            self.observer.close()
            raise

    def bridge(self, request: dict) -> dict:
        payload = json.dumps(request, separators=(",", ":"))
        if len(payload.encode()) > MAX_BRIDGE_BYTES:
            raise ValueError("Catalog bridge input exceeds bound")
        result = subprocess.run([self.runtime, "--no-env-file", "--no-install", "--config=" + str(self.bunfig), str(self.bridge_path)], input=payload,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                text=True, cwd=self.bridge_config_dir,
                                env=self.env | {"DO_NOT_TRACK": "1"}, timeout=15, check=False)
        if result.returncode or len(result.stdout.encode()) > MAX_BRIDGE_BYTES:
            raise ValueError("Offline catalog bridge failed")
        value = json.loads(result.stdout)
        if (not isinstance(value, dict) or value.get("protocol") != 1
                or value.get("deployable") is not False
                or not isinstance(value.get("runtime"), dict)
                or value["runtime"].get("name") != "bun"):
            raise ValueError("Offline catalog bridge returned invalid evidence")
        return value

    def catalog_report(self) -> dict:
        catalog = json.loads(self.observer.scalar(self.catalog_sql))
        response = self.bridge({"operation": "evaluate", "catalog": catalog,
                                "trustedOwnerRole": "bfa_fixture_admin"})
        report = response.get("report")
        if (not isinstance(report, dict) or report.get("inventoryVersion") != 1
                or report.get("deployable") is not False
                or report.get("catalogStatus") not in ("pass", "fail")):
            raise ValueError("Exact catalog evaluation unavailable")
        return report

    @staticmethod
    def signature(entry: dict) -> str:
        schema, name, arguments = entry.get("schema"), entry.get("name"), entry.get("arguments")
        if (not isinstance(schema, str) or not re.fullmatch(r"[a-z0-9_]+", schema)
                or not isinstance(name, str) or not re.fullmatch(r"[a-z0-9_]+", name)
                or not isinstance(arguments, str)
                or not re.fullmatch(r"[a-z0-9_.,\[\] ]*", arguments)):
            raise ValueError("Unsafe inventory signature")
        return f"{schema}.{name}({arguments})"

    def apply_candidate(self) -> None:
        # Fixture-only, after guarded native runner creates this database. No
        # generated migration or configurable connected database is supported.
        for entry in self.inventory:
            signature = self.signature(entry)
            self.observer.query(f"REVOKE ALL ON FUNCTION {signature} FROM PUBLIC,anon,authenticated,service_role;")
            if entry.get("serviceExecute") is True:
                self.observer.query(f"GRANT EXECUTE ON FUNCTION {signature} TO service_role;")
        for schema in ("bfa_p5_voice", "bfa_p5_capacity", "bfa_p5_voice_v2"):
            self.observer.query(f"REVOKE ALL ON SCHEMA {schema} FROM PUBLIC,anon,authenticated,service_role;")
        self.observer.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC,anon,authenticated,service_role;"
                            "GRANT USAGE ON SCHEMA public TO PUBLIC,anon,authenticated,service_role;")
        self.check(self.catalog_report()["catalogStatus"] == "pass", "Exact fixture candidate passes unchanged catalog evaluator")

    def restore_legacy_grants(self) -> None:
        # Needed only between the two independent disposable cutover cases.
        for entry in self.legacy_enablers:
            self.observer.query(f"GRANT EXECUTE ON FUNCTION {self.signature(entry)} TO service_role;")

    def run(self, name: str, fn) -> dict:
        start = len(self.sessions)
        result = super().run(name, fn)
        pids = [self.observer.pid] + [session.pid for session in self.sessions[start:]]
        result["backendPids"] = pids
        if len(pids) < 3 or len(set(pids)) != len(pids) or any(type(pid) is not int or pid <= 0 for pid in pids):
            result.update(status="failed", error="Distinct observer and worker backend identities required")
        return result

    def json_result(self, lines: list[str]):
        self.check(len(lines) == 1, "One exact JSON result observed")
        return json.loads(lines[0])

    def v2_fixture(self, stage: str) -> dict:
        if stage not in ("issuance", "proof", "marker"):
            raise ValueError("Explicit v2 fixture stage required")
        f = {key: uid() for key in ("owner", "thread", "session", "attempt", "approval", "policy", "cleanup")}
        f["fingerprint"] = uid().replace("-", "") + uid().replace("-", "")
        f["issued"] = int(self.observer.scalar("SELECT bfa_p5_voice.ms();"))
        f["deadline"] = f["issued"] + 600000
        f["pool"] = self.pool()
        self.observer.query(
            f"INSERT INTO public.bfa_p3b_staging_accounts(user_id,admitted,expires_at) VALUES({literal(f['owner'])},true,to_timestamp({f['deadline']}/1000.0));"
            f"INSERT INTO public.bfa_p3b_threads(id,owner_id,created_at) VALUES({literal(f['thread'])},{literal(f['owner'])},{literal(SOURCE_CREATED_AT)}::timestamptz);"
            f"INSERT INTO bfa_p5_voice.quotas VALUES({literal(f['owner'])},{literal(f['policy'])},10,1,true);"
            f"INSERT INTO bfa_p5_capacity.routes VALUES({literal(f['owner'])},{literal(f['policy'])},{literal(f['pool'])});")
        parent = self.json_result(self.observer.query(json_call(
            f"public.bfa_p5_v2_observe_parent({literal(f['owner'])},{literal(f['session'])},{f['issued']},{f['deadline']})")))
        self.check(parent == {"protocol": 2, "ownerId": f["owner"], "authSessionId": f["session"], "parentVersion": 0, "revoked": False},
                   "Fictional clear parent exact association observed")
        generation = self.json_result(self.observer.query(json_call(
            f"public.bfa_p5_v2_register_generation({literal(f['owner'])},{literal(f['session'])},0,{literal(f['thread'])},0,{literal(SOURCE_CREATED_AT)},{f['issued']},{f['deadline']})")))
        self.check(isinstance(generation, dict) and generation.get("ownerId") == f["owner"]
                   and generation.get("authSessionId") == f["session"] and generation.get("parentVersion") == 0
                   and generation.get("threadId") == f["thread"] and generation.get("sourceCreatedAt") == SOURCE_CREATED_AT,
                   "V2 generation registered against exact fictional source metadata")
        f["incarnation"] = generation["threadIncarnation"]
        f["claim"] = {"claimId": uid(), "expiresAt": f["deadline"], "binding": {
            "ownerId": f["owner"], "threadId": f["thread"], "threadIncarnation": f["incarnation"],
            "threadRevision": 0, "attemptId": f["attempt"], "approvalId": f["approval"],
            "approvalDigest": "b" * 64, "scope": "developer-voice-session"}}
        self.observer.query(f"INSERT INTO bfa_p5_voice.approvals VALUES({literal(f['approval'])},repeat('b',64),{literal(f['owner'])},{literal(f['thread'])},{literal(f['incarnation'])},0,{literal(f['attempt'])},'developer-voice-session',{f['deadline']},false,{literal(f['policy'])});")
        if stage != "issuance":
            self.check(self.json_result(self.observer.query(issuance_sql(f))) == issuance_receipt(f), "Exact immutable fictional v2 issuance registered")
            cleanup = self.json_result(self.observer.query(cleanup_sql(f, f["issued"])))
            self.check(isinstance(cleanup, dict) and cleanup.get("claim") == f["claim"]
                       and cleanup.get("cleanupId") == f["cleanup"] and cleanup.get("authSessionId") == f["session"]
                       and cleanup.get("authorityFingerprint") == f["fingerprint"], "Exact v2 cleanup ownership registered")
        f["proof"] = None
        f["mark"] = None
        if stage == "marker":
            initial = proof_value(f, "claim", int(self.observer.scalar("SELECT bfa_p5_voice.ms();")))
            self.check(self.json_result(self.observer.query(proof_sql(initial))) == initial, "Exact fresh claim proof registered")
            self.check(self.json_result(self.observer.query(claim_v2_sql(initial))) == {"protocol": 2, "proof": initial, "status": "claimed"}, "V2 combined claim reserves once")
            self.retained(f)
        if stage in ("proof", "marker"):
            f["proof"] = proof_value(f, "inspect" if stage == "marker" else "claim", int(self.observer.scalar("SELECT bfa_p5_voice.ms();")))
        if stage == "marker":
            self.check(self.json_result(self.observer.query(proof_sql(f["proof"]))) == f["proof"], "Fresh unused full inspect proof registered directly for marker")
            f["mark"] = marker_value(f["proof"])
        return f

    def details(self, f: dict) -> dict:
        claim_id = literal(f["claim"]["claimId"])
        selects = {
            "issuance": f"SELECT to_jsonb(t) FROM bfa_p5_voice.issuances t WHERE fingerprint={literal(f['fingerprint'])}",
            "binding": f"SELECT to_jsonb(t) FROM bfa_p5_voice_v2.issuance_auth_bindings t WHERE fingerprint={literal(f['fingerprint'])}",
            "cleanup": f"SELECT to_jsonb(t) FROM bfa_p5_voice.cleanup_owners t WHERE cleanup_id={literal(f['cleanup'])}",
            "claim": f"SELECT to_jsonb(t) FROM bfa_p5_voice.claims t WHERE claim_id={claim_id}",
            "allocation": f"SELECT to_jsonb(t) FROM bfa_p5_capacity.allocations t WHERE claim_id={claim_id}",
            "proofs": f"SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY receipt_id),'[]'::jsonb) FROM bfa_p5_voice.proofs t WHERE claim_id={claim_id}",
        }
        result = {name: json.loads(self.observer.scalar(f"SELECT COALESCE(({sql})::text,'null');")) for name, sql in selects.items()}
        result["quota"] = self.state(f)
        result["pool"] = self.pool_state(f["pool"])
        return result

    def remember(self, f: dict) -> dict:
        before = self.details(f)
        self.current["committedStateBefore"] = before
        self.current["identity"] = {"ownerId": f["owner"], "authSessionId": f["session"], "parentVersion": 0,
            "authorityFingerprint": f["fingerprint"], "issuedAt": f["issued"], "expiresAt": f["deadline"],
            "claim": copy.deepcopy(f["claim"]), "cleanupId": f["cleanup"],
            "proof": copy.deepcopy(f.get("proof")), "markRequest": copy.deepcopy(f.get("mark"))}
        return before

    def exact_issuance(self, f: dict, expected_present: bool = True) -> None:
        records = self.details(f)
        expected_issuance = {"fingerprint": f["fingerprint"], "owner_id": f["owner"],
            "thread_id": f["thread"], "incarnation": f["incarnation"], "revision": 0,
            "issued_ms": f["issued"], "expires_ms": f["deadline"], "revoked": False}
        expected_binding = {"fingerprint": f["fingerprint"], "protocol": 2,
            "owner_id": f["owner"], "auth_session_id": f["session"], "parent_version": 0}
        self.check(records["issuance"] == (expected_issuance if expected_present else None)
                   and records["binding"] == (expected_binding if expected_present else None),
                   "Committed issuance and immutable v2 binding equal the exact original tuple")

    def unchanged_issuance(self, before: dict, after: dict) -> None:
        for key in ("issuance", "binding"):
            if before[key] is not None:
                self.check(after[key] == before[key], "Original immutable " + key + " remains exact")

    def unchanged_proofs(self, before: list, after: list) -> None:
        indexed = {row["receipt_id"]: row for row in after}
        for original in before:
            actual = indexed.get(original["receipt_id"])
            self.check(actual is not None and {k: v for k, v in actual.items() if k != "consumed_ms"}
                       == {k: v for k, v in original.items() if k != "consumed_ms"},
                       "Original full proof identity and deadlines never change")
            if original["consumed_ms"] is not None:
                self.check(actual["consumed_ms"] == original["consumed_ms"], "Existing proof consumption time never changes")

    def consumed_exact_proof(self, f: dict, expected_present: bool = True) -> None:
        proof = f["proof"]
        rows = [row for row in self.details(f)["proofs"] if row["receipt_id"] == proof["receiptId"]]
        self.check(len(rows) == (1 if expected_present else 0),
                   "Exact selected receipt is present once or denied without creation")
        if not expected_present:
            return
        row = rows[0]
        expected = {"protocol": proof["protocol"], "receipt_id": proof["receiptId"],
            "operation": proof["operation"], "claim": proof["claim"], "cleanup_id": proof["cleanupId"],
            "session_id": proof["authSessionId"], "session_version": proof["parentVersion"],
            "authority_fingerprint": proof["authorityFingerprint"],
            "identity_expires_ms": proof["identityExpiresAt"], "verified_ms": proof["verifiedAt"],
            "expires_ms": proof["expiresAt"], "effective_expires_ms": proof["effectiveExpiresAt"]}
        self.check({key: row[key] for key in expected} == expected,
                   "Consumed receipt retains every original protocol-2 proof field")
        self.check(type(row["consumed_ms"]) is int and proof["verifiedAt"] <= row["consumed_ms"] < proof["expiresAt"],
                   "Exact receipt consumption is recorded while its original proof remains fresh")

    def check_closed(self, f: dict, *, marked: bool, charged: bool) -> None:
        self.ack(self.observer.query(self.capacity_call(f, "close")), f, "closed")
        state = self.state(f)
        self.check(state == {"remaining": 9 if charged else 10, "claims": 1 if charged else 0,
                             "held": 1 if charged else 0, "attempts": 1},
                   "Exact cleanup keeps cumulative accounting and immutable attempt ownership")
        self.check(self.pool_state(f["pool"]) == {"occupied": 1 if marked else 0,
                                                  "held": 1 if charged else 0, "quarantined": False},
                   "Cleanup retains marked uncertain occupancy and never refunds cumulative units")
        if charged:
            self.check(self.allocation(f) == {"slotHeld": marked, "closed": True,
                "operation": f["mark"]["operationId"] if marked else None, "terminal": None, "session": None},
                "Exact marked or never-started allocation remains associated after close")


def revocation_order(d: V2Driver, kind: str, stage: str, revoke_first: bool) -> None:
    f = d.v2_fixture(stage)
    before = d.remember(f)
    sql = issuance_sql(f) if stage == "issuance" else proof_sql(f["proof"]) if stage == "proof" else marker_sql(f["mark"])
    operation, revoker = d.session("v2_" + stage), d.session("v2_" + kind + "_revoke")
    if revoke_first:
        revoked = d.json_result(revoker.query("BEGIN; SET LOCAL ROLE service_role; " + revoke_sql(f, kind)))
        d.check(revoked.get("revoked") is True, "Exact revocation transaction reached terminal state before waiter")
        token = operation.start("BEGIN; SET LOCAL ROLE service_role; " + sql + " COMMIT;")
        d.blocked(operation, revoker)
        revoker.query("COMMIT;")
        result = d.json_result(operation.finish(token))
    else:
        result = d.json_result(operation.query("BEGIN; SET LOCAL ROLE service_role; " + sql))
        token = revoker.start("BEGIN; SET LOCAL ROLE service_role; " + revoke_sql(f, kind) + " COMMIT;")
        d.blocked(revoker, operation)
        operation.query("COMMIT;")
        revoked = d.json_result(revoker.finish(token))
        d.check(revoked.get("revoked") is True, "Waiting exact revocation commits after positive operation")
    expected = (None if revoke_first else issuance_receipt(f)) if stage == "issuance" else (
        None if revoke_first else f["proof"]) if stage == "proof" else {
            "protocol": 2, "request": f["mark"], "status": "denied" if revoke_first else "marked"}
    d.check(result == expected, "Ordering produces exact v2 denial or original positive receipt")
    after = d.details(f)
    d.exact_issuance(f, expected_present=not (stage == "issuance" and revoke_first))
    d.unchanged_issuance(before, after)
    d.unchanged_proofs(before["proofs"], after["proofs"])
    if stage == "issuance":
        d.check((after["issuance"] is None) == revoke_first and (after["binding"] is None) == revoke_first,
                "Issuance and protocol-2 association commit together or remain absent")
    if stage == "proof":
        d.check(len(after["proofs"]) == (0 if revoke_first else 1), "Proof registration is absent or retains exactly one immutable receipt")
        d.check(d.json_result(d.observer.query(claim_v2_sql(f["proof"]))) == {"protocol": 2, "proof": f["proof"], "status": "denied"},
                "Previously returned proof cannot bypass committed revocation")
        d.consumed_exact_proof(f, expected_present=not revoke_first)
    if stage == "marker":
        d.consumed_exact_proof(f)
    # Read after both commits, not a stale receipt, establishes present denial.
    d.check(d.observer.scalar(json_call("public.bfa_p5_v2_read_issuance("
        f"{literal(f['owner'])},{literal(f['session'])},0,{literal(f['fingerprint'])})")) == "null",
        "Post-commit protected issuance observation denies revoked parent or legacy fence")
    d.check_closed(f, marked=stage == "marker" and not revoke_first, charged=stage == "marker")
    final = d.details(f)
    d.unchanged_issuance(after, final)
    d.unchanged_proofs(after["proofs"], final["proofs"])
    d.current["committedStateAfter"] = final


def close_order(d: V2Driver, close_first: bool) -> None:
    f = d.v2_fixture("marker")
    before = d.remember(f)
    closer, marker = d.session("v2_exact_close"), d.session("v2_exact_marker")
    if close_first:
        d.ack(closer.query("BEGIN; SET LOCAL ROLE service_role; " + d.capacity_call(f, "close")), f, "closed")
        token = marker.start("BEGIN; SET LOCAL ROLE service_role; " + marker_sql(f["mark"]) + " COMMIT;")
        d.blocked(marker, closer)
        closer.query("COMMIT;")
        response = d.json_result(marker.finish(token))
    else:
        response = d.json_result(marker.query("BEGIN; SET LOCAL ROLE service_role; " + marker_sql(f["mark"])))
        token = closer.start("BEGIN; SET LOCAL ROLE service_role; " + d.capacity_call(f, "close") + " COMMIT;")
        d.blocked(closer, marker)
        marker.query("COMMIT;")
        d.ack(closer.finish(token), f, "closed")
    d.check(response == {"protocol": 2, "request": f["mark"], "status": "closed" if close_first else "marked"},
            "Exact close-marker ordering never rewrites the owned request")
    d.consumed_exact_proof(f)
    d.check_closed(f, marked=not close_first, charged=True)
    final = d.details(f)
    d.unchanged_issuance(before, final)
    d.unchanged_proofs(before["proofs"], final["proofs"])
    d.current["committedStateAfter"] = final


def activity(d: V2Driver, worker) -> dict:
    row = json.loads(d.observer.scalar(
        "SELECT json_build_object('pid',pid,'state',state,'xactStart',xact_start,"
        "'lockCount',(SELECT count(*) FROM pg_locks WHERE pid=a.pid))::text "
        f"FROM pg_stat_activity a WHERE pid={worker.pid};"))
    d.check(row["pid"] == worker.pid, "Drain observation names the exact tracked backend")
    return row


def deny_legacy_calls(d: V2Driver, worker) -> None:
    # Catch only the exact permission exception inside a fixture-owned DO block;
    # a successful call or unrelated SQL failure is never converted into denial.
    for entry in d.legacy_enablers:
        args = ",".join("NULL::" + arg for arg in entry["arguments"].split(","))
        expression = f"{entry['schema']}.{entry['name']}({args})"
        worker.query("BEGIN; SET LOCAL SESSION AUTHORIZATION service_role;")
        try:
            identity = json.loads(worker.scalar("SELECT json_build_object('session',session_user,'current',current_user)::text;"))
            d.check(identity == {"session": "service_role", "current": "service_role"},
                    "New legacy permission check runs as the exact service session principal")
            worker.query("DO $fixture$ BEGIN BEGIN PERFORM " + expression + "; "
                         "RAISE EXCEPTION 'Legacy call unexpectedly remained executable'; "
                         "EXCEPTION WHEN insufficient_privilege THEN NULL; END; "
                         "END $fixture$;")
        finally:
            worker.query("ROLLBACK; SET SESSION AUTHORIZATION bfa_fixture_admin; RESET ROLE;")
            identity = json.loads(worker.scalar("SELECT json_build_object('session',session_user,'current',current_user)::text;"))
            d.check(identity == {"session": "bfa_fixture_admin", "current": "bfa_fixture_admin"},
                    "Known disposable fixture session identity restores after permission check")
    d.check(True, "Every exact legacy enabling signature denies new service execution")



def close_as_service(d: V2Driver, session, f: dict) -> None:
    session.query("BEGIN; SET LOCAL SESSION AUTHORIZATION service_role;")
    try:
        principal = json.loads(session.scalar("SELECT json_build_object('session',session_user,'current',current_user)::text;"))
        d.check(principal == {"session": "service_role", "current": "service_role"},
                "Preserved exact cleanup runs as the actual service session principal")
        d.ack(session.query(d.capacity_call(f, "close")), f, "closed")
        session.query("COMMIT;")
    except Exception:
        session.query("ROLLBACK;")
        raise
    finally:
        session.query("SET SESSION AUTHORIZATION bfa_fixture_admin; RESET ROLE;")
        principal = json.loads(session.scalar("SELECT json_build_object('session',session_user,'current',current_user)::text;"))
        d.check(principal == {"session": "bfa_fixture_admin", "current": "bfa_fixture_admin"},
                "Cleanup restores the known disposable fixture session principal")


def cutover_order(d: V2Driver, drained: bool) -> None:
    d.restore_legacy_grants()
    d.check(d.catalog_report()["catalogStatus"] == "fail", "Unchanged legacy execution remains an explicit catalog failure")
    pool = d.pool()
    f = d.capacity_fixture(pool)
    f["issued"] = int(d.observer.scalar(f"SELECT issued_ms FROM bfa_p5_voice.issuances WHERE fingerprint={literal(f['fingerprint'])};"))
    f["proof"], f["mark"] = None, None
    before = d.remember(f)
    # A retained v1 row has no v2 parent association; never label it adopted.
    d.current["identity"]["parentVersion"] = None
    holder = d.owner_lock(f)
    worker, newcomer = d.session("legacy_inflight"), d.session("legacy_denied_newcomer")
    worker.query("BEGIN; SET LOCAL SESSION AUTHORIZATION service_role;")
    principal = json.loads(worker.scalar("SELECT json_build_object('session',session_user,'current',current_user)::text;"))
    d.check(principal == {"session": "service_role", "current": "service_role"},
            "Already-running legacy call starts as the exact service session principal")
    token = worker.start(d.capacity_call(f) + " COMMIT;")
    d.blocked(worker, holder)
    events = ["lock-observed", "fixture-gate-closed"]
    # The fixture now starts no additional legacy enabling work until explicit
    # post-candidate denial checks. This gate is local test orchestration only.
    if drained:
        holder.query("COMMIT;")
        d.ack(worker.finish(token), f, "claimed")
        events.append("legacy-call-completed")
        observed = activity(d, worker)
        d.check(observed["state"] == "idle" and observed["xactStart"] is None and observed["lockCount"] == 0,
                "Tracked legacy backend has finished its transaction and released every lock")
        events.append("drain-observed")
        d.apply_candidate()
        events.append("privileges-revoked")
    else:
        d.apply_candidate()
        events.append("privileges-revoked")
        d.blocked(worker, holder)
        observed = activity(d, worker)
        d.check(observed["state"] == "active" and observed["xactStart"] is not None and observed["lockCount"] > 0,
                "Catalog pass coexists with the observed previously running legacy call")
        events.append("not-drained-observed")
        holder.query("COMMIT;")
        d.ack(worker.finish(token), f, "claimed")
        events.append("legacy-call-completed")
    d.retained(f)
    d.check(d.pool_state(pool) == {"occupied": 1, "held": 1, "quarantined": False},
            "Original old call commits one capacity hold without replacement or refund")
    deny_legacy_calls(d, newcomer)
    events.append("new-legacy-call-denied")
    close_as_service(d, newcomer, f)
    worker.query("SET SESSION AUTHORIZATION bfa_fixture_admin; RESET ROLE;")
    principal = json.loads(worker.scalar("SELECT json_build_object('session',session_user,'current',current_user)::text;"))
    d.check(principal == {"session": "bfa_fixture_admin", "current": "bfa_fixture_admin"},
            "Completed legacy worker restores the known disposable fixture session principal")
    d.check(d.pool_state(pool) == {"occupied": 0, "held": 1, "quarantined": False},
            "Preserved exact cleanup releases only the old unmarked slot")
    d.retained(f)
    events.append("cleanup-completed")
    after = d.details(f)
    d.unchanged_issuance(before, after)
    d.unchanged_proofs(before["proofs"], after["proofs"])
    d.current["committedStateAfter"] = after
    d.current["cutover"] = {"baselineStatus": "fail", "candidateStatus": "pass", "gateClosed": True,
        "legacyWorkerPid": worker.pid, "completedBeforeRevoke": drained,
        "drain": {"drained": drained, "trackedPids": [worker.pid], "observed": [observed]},
        "events": events, "newLegacyDenied": True}
    # Leave a genuinely drained candidate after this case. Restoring baseline
    # enabling grants for the separate second cutover case happens explicitly
    # at its start, with this case's worker transaction already completed.


ACCOUNTING_TABLES = (
    "bfa_p5_voice.generations", "bfa_p5_voice.owner_clocks", "bfa_p5_voice.session_fences",
    "bfa_p5_voice.issuances", "bfa_p5_voice.quotas", "bfa_p5_voice.approvals",
    "bfa_p5_voice.cleanup_owners", "bfa_p5_voice.proofs", "bfa_p5_voice.attempts", "bfa_p5_voice.claims",
    "bfa_p5_capacity.pools", "bfa_p5_capacity.routes", "bfa_p5_capacity.allocations",
    "bfa_p5_capacity.sessions", "bfa_p5_capacity.evidence", "bfa_p5_capacity.conflicts",
    "bfa_p5_voice_v2.auth_parents", "bfa_p5_voice_v2.issuance_auth_bindings",
)


def accounting_snapshot(d: V2Driver) -> dict:
    return {table: json.loads(d.observer.scalar(
        f"SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text FROM {table} t;"))
        for table in ACCOUNTING_TABLES}


def retained_rows(d: V2Driver, baseline: dict) -> None:
    after = accounting_snapshot(d)
    for table, rows in baseline.items():
        current = {json.dumps(row, sort_keys=True, separators=(",", ":")) for row in after[table]}
        d.check(all(json.dumps(row, sort_keys=True, separators=(",", ":")) in current for row in rows),
                "Earlier committed rows remain unchanged in " + table)


def cases(driver: V2Driver) -> list[tuple[str, object]]:
    functions = []
    for kind in ("parent", "legacy"):
        for stage in ("issuance", "proof", "marker"):
            for first in (True, False):
                functions.append(lambda kind=kind, stage=stage, first=first:
                                 revocation_order(driver, kind, stage, first))
    functions.extend((lambda: close_order(driver, True), lambda: close_order(driver, False),
                      lambda: cutover_order(driver, False), lambda: cutover_order(driver, True)))
    return list(zip(CASE_NAMES, functions, strict=True))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--psql", required=True)
    parser.add_argument("--socket", required=True)
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--database", default=base.DATABASE, choices=[base.DATABASE])
    parser.add_argument("--user", default="bfa_fixture_admin", choices=["bfa_fixture_admin"])
    parser.add_argument("--runtime", required=True)
    parser.add_argument("--bridge", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--log-dir")
    args = parser.parse_args()
    if not hasattr(os, "geteuid") or os.geteuid() == 0:
        parser.error("Native fixture sessions require a nonroot OS user; no bypass is supported")
    # The outer runner establishes fresh-cluster ownership. This child also
    # checks local socket/database identity; matching labels alone do not prove
    # that an independently supplied database was created by that runner.
    try:
        base.validate_connection_arguments(args)
    except ValueError as error:
        parser.error(str(error))
    driver = V2Driver(args)
    try:
        baseline = accounting_snapshot(driver)
        results = []
        for name, fn in cases(driver):
            def checked(fn=fn):
                fn()
                retained_rows(driver, baseline)
            results.append(driver.run(name, checked))
        root = Path(__file__).resolve().parents[3]
        sources = [Path(__file__).resolve(), _CAPACITY_PATH, _CAPACITY_PATH.with_name("concurrency.py"),
                   driver.bridge_path, driver.bridge_path.with_name("cutover-inventory.ts")]
        result = {"suite": "P5 disposable local PostgreSQL v2 concurrency", "protocol": 2,
                  "caseInventoryVersion": 1, "deployable": False, "serverVersion": driver.observer.scalar("SHOW server_version;"),
                  "cases": results, "passed": sum(case["status"] == "passed" for case in results),
                  "failed": sum(case["status"] != "passed" for case in results),
                  "runtime": {"path": driver.runtime, "sha256": hashlib.sha256(Path(driver.runtime).read_bytes()).hexdigest(),
                              **driver.runtime_identity},
                  "sourceSha256": {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sources},
                  "earlierAccounting": {"tables": list(ACCOUNTING_TABLES),
                      "sha256": hashlib.sha256(json.dumps(baseline, sort_keys=True, separators=(",", ":")).encode()).hexdigest(),
                      "retained": all(case["status"] == "passed" for case in results)},
                  "limitations": [
                      "Fictional SQL Auth/policy/approval and fingerprint metadata; no real Auth or trusted-issuer seal provenance.",
                      "Observed native locks apply only if this guarded suite actually executes; serial checks cannot substitute.",
                      "Fixture gate/drain covers the exact tracked runner-owned legacy backends, not deployed host quiescence.",
                      "Catalog pass is not function-body authentication, route acceptance or provider permission.",
                      "Marked uncertain occupancy and cumulative units retain existing cleanup/finality semantics.",
                      "No real model, voice, HTTP fault injection, provider finality or device acceptance."]}
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps({"passed": result["passed"], "failed": result["failed"], "output": args.output}))
        return 1 if result["failed"] else 0
    finally:
        driver.observer.close()


if __name__ == "__main__":
    raise SystemExit(main())
