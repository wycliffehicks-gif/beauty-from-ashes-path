"""Actual database/service-record tests; never creates Auth users or sessions.
Uses the platform database connection only for deterministic lock coordination.
No message bodies, provider calls or auth configuration mutations.
"""
import os, uuid, datetime, concurrent.futures, time, json
import psycopg

URL = os.environ['SUPABASE_DB_URL']
owner = str(uuid.uuid4())
checks = []
def connection(): return psycopg.connect(URL, autocommit=True)
def call(name, args):
    with connection() as c:
        return c.execute('select public.bfa_p3b_'+name+'('+','.join(['%s']*len(args))+')', args).fetchone()[0]
def denied(name,args):
    try: call(name,args)
    except psycopg.Error: return
    raise AssertionError('Invalid arguments accepted')

with connection() as setup:
    setup.execute('insert into public.bfa_p3b_staging_accounts(user_id,admitted,expires_at) values(%s,true,clock_timestamp()+interval \'10 minutes\')',[owner])
    setup.execute("insert into public.bfa_p3b_allowances(owner_id,mode,remaining_units) values(%s,'text',20),(%s,'voice',20)",[owner,owner])
try:
    t=call('create',[owner]); request=str(uuid.uuid4())
    base=[owner,t,0,request,'text','a'*64]
    for index in range(6):
        args=base.copy();args[index]=None;denied('reserve',args);denied('claim',args)
    for index in range(4):
        args=[owner,t,0,'advance',None];args[index]=None;denied('transition',args)
    for index in range(4):
        args=[owner,request,str(uuid.uuid4()),0];args[index]=None;denied('settle',args)
    denied('create',[None]);denied('reserve',[owner,t,-1,request,'text','a'*64])
    denied('reserve',[owner,t,0,request,'invalid','a'*64]);denied('reserve',[owner,t,0,request,'text','not-a-hash'])
    denied('transition',[owner,t,0,'save',None]);denied('transition',[owner,t,0,'advance','"unexpected"'])
    with connection() as c:
        assert c.execute('select count(*) from public.bfa_p3b_admissions where owner_id=%s',[owner]).fetchone()[0]==0
        assert c.execute('select sum(remaining_units) from public.bfa_p3b_allowances where owner_id=%s',[owner]).fetchone()[0]==40
    checks.append('null/invalid arguments denied before any mutation (24 probes)')

    # Block thread, expire while guard waits. Transaction-start now() would pass.
    with connection() as c: c.execute("update public.bfa_p3b_staging_accounts set expires_at=clock_timestamp()+interval '1 second' where user_id=%s",[owner])
    locker=connection();locker.execute('begin');locker.execute('select id from public.bfa_p3b_threads where id=%s for update',[t])
    with concurrent.futures.ThreadPoolExecutor() as pool:
        future=pool.submit(denied,'transition',[owner,t,0,'advance',None]);time.sleep(1.3);locker.execute('commit');future.result(timeout=10)
    locker.close();checks.append('actual expiry after thread-lock wait denied')
    with connection() as c: c.execute("update public.bfa_p3b_staging_accounts set expires_at=clock_timestamp()+interval '10 minutes' where user_id=%s",[owner])

    # Four pending admissions, both modes, two claimed; settle races delete.
    pending=[]
    for i in range(4):
        rid=str(uuid.uuid4());mode='text' if i<2 else 'voice';args=[owner,t,0,rid,mode,'b'*64]
        call('reserve',args)
        if i%2==0: assert call('claim',args) is True
        pending.append((rid,i%2==0))
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures=[pool.submit(call,'settle',[owner,rid,str(uuid.uuid4()),0]) for rid,claimed in pending if claimed]
        futures.append(pool.submit(call,'transition',[owner,t,0,'delete',None]))
        results=[f.result(timeout=15) for f in futures]
    assert all(r is True for r in results[:2])
    with connection() as c:
        rows=c.execute('select state from public.bfa_p3b_admissions where owner_id=%s',[owner]).fetchall()
        assert sorted(r[0] for r in rows)==['cancelled-before-dispatch','cancelled-before-dispatch','settled','settled']
        assert c.execute('select sum(remaining_units) from public.bfa_p3b_allowances where owner_id=%s',[owner]).fetchone()[0]==40
        assert c.execute('select deleted_at is not null from public.bfa_p3b_threads where id=%s',[t]).fetchone()[0]
    checks.append('multi-pending text/voice settle-delete terminates, exactly-once balance, tombstone')
    print(json.dumps({'kind':'actual database, NOT authenticated sessions','passed':checks},indent=2))
finally:
    with connection() as c:
        c.execute('update public.bfa_p3b_staging_accounts set admitted=false,expires_at=clock_timestamp() where user_id=%s',[owner])