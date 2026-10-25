import { describe, it, expect } from 'vitest';
import { ConversationService } from '../service/service';
import { createMockProvider } from '../service/mock-provider';
const prayer = 'Please write a short Christian prayer for patience today.';
const follow = 'Could you make that prayer simpler?';
async function send(s: ConversationService, thread: string, id: string, text: string) {
  const turn = s.admitUserMessage(thread, id, text);
  return s.runTurn(thread, turn, { accept: () => true, apply: () => {} });
}
describe('Independent P3b authority round-trip diagnostic', () => {
  it('single-thread restored grant authorizes only its direct follow-up and stays immutable', async () => {
    const a = new ConversationService({ verifiedOwnerId: 'auth-a', provider: createMockProvider({ delayMs: 0 }) });
    a.ensureThread('one', false);
    expect(await send(a, 'one', 'm1', prayer)).toBe('committed');
    const state = a.exportAuthority('one');
    const b = new ConversationService({ verifiedOwnerId: 'auth-a', provider: createMockProvider({ delayMs: 0 }) });
    b.restoreAuthority(state, 'one');
    state.issuer.issued.length = 0;
    expect(await send(b, 'one', 'm2', follow)).toBe('committed');
    const grants = b.inspect('one')?.grants;
    expect(grants).toHaveLength(2);
    const followGrant = grants?.[1];
    if (!followGrant) throw new Error('Missing follow-up grant');
    const grant = b.grantIssuer().get(followGrant.grantId);
    if (!grant) throw new Error('Missing issued grant');
    expect(Object.isFrozen(grant)).toBe(true);
    expect(Object.isFrozen(grant.sources)).toBe(true);
  });
  it('exporting one thread from a multi-thread service excludes other thread grants and restores', async () => {
    const a = new ConversationService({ verifiedOwnerId: 'auth-a', provider: createMockProvider({ delayMs: 0 }) });
    a.ensureThread('one', false); a.ensureThread('two', false);
    expect(await send(a, 'one', 'm1', prayer)).toBe('committed');
    expect(await send(a, 'two', 'm2', prayer)).toBe('committed');
    const state = a.exportAuthority('one');
    expect(state.issuer.issued).toHaveLength(1);
    expect(state.issuer.issued.every(g => g.threadId === state.record.threadId)).toBe(true);
    const b = new ConversationService({ verifiedOwnerId: 'auth-a' });
    expect(() => b.restoreAuthority(state, 'one')).not.toThrow();
  });
  it('filters revoked lineage while leaving other live thread grants intact and preserves counter uniqueness', async () => {
    const a = new ConversationService({ verifiedOwnerId: 'auth-a', provider: createMockProvider({ delayMs: 0 }) });
    a.ensureThread('one', false); a.ensureThread('two', false);
    await send(a, 'one', 'm1', prayer); await send(a, 'two', 'm2', prayer);
    const one = a.grantIssuer().forThread('bfa-thread-one')[0];
    const two = a.grantIssuer().forThread('bfa-thread-two')[0];
    if (!one || !two) throw new Error('Missing fixture grants');
    a.grantIssuer().revoke([one.grantId, two.grantId]);
    const state = a.exportAuthority('one');
    expect(state.issuer.revoked).toEqual([one.grantId]);
    expect(a.grantIssuer().get(two.grantId)).toBe(two);
    expect(a.inspect('two')?.grants).toHaveLength(1);
    const b = new ConversationService({ verifiedOwnerId: 'auth-a', provider: createMockProvider({ delayMs: 0 }) });
    b.restoreAuthority(state, 'one');
    expect(b.grantIssuer().isRevoked(one.grantId)).toBe(true);
    await send(b, 'one', 'm3', prayer);
    const newest = b.inspect('one')?.grants.at(-1);
    if (!newest) throw new Error('Missing new grant');
    expect(newest.grantId).not.toBe(one.grantId);
    expect(newest.grantId).not.toBe(two.grantId);
  });
});