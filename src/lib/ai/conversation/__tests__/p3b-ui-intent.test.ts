import { describe, expect, it } from 'vitest';
import { NavigationIntent, selectedReopenRevision } from '../staging/lifecycle';

describe('P3b local navigation intent (not Auth authority)', () => {
  it('cancelled asynchronous save cannot execute captured navigation', async () => {
    const intent = new NavigationIntent();
    const ticket = intent.next();
    let finish = () => {};
    const pending = new Promise<void>(resolve => { finish = resolve; });
    let navigations = 0;
    const work = pending.then(() => { if (intent.current(ticket)) navigations += 1; });
    intent.clear(); finish(); await work;
    expect(navigations).toBe(0);
  });
  it('new intent supersedes old intent but may navigate once confirmed', () => {
    const intent = new NavigationIntent(); const old = intent.next(); const next = intent.next();
    expect(intent.current(old)).toBe(false); expect(intent.current(next)).toBe(true);
    intent.clear(); expect(intent.current(next)).toBe(false);
  });
  it('same selected thread uses confirmed save/discard operational revision', () => {
    expect(selectedReopenRevision({ thread: 'A', revision: 0 }, { thread: 'A', revision: 2 })).toBe(2);
  });
  it('another selected thread keeps its captured optimistic revision', () => {
    expect(selectedReopenRevision({ thread: 'B', revision: 7 }, { thread: 'A', revision: 2 })).toBe(7);
  });
});