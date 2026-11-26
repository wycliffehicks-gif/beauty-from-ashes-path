"""Independent contract checks against a disposable local PostgreSQL cluster only."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import time
import uuid

REPO = Path.cwd()
SOURCE = REPO / "docs/pilot/conversation/sql-drafts/private-typed-spend.sql"
P3B = REPO / "drizzle/migrations"
spec = importlib.util.spec_from_file_location("bfa_test_sessions", REPO / "scripts/conversation-eval/p5-sql/concurrency.py")
session_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(session_module)
Session = session_module.Session

def uid():
    return str(uuid.uuid4())

def dig(s):
    return hashlib.sha256(s.encode("ascii")).hexdigest()

def q(s):
    return "'" + str(s).replace("'", "''") + "'"

def require(value, desc):
    if not value:
        raise AssertionError(desc)

class RaceTests:
    def __init__(self, psql, socket, logs):
        self.log_dir = Path(logs)
        self.command = [psql, "-X", "-A", "-t", "-q", "-w", "-v", "ON_ERROR_STOP=1",
                        "-h", socket, "-p", "55432", "-U", "bfa_test", "-d", "postgres"]
        self.env = {"PATH": "/usr/bin:/bin", "HOME": os.environ["HOME"], "LC_ALL": "C",
                    "PGOPTIONS": "-c lock_timeout=12000 -c statement_timeout=15000 -c idle_in_transaction_session_timeout=18000"}
        self.sessions = []
        self.cases = []
        self.barriers = []
        self.o = Session(self,"typed_observer")
        self.a = Session(self,"typed_first")
        self.b = Session(self,"typed_second")

    def blocked(self, blocker, waiter):
        until = time.monotonic() + 4
        while time.monotonic() < until:
            ok = self.o.scalar(f"SELECT {blocker.pid}=ANY(pg_blocking_pids({waiter.pid}));")
            if ok == 't':
                self.barriers.append("postgres-confirmed-blocking-pid")
                return
            time.sleep(.025)
        raise AssertionError("Required database-observed wait never occurred")

    def after_deadline(self, sql):
        require(self.o.scalar(f"SELECT clock_timestamp() < ({sql});") == 't', "wait must start before real deadline")
        until=time.monotonic()+6
        while time.monotonic()<until:
            if self.o.scalar(f"SELECT clock_timestamp() >= ({sql});") == 't':
                self.barriers.append("postgres-confirmed-deadline")
                return
            time.sleep(.04)
        raise AssertionError("Required real deadline never passed")

    def prepare(self):
        self.o.query('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;')
        for path in [P3B/"0000_p3b_locked_conversation_foundation.sql", P3B/"0001_p3b_revoke_inherited_browser_grants.sql", SOURCE]:
            self.o.query(path.read_text())
        require(self.o.scalar("SELECT current_setting('listen_addresses') = '';") == 't', "SQL must use local socket only")
        self.a.query("SET ROLE service_role;")
        self.b.query("SET ROLE service_role;")

    def run(self):
        self.prepare()
        self.race_claim()
        self.race_settle()
        self.race_collision()
        self.wait_expiry("approval")
        self.wait_expiry("allowlist")
        self.wait_expiry("auth")
        self.wait_revoke()
        self.wait_revision()
        self.after_tombstone()
        return {"status":"PASS","sqlSha256":hashlib.sha256(SOURCE.read_bytes()).hexdigest(), "postgres":self.o.scalar("SHOW server_version;"),
                "cases":self.cases, "observedLockBarriers":self.barriers.count("postgres-confirmed-blocking-pid"),
                "observedClockBarriers":self.barriers.count("postgres-confirmed-deadline"),"tcpListening":False}

    def race_claim(self):
        f=self.fixture()
        self.a.query("BEGIN;")
        require(self.a.scalar(self.claim(f))=="t","first claim must succeed")
        pending=self.b.start(self.claim(f))
        self.blocked(self.a,self.b)
        self.a.query("COMMIT;")
        require(self.b.finish(pending)==["f"],"competing claimant must not reissue")
        require(self.state(f)=="held","exactly one held authorization expected")
        self.cases.append("simultaneous claim: one dispatch authority, one held grant")

    def race_settle(self):
        f=self.fixture()
        require(self.a.scalar(self.claim(f))=="t","fixture claim")
        receipt="resp_native-differing-settlements"
        self.a.query("BEGIN;")
        require(self.a.scalar(self.settle(f,receipt,154))=="t","first receipt")
        pending=self.b.start(self.settle(f,receipt,155))
        self.blocked(self.a,self.b)
        self.a.query("COMMIT;")
        require(self.b.finish(pending)==["f"],"different dollar amount on repeated receipt")
        require(self.b.scalar(self.settle(f,receipt,154))=="t","exact idempotent receipt")
        require(self.b.scalar(self.settle(f,receipt,154,"other-evidence"))=="f","different receipt evidence")
        require(self.amount(f)=="154","first settled estimate must be retained")
        self.cases.append("simultaneous inconsistent receipt: original charge retained; exact replay acknowledged")

    def race_collision(self):
        fx,fy=self.fixture(),self.fixture()
        require(self.a.scalar(self.claim(fx))=="t" and self.b.scalar(self.claim(fy))=="t","independent held grants")
        receipt="resp_native-global-id-collision"
        self.a.query("BEGIN;")
        require(self.a.scalar(self.settle(fx,receipt,121))=="t","first provider receipt")
        pending=self.b.start(self.settle(fy,receipt,183))
        self.blocked(self.a,self.b)
        self.a.query("COMMIT;")
        require(self.b.finish(pending)==["f"],"receipt may settle only one grant")
        require(self.state(fy)=="held" and self.amount(fx)=="121","losing row remains held")
        self.cases.append("global receipt collision across two grants: single settlement, second hold retained")

    def wait_expiry(self, subject):
        f=self.fixture(short=subject)
        holder=self.o
        holder.query("BEGIN;")
        holder.query(self.lock(f,"thread" if subject!="auth" else "approval"))
        pending=self.b.start(self.claim(f))
        self.blocked(holder,self.b)
        self.after_deadline(q(f[subject+"_deadline"])+"::timestamptz")
        holder.query("COMMIT;")
        require(self.b.finish(pending)==["f"],subject+" expired during wait")
        require(self.state(f)=="approved","expired eligibility must not mark possible dispatch")
        self.cases.append(subject+" deadline expired during observed row lock")

    def wait_revoke(self):
        f=self.fixture()
        self.o.query("BEGIN;")
        self.o.query(f"UPDATE public.bfa_p3b_staging_accounts SET admitted=false WHERE user_id={q(f['owner'])};")
        pending=self.b.start(self.claim(f))
        self.blocked(self.o,self.b)
        self.o.query("COMMIT;")
        require(self.b.finish(pending)==["f"] and self.state(f)=="approved","committed de-admission")
        self.cases.append("committed allowlist withdrawal during observed wait")

    def wait_revision(self):
        f=self.fixture()
        self.o.query("BEGIN;")
        self.o.query(f"UPDATE public.bfa_p3b_threads SET revision=revision+1 WHERE id={q(f['thread'])};")
        pending=self.b.start(self.claim(f))
        self.blocked(self.o,self.b)
        self.o.query("COMMIT;")
        require(self.b.finish(pending)==["f"] and self.state(f)=="approved","committed thread revision change")
        self.cases.append("thread revision advanced during observed row lock")

    def after_tombstone(self):
        f=self.fixture(short="approval")
        require(self.a.scalar(self.claim(f))=="t","apply pre-expiry claim")
        self.o.query(f"UPDATE public.bfa_p3b_staging_accounts SET admitted=false WHERE user_id={q(f['owner'])};"
                     f"UPDATE public.bfa_p3b_threads SET deleted_at=clock_timestamp() WHERE id={q(f['thread'])};")
        self.after_deadline(q(f["approval_deadline"])+"::timestamptz")
        require(self.b.scalar(self.claim(f))=="f" and self.state(f)=="held","expired uncertain hold")
        require(self.b.scalar(self.settle(f,"resp_native-after-tombstone",312))=="t","late, reliably attributed settlement")
        require(self.amount(f)=="312","late settlement estimate retained")
        self.cases.append("delayed receipt after expiry, allowlist withdrawal and deletion; no second dispatch")

    def stamp(self, seconds):
        return self.o.scalar(f"SELECT (clock_timestamp()+interval '{seconds} seconds')::text;")

    def fixture(self, short=""):
        f = dict(approval=uid(), owner=uid(), session=uid(), thread=uid(), request=uid(),
                 manifest=dig("unit manifest"), wire=dig(uid()), reserve=9112)
        for kind in ("allowlist","auth","approval"):
            f[kind+"_deadline"] = self.stamp(2.5 if kind==short else 75)
        self.o.query(f"INSERT INTO public.bfa_p3b_staging_accounts(user_id,admitted,expires_at)"
                     f" VALUES({q(f['owner'])},true,{q(f['allowlist_deadline'])});"
                     f"INSERT INTO public.bfa_p3b_threads(id,owner_id) VALUES({q(f['thread'])},{q(f['owner'])});")
        self.install_grant(f)
        return f


    def binding(self, f):
        return ",".join([q(f["approval"]),q(f["owner"]),q(f["session"]),q(f["thread"]),"0",q(f["request"]),
                          q(f["manifest"]),q(f["wire"]),"'openai'","'gpt-6-luna'","'default'","9112",q(f["approval_deadline"])])

    def install_grant(self,f):
        self.o.query("INSERT INTO bfa_private_text_spend.approvals(approval_id,owner_id,auth_session_id,thread_id,"
                     "thread_revision,request_id,manifest_sha256,payload_sha256,provider,model,tier,max_micros,expires_at)"
                     f" VALUES ({self.binding(f)});")

    def claim(self,f):
        # Auth begins before the database call and its lock waits.
        return f"SELECT public.bfa_private_text_spend_claim({self.binding(f)}, {q(self.stamp(-.05))}, {q(f['auth_deadline'])});"

    def settle(self,f,receipt,amount,evidence=None):
        metadata=dig(evidence or (f["request"]+receipt))
        return f"SELECT public.bfa_private_text_spend_settle({self.binding(f)}, {q(receipt)}, {q(metadata)}, {amount});"

    def state(self,f):
        return self.o.scalar(f"SELECT state FROM bfa_private_text_spend.approvals WHERE approval_id={q(f['approval'])};")

    def amount(self,f):
        return self.o.scalar(f"SELECT charged_micros FROM bfa_private_text_spend.approvals WHERE approval_id={q(f['approval'])};")

    def lock(self,f,kind):
        if kind == "thread":
            return f"SELECT 1 FROM public.bfa_p3b_threads WHERE id={q(f['thread'])} FOR UPDATE;"
        return f"SELECT 1 FROM bfa_private_text_spend.approvals WHERE approval_id={q(f['approval'])} FOR UPDATE;"

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("psql"); parser.add_argument("socket"); parser.add_argument("logs")
    args=parser.parse_args()
    require(Path(args.psql).is_absolute() and Path(args.socket).is_absolute() and not os.geteuid()==0, "private local context")
    harness=RaceTests(args.psql,args.socket,args.logs)
    try:
        out=harness.run()
    except BaseException:
        print("BFA_TYPED_PARTIAL",json.dumps({"cases":harness.cases,"barriers":harness.barriers}), flush=True)
        raise
    finally:
        for session in harness.sessions:
            session.close()
    print("BFA_TYPED_NATIVE",json.dumps(out,separators=(",",":")),flush=True)

if __name__ == "__main__":
    main()
