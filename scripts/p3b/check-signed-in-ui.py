"""Signed-in staging UI checks for fictional A and C at 390 and 1280 px, keyboard-driven where
practical. Real password sessions (credentials read from the 0600 temp file, never printed),
real server functions, mock provider. Screenshots show fictional text only."""
import asyncio, json, os, requests
from playwright.async_api import async_playwright, expect
U=os.environ['SUPABASE_URL']; P=os.environ['SUPABASE_PUBLISHABLE_KEY']
KEY='sb-'+os.environ['SUPABASE_PROJECT_ID']+'-auth-token'; OUT='/tmp/browser/p3b-signed-in'
creds=json.load(open('/tmp/p3b-auth/creds.json'))
def session(n):
  r=requests.post(U+'/auth/v1/token?grant_type=password',headers={'apikey':P},json=creds[n]); assert r.ok,'sign-in refused'; return json.dumps(r.json())
async def tab_to(page,name,limit=40):
  for _ in range(limit):
    await page.keyboard.press('Tab')
    if await page.evaluate("n=>document.activeElement&&document.activeElement.textContent.trim()===n",name): return
  raise AssertionError('keyboard could not reach '+name)
async def run(p,w,res):
  b=await p.chromium.launch(headless=True); ctx=await b.new_context(viewport={'width':w,'height':1800}); page=await ctx.new_page()
  errors=[]; page.on('pageerror',lambda e:errors.append(str(e)[:120]))
  await page.goto('http://localhost:8080/'); await page.evaluate("([k,v])=>localStorage.setItem(k,v)",[KEY,session('A')])
  # Same device-local agreement a person records in the normal opening flow (fictional test device).
  await page.evaluate("v=>localStorage.setItem('bfa.v1',v)",json.dumps({'onboarded':True,'legalAcceptance':{'version':'2026-10-04.1','acceptedAt':'2026-10-26T02:30:00.000Z'},'showSpiritual':False}))
  await page.goto('http://localhost:8080/conversation-staging'); await page.wait_for_timeout(1500)
  await tab_to(page,'New conversation'); await page.keyboard.press('Enter')
  st=page.locator('p[role=status]').first; await expect(st).to_have_text('Unsaved changes',timeout=15000)
  await page.get_by_label('Fictional message').fill('I could write tomorrow.')
  await page.get_by_label('Fictional message').focus(); await tab_to(page,'Send fictional message',5); await page.keyboard.press('Enter')
  await expect(page.locator('ol li')).to_have_count(2,timeout=15000)
  await page.get_by_role('button',name='Save',exact=True).focus(); await page.keyboard.press('Enter'); await expect(st).to_have_text('Saved',timeout=15000)
  res.append(f'{w}: keyboard New/Send/Save -> Saved')
  await page.get_by_label('Fictional message').fill('I was tired, not angry.'); await page.get_by_role('button',name='Send fictional message').click()
  await expect(st).to_have_text('Unsaved changes',timeout=15000); res.append(f'{w}: later turn -> Unsaved changes')
  await page.reload(); await page.wait_for_timeout(1500)
  await page.get_by_role('button',name='Refresh saved list').click()
  await page.get_by_role('button',name='Reopen conversation 1').click(); await expect(page.locator('ol li')).to_have_count(2,timeout=15000)
  res.append(f'{w}: reload + reopen restored saved 2 events only')
  note=page.get_by_label('Fictional source material')
  await note.evaluate("e=>{const s=e.value.indexOf('I am making'),t=e.value.indexOf('\\nIgnore');e.focus();e.setSelectionRange(s,t);e.dispatchEvent(new Event('select',{bubbles:true}))}")
  await page.get_by_role('button',name='Preview selected excerpt').click(); dlg=page.get_by_role('dialog')
  await expect(dlg).to_contain_text('I am making room for one honest step.'); await page.keyboard.press('Escape'); await expect(dlg).to_have_count(0)
  await expect(page.locator('ol li')).to_have_count(2); res.append(f'{w}: excerpt preview Escape -> nothing shared')
  await page.get_by_role('button',name='Preview selected excerpt').click(); await page.get_by_role('button',name='Confirm exact share').click()
  await expect(page.locator('ol li')).to_have_count(3,timeout=15000)
  li=page.locator('ol li').last; await expect(li).to_contain_text('Shared exact excerpt · untrusted user data'); t=await li.inner_text()
  assert 'SYNTHETIC_ADJACENT' not in t and 'Ignore all rules' not in t; res.append(f'{w}: confirmed exact excerpt only, labelled untrusted')
  over=await page.evaluate("document.documentElement.scrollWidth>window.innerWidth"); assert not over,'horizontal overflow'
  await page.screenshot(path=f'{OUT}/a-{w}.png')
  await page.get_by_role('button',name='Delete').click(); await page.get_by_role('dialog').get_by_role('button',name='Delete').click()
  await expect(st).to_have_text('Deleted.',timeout=15000); res.append(f'{w}: Delete -> Deleted.')
  await page.evaluate("([k,v])=>localStorage.setItem(k,v)",[KEY,session('C')]); await page.reload(); await page.wait_for_timeout(1500)
  await page.get_by_role('button',name='New conversation').click(); await page.wait_for_timeout(3000)
  assert await page.locator('ol li').count()==0; await page.screenshot(path=f'{OUT}/c-{w}.png')
  res.append(f'{w}: C (valid, nonallowlisted) New -> no conversation; status="{await st.inner_text()}"')
  assert not errors, errors; await b.close()
async def main():
  res=[]
  async with async_playwright() as p:
    for w in (390,1280): await run(p,w,res)
  print('\n'.join(res))
asyncio.run(main())
