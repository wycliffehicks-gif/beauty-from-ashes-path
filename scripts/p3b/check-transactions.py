"""Real Cloud database transaction checks; NOT authenticated A/B acceptance.
Uses isolated non-auth UUID test principals; never mints sessions or calls a model.
Leaves content-free ledger/tombstones, disables allowlist at cleanup.
"""
import os, uuid, requests, concurrent.futures, datetime, json
U=os.environ['SUPABASE_URL']; K=os.environ['SUPABASE_SERVICE_ROLE_KEY']
H={'apikey':K,'Content-Type':'application/json','Prefer':'return=representation'}
if not K.startswith('sb_'): H['Authorization']='Bearer '+K
owner=str(uuid.uuid4()); expires=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(minutes=10)).isoformat()
def api(method,path,data=None): return requests.request(method,U+'/rest/v1/'+path,headers=H,json=data,timeout=30)
def rpc(name,data): return api('POST','rpc/bfa_p3b_'+name,data)
def ok(r): assert r.ok, ('Database operation failed',r.status_code); return r.json()
def reserve(thread,req,rev=0,mode='text',fp='a'*64): return rpc('reserve',dict(p_owner=owner,p_thread=thread,p_revision=rev,p_request=req,p_mode=mode,p_fingerprint=fp))
checks=[]
try:
 ok(api('POST','bfa_p3b_staging_accounts',{'user_id':owner,'admitted':True,'expires_at':expires}))
 ok(api('POST','bfa_p3b_allowances',[{'owner_id':owner,'mode':'text','remaining_units':1},{'owner_id':owner,'mode':'voice','remaining_units':1}]))
 t=ok(rpc('create',{'p_owner':owner})); ids=[str(uuid.uuid4()) for _ in range(8)]
 with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool: results=list(pool.map(lambda x:reserve(t,x),ids))
 assert sum(r.ok for r in results)==1; checks.append('one-unit concurrency: exactly one reservation')
 req=ids[next(i for i,r in enumerate(results) if r.ok)]
 with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool: results=list(pool.map(lambda _:reserve(t,req),range(8)))
 assert all(r.ok and r.json()['duplicate'] for r in results); checks.append('identical identity: duplicate only')
 assert not reserve(t,req,fp='b'*64).ok; checks.append('changed payload identity: denied')
 args=dict(p_owner=owner,p_thread=t,p_revision=0,p_request=req,p_mode='text',p_fingerprint='a'*64)
 with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool: results=list(pool.map(lambda _:rpc('claim',args),range(8)))
 assert sum(r.ok and r.json() is True for r in results)==1; checks.append('concurrent dispatch claim: exactly one')
 ok(rpc('transition',dict(p_owner=owner,p_thread=t,p_revision=0,p_action='cancel')))
 a=ok(api('GET','bfa_p3b_admissions?owner_id=eq.'+owner+'&request_id=eq.'+req))[0]
 assert a['state']=='uncertain'; balance=ok(api('GET','bfa_p3b_allowances?owner_id=eq.'+owner+'&mode=eq.text'))[0]['remaining_units']; assert balance==0
 checks.append('possible-dispatch cancellation retains reservation')
 receipt=str(uuid.uuid4()); settle=dict(p_owner=owner,p_request=req,p_receipt=receipt,p_charged=0)
 with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool: results=list(pool.map(lambda _:rpc('settle',settle),range(8)))
 assert all(r.ok and r.json() is True for r in results)
 assert ok(api('GET','bfa_p3b_allowances?owner_id=eq.'+owner+'&mode=eq.text'))[0]['remaining_units']==1
 assert rpc('settle',{**settle,'p_receipt':str(uuid.uuid4())}).json() is False
 checks.append('late duplicate receipts refund exactly once; conflicting receipt denied')
 assert reserve(t,str(uuid.uuid4()),rev=1,mode='voice').ok; checks.append('separate voice allowance')
 ok(rpc('transition',dict(p_owner=owner,p_thread=t,p_revision=1,p_action='delete')))
 assert not reserve(t,str(uuid.uuid4()),rev=2).ok; assert not rpc('transition',dict(p_owner=owner,p_thread=t,p_revision=2,p_action='save',p_snapshot='forged')).ok
 row=ok(api('GET','bfa_p3b_threads?id=eq.'+t))[0]; assert row['saved_snapshot'] is None and row['deleted_at']
 checks.append('deletion tombstone rejects stale reserve/save and removes saved content')
 # Ordinary callers cannot bypass service RPCs even with a forged owner selector.
 anon={'apikey':os.environ['SUPABASE_PUBLISHABLE_KEY'],'Content-Type':'application/json'}
 for name,payload in [('reserve',args),('claim',args),('transition',dict(p_owner=owner,p_thread=t,p_revision=2,p_action='save',p_snapshot='forged'))]:
  r=requests.post(U+'/rest/v1/rpc/bfa_p3b_'+name,headers=anon,json=payload);assert not r.ok
 checks.append('anonymous direct state-changing RPC bypass denied')
 print(json.dumps({'kind':'actual database/service transaction checks, NOT auth integration','passed':checks},indent=2))
finally:
 api('PATCH','bfa_p3b_staging_accounts?user_id=eq.'+owner,{'admitted':False,'expires_at':datetime.datetime.now(datetime.timezone.utc).isoformat()})
