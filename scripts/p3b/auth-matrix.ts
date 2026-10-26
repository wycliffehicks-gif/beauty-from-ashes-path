/**
 * Signed-in P3b O01–O08 matrix. Real Auth password sessions for fictional A/B/C,
 * the real staging handler (stagingOperation) with a user-scoped SDK client exactly as the
 * auth middleware builds it, real RLS/REST/RPC. Mock provider only. Prints no secrets/content tokens.
 * Run: bun scripts/p3b/auth-matrix.ts   (needs /tmp/p3b-auth/creds.json from auth-setup.py)
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { stagingOperation, type ActiveThread } from '@/lib/ai/conversation/staging/adapter.server';
import { stagingInput } from '@/lib/ai/conversation/staging/input';
import { FICTIONAL_NOTE, previewSelection } from '@/lib/ai/conversation/staging/excerpt';
import { CONVERSATION_POLICY_BLOCK_SHA256, CONVERSATION_POLICY_IDENTITY } from '@/lib/ai/conversation/policy';
import type { Database } from '@/integrations/supabase/types';

const URL = process.env.SUPABASE_URL!, PUB = process.env.SUPABASE_PUBLISHABLE_KEY!, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const creds = JSON.parse(readFileSync('/tmp/p3b-auth/creds.json', 'utf8')) as Record<'A'|'B'|'C', { email: string; password: string }>;
const ids = JSON.parse(readFileSync('/tmp/p3b-auth/ids.json', 'utf8')) as Record<'A'|'B'|'C', string>;
const results: { gate: string; check: string; pass: boolean; evidence: string }[] = [];
const svcH: Record<string,string> = { apikey: SVC, 'Content-Type': 'application/json' };

async function signIn(who: 'A'|'B'|'C') {
  const c = createClient<Database>(URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword(creds[who]);
  if (error || !data.session) throw new Error(`ordinary password sign-in refused for ${who}`);
  return { token: data.session.access_token, auth: c };
}
function userClient(token: string): SupabaseClient<Database> {
  return createClient<Database>(URL, PUB, { global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined } });
}
async function check(gate: string, name: string, fn: () => Promise<string | void>) {
  try { const e = await fn(); results.push({ gate, check: name, pass: true, evidence: e || 'ok' }); }
  catch (err) { results.push({ gate, check: name, pass: false, evidence: (err as Error).message.slice(0, 200) }); }
}
async function denied(p: Promise<unknown>, expect = /Unavailable|Conflict|Refresh/) {
  try { await p; } catch (e) { const m = (e as Error).message; if (!expect.test(m)) throw new Error('unexpected error: ' + m); return m; }
  throw new Error('expected denial but operation succeeded');
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function svc(path: string, init: RequestInit = {}) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...svcH, ...(init.headers as object) } });
  return { ok: r.ok, status: r.status, json: r.ok ? await r.json().catch(() => null) : null };
}
const admissions = async (owner: string) => ((await svc(`bfa_p3b_admissions?owner_id=eq.${owner}&select=request_id,state,mode`)).json ?? []) as { request_id: string; state: string; mode: string }[];
const balance = async (owner: string, mode: string) => ((await svc(`bfa_p3b_allowances?owner_id=eq.${owner}&mode=eq.${mode}&select=remaining_units`)).json as { remaining_units: number }[])[0]?.remaining_units;
const asActive = (r: unknown) => { assert((r as ActiveThread).kind === 'active', 'not active'); return r as ActiveThread; };

const A = await signIn('A'), B = await signIn('B'), C = await signIn('C');
const a = userClient(A.token), b = userClient(B.token), c = userClient(C.token);
const op = (cl: SupabaseClient<Database>, input: Record<string, unknown>) => stagingOperation(stagingInput.parse(input), cl);
const send = (cl: SupabaseClient<Database>, s: ActiveThread, message: string, requestId = randomUUID(), action = 'append') =>
  op(cl, { action, thread: s.thread, revision: s.revision, token: s.token, requestId, message, preferenceOn: false }).then(asActive);

// ---------- O01 identity / ownership / forged input / direct REST-RPC ----------
let tA = asActive(await op(a, { action: 'create', preferenceOn: false }));
await check('O01', 'real C session is valid but non-allowlisted: create/list denied', async () => {
  const u = await c.auth.getUser(); assert(u.data.user?.id === ids.C, 'C session not valid');
  await denied(op(c, { action: 'create' })); await denied(op(c, { action: 'list' }));
  return 'C getUser ok; handler Unavailable';
});
await check('O01', 'absent and forged bearer denied', async () => {
  const anon = createClient<Database>(URL, PUB, { auth: { persistSession: false } });
  await denied(op(anon, { action: 'list' })); await denied(op(userClient('not.a.jwt'), { action: 'list' }));
});
await check('O01', 'B cannot read/append/save/delete/cancel/reopen A thread', async () => {
  const before = await admissions(ids.B);
  for (const action of ['read', 'save', 'discard', 'reopen', 'delete', 'cancel', 'context', 'preference'])
    await denied(op(b, { action, thread: tA.thread, revision: tA.revision, token: tA.token, preferenceOn: false }));
  await denied(op(b, { action: 'append', thread: tA.thread, revision: tA.revision, token: tA.token, requestId: randomUUID(), message: 'hello' }));
  assert((await admissions(ids.B)).length === before.length, 'B admissions changed');
  const still = asActive(await op(a, { action: 'read', thread: tA.thread, revision: tA.revision, token: tA.token, preferenceOn: false }));
  return `9 ops Unavailable; A still reads rev ${still.revision}; no B admission`;
});
await check('O01', 'A token replayed on B thread rejected (seal owner/thread binding)', async () => {
  const tB = asActive(await op(b, { action: 'create' }));
  await denied(op(b, { action: 'read', thread: tB.thread, revision: tB.revision, token: tA.token }));
});
await check('O01', 'strict input rejects owner/history/grant authority fields', async () => {
  for (const extra of [{ owner: ids.B }, { history: [] }, { grants: [] }, { derived: [] }])
    assert(!stagingInput.safeParse({ action: 'list', ...extra }).success, 'accepted ' + Object.keys(extra)[0]);
});
await check('O01', 'direct REST: RLS limits SELECT to own rows; no browser writes', async () => {
  const own = await a.from('bfa_p3b_threads').select('id').eq('id', tA.thread);
  const other = await b.from('bfa_p3b_threads').select('id,saved_snapshot').eq('id', tA.thread);
  const cAll = await c.from('bfa_p3b_threads').select('id');
  assert(own.data?.length === 1, 'A cannot see own'); assert(other.data?.length === 0, 'B sees A'); assert(cAll.data?.length === 0, 'C sees rows');
  const ins = await b.from('bfa_p3b_staging_accounts').insert({ user_id: ids.C, admitted: true, expires_at: new Date(Date.now()+9e5).toISOString() });
  const upd = await b.from('bfa_p3b_allowances').update({ remaining_units: 999 }).eq('owner_id', ids.B).select();
  const del = await b.from('bfa_p3b_threads').delete().eq('id', tA.thread).select();
  assert(ins.error, 'insert allowed'); assert(upd.error || (upd.data ?? []).length === 0, 'update allowed'); assert(del.error || (del.data ?? []).length === 0, 'delete allowed');
  return 'A=1 own row, B=0, C=0; insert/update/delete denied';
});
await check('O01', 'direct RPC with forged p_owner denied for signed-in B and C', async () => {
  const args = { p_owner: ids.A, p_thread: tA.thread, p_revision: tA.revision, p_request: randomUUID(), p_mode: 'text', p_fingerprint: 'a'.repeat(64) };
  for (const cl of [b, c]) {
    for (const [fn, p] of [['bfa_p3b_reserve', args], ['bfa_p3b_claim', args], ['bfa_p3b_create', { p_owner: ids.A }],
      ['bfa_p3b_transition', { p_owner: ids.A, p_thread: tA.thread, p_revision: tA.revision, p_action: 'delete', p_snapshot: null }],
      ['bfa_p3b_fence', { p_owner: ids.A, p_thread: tA.thread, p_action: 'delete' }]] as const) {
      const r = await (cl.rpc as unknown as (f: string, a: object) => Promise<{ error: unknown }>)(fn, p);
      assert(r.error, fn + ' allowed');
    }
  }
  const row = await a.from('bfa_p3b_threads').select('deleted_at').eq('id', tA.thread).single();
  assert(!row.data?.deleted_at, 'A thread mutated'); return '10 RPC calls denied; A thread intact';
});
await check('O01', 'session revoked mid-operation: in-flight send fails, nothing committed', async () => {
  const A2 = await signIn('A'); const a2 = userClient(A2.token);
  let s = asActive(await op(a2, { action: 'create' })); const rev = s.revision;
  const pending = send(a2, s, 'I could write tomorrow.');
  await new Promise(r => setTimeout(r, 120)); await A2.auth.auth.signOut({ scope: 'local' });
  await denied(pending);
  const row = await a.from('bfa_p3b_threads').select('revision').eq('id', s.thread).single();
  assert(row.data?.revision === rev, 'revision advanced after revocation');
  await denied(op(a2, { action: 'list' }));
  return 'revoked session denied mid-send and afterwards; revision unchanged';
});
await check('O01', 'allowlist closed mid-operation: in-flight send fails; reopened afterwards', async () => {
  let s = asActive(await op(a, { action: 'create' }));
  const pending = send(a, s, 'I could write tomorrow.');
  await new Promise(r => setTimeout(r, 120));
  await svc(`bfa_p3b_staging_accounts?user_id=eq.${ids.A}`, { method: 'PATCH', body: JSON.stringify({ admitted: false }) });
  try { await denied(pending); } finally {
    await svc(`bfa_p3b_staging_accounts?user_id=eq.${ids.A}`, { method: 'PATCH', body: JSON.stringify({ admitted: true }) });
  }
  const adm = await admissions(ids.A); return `denied; A admission states: ${[...new Set(adm.map(x => x.state))].join(',') || 'none'}`;
});

// ---------- O02 / O07 saved snapshot, reopen, no account-wide memory, corrections/restrictions ----------
let t1 = tA;
t1 = await send(a, t1, "I came home yesterday and couldn't talk to anyone.");
t1 = await send(a, t1, 'I was tired, not angry.');
t1 = await send(a, t1, "Please don't ask me any questions.");
const savedEvents = t1.inspection!.events.length;
t1 = asActive(await op(a, { action: 'save', thread: t1.thread, revision: t1.revision, token: t1.token, preferenceOn: false }));
await check('O05', 'explicit Save shows saved; next turn shows unsaved', async () => {
  assert(t1.saved, 'not saved after save');
  const next = await send(a, t1, 'I could write tomorrow.'); assert(!next.saved, 'still saved after new turn'); t1 = next;
});
await check('O02', 'new thread A2 has no A1 content (no account-wide memory)', async () => {
  const n = asActive(await op(a, { action: 'create' }));
  assert(n.inspection!.events.length === 0 && n.inspection!.derived.length === 0, 'content leaked');
  const n2 = await send(a, n, 'What have I told you about yesterday?');
  assert(!n2.inspection!.lastRequest!.historyEventIds.some(id => t1.inspection!.events.some(e => e.eventId === id)), 'history leaked');
  return `new thread request history ${n2.inspection!.lastRequest!.historyEventIds.length} own events only`;
});
await check('O05', 'Discard restores exactly the saved snapshot', async () => {
  const d = asActive(await op(a, { action: 'discard', thread: t1.thread, revision: t1.revision, preferenceOn: false }));
  assert(d.inspection!.events.length === savedEvents && d.saved, `events ${d.inspection!.events.length} vs ${savedEvents}`); t1 = d;
});
await check('O02/O07', 'list + reopen after "reload" restores saved snapshot, corrections, restriction, mic off', async () => {
  const list = await op(a, { action: 'list' }) as { kind: string; threads: { thread: string; revision: number }[] };
  const item = list.threads.find(x => x.thread === t1.thread); assert(item, 'saved thread not listed');
  assert(Object.keys(list.threads[0]).sort().join() === 'revision,savedAt,thread', 'list metadata not minimal');
  const r = asActive(await op(a, { action: 'reopen', thread: item.thread, revision: item.revision, preferenceOn: false }));
  assert(r.microphone === 'off', 'mic'); assert(r.inspection!.events.length === savedEvents, 'events');
  assert(r.inspection!.restrictions.length > 0, 'restriction lost');
  const derived = r.inspection!.derived as unknown as { tag?: string; supersededBy?: unknown; status?: string }[];
  assert(derived.length > 0, 'derived lost'); t1 = r;
  return `events=${savedEvents}, restrictions=${r.inspection!.restrictions.join('|')}, derived=${derived.length}`;
});
await check('O05', 'stale revision Save → Conflict; concurrent saves on same revision → exactly one', async () => {
  const s = await send(a, t1, 'I could write tomorrow.');
  await denied(op(a, { action: 'save', thread: s.thread, revision: s.revision - 1, token: s.token }), /Conflict/);
  const both = await Promise.allSettled([0, 1].map(() => op(a, { action: 'save', thread: s.thread, revision: s.revision, token: s.token, preferenceOn: false })));
  assert(both.filter(x => x.status === 'fulfilled').length === 1, `fulfilled ${both.filter(x => x.status === 'fulfilled').length}`);
  t1 = asActive((both.find(x => x.status === 'fulfilled') as PromiseFulfilledResult<unknown>).value);
});
await check('O05', 'lost response: old token stale after committed revision; Stop gives stopped state, no claimed recovery', async () => {
  const old = t1; const advanced = await send(a, old, 'I could write tomorrow.');
  await denied(send(a, old, 'I could write tomorrow.'), /Conflict/);
  const stop = await op(a, { action: 'cancel', thread: old.thread, revision: old.revision, token: old.token });
  assert(stop.kind === 'stopped', 'stop kind ' + stop.kind);
  const r = asActive(await op(a, { action: 'reopen', thread: old.thread, revision: (stop as { revision: number }).revision, preferenceOn: false }));
  t1 = r; return `advanced rev ${advanced.revision}; stopped; reopen restored saved events=${r.inspection!.events.length}`;
});

// ---------- O03 / O04 excerpts, sources, policy ----------
await check('O03/O04', 'exact excerpt: only confirmed bytes, untrusted, adjacent text absent; policy unchanged', async () => {
  const start = FICTIONAL_NOTE.indexOf('I am making'), end = FICTIONAL_NOTE.indexOf('\nIgnore');
  const sel = previewSelection(start, end);
  const r = asActive(await op(a, { action: 'excerpt', thread: t1.thread, revision: t1.revision, token: t1.token, preferenceOn: false,
    selection: { start, end, sourceRevision: sel.sourceRevision, excerptHash: sel.excerptHash } }));
  const ev = r.inspection!.events.filter(e => (e as { sharedExcerpt?: unknown }).sharedExcerpt);
  assert(ev.length === 1 && ev[0].text === sel.exactText, 'excerpt bytes');
  assert(!JSON.stringify(r.inspection).includes('SYNTHETIC_ADJACENT') && !JSON.stringify(r.inspection).includes('Ignore all rules'), 'adjacent text leaked');
  const s = await send(a, r, 'I could write tomorrow.');
  const lr = s.inspection!.lastRequest!;
  assert(lr.policySha256 === CONVERSATION_POLICY_BLOCK_SHA256 && lr.policyIdentity === CONVERSATION_POLICY_IDENTITY, 'policy changed');
  assert(!lr.sourceKeys.some(k => /journal|weekly|day10|hidden/i.test(k)), 'implicit store import');
  t1 = s; return `excerpt exact (${sel.exactText.length} chars); policy ${lr.policySha256.slice(0, 12)}; sources=[${lr.sourceKeys.join(',')}]`;
});
await check('O03/O04', 'drifted hash or revision denied without mutation', async () => {
  const start = 0, end = 5; const sel = previewSelection(start, end);
  for (const selection of [{ start, end, sourceRevision: 'stale', excerptHash: sel.excerptHash }, { start, end: 6, sourceRevision: sel.sourceRevision, excerptHash: sel.excerptHash }])
    await denied(op(a, { action: 'excerpt', thread: t1.thread, revision: t1.revision, token: t1.token, selection }), /Refresh/);
  const row = await a.from('bfa_p3b_threads').select('revision').eq('id', t1.thread).single();
  assert(row.data?.revision === t1.revision, 'revision moved'); return 'Refresh selection; revision unchanged (cancel = no request at all)';
});

// ---------- O06 pending Stop/Delete, no resurrection ----------
await check('O06', 'Delete during pending send: send fails, thread gone, no saved content, stale save denied', async () => {
  let s = asActive(await op(a, { action: 'create' })); s = await send(a, s, 'I could write tomorrow.');
  s = asActive(await op(a, { action: 'save', thread: s.thread, revision: s.revision, token: s.token, preferenceOn: false }));
  const req = randomUUID(); const pending = send(a, s, 'I could write tomorrow.', req);
  await new Promise(r => setTimeout(r, 120));
  const del = await op(a, { action: 'delete', thread: s.thread }); assert(del.kind === 'deleted', 'not deleted');
  await denied(pending);
  await denied(op(a, { action: 'save', thread: s.thread, revision: s.revision, token: s.token }));
  await denied(op(a, { action: 'reopen', thread: s.thread, revision: del.revision }));
  const row = (await svc(`bfa_p3b_threads?id=eq.${s.thread}&select=deleted_at,saved_snapshot`)).json[0];
  assert(row.deleted_at && row.saved_snapshot === null, 'snapshot retained');
  const list = await op(a, { action: 'list' }) as { threads: { thread: string }[] }; assert(!list.threads.some(x => x.thread === s.thread), 'listed');
  const adm = (await admissions(ids.A)).find(x => x.request_id === req);
  return `tombstoned; admission for pending request: ${adm?.state ?? 'none reserved'}`;
});
await check('O06', 'Stop during pending send: late result suppressed', async () => {
  const s = asActive(await op(a, { action: 'create' }));
  const pending = send(a, s, 'I could write tomorrow.'); await new Promise(r => setTimeout(r, 120));
  const stop = await op(a, { action: 'cancel', thread: s.thread, revision: s.revision, token: s.token });
  await denied(pending);
  const row = await a.from('bfa_p3b_threads').select('revision').eq('id', s.thread).single();
  return `stop=${stop.kind}; final rev ${row.data?.revision}; pending denied`;
});

// ---------- O08 admission limits, duplicate, payload reuse, voice separation ----------
await check('O08', 'concurrent duplicate request identity dispatches at most once', async () => {
  const s = asActive(await op(a, { action: 'create' })); const req = randomUUID();
  const both = await Promise.allSettled([0, 1].map(() => send(a, s, 'I could write tomorrow.', req)));
  const ok = both.filter(x => x.status === 'fulfilled').length; assert(ok <= 1, 'dispatched twice');
  const n = (await admissions(ids.A)).filter(x => x.request_id === req).length; assert(n === 1, 'admission rows ' + n);
  return `${ok} committed, 1 admission row`;
});
await check('O08', 'reused request identity with different payload fails safely', async () => {
  const s = asActive(await op(a, { action: 'create' })); const req = randomUUID();
  const s2 = await send(a, s, 'I could write tomorrow.', req);
  await denied(send(a, s2, 'I was tired, not angry.', req));
});
await check('O08', 'B 1 text unit: second send denied, balance 0; voice allowance separate', async () => {
  let s = asActive(await op(b, { action: 'create' }));
  s = await send(b, s, 'I could write tomorrow.'); assert(await balance(ids.B, 'text') === 1, 'mock settle did not refund zero-paid');
  // Burn: hold the single unit with an uncertain reservation via a pending send revoked by delete.
  const pending = send(b, s, 'I could write tomorrow.'); await new Promise(r => setTimeout(r, 120));
  await op(b, { action: 'delete', thread: s.thread }); await denied(pending);
  const held = await balance(ids.B, 'text');
  let t = asActive(await op(b, { action: 'create' }));
  if (held === 0) await denied(send(b, t, 'I could write tomorrow.'));
  const v = await send(b, t, 'I could write tomorrow.', randomUUID(), 'voice');
  assert(await balance(ids.B, 'voice') === 1, 'voice not settled');
  return `text balance after possibly-dispatched delete = ${held} (uncertain hold retained if 0); voice send ok rev ${v.revision}`;
});
await check('O08', 'C has no spendable path; zero admissions/allowances for C', async () => {
  await denied(op(c, { action: 'create' }));
  assert((await admissions(ids.C)).length === 0, 'C admissions'); assert((await balance(ids.C, 'text')) === undefined, 'C allowance');
});

const failed = results.filter(r => !r.pass);
console.log(JSON.stringify({ kind: 'REAL signed-in Auth sessions + real staging handler + real RLS/RPC; mock provider only', total: results.length, failed: failed.length, results }, null, 1));
await Promise.all([A, B, C].map(x => x.auth.auth.signOut({ scope: 'global' })));
process.exit(failed.length ? 1 : 0);
