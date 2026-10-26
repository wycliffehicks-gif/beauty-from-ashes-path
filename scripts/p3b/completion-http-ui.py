"""P3b completion pass: actual TanStack server-function HTTP boundary (requireSupabaseAuth +
input validator + serialization) and signed-in UI on the real /conversation-staging console.
Sessions come from the ordinary app client's signInWithPassword inside the page (credentials are
passed as evaluate arguments from the 0600 temp file, never printed). This is NOT a login-screen
UX test: no login page exists or is shipped. Mock provider only; fictional text only."""
import asyncio, json, os, sys, requests
from playwright.async_api import async_playwright, expect
U=os.environ['SUPABASE_URL']; K=os.environ['SUPABASE_SERVICE_ROLE_KEY']
H={'apikey':K}
if not K.startswith('sb_'): H['Authorization']='Bearer '+K
creds=json.load(open('/tmp/p3b-auth/creds.json')); ids=json.load(open('/tmp/p3b-auth/ids.json'))
OUT='/tmp/browser/p3b-completion'; os.makedirs(OUT,exist_ok=True)
res=[]; fails=[]
def svc(p): r=requests.get(U+'/rest/v1/'+p,headers=H); r.raise_for_status(); return r.json()
def adm(o): return svc(f'bfa_p3b_admissions?owner_id=eq.{o}&select=request_id,state')
def row(t): return svc(f'bfa_p3b_threads?id=eq.{t}&select=revision,deleted_at,saved_revision')[0]
def admit(o,on): requests.patch(f'{U}/rest/v1/bfa_p3b_staging_accounts?user_id=eq.{o}',headers={**H,'Content-Type':'application/json'},json={'admitted':on}).raise_for_status()
def ok(gate,name,cond,ev=''):
  (res if cond else fails).append(f'{gate} {"PASS" if cond else "FAIL"}: {name} {ev}'); 
JS_SETUP="""async () => { const m = await import('/src/integrations/supabase/client.ts'); const f = await import('/src/lib/ai/conversation/staging/staging.functions.ts');
  window.__sb = m.supabase; window.__fn = f.runStagingOperation; return true; }"""
SIGNIN="async (c) => { await window.__sb.auth.signOut({scope:'local'}); const r = await window.__sb.auth.signInWithPassword(c); return !r.error && !!r.data.session; }"
CALL="""async ([data, auth]) => { try { const r = await window.__fn(auth === undefined ? { data } : { data, headers: { Authorization: auth } });
  window.__last = r; return { ok: true, kind: r.kind, thread: r.thread, revision: r.revision }; } catch (e) { return { ok: false, err: String(e && e.message || e).slice(0, 80) }; } }"""
async def call(page,data,auth=None,use_last=False):
  return await page.evaluate(CALL,[data,auth] if auth is not None else [data])
async def http_boundary(page,statuses):
  await page.evaluate(SIGNIN,creds['A'])
  r=await call(page,{'action':'create','preferenceOn':False}); ok('O01-HTTP','A create over real server-function HTTP',r['ok'] and r['kind']=='active')
  # keep A's thread/token only in page memory
  await page.evaluate("()=>{window.__A=window.__last}")
  tA=r['thread']; base=row(tA)
  r=await page.evaluate("async()=>{const a=window.__A;try{const x=await window.__fn({data:{action:'append',thread:a.thread,revision:a.revision,token:a.token,requestId:crypto.randomUUID(),message:'I could write tomorrow.',preferenceOn:false}});window.__A=x;return x.kind}catch(e){return 'err'}}")
  ok('O01-HTTP','A append over HTTP commits mock reply',r=='active'); base=row(tA); aAdm=len(adm(ids['A']))
  # strict forged authority through the real validator
  for extra in ({'owner':ids['B']},{'history':[]},{'grants':[]},{'derived':[]},{'ownerId':ids['A']}):
    r=await page.evaluate("async(x)=>{const a=window.__A;try{await window.__fn({data:{action:'read',thread:a.thread,revision:a.revision,token:a.token,...x}});return 'accepted'}catch(e){return 'denied'}}",extra)
    ok('O01-HTTP','forged field rejected by server validator: '+list(extra)[0],r=='denied')
  token_a=await page.evaluate("async()=>(await window.__sb.auth.getSession()).data.session.access_token")
  # B against A over HTTP
  await page.evaluate(SIGNIN,creds['B']); bAdm=len(adm(ids['B']))
  for action in ('read','save','discard','reopen','delete','cancel','preference','context','append','voice','excerpt','source'):
    extra={'append':{'requestId':None,'message':'I could write tomorrow.'},'voice':{'requestId':None,'message':'I could write tomorrow.'},
           'excerpt':{'selection':{'start':0,'end':5,'sourceRevision':'x','excerptHash':'a'*64}},'source':{'sourceKey':'day-01','sourceHash':'a'*64}}.get(action,{})
    r=await page.evaluate("async([action,x])=>{const a=window.__A;if('requestId' in x)x.requestId=crypto.randomUUID();try{await window.__fn({data:{action,thread:a.thread,revision:a.revision,token:a.token,preferenceOn:false,...x}});return 'accepted'}catch(e){return 'denied'}}",[action,extra])
    ok('O01-HTTP','B session vs A thread denied: '+action,r=='denied')
  ok('O01-HTTP','B spent nothing, A thread unchanged',len(adm(ids['B']))==bAdm and row(tA)==base and len(adm(ids['A']))==aAdm,f'A rev {base["revision"]}')
  # C valid but non-allowlisted
  await page.evaluate(SIGNIN,creds['C'])
  for d in ({'action':'create'},{'action':'list'}):
    r=await call(page,d); ok('O01-HTTP','C (valid session, not allowlisted) denied: '+d['action'],not r['ok'])
  ok('O01-HTTP','C has zero admissions',adm(ids['C'])==[])
  # absent bearer
  await page.evaluate("async()=>window.__sb.auth.signOut({scope:'local'})")
  statuses.clear(); r=await call(page,{'action':'list'})
  ok('O01-HTTP','absent bearer denied',not r['ok'] and statuses and statuses[-1][1] is None,f'status {statuses[-1][0] if statuses else "?"}')
  # revoked: A token revoked by global sign-out, then presented explicitly
  await page.evaluate(SIGNIN,creds['A']); await page.evaluate("async()=>window.__sb.auth.signOut({scope:'global'})")
  statuses.clear(); r=await call(page,{'action':'list'},'Bearer '+token_a)
  sent=statuses[-1][1] if statuses else None
  ok('O01-HTTP','revoked A token over HTTP denied',not r['ok'] and sent=='Bearer '+token_a,f'status {statuses[-1][0] if statuses else "?"}; revoked bearer actually sent')
  r=await page.evaluate("async()=>{const a=window.__A;try{await window.__fn({data:{action:'append',thread:a.thread,revision:a.revision,token:a.token,requestId:crypto.randomUUID(),message:'I could write tomorrow.',preferenceOn:false}});return 'accepted'}catch(e){return 'denied'}}")
  ok('O01-HTTP','signed-out append with valid A authority token denied; no spend',r=='denied' and len(adm(ids['A']))==aAdm and row(tA)==base)
  await page.evaluate("()=>{window.__A=null;window.__last=null}")

async def ui(page,w):
  st=page.locator('main > p[role=status]')
  await page.goto('http://localhost:8080/conversation-staging'); await page.wait_for_timeout(2500); await page.evaluate(JS_SETUP)
  assert await page.evaluate(SIGNIN,creds['A']); await page.wait_for_timeout(800)
  items=page.locator('ol li'); msg=page.get_by_label('Fictional message')
  await page.get_by_role('button',name='New conversation').click(); await expect(st).to_have_text('Unsaved changes',timeout=15000)
  await msg.fill('I could write tomorrow.'); await page.get_by_role('button',name='Send fictional message').click(); await expect(items).to_have_count(2,timeout=15000)
  await page.get_by_role('button',name='Save',exact=True).click(); await expect(st).to_have_text('Saved',timeout=15000)
  await msg.fill('I was tired, not angry.'); await page.get_by_role('button',name='Send fictional message').click(); await expect(items).to_have_count(4,timeout=15000); await expect(st).to_have_text('Unsaved changes')
  # Discard -> Cancel keeps; Confirm restores saved
  await page.get_by_role('button',name='Discard',exact=True).click(); await page.get_by_role('dialog').get_by_role('button',name='Cancel').click()
  await expect(items).to_have_count(4); await expect(st).to_have_text('Unsaved changes'); res.append(f'O05-UI {w} PASS: Discard dialog Cancel kept 4 events, unsaved')
  await page.get_by_role('button',name='Discard',exact=True).click(); await page.get_by_role('button',name='Confirm discard').click()
  await expect(items).to_have_count(2,timeout=15000); await expect(st).to_have_text('Saved'); res.append(f'O05-UI {w} PASS: Confirm discard restored saved 2 events')
  # switch (New) while unsaved: Cancel stays, then Save-and-continue failure is visible, recovery, then Discard and continue
  await msg.fill('I was tired, not angry.'); await page.get_by_role('button',name='Send fictional message').click(); await expect(items).to_have_count(4,timeout=15000)
  await page.get_by_role('button',name='New conversation').click(); dlg=page.get_by_role('dialog'); await expect(dlg).to_contain_text('Unsaved conversation')
  await dlg.get_by_role('button',name='Cancel').click(); await expect(dlg).to_have_count(0); await expect(items).to_have_count(4); res.append(f'O05-UI {w} PASS: switch dialog Cancel stayed with 4 events')
  await page.get_by_role('button',name='New conversation').click(); admit(ids['A'],False)
  try:
    await dlg.get_by_role('button',name='Save and continue').click()
    await expect(dlg.get_by_role('alert')).to_contain_text('Navigation did not continue',timeout=15000); res.append(f'O05-UI {w} PASS: Save-and-continue failure shown as alert in dialog; no navigation')
  finally: admit(ids['A'],True)
  await dlg.get_by_role('button',name='Cancel').click()
  await page.get_by_role('button',name='Leave unavailable conversation').click(); await expect(items).to_have_count(0)
  await page.get_by_role('button',name='Refresh saved list').click(); await page.get_by_role('button',name='Reopen conversation 1').click()
  await expect(items).to_have_count(2,timeout=15000); await expect(st).to_have_text('Saved'); res.append(f'O05-UI {w} PASS: recovery left unavailable state; reopen restored only saved 2 events')
  # reopen while unsaved: dialog -> Discard and continue -> reopened saved
  await msg.fill('I was tired, not angry.'); await page.get_by_role('button',name='Send fictional message').click(); await expect(items).to_have_count(4,timeout=15000)
  await page.get_by_role('button',name='Refresh saved list').click(); await page.get_by_role('button',name='Reopen conversation 1').click()
  await dlg.get_by_role('button',name='Discard and continue').click(); await expect(items).to_have_count(2,timeout=15000); await expect(st).to_have_text('Saved')
  res.append(f'O05-UI {w} PASS: reopen while unsaved -> Discard and continue -> saved 2 events')
  # New while unsaved: Save and continue -> new empty conversation
  await msg.fill('I was tired, not angry.'); await page.get_by_role('button',name='Send fictional message').click(); await expect(items).to_have_count(4,timeout=15000)
  await page.get_by_role('button',name='New conversation').click(); await dlg.get_by_role('button',name='Save and continue').click()
  await expect(items).to_have_count(0,timeout=15000); await expect(st).to_have_text('Unsaved changes'); res.append(f'O05-UI {w} PASS: New while unsaved -> Save and continue -> new empty conversation')
  await page.get_by_role('button',name='Refresh saved list').click(); await page.get_by_role('button',name='Reopen conversation 1').click()
  await page.wait_for_timeout(700)
  if await dlg.count(): await dlg.get_by_role('button',name='Discard and continue').click()  # the empty new conversation is itself unsaved
  await expect(items).to_have_count(4,timeout=15000); res.append(f'O05-UI {w} PASS: saved-and-continued conversation reopens with 4 events')
  # account switch without reload while a send is pending
  bBefore=len(adm(ids['B'])); await msg.fill('I could write tomorrow.'); await page.get_by_role('button',name='Send fictional message').click()
  await page.evaluate(SIGNIN,creds['B']); await page.wait_for_timeout(1500)
  body=await page.locator('main').inner_text()
  ok('O05-UI',f'{w} account switch A->B during pending send cleared A content without reload',await items.count()==0 and 'tired, not angry' not in body and 'I could write tomorrow' not in body and len(adm(ids['B']))==bBefore)
  over=await page.evaluate("document.documentElement.scrollWidth>window.innerWidth"); ok('O05-UI',f'{w} no horizontal overflow',not over)
  await page.screenshot(path=f'{OUT}/switched-{w}.png')
  await page.evaluate("async()=>window.__sb.auth.signOut({scope:'local'})")

async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(headless=True)
    for w in (390,1280):
      ctx=await b.new_context(viewport={'width':w,'height':1800}); page=await ctx.new_page(); errs=[]
      page.on('pageerror',lambda e:errs.append(str(e)[:120]))
      statuses=[]
      async def onresp(r):
        if '/_serverFn/' in r.url: statuses.append((r.status,r.request.headers.get('authorization')))
      page.on('response',onresp)
      await page.goto('http://localhost:8080/')
      await page.evaluate("v=>localStorage.setItem('bfa.v1',v)",json.dumps({'onboarded':True,'legalAcceptance':{'version':'2026-10-04.1','acceptedAt':'2026-10-26T02:30:00.000Z'},'showSpiritual':False}))
      await page.goto('http://localhost:8080/conversation-staging'); await page.wait_for_timeout(2500); await page.evaluate(JS_SETUP)
      if w==390: await http_boundary(page,statuses)
      try: await ui(page,w)
      except Exception as e: fails.append(f'O05-UI {w} FAIL: {str(e)[:200]}')
      ok('UI',f'{w} no page errors',not errs,str(errs[:2]))
      await ctx.close()
    await b.close()
  print('\n'.join(res+fails)); print(json.dumps({'passed':len(res),'failed':len(fails)}))
  sys.exit(1 if fails else 0)
asyncio.run(main())
