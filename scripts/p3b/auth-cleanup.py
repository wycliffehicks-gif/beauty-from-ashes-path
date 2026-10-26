"""Always-run cleanup for the fictional signed-in P3b run. Prints no secrets.
Closes A/B staging admission, revokes and deletes ONLY the fictional accounts
recorded by auth-setup.py, removes the local credential file. Email sign-in is
turned back off separately via the platform auth tool, then verified here with --verify."""
import os, json, sys, datetime, requests, pathlib
U=os.environ['SUPABASE_URL']; K=os.environ['SUPABASE_SERVICE_ROLE_KEY']
H={'apikey':K,'Content-Type':'application/json'}
if not K.startswith('sb_'): H['Authorization']='Bearer '+K
D=pathlib.Path('/tmp/p3b-auth'); ids=json.loads((D/'ids.json').read_text()) if (D/'ids.json').exists() else {}
now=datetime.datetime.now(datetime.timezone.utc).isoformat(); out={}
for name,uid in ids.items():
  r=requests.patch(f"{U}/rest/v1/bfa_p3b_staging_accounts?user_id=eq.{uid}",headers=H,json={'admitted':False,'expires_at':now}); out[name+'_admission_closed']=r.ok
  r=requests.delete(f"{U}/auth/v1/admin/users/{uid}",headers=H); out[name+'_deleted']=r.status_code
for f in ('creds.json','ids.json'):
  p=D/f
  if p.exists(): p.unlink()
r=requests.get(f"{U}/rest/v1/bfa_p3b_staging_accounts?admitted=eq.true&select=user_id",headers=H); out['admitted_rows']=len(r.json())
if '--verify' in sys.argv:
  s=requests.get(U+'/auth/v1/settings',headers={'apikey':os.environ['SUPABASE_PUBLISHABLE_KEY']}).json()
  out['settings']={'disable_signup':s['disable_signup'],'email':s['external']['email'],'anonymous':s['external']['anonymous_users'],'autoconfirm':s['mailer_autoconfirm']}
print(json.dumps(out))
