"""Actual database/service-record tests; never creates Auth users or sessions.
Uses the platform database connection only for deterministic lock coordination.
No message bodies, provider calls or auth configuration mutations.
"""
import os, uuid, datetime, concurrent.futures, time, json
import psycopg, requests

URL = os.environ['SUPABASE_DB_URL']
U=os.environ['SUPABASE_URL']; K=os.environ['SUPABASE_SERVICE_ROLE_KEY']
H={'apikey':K,'Content-Type':'application/json','Prefer':'return=representation'}
if not K.startswith('sb_'): H['Authorization']='Bearer '+K
def api(method,path,data=None):
    r=requests.request(method,U+'/rest/v1/'+path,headers=H,json=data,timeout=15)
    r.raise_for_status();return r.json() if r.content else None
owner = str(uuid.uuid4())
checks = []
def connection(): return psycopg.connect(URL, autocommit=True)
def call(name, args):
    names={'create':['p_owner'],'reserve':['p_owner','p_thread','p_revision','p_request','p_mode','p_fingerprint'],
      'claim':['p_owner','p_thread','p_revision','p_request','p_mode','p_fingerprint'],
      'transition':['p_owner','p_thread','p_revision','p_action','p_snapshot'],'settle':['p_owner','p_request','p_receipt','p_charged']}
    return api('POST','rpc/bfa_p3b_'+name,dict(zip(names[name],args)))
def denied(name,args):
    try: call(name,args)
    except requests.HTTPError: return
    raise AssertionError('Invalid arguments accepted')
api('POST','bfa_p3b_staging_accounts',{'user_id':owner,'admitted':True,'expires_at':(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(minutes=10)).isoformat()})
api('POST','bfa_p3b_allowances',[{'owner_id':owner,'mode':mode,'remaining_units':20} for mode in ['text','voice']])
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
    assert api('GET','bfa_p3b_admissions?owner_id=eq.'+owner)==[]
    assert sum(r['remaining_units'] for r in api('GET','bfa_p3b_allowances?owner_id=eq.'+owner))==40
    checks.append('null/invalid arguments denied before any mutation (24 probes)')

    # Sandbox SQL role cannot execute service RPCs or hold protected locks.
    # Do not widen grants for a test. Expired service-record denial is still real.
    api('PATCH','bfa_p3b_staging_accounts?user_id=eq.'+owner,{'expires_at':datetime.datetime.now(datetime.timezone.utc).isoformat()})
    denied('transition',[owner,t,0,'advance',None])
    checks.append('expired allowlist service RPC denied; deterministic lock-wait test BLOCKED by sandbox SQL grants')
    api('PATCH','bfa_p3b_staging_accounts?user_id=eq.'+owner,{'expires_at':(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(minutes=10)).isoformat()})

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
    rows=api('GET','bfa_p3b_admissions?owner_id=eq.'+owner)
    assert sorted(r['state'] for r in rows)==['cancelled-before-dispatch','cancelled-before-dispatch','settled','settled']
    assert sum(r['remaining_units'] for r in api('GET','bfa_p3b_allowances?owner_id=eq.'+owner))==40
    assert api('GET','bfa_p3b_threads?id=eq.'+t)[0]['deleted_at']
    checks.append('multi-pending text/voice settle-delete terminates, exactly-once balance, tombstone')
    print(json.dumps({'kind':'actual database, NOT authenticated sessions','passed':checks},indent=2))
finally:
    api('PATCH','bfa_p3b_staging_accounts?user_id=eq.'+owner,{'admitted':False,'expires_at':datetime.datetime.now(datetime.timezone.utc).isoformat()})
