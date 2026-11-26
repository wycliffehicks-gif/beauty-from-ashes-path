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
SPEND = REPO / "docs/pilot/conversation/sql-drafts/private-typed-spend.sql"
SOURCE = REPO / "docs/pilot/conversation/sql-drafts/private-typed-dispatch.sql"
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
        self.o.query('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE TABLE auth.sessions(id uuid PRIMARY KEY, user_id uuid NOT NULL, not_after timestamptz);')
        for path in [P3B/"0000_p3b_locked_conversation_foundation.sql", P3B/"0001_p3b_revoke_inherited_browser_grants.sql", SPEND, SOURCE]:
            self.o.query(path.read_text())
        require(self.o.scalar("SELECT current_setting('listen_addresses') = '';") == 't', "SQL must use local socket only")
        self.a.query("SET ROLE service_role;")
        self.b.query("SET ROLE service_role;")


    def simultaneous(self, first_sql, second_sql, after_first=None):
        self.a.query("BEGIN;")
        first = self.a.scalar(first_sql)
        if after_first:
            after_first(first)
        pending = self.b.start(second_sql)
        self.blocked(self.a,self.b)
        self.a.query("COMMIT;")
        second = self.b.finish(pending)
        return first, second

    def block_then(self, update, method_sql, deadline=None):
        self.o.query("BEGIN;")
        self.o.query(update)
        pending = self.b.start(method_sql)
        self.blocked(self.o, self.b)
        if deadline is not None:
            self.after_deadline(q(deadline)+"::timestamptz")
        self.o.query("COMMIT;")
        return self.b.finish(pending)

    def revision(self,f):
        return int(self.o.scalar(f"SELECT revision FROM public.bfa_p3b_threads WHERE id={q(f['thread'])};"))

    def run(self):
        self.prepare()
        self.one_marker()
        self.settle_versus_stopped()
        self.finish_once()
        self.logout_order(True)
        self.logout_order(False)
        for dimension in ("approval","allowlist","session","auth","envelope"):
            self.expired_marker(dimension)
        self.withdrawn_approval()
        self.shortened_dispatch_ceiling()
        self.collision_rollback_expiry()
        self.legacy_settlement_read()
        self.original_verified_age()
        return {"status":"PASS","sqlSha256":hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
                "baseSpendSha256":hashlib.sha256(SPEND.read_bytes()).hexdigest(),
                "postgres":self.o.scalar("SHOW server_version;"),"cases":self.cases,
                "observedLockBarriers":self.barriers.count("postgres-confirmed-blocking-pid"),
                "observedClockBarriers":self.barriers.count("postgres-confirmed-deadline"),
                "sessionSource":"local auth.sessions fixture","tcpListening":False}

    def held(self, short=""):
        f=self.fixture(short)
        result=self.a.scalar(self.claim(f))
        require(result=="t" and self.state(f)=="held","fixture claim must hold the funding")
        return f

    def one_marker(self):
        f=self.held()
        a,b=self.simultaneous(self.mark(f),self.mark(f))
        require(a=="t" and b==["f"],"exactly one marker for concurrent calls")
        require(self.b.scalar(self.mark(f))=="f","no replacement marker after lost acknowledgment")
        require(self.state(f)=="held" and self.revision(f)==0,"mark cannot deliver or settle")
        self.cases.append("concurrent dispatch marker and lost acknowledgement: only one caller wins")

    def withdrawn_approval(self):
        f=self.held()
        outcome=self.block_then(f"UPDATE bfa_private_text_spend.approvals SET revoked=true WHERE approval_id={q(f['approval'])};",self.mark(f))
        require(outcome==["f"] and self.state(f)=="held","newly revoked approval cannot send or refund")
        self.cases.append("independent revocation during marker lock wait preserves hold")

    def original_verified_age(self):
        f=self.fixture()
        started=self.stamp(-27.5)
        require(self.a.scalar(f"SELECT public.bfa_private_text_spend_claim({self.binding(f)}, {q(started)}, {q(f['auth_deadline'])});")=="t",
                "hold begins within original verified window")
        deadline=self.o.scalar(f"SELECT ({q(started)}::timestamptz + interval '30 seconds')::text;")
        result=self.block_then(self.lock(f,"thread"),self.mark(f),deadline)
        require(result==["f"] and self.state(f)=="held","a later Auth timestamp cannot restart the original 30-second verification")
        self.cases.append("fresh Auth observation cannot reset the durable original verification age during a wait")

    def legacy_settlement_read(self):
        f=self.held()
        require(self.a.scalar(self.mark(f))=="t","marked funding fixture")
        legacy=(f"SELECT public.bfa_private_text_spend_settle({self.binding(f)},"
                f"{q(f['receipt'])},{q(f['evidence'])},143);")
        read=self.observed(f,"read",f["marker"])
        x,y=self.simultaneous(legacy,f"SELECT coalesce(({read})->>'state','unavailable');")
        require(x=="t" and y==["unavailable"],
                "funding already settled by preserved ledger cannot be reported as dispatched without matched marker settlement")
        require(self.b.scalar(self.done(f))=="-1" and self.revision(f)==0,
                "base settlement alone cannot finish")
        require(self.b.scalar(self.paid(f))=="t","exact receipt association can recover independently")
        read=self.observed(f,"read",f["marker"])
        require(self.b.scalar(f"SELECT ({read})->>'state';")=="settled" and self.revision(f)==0,
                "matched receipt resolves accounting only")
        self.cases.append("old settlement wins post-marker read; no false dispatch authority until exact independent receipt association")

    def collision_rollback_expiry(self):
        x,y=self.held(),self.held("envelope")
        y["marker"]=x["marker"]
        self.a.query("BEGIN;")
        require(self.a.scalar(self.mark(x))=="t","marker collision fixture setup")
        pend=self.b.start(self.mark(y))
        self.blocked(self.a,self.b)
        self.after_deadline(q(y["envelope_deadline"])+"::timestamptz")
        self.a.query("ROLLBACK;")
        outcome=self.b.finish(pend)
        require(outcome==["f"], "global marker collision wait crossed expiry; grant must deny after first transaction rolls back")
        n=self.o.scalar(f"SELECT count(*) FROM bfa_private_text_spend.dispatches WHERE approval_id={q(y['approval'])};")
        require(n=="0" and self.state(y)=="held","losing expired grant must retain only its monetary hold")
        self.cases.append("global marker collision rollback after expiry: no stale marker on independent grant")

    def shortened_dispatch_ceiling(self):
        f=self.held()
        short=self.stamp(2.5)
        f["envelope_deadline"]=short
        require(self.a.scalar(self.mark(f))=="t" and self.a.scalar(self.paid(f))=="t","restrictive dispatch deadline fixture")
        f["envelope_deadline"]=self.stamp(70)
        result=self.block_then(self.lock(f,"thread"),self.done(f),short)
        require(result==["-1"] and self.revision(f)==0 and self.state(f)=="settled",
                "longer later observation cannot extend deadline retained at dispatch")
        self.cases.append("later broader ceiling cannot revive settled delivery after marked deadline")

    def expired_marker(self,dimension):
        f=self.held(dimension)
        result=self.block_then(self.lock(f,"thread"),self.mark(f),f[dimension+"_deadline"])
        require(result==["f"] and self.state(f)=="held","lock-time "+dimension+" expiry")
        self.cases.append(dimension+" expires after claim while dispatch waits for thread")

    def logout_order(self, logout_wins):
        f=self.held()
        delete=f"DELETE FROM auth.sessions WHERE id={q(f['session'])};"
        if logout_wins:
            outcome=self.block_then(delete,self.mark(f))
            require(outcome==["f"] and self.state(f)=="held","removed session invalidates even if JWT deadline remains")
        else:
            self.a.query("BEGIN;")
            require(self.a.scalar(self.mark(f))=="t","pre-deletion mark")
            pending=self.o.start(delete)
            # Use a distinct observer here: the original observer is currently blocked.
            witness=Session(self,"typed_logout_observer")
            observer=self.o; self.o=witness
            try:
                self.blocked(self.a,observer)
            finally:
                self.o=observer
            self.a.query("COMMIT;")
            self.o.finish(pending)
            require(self.b.scalar(self.mark(f))=="f","cannot reissue after deletion")
            require(self.b.scalar(self.paid(f))=="t" and self.state(f)=="settled","settlement survives deleted Auth session")
            require(self.b.scalar(self.done(f))=="-1" and self.revision(f)==0,"no finish after session deletion")
        self.cases.append("Auth session deletion "+("wins before marker while JWT time remains" if logout_wins else "waits for marker; settlement retained and finish suppressed"))

    def settle_versus_stopped(self):
        f=self.held()
        require(self.a.scalar(self.mark(f))=="t","dispatch fixture")
        require(self.a.scalar(self.paid(f))=="t","receipt fixture")
        stopped=f"UPDATE public.bfa_p3b_threads SET revision=revision+1 WHERE id={q(f['thread'])};"
        result=self.block_then(stopped,self.done(f))
        require(result==["-1"] and self.state(f)=="settled" and self.revision(f)==1,"settle survives stop; delivery denied")
        self.cases.append("committed stop during finish wait suppresses reply and preserves receipt")

    def finish_once(self):
        f=self.held()
        require(self.a.scalar(self.mark(f))=="t" and self.a.scalar(self.paid(f))=="t","eligible receipt")
        a,b=self.simultaneous(self.done(f),self.done(f))
        require(a=="1" and b==["-1"] and self.revision(f)==1,"current reply advances exactly once")
        self.cases.append("concurrent finish consumes one delivery and advances thread exactly once")

    def observed(self,f,kind,dispatch=None,evidence=None):
        binding=self.binding(f)
        marker="NULL" if dispatch is None else q(dispatch)
        auth_start=q(self.stamp(-.01))
        a=q(f["auth_deadline"])
        c=q(f["envelope_deadline"])
        args=f"{binding},{marker},{auth_start},{a},{c}"
        if evidence is not None:
            args+=","+q(evidence)
        return f"public.bfa_private_text_spend_{kind}({args})"

    def mark(self,f):
        call=self.observed(f,"dispatch",f["marker"])
        return f"SELECT coalesce(({call})->>'state'='dispatched',false);"

    def done(self,f):
        call=self.observed(f,"finish",f["marker"],f["evidence"])
        return f"SELECT coalesce((({call})->>'finishedRevision')::bigint,-1);"

    def paid(self,f):
        return ("SELECT public.bfa_private_text_spend_settle_dispatched("
                f"{self.binding(f)},{q(f['marker'])},{q(f['receipt'])},{q(f['evidence'])},143);")

    def stamp(self, seconds):
        return self.o.scalar(f"SELECT (clock_timestamp()+interval '{seconds} seconds')::text;")

    def fixture(self, short=""):
        f = dict(marker=uid(),receipt="resp_fixture_"+uid(),evidence=dig(uid()),approval=uid(), owner=uid(), session=uid(), thread=uid(), request=uid(),
                 manifest=dig("unit manifest"), wire=dig(uid()), reserve=9112)
        for kind in ("allowlist","auth","approval","session","envelope"):
            f[kind+"_deadline"] = self.stamp(2.5 if kind==short else 75)
        self.o.query(f"INSERT INTO public.bfa_p3b_staging_accounts(user_id,admitted,expires_at)"
                     f" VALUES({q(f['owner'])},true,{q(f['allowlist_deadline'])});"
                     f"INSERT INTO public.bfa_p3b_threads(id,owner_id) VALUES({q(f['thread'])},{q(f['owner'])});")
        self.o.query(f"INSERT INTO auth.sessions(id,user_id,not_after) VALUES({q(f['session'])},{q(f['owner'])},{q(f['session_deadline'])});")
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
        print("BFA_SENDER_PARTIAL",json.dumps({"cases":harness.cases,"barriers":harness.barriers}), flush=True)
        raise
    finally:
        for session in harness.sessions:
            session.close()
    print("BFA_SENDER_NATIVE",json.dumps(out,separators=(",",":")),flush=True)

if __name__ == "__main__":
    main()
