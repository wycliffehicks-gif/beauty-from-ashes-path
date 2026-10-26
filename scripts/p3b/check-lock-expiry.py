"""Actual database lock-wait crossing allowlist expiry, using fictional service
records only (no Auth users, sessions, content or provider calls). Requires the
temporary helper bfa_p3b_test_hold_owner_lock, which a later migration removes."""
import os, uuid, datetime, time, json, threading, requests
U=os.environ['SUPABASE_URL']; K=os.environ['SUPABASE_SERVICE_ROLE_KEY']
H={'apikey':K,'Content-Type':'application/json','Prefer':'return=representation'}
if not K.startswith('sb_'): H['Authorization']='Bearer '+K
def raw(method,path,data=None): return requests.request(method,U+'/rest/v1/'+path,headers=H,json=data,timeout=30)
def api(method,path,data=None):
    r=raw(method,path,data); r.raise_for_status(); return r.json() if r.content else None
now=lambda: datetime.datetime.now(datetime.timezone.utc)
owner=str(uuid.uuid4())
api('POST','bfa_p3b_staging_accounts',{'user_id':owner,'admitted':True,'expires_at':(now()+datetime.timedelta(minutes=5)).isoformat()})
api('POST','bfa_p3b_allowances',[{'owner_id':owner,'mode':m,'remaining_units':10} for m in ['text','voice']])
out={}
try:
    t=api('POST','rpc/bfa_p3b_create',{'p_owner':owner})
    api('PATCH','bfa_p3b_staging_accounts?user_id=eq.'+owner,{'expires_at':(now()+datetime.timedelta(seconds=2)).isoformat()})
    holder=threading.Thread(target=lambda: out.__setitem__('hold',raw('POST','rpc/bfa_p3b_test_hold_owner_lock',{'p_owner':owner,'p_seconds':4}).status_code))
    holder.start(); time.sleep(0.6)
    started=time.time()
    r=raw('POST','rpc/bfa_p3b_reserve',{'p_owner':owner,'p_thread':t,'p_revision':0,'p_request':str(uuid.uuid4()),'p_mode':'text','p_fingerprint':'c'*64})
    waited=time.time()-started; holder.join()
    assert out['hold']==200, out
    assert waited>=2.5, f'reserve did not wait on the owner lock ({waited:.2f}s)'
    assert r.status_code>=400, f'reserve after expiry accepted: {r.status_code}'
    assert api('GET','bfa_p3b_admissions?owner_id=eq.'+owner)==[]
    assert sum(x['remaining_units'] for x in api('GET','bfa_p3b_allowances?owner_id=eq.'+owner))==20
    assert api('GET','bfa_p3b_threads?id=eq.'+t)[0]['revision']==0
    print(json.dumps({'kind':'actual database, fictional service records, NOT authenticated sessions',
      'passed':['reserve waited %.1fs on held owner lock, allowlist expired during wait, denied HTTP %d after lock; zero admissions, balance 20, revision 0'%(waited,r.status_code)]},indent=2))
finally:
    api('PATCH','bfa_p3b_staging_accounts?user_id=eq.'+owner,{'admitted':False,'expires_at':now().isoformat()})
