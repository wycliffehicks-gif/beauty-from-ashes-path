import { createFileRoute } from "@tanstack/react-router";

import { ConversationPreview } from "@/components/conversation-preview/ConversationPreview";

// DEVELOPER PREVIEW ROUTE — deliberately NOT linked from participant
// navigation. Fictional responses, session-only simulated saving, no AI or
// microphone connection. See docs/pilot/conversation/p2-preview-checkpoint.md.
export const Route = createFileRoute("/conversation-preview")({
  head: () => ({
    meta: [
      { title: "Conversation developer preview — Beauty from Ashes" },
      {
        name: "description",
        content:
          "Developer-only preview of the planned conversation feature: fictional responses, session-only simulated saving, no AI or microphone connection.",
      },
      { property: "og:title", content: "Conversation developer preview — Beauty from Ashes" },
      {
        property: "og:description",
        content:
          "Developer-only preview of the planned conversation feature: fictional responses and simulated saving only.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConversationPreview,
});
