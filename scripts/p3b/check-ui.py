"""Real component with local async doubles; NOT authenticated O01–O08 acceptance.
Run: python3 scripts/p3b/check-ui.py
Output and the test-only bundle stay under /tmp/browser/p3b-async-ui.
"""
import asyncio
import json
import subprocess
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path('/tmp/browser/p3b-async-ui')
OUT.mkdir(parents=True, exist_ok=True)
subprocess.run(['node', 'scripts/p3b/ui-harness.cjs', str(OUT / 'harness.js')], check=True)
BUNDLE = (OUT / 'harness.js').read_text()

def active(thread='A', revision=0, saved=False, preference=False):
    return dict(kind='active', thread=thread, revision=revision, token='synthetic-local-state', saved=saved, microphone='off',
                inspection=dict(preferenceOn=preference, events=[], restrictions=[], derived=[], lastRequest=None))

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={'width':1280,'height':1800})
        page = await context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        await page.route('**/*', lambda route: route.fulfill(status=200, content_type='text/html', body='<div id="root"></div><script>'+BUNDLE+'</script>') if route.request.url == 'http://localhost:8080/__p3b_local_ui_test' else route.abort())

        async def reset():
            await page.goto('http://localhost:8080/__p3b_local_ui_test')
            await page.get_by_role('button', name='New conversation', exact=True).wait_for()
        async def pending(action):
            await page.wait_for_function('(a) => window.p3bHarness.pending()[0]?.action === a', action)
        async def resolve(value):
            await page.evaluate('(v) => window.p3bHarness.resolve(v)', value)
        async def new():
            await reset()
            await page.get_by_role('button', name='New conversation', exact=True).click()
            await pending('create'); await resolve(active())
            await page.get_by_label('Fictional message', exact=True).fill('KEEP_DRAFT')
        async def calls(): return await page.evaluate('window.p3bHarness.calls')
        dialog = page.get_by_role('dialog')

        # Cancel/Escape preserve draft and prevent captured New after a confirmed save.
        for cancel in ['Cancel', 'Escape']:
            await new()
            await page.get_by_role('button', name='New conversation', exact=True).click()
            await dialog.get_by_role('button', name='Save and continue', exact=True).click()
            await pending('save')
            if cancel == 'Escape': await page.keyboard.press('Escape')
            else: await dialog.get_by_role('button', name='Cancel', exact=True).click()
            await resolve(active(revision=1, saved=True))
            await page.wait_for_function('!window.p3bHarness.pending().length')
            assert [c['action'] for c in await calls()] == ['create','save']
            assert await page.get_by_label('Fictional message', exact=True).input_value() == 'KEEP_DRAFT'
        print('PASS Cancel and Escape invalidate captured navigation (2)')

        # Same-thread mutation must supply its returned revision; other thread stays captured.
        for action in ['save','discard']:
            for target in ['A','B']:
                await new()
                await page.get_by_role('button', name='Refresh saved list', exact=True).click()
                await pending('list'); await resolve(dict(kind='list', threads=[dict(thread=target,revision=0 if target=='A' else 7,savedAt='2026-10-25T00:00:00Z')]))
                await page.get_by_role('button', name='Send fictional message', exact=True).click()
                await pending('append'); await resolve(active(revision=1))
                await page.get_by_label('Fictional message', exact=True).fill('DRAFT_BEFORE_SWITCH')
                await page.get_by_role('button', name='Reopen conversation 1', exact=True).click()
                await dialog.get_by_role('button', name=('Save' if action=='save' else 'Discard')+' and continue', exact=True).click()
                await pending(action); await resolve(active(revision=2, saved=True))
                await pending('reopen')
                request = (await calls())[-1]
                assert request['thread']==target and request['revision']==(2 if target=='A' else 7)
                await resolve(active(thread=target,revision=3 if target=='A' else 8,saved=True))
                await page.wait_for_function('!window.p3bHarness.pending().length')
        print('PASS Save/Discard same-thread and other-thread confirmed revisions (4)')

        await new()
        await page.get_by_role('button', name='New conversation', exact=True).click()
        await dialog.get_by_role('button', name='Save and continue', exact=True).click()
        await pending('save'); await page.evaluate('window.p3bHarness.reject()')
        await dialog.get_by_role('alert').wait_for()
        assert await dialog.get_by_role('button', name='Cancel', exact=True).is_enabled()
        assert [c['action'] for c in await calls()]==['create','save']
        await page.screenshot(path=str(OUT/'dialog-failure.png'))
        await dialog.get_by_role('button', name='Cancel', exact=True).click()
        assert await page.get_by_label('Fictional message', exact=True).input_value()=='KEEP_DRAFT'
        print('PASS Failed save stays visible in dialog without retry/navigation')

        # Latest separate setting reconciles initial New and reopen before Send.
        for opening in ['create','reopen']:
            await reset()
            if opening=='reopen':
                await page.get_by_role('button', name='Refresh saved list', exact=True).click()
                await pending('list'); await resolve(dict(kind='list',threads=[dict(thread='A',revision=4,savedAt='2026-10-25T00:00:00Z')]))
                await page.get_by_role('button',name='Reopen conversation 1',exact=True).click()
            else: await page.get_by_role('button',name='New conversation',exact=True).click()
            await pending(opening)
            await page.get_by_role('switch',name='Christian content',exact=True).click()
            await resolve(active(revision=5, saved=opening=='reopen'))
            await pending('preference')
            assert (await calls())[-1]['preferenceOn'] is True
            await resolve(active(revision=6, preference=True))
            await page.get_by_label('Fictional message',exact=True).fill('Fictional draft')
            assert await page.get_by_role('button',name='Send fictional message',exact=True).is_enabled()
        print('PASS New/reopen initial preference reconciliation (2)')

        # A second toggle during reconciliation does not loop or permit stale Send.
        await reset(); await page.get_by_role('button',name='New conversation',exact=True).click()
        await pending('create'); await page.get_by_role('switch',name='Christian content',exact=True).click()
        await resolve(active()); await pending('preference')
        await page.get_by_role('switch',name='Christian content',exact=True).click()
        await resolve(active(revision=1,preference=True))
        await page.get_by_role('alert').wait_for()
        await page.get_by_label('Fictional message',exact=True).fill('Not stale')
        assert await page.get_by_role('button',name='Send fictional message',exact=True).is_disabled()
        assert [c['action'] for c in await calls()]==['create','preference']
        await page.get_by_role('button',name='Confirm current Christian content setting',exact=True).click()
        await pending('preference'); assert (await calls())[-1]['preferenceOn'] is False
        await resolve(active(revision=2,preference=False))
        assert await page.get_by_role('button',name='Send fictional message',exact=True).is_enabled()
        print('PASS Rapid preference change requires deliberate confirmation, no loop')

        await reset(); await page.get_by_role('button',name='New conversation',exact=True).click()
        await pending('create'); await page.get_by_role('switch',name='Christian content',exact=True).click()
        await resolve(active()); await pending('preference'); await page.evaluate('window.p3bHarness.reject()')
        await page.get_by_role('alert').wait_for()
        await page.get_by_label('Fictional message',exact=True).fill('Not sent')
        assert await page.get_by_role('button',name='Send fictional message',exact=True).is_disabled()
        await page.screenshot(path=str(OUT/'preference-failure.png'))
        assert await page.get_by_role('button',name='Confirm current Christian content setting',exact=True).is_enabled()
        print('PASS Preference failure visible with explicit retry, Send blocked')

        # Clear/account-change fence both navigation intent and initial reconciliation.
        for transition in ['clear','auth']:
            for stage in ['save','preference']:
                await new()
                if stage=='save':
                    await page.get_by_role('button',name='New conversation',exact=True).click()
                    await dialog.get_by_role('button',name='Save and continue',exact=True).click()
                else:
                    await page.get_by_role('switch',name='Christian content',exact=True).click()
                await pending(stage)
                await page.evaluate('window.p3bHarness.clear()' if transition=='clear' else 'window.p3bHarness.auth("fictional-ui-b")')
                await resolve(active(revision=9, saved=True, preference=stage=='preference'))
                await page.wait_for_function('!window.p3bHarness.pending().length')
                assert await page.get_by_label('Fictional message',exact=True).count()==0
                assert await dialog.count()==0
                assert await page.get_by_role('button',name='New conversation',exact=True).is_enabled()
                assert len(await calls())==2
        print('PASS Clear/account changes suppress pending save/preference responses (4)')
        assert not errors, errors
        print('16 deterministic component scenarios passed; real Auth acceptance BLOCKED; zero network transport')
        await browser.close()

asyncio.run(main())