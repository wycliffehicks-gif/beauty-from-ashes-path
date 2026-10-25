import { supabaseAdmin } from '@/integrations/supabase/client.server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { ConversationService } from '../service/service';
import { createMockProvider } from '../service/mock-provider';
import { resolveRegistrySource } from '../sources';
import { sha256HexSync } from '../service/sha256-sync';
import { seal, unseal, fingerprint as keyedFingerprint } from './seal.server';
import { stagingInput, type StagingInput } from './input';

/** No server content cache, provider API, microphone or account enrollment. */
export async function stagingOperation(raw: StagingInput, client: SupabaseClient<Database>) {
  const input = stagingInput.parse(raw);
  async function identity() {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) throw new Error('Unavailable');
    const { data: allowed, error: denied } = await supabaseAdmin.from('bfa_p3b_staging_accounts')
      .select('user_id').eq('user_id', data.user.id).eq('admitted', true).gt('expires_at', new Date().toISOString()).maybeSingle();
    if (denied || !allowed) throw new Error('Unavailable');
    return data.user.id;
  }
  const owner = await identity();
  if (input.action === 'create') {
    const r = await supabaseAdmin.rpc('bfa_p3b_create', { p_owner: owner });
    if (r.error || !r.data) throw new Error('Unavailable');
    const service = new ConversationService({ verifiedOwnerId: owner }); service.ensureThread(r.data, input.preferenceOn === true);
    const token = await seal({ owner, thread: r.data, revision: 0, expires: Date.now()+15*60*1000, authority: service.exportAuthority(r.data) });
    return { thread: r.data, revision: 0, token, saved: false, inspection: service.inspect(r.data) };
  }
  const thread = input.thread;
  if (!thread) throw new Error('Unavailable');
  // RLS and explicit owner check both precede content, token decoding and ledger access.
  const found = await client.from('bfa_p3b_threads').select('id,revision,saved_revision,saved_snapshot').eq('id',thread).eq('owner_id',owner).maybeSingle();
  if (found.error || !found.data) throw new Error('Unavailable');
  const row = found.data;
  if (input.revision !== row.revision) throw new Error('Conflict');
  const service = new ConversationService({ verifiedOwnerId: owner, provider: createMockProvider({ delayMs: 0 }),
    stageHook: async () => {
      try {
        await identity();
        const live = await client.from('bfa_p3b_threads').select('revision').eq('id',thread).maybeSingle();
        if (live.error || live.data?.revision !== row.revision) throw new Error('Unavailable');
      } catch { service.cancelThread(thread, 'stale-server-work'); }
    },
  });
  if (input.action === 'reopen' || input.action === 'discard') {
    if (row.saved_snapshot && row.saved_revision !== null && typeof row.saved_snapshot === 'string') {
      const saved = await unseal(row.saved_snapshot, owner, thread, row.saved_revision, true);
      service.restoreAuthority(saved.authority, thread);
      service.discardThread(thread);
    } else service.ensureThread(thread, input.preferenceOn === true);
    service.setPreference(thread, input.preferenceOn === true);
    service.openThread(thread);
  } else {
    if (!input.token) throw new Error('Unavailable');
    const active = await unseal(input.token, owner, thread, row.revision);
    service.restoreAuthority(active.authority, thread);
  }
  await service.ready();
  let revision = row.revision;
  let requestId: string | undefined;
  async function transition(action: string, snapshot?: string) {
    await identity();
    const r = await supabaseAdmin.rpc('bfa_p3b_transition', { p_owner: owner, p_thread: thread as string,
      p_revision: revision, p_action: action, p_snapshot: snapshot ?? null });
    if (r.error || r.data === null) throw new Error('Conflict');
    revision = r.data;
  }
  if (input.action === 'append' || input.action === 'voice') {
    if (!input.message || !input.requestId) throw new Error('Unavailable');
    requestId = input.requestId;
    const mode = input.action === 'voice' ? 'voice' : 'text';
    // Keyed opaque ciphertext fingerprint: no dictionary-hash of a private message is stored.
    const fingerprint = await keyedFingerprint(`${input.token}:${requestId}:${mode}:${input.message}`);
    const args = { p_owner: owner, p_thread: thread, p_revision: revision, p_request: requestId, p_mode: mode, p_fingerprint: fingerprint };
    const reserve = await supabaseAdmin.rpc('bfa_p3b_reserve', args);
    if (reserve.error) throw new Error('Unavailable');
    const result = reserve.data as { duplicate?: boolean } | null;
    if (result?.duplicate) throw new Error('Request already admitted');
    await identity();
    const claim = await supabaseAdmin.rpc('bfa_p3b_claim', args);
    if (claim.error || !claim.data) throw new Error('Unavailable');
    const turn = service.admitUserMessage(thread, requestId, input.message);
    await service.runTurn(thread, turn, { accept: () => true, apply: () => {} });
    // Only this local mock's reliable terminal return establishes zero fictional charge.
    const settle = await supabaseAdmin.rpc('bfa_p3b_settle', { p_owner: owner, p_request: requestId, p_receipt: crypto.randomUUID(), p_charged: 0 });
    if (settle.error || !settle.data) throw new Error('Unavailable');
    await identity();
    const finish = await supabaseAdmin.rpc('bfa_p3b_finish', { p_owner: owner, p_thread: thread, p_revision: revision, p_request: requestId });
    if (finish.error || finish.data === null) throw new Error('Conflict');
    revision = finish.data;
  } else if (input.action === 'source') {
    const registry = await service.ready();
    if (!registry) throw new Error('Unavailable');
    const source = resolveRegistrySource(registry, input.sourceKey, false);
    if (!source.ok || source.value.excerpt.kind !== 'journey-day-teaching' || sha256HexSync(source.value.excerpt.exactText) !== input.sourceHash) throw new Error('Refresh source preview');
    service.recordSharedTeaching(thread, crypto.randomUUID(), source.value.excerpt.sourceKey, source.value.excerpt.exactText);
    await transition('advance');
  } else if (input.action === 'save') {
    service.saveThread(thread);
    const snapshot = await seal({ owner, thread, revision: revision+1, expires: 0, authority: service.exportAuthority(thread) });
    await transition('save', snapshot);
  } else if (['discard','reopen','cancel','delete'].includes(input.action)) {
    await transition(input.action);
    if (input.action === 'delete') { service.deleteThread(thread); return { thread, revision, deleted: true }; }
    if (input.action === 'cancel') service.cancelThread(thread, 'confirmed-stop');
  }
  // Recheck after awaits and before publishing any content. Cross-instance tombstone wins.
  await identity();
  const current = await client.from('bfa_p3b_threads').select('revision').eq('id',thread).maybeSingle();
  if (current.error || current.data?.revision !== revision) throw new Error('Unavailable');
  const token = await seal({ owner, thread, revision, expires: Date.now()+15*60*1000, authority: service.exportAuthority(thread) });
  return { thread, revision, token, saved: input.action === 'save' || (row.saved_revision === revision), inspection: service.inspect(thread), microphone: 'off' };
}
