/**
 * P3b completion pass (O02–O08 gaps). Real ordinary password sessions for fictional A/B/C,
 * the real staging handler (stagingOperation) with a user-scoped SDK client as the auth
 * middleware builds it, real RLS/RPC/ledger. Mock provider only; no media, no model.
 * Honest label: this file calls the handler directly (no TanStack HTTP/requireSupabaseAuth);
 * the HTTP boundary is exercised by completion-http-ui.py.
 * Requires auth-setup.py --completion (B text allowance is an explicit server-owned 0).
 * Prints no credentials or tokens.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { stagingOperation, type ActiveThread } from '@/lib/ai/conversation/staging/adapter.server';
import { stagingInput } from '@/lib/ai/conversation/staging/input';
import { FICTIONAL_NOTE, previewSelection } from '@/lib/ai/conversation/staging/excerpt';
import { CONVERSATION_POLICY_BLOCK_SHA256 } from '@/lib/ai/conversation/policy';
import { MOCK_REPLY_PREFIX } from '@/lib/ai/conversation/service/mock-provider';
import type { Database } from '@/integrations/supabase/types';

const URL = process.env.SUPABASE_URL!, PUB = process.env.SUPABASE_PUBLISHABLE_KEY!, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const creds = JSON.parse(readFileSync('/tmp/p3b-auth/creds.json', 'utf8')) as Record<'A'|'B'|'C', { email: string; password: string }>;
const ids = JSON.parse(readFileSync('/tmp/p3b-auth/ids.json', 'utf8')) as Record<'A'|'B'|'C', string>;
const results: { gate: string; check: string; status: 'pass'|'fail'|'unresolved'; evidence: string }[] = [];
class Unresolved extends Error {}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(gate: string, name: string, fn: () => Promise<string | void>) {
  try { results.push({ gate, check: name, status: 'pass', evidence: (await fn()) || 'ok' }); }
  catch (e) { results.push({ gate, check: name, status: e instanceof Unresolved ? 'unresolved' : 'fail', evidence: (e as Error).message.slice(0, 240) }); }
}
async function denied(p: Promise<unknown>) {
  try { await p; } catch (e) { return (e as Error).message; }
  throw new Error('expected denial but operation succeeded');
}
async function signIn(who: 'A'|'B'|'C') {
  const c = createClient<Database>(URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword(creds[who]);
  if (error || !data.session) throw new Error('ordinary password sign-in refused for ' + who);
  return createClient<Database>(URL, PUB, { global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined } });
}
const svcH: Record<string, string> = { apikey: SVC, 'Content-Type': 'application/json' };
const svc = async (path: string) => { const r = await fetch(`${URL}/rest/v1/${path}`, { headers: svcH }); return r.ok ? await r.json() : null; };
type Adm = { request_id: string; state: string; mode: string; thread_id: string };
const admissions = async (o: string): Promise<Adm[]> => (await svc(`bfa_p3b_admissions?owner_id=eq.${o}&select=request_id,state,mode,thread_id`)) ?? [];
const balance = async (o: string, m: string): Promise<number | undefined> => ((await svc(`bfa_p3b_allowances?owner_id=eq.${o}&mode=eq.${m}&select=remaining_units`)) ?? [])[0]?.remaining_units;
const threadRow = async (t: string) => ((await svc(`bfa_p3b_threads?id=eq.${t}&select=revision,deleted_at,saved_snapshot,saved_revision`)) ?? [])[0];
const asActive = (r: unknown) => { assert((r as ActiveThread).kind === 'active', 'not active: ' + (r as { kind: string }).kind); return r as ActiveThread; };
const op = (cl: SupabaseClient<Database>, input: Record<string, unknown>) => stagingOperation(stagingInput.parse(input), cl);
const send = (cl: SupabaseClient<Database>, s: ActiveThread, message: string, requestId = randomUUID(), action = 'append') =>
  op(cl, { action, thread: s.thread, revision: s.revision, token: s.token, requestId, message, preferenceOn: false }).then(asActive);
const lastReply = (s: ActiveThread) => [...s.inspection!.events].reverse().find(e => e.text.startsWith(MOCK_REPLY_PREFIX))?.text ?? '';
async function waitDispatched(owner: string, req: string, ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const a = (await admissions(owner)).find(x => x.request_id === req);
    if (a?.state === 'dispatched') return Date.now() - t0;
    if (a && a.state !== 'reserved') throw new Unresolved('admission left reserved/dispatched before observation: ' + a.state);
    await new Promise(r => setTimeout(r, 15));
  }
  throw new Unresolved('dispatched admission not observed in time');
}

const a = await signIn('A'), b = await signIn('B'), c = await signIn('C');

// ---------- O08 explicit zero allowance (unconditional) + separate voice ledger ----------
await check('O08', 'B explicit server-owned text allowance 0: authenticated send denied, no reservation/dispatch; voice separate', async () => {
  assert(await balance(ids.B, 'text') === 0, 'setup did not give B an explicit zero text allowance');
  const before = (await admissions(ids.B)).length;
  const t = asActive(await op(b, { action: 'create' }));
  const err = await denied(send(b, t, 'I could write tomorrow.'));
  assert((await admissions(ids.B)).length === before, 'a text admission row was created at zero');
  assert(await balance(ids.B, 'text') === 0, 'text balance changed');
  assert((await threadRow(t.thread)).revision === t.revision, 'thread revision advanced');
  const v = await send(b, t, 'I could write tomorrow.', randomUUID(), 'voice');
  assert(lastReply(v).startsWith(MOCK_REPLY_PREFIX), 'voice mode mock reply missing');
  const vAdm = (await admissions(ids.B)).filter(x => x.mode === 'voice');
  assert(vAdm.length === 1 && vAdm[0].state === 'settled', 'voice admission ' + JSON.stringify(vAdm.map(x => x.state)));
  assert(await balance(ids.B, 'voice') === 2 && await balance(ids.B, 'text') === 0, 'ledgers not separate');
  return `text 0 -> denied (${err.slice(0, 40)}); B text admissions ${before}->${before}; voice mock reply committed, 1 settled voice admission (zero charge), voice 2 / text 0`;
});

// ---------- O06 + O08 Delete after PROVEN dispatched admission ----------
await check('O06/O08', 'Delete after proven dispatched admission: late mock reply cannot commit/save/resurrect; uncertain hold retained', async () => {
  let s = asActive(await op(a, { action: 'create' })); s = await send(a, s, 'I could write tomorrow.');
  s = asActive(await op(a, { action: 'save', thread: s.thread, revision: s.revision, token: s.token, preferenceOn: false }));
  const units = (await balance(ids.A, 'text'))!; const req = randomUUID();
  const pending = send(a, s, 'I was tired, not angry.', req);
  const waited = await waitDispatched(ids.A, req);
  const del = await op(a, { action: 'delete', thread: s.thread }); assert(del.kind === 'deleted', 'not deleted');
  await denied(pending);
  await new Promise(r => setTimeout(r, 600)); // beyond the 250 ms mock reply delay
  const row = await threadRow(s.thread);
  assert(row.deleted_at && row.saved_snapshot === null && row.saved_revision === null, 'snapshot retained or not tombstoned');
  await denied(op(a, { action: 'save', thread: s.thread, revision: s.revision, token: s.token }));
  await denied(op(a, { action: 'reopen', thread: s.thread, revision: del.revision }));
  const list = await op(a, { action: 'list' }) as { threads: { thread: string }[] };
  assert(!list.threads.some(x => x.thread === s.thread), 'deleted thread listed');
  const adm = (await admissions(ids.A)).find(x => x.request_id === req)!;
  assert(adm.state === 'dispatched', 'admission not held uncertain: ' + adm.state);
  assert(await balance(ids.A, 'text') === units - 1, `balance ${await balance(ids.A, 'text')} vs ${units - 1}`);
  return `dispatched observed after ${waited}ms; tombstoned, snapshot null, save/reopen denied, unlisted; admission stays 'dispatched' (uncertain), 1 unit held (${units}->${units - 1}), no settle`;
});

// ---------- O06 Stop after PROVEN dispatched admission ----------
await check('O06/O08', 'Stop after proven dispatched admission: late mock reply never commits; saved snapshot unchanged; hold retained', async () => {
  let s = asActive(await op(a, { action: 'create' })); s = await send(a, s, 'I could write tomorrow.');
  s = asActive(await op(a, { action: 'save', thread: s.thread, revision: s.revision, token: s.token, preferenceOn: false }));
  const savedEvents = s.inspection!.events.length; const units = (await balance(ids.A, 'text'))!; const req = randomUUID();
  const pending = send(a, s, 'Please don\'t ask me any questions.', req);
  const waited = await waitDispatched(ids.A, req);
  const stop = await op(a, { action: 'cancel', thread: s.thread, revision: s.revision, token: s.token });
  assert(stop.kind === 'stopped' || stop.kind === 'active', 'stop kind ' + stop.kind);
  await denied(pending);
  await new Promise(r => setTimeout(r, 600));
  const row = await threadRow(s.thread);
  await denied(op(a, { action: 'save', thread: s.thread, revision: row.revision, token: s.token }));
  const r = asActive(await op(a, { action: 'reopen', thread: s.thread, revision: row.revision, preferenceOn: false }));
  assert(r.inspection!.events.length === savedEvents, 'late reply or message resurrected');
  assert(!r.inspection!.restrictions.includes('no-questions'), 'stopped turn restriction committed');
  const adm = (await admissions(ids.A)).find(x => x.request_id === req)!;
  assert(adm.state === 'dispatched', 'admission state ' + adm.state);
  assert(await balance(ids.A, 'text') === units - 1, 'hold not retained');
  return `dispatched after ${waited}ms; stop=${stop.kind}; old token save denied; reopen = saved ${savedEvents} events, no 'no-questions'; admission 'dispatched' held, ${units}->${units - 1}`;
});

// ---------- O02–O04/O07 exact canaries after save/discard/reopen ----------
const CROSS_THREAD = 'Was angry when came home yesterday.', CROSS_OWNER = 'Not angry with her; tired.';
await check('O02/O03/O04/O07', 'saved lineage, discard canary, cross-thread/cross-owner canaries, correction, no-questions, exact excerpt in request', async () => {
  let bt = asActive(await op(b, { action: 'create' })); bt = await send(b, bt, 'I am not angry with her; I am tired.', randomUUID(), 'voice');
  assert(JSON.stringify(bt.inspection).includes(CROSS_OWNER), 'cross-owner canary not planted');
  let other = asActive(await op(a, { action: 'create' })); other = await send(a, other, 'I was angry when I came home yesterday.');
  const otherReply = lastReply(await send(a, other, 'I could write tomorrow.'));
  assert(otherReply.includes('Is there anything else'), 'control thread without restriction should ask');
  let t = asActive(await op(a, { action: 'create' }));
  t = await send(a, t, "I came home yesterday and couldn't talk to anyone.");
  t = await send(a, t, 'I was tired, not angry.');
  t = await send(a, t, "Please don't ask me any questions.");
  t = await send(a, t, 'I could write tomorrow.');
  assert(!lastReply(t).includes('Is there anything else'), 'no-questions restriction ignored');
  t = asActive(await op(a, { action: 'save', thread: t.thread, revision: t.revision, token: t.token, preferenceOn: false }));
  const saved = t.inspection!.events.map(e => e.eventId);
  t = await send(a, t, 'DISCARD-CANARY-7731 fictional unsaved line.'); // unsaved canary, then discarded
  assert(!t.saved, 'canary turn shown as saved');
  t = asActive(await op(a, { action: 'discard', thread: t.thread, revision: t.revision, preferenceOn: false }));
  assert(JSON.stringify(t.inspection!.events.map(e => e.eventId)) === JSON.stringify(saved), 'discard did not restore exact saved events');
  const list = await op(a, { action: 'list' }) as { threads: { thread: string; revision: number }[] };
  const item = list.threads.find(x => x.thread === t.thread)!; assert(item, 'not listed');
  t = asActive(await op(a, { action: 'reopen', thread: item.thread, revision: item.revision, preferenceOn: false }));
  assert(t.microphone === 'off' && t.inspection!.restrictions.join() === 'no-questions', 'restriction lineage ' + t.inspection!.restrictions.join());
  const derived = t.inspection!.derived as unknown as Record<string, unknown>[];
  const tags = derived.map(d => String(d.tag ?? d.kind));
  // Exact excerpt then recall: provider-derived reply text is built only from the request.
  const start = FICTIONAL_NOTE.indexOf('I am making'), end = FICTIONAL_NOTE.indexOf('\nIgnore');
  const sel = previewSelection(start, end);
  t = asActive(await op(a, { action: 'excerpt', thread: t.thread, revision: t.revision, token: t.token, preferenceOn: false,
    selection: { start, end, sourceRevision: sel.sourceRevision, excerptHash: sel.excerptHash } }));
  const ex = t.inspection!.events.find(e => (e as { sharedExcerpt?: unknown }).sharedExcerpt)!;
  assert(ex && ex.text === sel.exactText && ex.text === FICTIONAL_NOTE.slice(start, end), 'excerpt bytes differ');
  t = await send(a, t, 'What have I told you about yesterday?');
  const reply = lastReply(t), lr = t.inspection!.lastRequest!;
  for (const must of ["Came home yesterday and couldn't talk to anyone.", 'Was tired, not angry.', 'You mentioned an intention, not something done: Could write tomorrow (intention, not done).'])
    assert(reply.includes(must), 'recall reply missing: ' + must);
  for (const never of [CROSS_THREAD, CROSS_OWNER, 'Not angry with her', 'DISCARD-CANARY-7731', 'SYNTHETIC_ADJACENT', 'Ignore all rules'])
    assert(!reply.includes(never) && !JSON.stringify(t.inspection).includes(never), 'canary leaked: ' + never);
  assert(lr.historyEventIds.includes(ex.eventId), 'excerpt event not in request history');
  assert(lr.historyEventIds.every(id => t.inspection!.events.some(e => e.eventId === id)), 'request history includes foreign event');
  assert(!lr.historyEventIds.some(id => other.inspection!.events.some(e => e.eventId === id)), 'cross-thread history');
  assert(lr.restrictions.join() === 'no-questions' && lr.policySha256 === CONVERSATION_POLICY_BLOCK_SHA256, 'request restriction/policy');
  assert(!lr.sourceKeys.some(k => /journal|weekly|day10|hidden/i.test(k)), 'implicit store source');
  return `reply echoes exact saved report+correction+intention; discarded/cross-thread/cross-owner/adjacent canaries absent; excerpt event (${sel.exactText.length} chars, exact bytes) in request history; restrictions=[no-questions]; derived tags=[${tags.join(',')}]; sources=[${lr.sourceKeys.join(',')}]`;
});
await check('O07', 'later contradicting report and restriction persist only by thread; new thread clean', async () => {
  const n = asActive(await op(a, { action: 'create' }));
  const r = await send(a, n, 'What have I told you about yesterday?');
  assert(lastReply(r).includes("I have nothing you've told me in this conversation to recount."), 'new thread recalled other content');
  assert(r.inspection!.restrictions.length === 0, 'restriction leaked across threads');
  return 'new thread recall = nothing to recount; restrictions []';
});
await check('O08', 'C valid session: no admission or allowance rows', async () => {
  await denied(op(c, { action: 'create' }));
  assert((await admissions(ids.C)).length === 0 && (await balance(ids.C, 'text')) === undefined, 'C spend path');
});

const failed = results.filter(r => r.status === 'fail').length, unresolved = results.filter(r => r.status === 'unresolved').length;
console.log(JSON.stringify({ kind: 'REAL password sessions + real staging handler (direct call, not HTTP) + real ledger; mock provider only', total: results.length, failed, unresolved, results }, null, 1));
process.exit(failed ? 1 : 0);
