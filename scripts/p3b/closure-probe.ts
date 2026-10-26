/**
 * Proves previously issued fictional sessions cannot reach staging after cleanup.
 * Phase 1 (before cleanup): ordinary password sign-in for A/B/C, tokens held in memory only.
 * Waits for /tmp/p3b-auth-done (written after cleanup + email OFF), then probes the real handler,
 * direct RLS reads (bfa_p3b_threads) and Auth getUser with the old tokens. Prints no tokens.
 * Run in background: bun scripts/p3b/closure-probe.ts > /tmp/p3b-closure.log
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { stagingOperation } from '@/lib/ai/conversation/staging/adapter.server';
import type { Database } from '@/integrations/supabase/types';
const URL = process.env.SUPABASE_URL!, PUB = process.env.SUPABASE_PUBLISHABLE_KEY!;
const creds = JSON.parse(readFileSync('/tmp/p3b-auth/creds.json', 'utf8')) as Record<string, { email: string; password: string }>;
const tokens: Record<string, string> = {};
for (const n of ['A', 'B', 'C']) {
  const c = createClient<Database>(URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword(creds[n]); if (error || !data.session) throw new Error('sign-in ' + n);
  tokens[n] = data.session.access_token;
}
const pre: Record<string, boolean> = {};
for (const n of ['A', 'B']) {
  const cl = createClient<Database>(URL, PUB, { global: { headers: { Authorization: `Bearer ${tokens[n]}` } }, auth: { persistSession: false, storage: undefined } });
  pre[n] = await stagingOperation({ action: 'list' }, cl).then(() => true, () => false);
}
console.log(JSON.stringify({ phase: 'ready', liveBeforeCleanup: pre }));
// Control: the held sessions must reach staging before cleanup, or the closure result proves nothing.
if (!pre.A || !pre.B) { console.log(JSON.stringify({ phase: 'aborted', reason: 'live-before-cleanup control failed' })); process.exit(1); }
while (!existsSync('/tmp/p3b-auth-done')) await new Promise(r => setTimeout(r, 500));
const after: Record<string, unknown> = {};
for (const n of ['A', 'B', 'C']) {
  const cl = createClient<Database>(URL, PUB, { global: { headers: { Authorization: `Bearer ${tokens[n]}` } }, auth: { persistSession: false, storage: undefined } });
  const handler = await stagingOperation({ action: 'list' }, cl).then(() => 'ALLOWED', () => 'denied');
  const create = await stagingOperation({ action: 'create' }, cl).then(() => 'ALLOWED', () => 'denied');
  const rows = await cl.from('bfa_p3b_threads').select('id');
  const user = await cl.auth.getUser();
  after[n] = { handlerList: handler, handlerCreate: create, rlsRows: rows.data?.length ?? 0, getUser: user.data.user ? 'VALID' : 'invalid' };
}
const closed = Object.values(after).every(v => { const x = v as Record<string, unknown>; return x.handlerList === 'denied' && x.handlerCreate === 'denied' && x.rlsRows === 0 && x.getUser === 'invalid'; });
console.log(JSON.stringify({ phase: 'after-cleanup', closed, after }));
process.exit(closed ? 0 : 1);
