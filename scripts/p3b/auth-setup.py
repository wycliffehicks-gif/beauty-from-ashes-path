"""Creates fictional confirmed A/B/C through the admin create-user route (no emails),
admits only A/B with expiry and integer fictional allowances. Credentials stay in a
0600 file under /tmp/p3b-auth and are never printed."""
import os, json, secrets, datetime, requests, pathlib
U=os.environ['SUPABASE_URL']; K=os.environ['SUPABASE_SERVICE_ROLE_KEY']
H={'apikey':K,'Content-Type':'application/json','Prefer':'return=minimal'}
if not K.startswith('sb_'): H['Authorization']='Bearer '+K
s=requests.get(U+'/auth/v1/settings',headers={'apikey':os.environ['SUPABASE_PUBLISHABLE_KEY']}).json()
assert s['disable_signup'] is True and s['external']['anonymous_users'] is False and s['mailer_autoconfirm'] is False, 'public signup not closed'
D=pathlib.Path('/tmp/p3b-auth'); tag=secrets.token_hex(4); creds={}; ids={}
for n in 'ABC':
  email=f'p3b-fictional-{n.lower()}-{tag}@example.com'; pw=secrets.token_urlsafe(24)+'Aa1!'
  r=requests.post(U+'/auth/v1/admin/users',headers=H,json={'email':email,'password':pw,'email_confirm':True})
  assert r.ok, ('create failed',n,r.status_code)
  ids[n]=r.json()['id']; creds[n]={'email':email,'password':pw}
  (D/'ids.json').write_text(json.dumps(ids))
p=D/'creds.json'; p.touch(mode=0o600); p.write_text(json.dumps(creds))
exp=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(minutes=40)).isoformat()
for n in 'AB':
  r=requests.post(U+'/rest/v1/bfa_p3b_staging_accounts',headers={**H,'Prefer':'resolution=merge-duplicates'},json={'user_id':ids[n],'admitted':True,'expires_at':exp}); assert r.ok,r.status_code
al=[{'owner_id':ids['A'],'mode':'text','remaining_units':40},{'owner_id':ids['A'],'mode':'voice','remaining_units':2},
    {'owner_id':ids['B'],'mode':'text','remaining_units':1},{'owner_id':ids['B'],'mode':'voice','remaining_units':1}]
r=requests.post(U+'/rest/v1/bfa_p3b_allowances',headers=H,json=al); assert r.ok,r.status_code
print(json.dumps({'created':list(ids),'admitted':['A','B'],'C':'valid account, not allowlisted'}))
