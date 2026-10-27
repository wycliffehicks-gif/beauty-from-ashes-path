import { useState, useEffect, useRef } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { usePrefs, readPrefs } from '@/lib/prefs';
import { runStagingOperation } from '@/lib/ai/conversation/staging/staging.functions';
import type { StagingInput } from '@/lib/ai/conversation/staging/input';
import type { ActiveThread, SavedThread } from '@/lib/ai/conversation/staging/adapter.server';
import { FICTIONAL_NOTE, previewSelection, confirmSelection } from '@/lib/ai/conversation/staging/excerpt';
import { ResponseFence, NavigationIntent, selectedReopenRevision, draftAfterSend, requiresSwitchChoice } from '@/lib/ai/conversation/staging/lifecycle';

type Destination = { action: 'create' } | { action: 'reopen'; target: SavedThread };

// Controlled dialogs have no Radix Trigger to restore focus to. Prefer the
// actual opener, with stable fallbacks after deletion or an asynchronous switch.
function useStagingDialogFocus(initialFocusId?: string) {
  const opener = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: (event: Event) => {
      opener.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
        ? document.activeElement : null;
      if (initialFocusId) {
        event.preventDefault();
        document.getElementById(initialFocusId)?.focus();
      }
    },
    onCloseAutoFocus: (event: Event) => {
      event.preventDefault();
      for (const target of [opener.current, document.getElementById('staging-message'), document.getElementById('staging-heading')]) {
        if (!target?.isConnected || target.matches(':disabled')) continue;
        target.focus();
        if (document.activeElement === target) break;
      }
      opener.current = null;
    },
  };
}

export function StagingConsole() {
  const run = useServerFn(runStagingOperation);
  const [prefs, updatePrefs, hydrated] = usePrefs();
  const [state, setState] = useState<ActiveThread | null>(null);
  const stateRef = useRef<ActiveThread | null>(null);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [listBusy, setListBusy] = useState(false);
  const [savedList, setSavedList] = useState<SavedThread[]>([]);
  const [listStatus, setListStatus] = useState('');
  const [confirm, setConfirm] = useState<'discard'|'delete'|null>(null);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [destinationError, setDestinationError] = useState('');
  const navigation = useRef(new NavigationIntent());
  const [preferenceError, setPreferenceError] = useState('');
  const [selection, setSelection] = useState<ReturnType<typeof previewSelection> | null>(null);
  const [range, setRange] = useState({ start: 0, end: 0 });
  const [recovery, setRecovery] = useState(false);
  const fence = useRef(new ResponseFence());
  const listFence = useRef(new ResponseFence());
  const subject = useRef<string | null | undefined>(undefined);
  const confirmationFocus = useStagingDialogFocus('staging-confirm-cancel');
  const destinationFocus = useStagingDialogFocus();
  const selectionFocus = useStagingDialogFocus();
  const setActive = (value: ActiveThread | null) => { stateRef.current = value; setState(value); };

  useEffect(() => {
    const clear = () => {
      fence.current.clear(); listFence.current.clear(); navigation.current.clear(); stateRef.current = null;
      setState(null); setMessage(''); setStatus(''); setBusy(false); setListBusy(false);
      setSavedList([]); setListStatus(''); setConfirm(null); setDestination(null); setSelection(null);
      setRange({ start: 0, end: 0 }); setRecovery(false); setDestinationError(''); setPreferenceError('');
    };
    window.addEventListener('bfa-app-clear', clear);
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const next = session?.user.id ?? null;
      if (event === 'SIGNED_OUT' || (subject.current !== undefined && next !== subject.current)) clear();
      subject.current = next;
    });
    return () => { fence.current.clear(); listFence.current.clear(); navigation.current.clear(); stateRef.current = null;
      window.removeEventListener('bfa-app-clear', clear); data.subscription.unsubscribe(); };
  }, []);

  async function refreshList() {
    const ticket = listFence.current.next(); setListBusy(true); setListStatus('');
    try {
      const before = await supabase.auth.getUser();
      if (!before.data.user) throw new Error();
      const result = await run({ data: { action: 'list' } });
      const after = await supabase.auth.getUser();
      if (!listFence.current.current(ticket) || before.data.user.id !== after.data.user?.id) return;
      if (result.kind !== 'list') throw new Error();
      setSavedList(result.threads); setListStatus(result.threads.length ? '' : 'No saved conversations.');
    } catch { if (listFence.current.current(ticket)) { setSavedList([]); setListStatus('Saved conversations unavailable.'); } }
    finally { if (listFence.current.current(ticket)) setListBusy(false); }
  }

  function cancelNavigation() { navigation.current.clear(); setDestination(null); setDestinationError(''); }

  async function act(action: StagingInput['action'], extras: Partial<StagingInput> = {}, intent?: { ticket: number; destination: Destination }) {
    const ticket = fence.current.next(); const active = stateRef.current; const sent = message;
    setBusy(true); setStatus(''); setSelection(null); setPreferenceError('');
    if (intent) setDestinationError('');
    try {
      const before = await supabase.auth.getUser();
      if (!before.data.user) throw new Error();
      if (!fence.current.current(ticket)) return;
      let next = await run({ data: { action,
        ...(active && action !== 'create' && { thread: active.thread, revision: active.revision, token: active.token }),
        preferenceOn: readPrefs().showSpiritual,
        ...(action === 'append' && { message: sent, requestId: crypto.randomUUID() }), ...extras } });
      const after = await supabase.auth.getUser();
      if (!fence.current.current(ticket) || before.data.user.id !== after.data.user?.id) return;
      if (next.kind === 'list') throw new Error();
      // Initial New/reopen can finish after the separate setting changed with no active thread.
      // One explicit reconciliation only; another change/failure offers a deliberate retry.
      let preferenceFailure = '';
      if (next.kind === 'active' && next.inspection?.preferenceOn !== readPrefs().showSpiritual && action !== 'preference') {
        const confirmed = next;
        try {
          const currentIdentity = await supabase.auth.getUser();
          if (!fence.current.current(ticket) || before.data.user.id !== currentIdentity.data.user?.id) return;
          const reconciled = await run({ data: { action: 'preference', thread: confirmed.thread, revision: confirmed.revision, token: confirmed.token, preferenceOn: readPrefs().showSpiritual } });
          const reconciledIdentity = await supabase.auth.getUser();
          if (!fence.current.current(ticket) || before.data.user.id !== reconciledIdentity.data.user?.id) return;
          if (reconciled.kind !== 'active') throw new Error();
          next = reconciled;
        } catch {
          if (!fence.current.current(ticket)) return;
          const currentIdentity = await supabase.auth.getUser();
          if (!fence.current.current(ticket) || before.data.user.id !== currentIdentity.data.user?.id) return;
          preferenceFailure = 'Preference update unavailable or stale. Nothing was retried. Confirm the current setting before sending.';
        }
      }
      if (next.kind === 'active' && next.inspection?.preferenceOn !== readPrefs().showSpiritual) {
        preferenceFailure ||= 'The setting changed while loading. Confirm the current setting before sending.';
      }
      setPreferenceError(preferenceFailure);
      setActive(next.kind === 'active' ? next : null);
      setStatus(next.kind === 'active' ? (next.saved ? 'Saved' : 'Unsaved changes') : next.kind === 'stopped' ? 'Stopped. Unsaved changes were not recovered. Reopen only a confirmed saved snapshot.' : (action === 'discard' ? 'Unsaved conversation discarded.' : 'Deleted.'));
      if (action === 'append') setMessage(current => draftAfterSend(current, sent));
      if (!intent && ['discard','reopen','delete','create'].includes(action)) setMessage('');
      setConfirm(null); setRecovery(next.kind === 'stopped');
      if (intent && navigation.current.current(intent.ticket) && !preferenceFailure) {
        const nextDestination = intent.destination;
        cancelNavigation();
        await act(nextDestination.action, nextDestination.action === 'reopen' ? {
          thread: nextDestination.target.thread, revision: selectedReopenRevision(nextDestination.target, next), token: undefined,
        } : {});
      }
    } catch {
      if (fence.current.current(ticket)) {
        setStatus('Unavailable or stale. Unsaved changes may not be recoverable. Nothing was retried.');
        setRecovery(true); setConfirm(null);
        if (action === 'preference') setPreferenceError('Preference update unavailable or stale. Nothing was retried. Confirm the current setting before sending.');
        if (intent && navigation.current.current(intent.ticket)) setDestinationError('Save or discard unavailable or stale. Navigation did not continue. Your typed draft is not saved. Nothing was retried.');
      }
    } finally { if (fence.current.current(ticket)) setBusy(false); }
  }

  function switchTo(next: Destination) {
    navigation.current.next(); setDestinationError('');
    if (stateRef.current && requiresSwitchChoice(stateRef.current.saved, message, busy)) { setDestination(next); return; }
    void act(next.action, next.action === 'reopen' ? { thread: next.target.thread, revision: next.target.revision, token: undefined } : {});
  }
  // Existing nonpersonal app preference is explicit, never silently enabled.
  const preferenceRef = useRef(prefs.showSpiritual);
  useEffect(() => {
    if (!hydrated) return;
    if (preferenceRef.current === prefs.showSpiritual) return;
    preferenceRef.current = prefs.showSpiritual;
    if (stateRef.current && stateRef.current.inspection?.preferenceOn !== prefs.showSpiritual) void act('preference', { preferenceOn: prefs.showSpiritual });
  }, [prefs.showSpiritual, hydrated]);

  return <main className="mx-auto max-w-3xl px-5 py-10 text-foreground">
    <h1 id="staging-heading" tabIndex={-1} className="font-serif text-3xl">Fictional staging conversation</h1>
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <Button disabled={busy} onClick={() => switchTo({ action: 'create' })}>New conversation</Button>
      <label htmlFor="staging-spiritual" className="flex items-center gap-2 text-sm">Christian content
        <Switch id="staging-spiritual" checked={prefs.showSpiritual} disabled={!hydrated} onCheckedChange={on => updatePrefs({ showSpiritual: on })}/>
      </label>
      {state && <>
        <Button disabled={busy || recovery} variant="outline" onClick={() => act('save')}>Save</Button>
        <Button disabled={busy} variant="outline" onClick={() => setConfirm('discard')}>Discard</Button>
        <Button variant="outline" onClick={() => act('cancel')}>Stop</Button>
        <Button variant="destructive" onClick={() => setConfirm('delete')}>Delete</Button>
      </>}
    </div>
    <p role="status" aria-live="polite" className="my-4 text-sm">{busy ? 'Working…' : status}</p>
    {preferenceError && <section className="mb-6 border-y border-border py-4">
      <p role="alert">{preferenceError}</p>
      <Button variant="outline" className="mt-3" disabled={busy || !state} onClick={() => act('preference', { preferenceOn: readPrefs().showSpiritual })}>Confirm current Christian content setting</Button>
    </section>}
    {recovery && <section className="mb-6 border-y border-border py-4">
      <p>Only the last confirmed saved conversation can be reopened. Unsaved changes are not claimed recovered.</p>
      <Button variant="outline" className="mt-3" disabled={listBusy} onClick={refreshList}>Refresh saved conversations</Button>
      <Button variant="outline" className="mt-3 ml-2" onClick={() => { fence.current.clear(); cancelNavigation(); setBusy(false); setActive(null); setMessage(''); setRecovery(false); setPreferenceError(''); setSelection(null); }}>Leave unavailable conversation</Button>
    </section>}
    <section className="my-6 border-y border-border py-4" aria-labelledby="saved-heading">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="saved-heading" className="font-serif text-xl">Saved conversations</h2>
        <Button variant="outline" disabled={listBusy} onClick={refreshList}>{listBusy ? 'Loading…' : 'Refresh saved list'}</Button></div>
      <p role="status" className="mt-3 text-sm">{listStatus}</p>
      <ul className="mt-3 space-y-2">{savedList.map((t, i) => <li key={t.thread} className="flex flex-wrap items-center justify-between gap-2">
        <span>Conversation {i+1} · {new Date(t.savedAt).toLocaleString()}</span>
        <Button variant="outline" disabled={busy} onClick={() => switchTo({ action: 'reopen', target: t })}>Reopen conversation {i+1}</Button>
      </li>)}</ul>
    </section>
    {state?.inspection && <>
      <ol className="space-y-4">{state.inspection.events.map(e => <li key={e.eventId} className="border-b border-border pb-4 break-words"><span className="text-sm text-muted-foreground">{e.sharedExcerpt ? 'Shared exact excerpt · untrusted user data' : e.role}</span><p className="whitespace-pre-wrap">{e.text}</p></li>)}</ol>
      <label className="mt-6 block" htmlFor="staging-message">Fictional message</label>
      <Textarea id="staging-message" value={message} onChange={e => setMessage(e.target.value)} maxLength={4000} className="mt-2"/>
      <Button className="mt-3" disabled={busy || recovery || !!preferenceError || !message.trim() || state.inspection.preferenceOn !== prefs.showSpiritual} onClick={() => act('append')}>Send fictional message</Button>
      <section className="mt-6 border-y border-border py-4">
        <label htmlFor="fictional-note" className="font-serif text-xl">Fictional source material</label>
        <Textarea id="fictional-note" readOnly value={FICTIONAL_NOTE} className="mt-3 min-h-36" onSelect={e => setRange({ start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd })}/>
        <Button variant="outline" className="mt-3" disabled={busy || recovery || range.start === range.end} onClick={() => setSelection(previewSelection(range.start, range.end))}>Preview selected excerpt</Button>
      </section>
      <details className="mt-6"><summary>Context used by this staging conversation</summary><pre className="mt-3 max-w-full overflow-auto text-xs">{JSON.stringify({ preference: state.inspection.preferenceOn, restrictions: state.inspection.restrictions, derived: state.inspection.derived, shared: state.inspection.events.filter(e => e.role === 'shared-source'), lastRequest: state.inspection.lastRequest }, null, 2)}</pre></details>
    </>}
    <Dialog open={confirm !== null} onOpenChange={open => { if (!open) setConfirm(null); }}><DialogContent {...confirmationFocus}><DialogTitle>{confirm === 'delete' ? 'Delete this conversation?' : 'Discard unsaved changes?'}</DialogTitle><DialogDescription>{confirm === 'delete' ? 'Saved content will be removed. Usage evidence is retained.' : 'Return to the saved snapshot, or remove this never-saved conversation.'}</DialogDescription>
      <div className="flex flex-wrap gap-2"><Button onClick={() => confirm && act(confirm)}>Confirm {confirm}</Button><Button id="staging-confirm-cancel" variant="outline" onClick={() => setConfirm(null)}>Cancel</Button></div>
    </DialogContent></Dialog>
    <Dialog open={destination !== null} onOpenChange={open => { if (!open) cancelNavigation(); }}><DialogContent {...destinationFocus}><DialogTitle>Unsaved conversation</DialogTitle><DialogDescription>Save the submitted conversation, discard it, or stay here. A typed unsent draft is not saved.</DialogDescription>
      {destinationError && <p role="alert">{destinationError}</p>}
      {preferenceError && <p role="alert">{preferenceError}</p>}
      <div className="flex flex-wrap gap-2"><Button disabled={busy || recovery} onClick={() => destination && act('save', {}, { destination, ticket: navigation.current.next() })}>Save and continue</Button><Button disabled={busy} variant="outline" onClick={() => destination && act('discard', {}, { destination, ticket: navigation.current.next() })}>Discard and continue</Button><Button variant="outline" onClick={cancelNavigation}>Cancel</Button></div>
    </DialogContent></Dialog>
    <Dialog open={selection !== null} onOpenChange={open => { if (!open) setSelection(null); }}><DialogContent {...selectionFocus}><DialogTitle>Share only this excerpt?</DialogTitle><DialogDescription>Fictional selection · untrusted user data</DialogDescription>
      <p className="whitespace-pre-wrap break-words">{selection?.exactText}</p><div className="flex flex-wrap gap-2"><Button onClick={() => {
        if (!selection) return;
        try { const selected = confirmSelection(selection); void act('excerpt', { selection: { start: selected.start, end: selected.end, sourceRevision: selected.sourceRevision, excerptHash: selected.excerptHash } }); }
        catch { setSelection(null); setStatus('Source changed. Refresh the selection preview.'); }
      }}>Confirm exact share</Button><Button variant="outline" onClick={() => setSelection(null)}>Cancel</Button></div>
    </DialogContent></Dialog>
  </main>;
}
