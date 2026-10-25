import type { ConversationService } from '../service/service';
type Authority = ReturnType<ConversationService['exportAuthority']>;
/** Content equivalence is independent of operational revision/cancellation/preference. */
export function hasSavedContent(authority: Authority): boolean {
  const r = authority.record;
  return r.saved !== null && JSON.stringify([r.events, r.derived, r.restrictions, r.grantByTurn]) ===
    JSON.stringify([r.saved.events, r.saved.derived, r.saved.restrictions, r.saved.grantByTurn]);
}
/** Local response fences are UI cleanup only, never auth or dispatch authority. */
export class ResponseFence {
  private generation = 0;
  next() { return ++this.generation; }
  clear() { this.generation += 1; }
  current(ticket: number) { return this.generation === ticket; }
}
export function draftAfterSend(current: string, sent: string) { return current === sent ? '' : current; }
export function requiresSwitchChoice(saved: boolean, draft: string, pending: boolean) { return !saved || draft.length > 0 || pending; }