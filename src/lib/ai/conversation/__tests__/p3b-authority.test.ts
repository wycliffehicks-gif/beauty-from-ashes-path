import { describe,it,expect } from 'vitest';
import { ConversationService } from '../service/service';
import { stagingInput } from '../staging/input';
import { createMockProvider } from '../service/mock-provider';
import { seal,unseal } from '../staging/seal.server';

describe('P3b internal authority', () => {
 it('rejects browser owner, history, derived and grants', () => {
   for (const key of ['ownerId','history','derived','grants']) expect(stagingInput.safeParse({action:'create',[key]:[]}).success).toBe(false);
 });
 it('uses immutable verified subject and rejects a different subject restore', () => {
   const a=new ConversationService({verifiedOwnerId:'auth-a'}); a.ensureThread('one',false);
   const b=new ConversationService({verifiedOwnerId:'auth-b'});
   expect(a.exportAuthority('one').record.ownerId).toBe('auth-a');
   expect(()=>b.restoreAuthority(a.exportAuthority('one'),'one')).toThrow('Unavailable');
 });
 it('restores service facts, restrictions and original grant provenance without voice',async () => {
   const a=new ConversationService({verifiedOwnerId:'auth-a',provider:createMockProvider()});a.ensureThread('one',false);
   const t=a.admitUserMessage('one','m','I feel angry.'); await a.runTurn('one',t,{accept:()=>true,apply:()=>{}});
   a.saveThread('one');a.startVoice('one');
   const b=new ConversationService({verifiedOwnerId:'auth-a'});b.restoreAuthority(a.exportAuthority('one'),'one');
   expect(b.inspect('one')?.events).toEqual(a.inspect('one')?.events);expect(b.voice.state).toBe('idle');
   b.admitUserMessage('one','m2','NEW_UNSAVED');b.discardThread('one');expect(b.inspect('one')?.events.some(e=>e.text==='NEW_UNSAVED')).toBe(false);
 });
 it('server seal rejects tamper, wrong subject, revision and expired active state',async () => {
   process.env['BFA_P3B_STATE_SECRET']='test-only-secret-not-deployed';
   const a=new ConversationService({verifiedOwnerId:'auth-a'});a.ensureThread('one',false);
   const token=await seal({owner:'auth-a',thread:'one',revision:2,expires:Date.now()+60000,authority:a.exportAuthority('one')});
   expect((await unseal(token,'auth-a','one',2)).owner).toBe('auth-a');
   await expect(unseal(token,'auth-b','one',2)).rejects.toThrow();await expect(unseal(token,'auth-a','one',3)).rejects.toThrow();
   await expect(unseal(token.slice(0,-4)+'AAAA','auth-a','one',2)).rejects.toThrow();
   const expired=await seal({owner:'auth-a',thread:'one',revision:2,expires:0,authority:a.exportAuthority('one')});
   await expect(unseal(expired,'auth-a','one',2)).rejects.toThrow();
 });
});
