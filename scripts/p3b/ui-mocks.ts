// Deterministic UI doubles only. No SDK, session, JWT, transport or app enrollment.
import { useEffect, useState } from 'react';
import type { StagingInput } from '../../src/lib/ai/conversation/staging/input';
import type { StagingResult } from '../../src/lib/ai/conversation/staging/adapter.server';
type Pending = { input: StagingInput; resolve: (value: StagingResult) => void; reject: () => void };
let owner: string | null = 'fictional-ui-a';
let onAuth: ((event: string, session: { user: { id: string } } | null) => void) | undefined;
let showSpiritual = false;
const listeners = new Set<() => void>();
const pending: Pending[] = [];
const calls: StagingInput[] = [];
export const runStagingOperation = () => {};
export const useServerFn = () => ({ data }: { data: StagingInput }) => {
  calls.push(data);
  return new Promise<StagingResult>((resolve, reject) => pending.push({ input: data, resolve, reject: () => reject(new Error('Synthetic failure')) }));
};
export const supabase = { auth: {
  getUser: async () => ({ data: { user: owner ? { id: owner } : null } }),
  onAuthStateChange: (callback: typeof onAuth) => {
    onAuth = callback;
    callback?.('INITIAL_SESSION', owner ? { user: { id: owner } } : null);
    return { data: { subscription: { unsubscribe: () => { onAuth = undefined; } } } };
  },
} };
export const readPrefs = () => ({ showSpiritual });
export function usePrefs() {
  const [prefs, setPrefs] = useState(readPrefs);
  useEffect(() => { const update = () => setPrefs(readPrefs()); listeners.add(update); return () => { listeners.delete(update); }; }, []);
  return [prefs, (patch: { showSpiritual: boolean }) => { showSpiritual = patch.showSpiritual; listeners.forEach(l => l()); }, true] as const;
}
const harness = {
  calls,
  pending: () => pending.map(p => p.input),
  resolve: (result: StagingResult) => { const p = pending.shift(); if (!p) throw new Error('No pending operation'); p.resolve(result); },
  reject: () => { const p = pending.shift(); if (!p) throw new Error('No pending operation'); p.reject(); },
  auth: (next: string | null) => { owner = next; onAuth?.(next ? 'SIGNED_IN' : 'SIGNED_OUT', next ? { user: { id: next } } : null); },
  clear: () => window.dispatchEvent(new Event('bfa-app-clear')),
};
Object.assign(window, { p3bHarness: harness });