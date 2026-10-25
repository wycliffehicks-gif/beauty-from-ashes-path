import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationService } from '../service/service';
import { seal } from '../staging/seal.server';
const fixtures = vi.hoisted(() => ({ rpc: vi.fn(), allowed: true, row: null as unknown, list: [] as unknown[], owner: '11111111-1111-4111-8111-111111111111' }));
function query(result: () => unknown) {
  const q: Record<string, unknown> = {};
  for (const method of ['select','eq','gt','is','not','order','limit']) q[method] = () => q;
  q.maybeSingle = async () => ({ data: result(), error: null });
  q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: result(), error: null }).then(resolve);
  return q;
}
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: {
  from: () => query(() => fixtures.allowed ? { user_id: fixtures.owner } : null), rpc: fixtures.rpc,
} }));
import { stagingOperation } from '../staging/adapter.server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
function client(subjects = [fixtures.owner]) {
  let calls = 0;
  return { auth: { getUser: async () => ({ data: { user: subjects[Math.min(calls++,subjects.length-1)] ? { id: subjects[Math.min(calls-1,subjects.length-1)] } : null }, error: null }) },
    from: () => query(() => fixtures.row ?? fixtures.list),
  } as unknown as SupabaseClient<Database>;
}
const thread='22222222-2222-4222-8222-222222222222';
beforeEach(() => { fixtures.allowed=true; fixtures.row=null;fixtures.list=[];fixtures.rpc.mockReset(); process.env['BFA_P3B_STATE_SECRET']='unit-only-not-deployed'; });
describe('P3b server adapter boundary doubles — NOT real Auth evidence', () => {
  it('absent or non-allowlisted identity fails before privileged work', async () => {
    await expect(stagingOperation({action:'create'},client(['']))).rejects.toThrow();
    fixtures.allowed=false;await expect(stagingOperation({action:'create'},client())).rejects.toThrow();expect(fixtures.rpc).not.toHaveBeenCalled();
  });
  it('account switch during create suppresses returned content',async () => {
    fixtures.rpc.mockResolvedValue({data:thread,error:null});
    await expect(stagingOperation({action:'create'},client([fixtures.owner,'33333333-3333-4333-8333-333333333333']))).rejects.toThrow();
  });
  it('saved list emits minimal metadata, no sealed snapshot or context', async () => {
    fixtures.list=[{id:thread,revision:7,saved_at:'2026-10-25T23:00:00Z',saved_snapshot:'MUST_NOT_EMIT'}];
    const result=await stagingOperation({action:'list'},client());
    expect(result).toEqual({kind:'list',threads:[{thread,revision:7,savedAt:'2026-10-25T23:00:00Z'}]});
  });
  it('reopen at newer operational revision returns saved equivalence and voice off',async () => {
    const s=new ConversationService({verifiedOwnerId:fixtures.owner});s.ensureThread(thread,false);s.saveThread(thread);
    const snapshot=await seal({owner:fixtures.owner,thread,revision:2,expires:0,authority:s.exportAuthority(thread)});
    fixtures.row={id:thread,revision:6,saved_revision:2,saved_snapshot:snapshot,deleted_at:null};
    fixtures.rpc.mockResolvedValue({data:7,error:null});
    // Final read changes to the committed revision, retaining original saved revision.
    const c=client();let reads=0;
    c.from=(() => { if(++reads>1) fixtures.row={...fixtures.row as object,revision:7};return query(()=>fixtures.row); }) as unknown as typeof c.from;
    const result=await stagingOperation({action:'reopen',thread,revision:6,preferenceOn:false},c);
    expect(result.kind).toBe('active'); if(result.kind!=='active') throw new Error();
    expect(result.saved).toBe(true);expect(result.microphone).toBe('off');expect(result.revision).toBe(7);
  });
  it('never-saved discard tombstones without restoring client history', async () => {
    fixtures.row={id:thread,revision:0,saved_revision:null,saved_snapshot:null,deleted_at:null};fixtures.rpc.mockResolvedValue({data:1,error:null});
    expect(await stagingOperation({action:'discard',thread,revision:0},client())).toEqual({kind:'deleted',thread,revision:1});
    expect(fixtures.rpc).toHaveBeenCalledWith('bfa_p3b_transition',expect.objectContaining({p_action:'delete',p_snapshot:null}));
  });
  it('failed deletion never returns success', async () => {
    fixtures.row={id:thread,revision:0,saved_revision:null,saved_snapshot:null,deleted_at:null};fixtures.rpc.mockResolvedValue({data:null,error:new Error()});
    await expect(stagingOperation({action:'delete',thread,revision:0},client())).rejects.toThrow();
  });
  it('stale revision fails before mutation and has no automatic retry', async () => {
    fixtures.row={id:thread,revision:2,saved_revision:null,saved_snapshot:null,deleted_at:null};
    await expect(stagingOperation({action:'delete',thread,revision:1},client())).rejects.toThrow();expect(fixtures.rpc).not.toHaveBeenCalled();
  });
});