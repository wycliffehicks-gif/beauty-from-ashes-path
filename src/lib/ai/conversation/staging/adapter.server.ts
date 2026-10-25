import { supabaseAdmin } from '@/integrations/supabase/client.server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { ConversationService } from '../service/service';
import { createMockProvider } from '../service/mock-provider';
import { resolveRegistrySource } from '../sources';
import { sha256HexSync } from '../service/sha256-sync';
import { seal, unseal, fingerprint as keyedFingerprint } from './seal.server';
import { stagingInput, type StagingInput } from './input';
import { confirmSelection } from './excerpt';
import { hasSavedContent } from './lifecycle';

export interface SavedThread { thread: string; revision: number; savedAt: string }
export interface ActiveThread {
  kind: 'active'; thread: string; revision: number; token: string; saved: boolean;
  inspection: ReturnType<ConversationService['inspect']>; microphone: 'off';
}
export type StagingResult = ActiveThread | { kind: 'list'; threads: SavedThread[] } | { kind: 'deleted' | 'stopped'; thread: string; revision: number };

/** No server content cache, provider API, microphone or enrollment. */
export async function stagingOperation(raw: StagingInput, client: SupabaseClient<Database>): Promise<StagingResult> {
  const input = stagingInput.parse(raw);
  if (input.action === 'preference' && input.preferenceOn === undefined) throw new Error('Unavailable');
  async function identity(expected?: string) {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user || (expected && data.user.id !== expected)) throw new Error('Unavailable');
    const { data: allowed, error: denied } = await supabaseAdmin.from('bfa_p3b_staging_accounts')
      .select('user_id').eq('user_id', data.user.id).eq('admitted', true).gt('expires_at', new Date().toISOString()).maybeSingle();
    if (denied || !allowed) throw new Error('Unavailable');
    return data.user.id;
  }
  const owner = await identity();
  if (input.action === 'list') {
    const r = await client.from('bfa_p3b_threads').select('id,revision,saved_at').eq('owner_id', owner)
      .is('deleted_at', null).not('saved_at', 'is', null).order('saved_at', { ascending: false }).limit(100);
    if (r.error) throw new Error('Unavailable');
    await identity(owner);
    return { kind: 'list', threads: (r.data ?? []).flatMap(t => t.saved_at ? [{ thread: t.id, revision: t.revision, savedAt: t.saved_at }] : []) };
  }
  if (input.action === 'create') {
    const r = await supabaseAdmin.rpc('bfa_p3b_create', { p_owner: owner });
    if (r.error || !r.data) throw new Error('Unavailable');
    const service = new ConversationService({ verifiedOwnerId: owner }); service.ensureThread(r.data, input.preferenceOn === true);
    await identity(owner);
    const token = await seal({ owner, thread: r.data, revision: 0, expires: Date.now()+15*60*1000, authority: service.exportAuthority(r.data) });
    await identity(owner);
    return { kind: 'active', thread: r.data, revision: 0, token, saved: false, inspection: service.inspect(r.data), microphone: 'off' };
  }
  if (!input.thread) throw new Error('Unavailable');
  const thread: string = input.thread;
  const found = await client.from('bfa_p3b_threads').select('id,revision,saved_revision,saved_snapshot,deleted_at').eq('id',thread).eq('owner_id',owner).maybeSingle();
  if (found.error || !found.data || found.data.deleted_at) throw new Error('Unavailable');
  const row = found.data;
  if (!['delete','cancel','preference'].includes(input.action) && input.revision !== row.revision) throw new Error('Conflict');
  const service = new ConversationService({ verifiedOwnerId: owner, provider: createMockProvider({ delayMs: 250 }),
    stageHook: async () => {
      try { await current(row.revision); }
      catch { service.cancelThread(thread, 'stale-server-work'); }
    },
  });
  async function current(revision: number) {
    await identity(owner);
    const live = await client.from('bfa_p3b_threads').select('revision,deleted_at').eq('id',thread).eq('owner_id',owner).maybeSingle();
    if (live.error || !live.data || live.data.deleted_at || live.data.revision !== revision) throw new Error('Unavailable');
  }
  let revision = row.revision;
  async function transition(action: string, snapshot?: string) {
    await identity(owner);
    const r = await supabaseAdmin.rpc('bfa_p3b_transition', { p_owner: owner, p_thread: thread,
      p_revision: revision, p_action: action, p_snapshot: snapshot ?? null });
    if (r.error || r.data === null) throw new Error('Conflict');
    revision = r.data;
  }
  // Delete can recover without any active token; never restore personal content.
  if (input.action === 'delete') {
    const result = await supabaseAdmin.rpc('bfa_p3b_fence', { p_owner: owner, p_thread: thread, p_action: 'delete' });
    if (result.error || result.data === null) throw new Error('Unavailable');
    revision = result.data; await identity(owner);
    return { kind: 'deleted', thread, revision };
  }
  if (input.action === 'cancel' || input.action === 'preference') {
    await identity(owner);
    const result = await supabaseAdmin.rpc('bfa_p3b_fence', { p_owner: owner, p_thread: thread, p_action: 'cancel' });
    if (result.error || result.data === null) throw new Error('Unavailable');
    revision = result.data;
    // A lost/competing committed response cannot be recovered from an old token.
    if (input.revision !== row.revision || revision !== row.revision+1 || !input.token) {
      await identity(owner); return { kind: 'stopped', thread, revision };
    }
  }
  if (input.action === 'reopen' || input.action === 'discard') {
    if (row.saved_revision !== null && typeof row.saved_snapshot === 'string') {
      const saved = await unseal(row.saved_snapshot, owner, thread, row.saved_revision, true);
      service.restoreAuthority(saved.authority, thread);
      service.discardThread(thread);
    } else {
      if (input.action === 'reopen') throw new Error('No saved snapshot');
      // Confirmed discard of a never-saved conversation removes its active authority.
      await transition('delete'); await identity(owner);
      return { kind: 'deleted', thread, revision };
    }
    if (service.inspect(thread)?.preferenceOn !== (input.preferenceOn === true)) service.setPreference(thread, input.preferenceOn === true);
    service.openThread(thread);
  } else {
    if (!input.token) throw new Error('Unavailable');
    const active = await unseal(input.token, owner, thread, row.revision);
    service.restoreAuthority(active.authority, thread);
    if (!['cancel','preference'].includes(input.action) && input.preferenceOn !== undefined && service.inspect(thread)?.preferenceOn !== input.preferenceOn) throw new Error('Confirm current preference');
  }
  await service.ready();
  if (input.action === 'append' || input.action === 'voice') {
    if (!input.message || !input.requestId) throw new Error('Unavailable');
    const requestId = input.requestId;
    const mode = input.action === 'voice' ? 'voice' : 'text';
    const fingerprint = await keyedFingerprint(`${input.token}:${requestId}:${mode}:${input.message}`);
    const args = { p_owner: owner, p_thread: thread, p_revision: revision, p_request: requestId, p_mode: mode, p_fingerprint: fingerprint };
    await identity(owner);
    const reserve = await supabaseAdmin.rpc('bfa_p3b_reserve', args);
    if (reserve.error || !reserve.data || (reserve.data as { duplicate?: boolean }).duplicate) throw new Error('Unavailable');
    await identity(owner);
    const claim = await supabaseAdmin.rpc('bfa_p3b_claim', args);
    if (claim.error || !claim.data) throw new Error('Unavailable');
    const turn = service.admitUserMessage(thread, requestId, input.message);
    let accepted = false;
    const outcome = await service.runTurn(thread, turn, { accept: () => true, apply: result => { accepted = result.ok; } });
    // No zero-charge inference on failure/stale/timeout. Hold for reliable reconciliation.
    if (outcome !== 'committed' || !accepted) throw new Error('Unavailable');
    const settle = await supabaseAdmin.rpc('bfa_p3b_settle', { p_owner: owner, p_request: requestId, p_receipt: crypto.randomUUID(), p_charged: 0 });
    if (settle.error || !settle.data) throw new Error('Unavailable');
    await identity(owner);
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
  } else if (input.action === 'excerpt') {
    if (!input.selection) throw new Error('Refresh selection');
    const selected = confirmSelection(input.selection);
    service.recordSharedExcerpt(thread, crypto.randomUUID(), selected.exactText, selected.sourceRevision, new Date().toISOString());
    await transition('advance');
  } else if (input.action === 'preference') {
    if (input.preferenceOn === undefined) throw new Error('Unavailable');
    service.setPreference(thread, input.preferenceOn);
  } else if (input.action === 'save') {
    service.saveThread(thread);
    const snapshot = await seal({ owner, thread, revision: revision+1, expires: 0, authority: service.exportAuthority(thread) });
    await transition('save', snapshot);
  } else if (['discard','reopen','cancel'].includes(input.action)) {
    if (input.action !== 'cancel') await transition(input.action);
    if (input.action === 'cancel') service.cancelThread(thread, 'confirmed-stop');
  }
  await current(revision);
  const authority = service.exportAuthority(thread);
  const token = await seal({ owner, thread, revision, expires: Date.now()+15*60*1000, authority });
  await current(revision); // Includes fresh owner check after encryption await.
  return { kind: 'active', thread, revision, token, saved: hasSavedContent(authority), inspection: service.inspect(thread), microphone: 'off' };
}
