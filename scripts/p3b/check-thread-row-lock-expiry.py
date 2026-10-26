"""Thread-row-lock wait crossing allowlist expiry (distinct from the earlier owner-lock check).
Uses fictional service records only. Requires the TEMPORARY helper bfa_p3b_test_hold_thread_row,
which holds only the thread row lock (NOT the owner advisory lock) and is removed by the next migration.
Control: an unexpired owner waits on the same row lock and is admitted, proving the wait is at the
row lock after the initial staging check. Expiring owner: initial check passes (expiry is ~2 s away),
waits on the row lock past expiry, then the post-lock recheck refuses with no mutation or spend."""
import os, uuid, datetime, time, json, threading, requests
U=os.environ['SUPABASE_URL']; K=os.environ['SUPABASE_SERVICE_ROLE_KEY']
H={'apikey':K,'Content-Type':'application/json','Prefer':'return=representation'}
if not K.startswith('sb_'): H['Authorization']='Bearer '+K
raw=lambda m,p,d=None: requests.request(m,U+'/rest/v1/'+p,headers=H,json=d,timeout=30)
def api(m,p,d=None): r=raw(m,p,d); r.raise_for_status(); return r.json() if r.content else None
now=lambda: datetime.datetime.now(datetime.timezone.utc)
def run(expire_in):
  o=str(uuid.uuid4()); out={}
  api('POST','bfa_p3b_staging_accounts',{'user_id':o,'admitted':True,'expires_at':(now()+datetime.timedelta(seconds=expire_in)).isoformat()})
  api('POST','bfa_p3b_allowances',[{'owner_id':o,'mode':m,'remaining_units':10} for m in ['text','voice']])
  try:
    t=api('POST','rpc/bfa_p3b_create',{'p_owner':o})
    h=threading.Thread(target=lambda: out.__setitem__('hold',raw('POST','rpc/bfa_p3b_test_hold_thread_row',{'p_thread':t,'p_seconds':4}).status_code)); h.start(); time.sleep(0.6)
    s=time.time(); r=raw('POST','rpc/bfa_p3b_reserve',{'p_owner':o,'p_thread':t,'p_revision':0,'p_request':str(uuid.uuid4()),'p_mode':'text','p_fingerprint':'d'*64}); waited=time.time()-s; h.join()
    adm=api('GET','bfa_p3b_admissions?owner_id=eq.'+o); bal=sum(x['remaining_units'] for x in api('GET','bfa_p3b_allowances?owner_id=eq.'+o)); rev=api('GET','bfa_p3b_threads?id=eq.'+t)[0]['revision']
    return dict(hold=out.get('hold'),waited=round(waited,2),status=r.status_code,admissions=len(adm),balance=bal,revision=rev,error=(r.json().get('message') if r.status_code>=400 else None))
  finally: api('PATCH','bfa_p3b_staging_accounts?user_id=eq.'+o,{'admitted':False,'expires_at':now().isoformat()})
ctrl=run(300); exp=run(2)
assert ctrl['hold']==200 and ctrl['waited']>=2.5 and ctrl['status']==200 and ctrl['admissions']==1, ctrl
assert exp['hold']==200 and exp['waited']>=2.5 and exp['status']>=400 and exp['admissions']==0 and exp['balance']==20 and exp['revision']==0, exp
print(json.dumps({'kind':'actual database row lock, fictional service records, NOT authenticated sessions','control_unexpired':ctrl,'expiring':exp,'passed':True},indent=1))
