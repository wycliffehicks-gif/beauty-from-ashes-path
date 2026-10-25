import { createFileRoute } from '@tanstack/react-router';
import { StagingConsole } from '@/components/conversation-staging/StagingConsole';
// Public shell only; every data operation independently revalidates auth + allowlist.
// No navigation link, signup, participant admission or model connection.
export const Route = createFileRoute('/conversation-staging')({
  head: () => ({ meta: [
    { title: 'Fictional staging — Beauty from Ashes' },
    { name: 'description', content: 'Restricted fictional conversation staging for Beauty from Ashes.' },
    { property: 'og:title', content: 'Fictional staging — Beauty from Ashes' },
    { property: 'og:description', content: 'Restricted fictional conversation staging; no live AI or microphone.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex' },
  ] }), component: StagingConsole,
});
