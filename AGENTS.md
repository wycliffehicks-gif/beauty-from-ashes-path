<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules

- Conversation provider requests are built only by `src/lib/ai/conversation/service/` through the P1 `assembleConversationContext` boundary; the preview store is a UI projection that routes confirmed lifecycle changes to the service. Why: one authority for context, grants and cancellation.
- P3b uses only `bfa_p3b_*` tables and service-only state-changing RPCs; authenticated reads require owner plus expiring staging allowlist RLS. Server actions revalidate Auth and allowlist before privileged transactions. Why: UI hiding and client owner IDs are never authority.
- P3b active authority is server AES-GCM sealed, owner/thread/revision-bound, browser-memory-only and expires after 15 minutes; only deliberate Save stores a sealed service snapshot. No server content cache or durable turn bodies. Why: preserve service provenance across stateless instances without implicit transcript retention.
- P3b reserve/claim/settle/finish use database transactions, never Maps or the pure admission reducer as a dispatch guarantee; reconciliation is server-only and may run after deletion without reading content. Why: preserve exact-once accounting and tombstone precedence across instances.
