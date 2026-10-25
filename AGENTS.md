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
