import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { runStagingOperation } from '@/lib/ai/conversation/staging/staging.functions';
import type { StagingInput } from '@/lib/ai/conversation/staging/input';

type State = Awaited<ReturnType<typeof runStagingOperation>>;
export function StagingConsole() {
  const run = useServerFn(runStagingOperation);
  const [state, setState] = useState<State | null>(null);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'discard'|'delete'|null>(null);
  async function act(action: StagingInput['action']) {
    setBusy(true); setStatus('');
    try {
      const next = await run({ data: { action, ...(state && { thread: state.thread, revision: state.revision,
        token: 'token' in state ? state.token : undefined }),
        ...(action === 'append' && { message, requestId: crypto.randomUUID() }) } });
      setState('deleted' in next ? null : next);
      setStatus('deleted' in next ? 'Deleted' : action === 'save' ? 'Saved' : action === 'append' ? 'Unsaved changes' : 'Ready');
      if (action === 'append') setMessage('');
      setConfirm(null);
    } catch { setStatus('Unavailable or stale. No automatic retry.'); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-3xl px-5 py-10 text-foreground">
    <h1 className="font-serif text-3xl">Fictional staging conversation</h1>
    <div className="mt-6 flex flex-wrap gap-2">
      <Button disabled={busy} onClick={() => act('create')}>New conversation</Button>
      {state && <>
        <Button disabled={busy} variant="outline" onClick={() => act('save')}>Save</Button>
        <Button disabled={busy} variant="outline" onClick={() => setConfirm('discard')}>Discard</Button>
        <Button disabled={busy} variant="outline" onClick={() => act('reopen')}>Reopen saved</Button>
        <Button disabled={busy} variant="outline" onClick={() => act('cancel')}>Stop</Button>
        <Button disabled={busy} variant="destructive" onClick={() => setConfirm('delete')}>Delete</Button>
      </>}
    </div>
    {confirm && <section role="dialog" aria-label={`Confirm ${confirm}`} className="mt-4 border border-border p-4">
      <p>{confirm === 'delete' ? 'Delete this conversation?' : 'Discard unsaved changes?'}</p>
      <div className="mt-3 flex gap-2"><Button disabled={busy} onClick={() => act(confirm)}>Confirm</Button><Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button></div>
    </section>}
    <p role="status" className="my-4 text-sm">{status}</p>
    {state && 'inspection' in state && state.inspection && <>
      <ol className="space-y-4">{state.inspection.events.map(e => <li key={e.eventId} className="border-b border-border pb-4 break-words"><span className="text-sm text-muted-foreground">{e.role}</span><p>{e.text}</p></li>)}</ol>
      <label className="mt-6 block" htmlFor="staging-message">Fictional message</label>
      <Textarea id="staging-message" value={message} onChange={e => setMessage(e.target.value)} maxLength={4000} className="mt-2"/>
      <Button className="mt-3" disabled={busy || !message.trim()} onClick={() => act('append')}>Send fictional message</Button>
      <details className="mt-6"><summary>Context used by this staging conversation</summary><pre className="mt-3 max-w-full overflow-auto text-xs">{JSON.stringify({ restrictions: state.inspection.restrictions, derived: state.inspection.derived, lastRequest: state.inspection.lastRequest }, null, 2)}</pre></details>
    </>}
  </main>;
}
