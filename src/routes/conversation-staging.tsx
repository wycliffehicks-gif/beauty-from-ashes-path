import { createFileRoute } from '@tanstack/react-router';
import { HostedStagingEntry } from '@/components/conversation-staging/HostedStagingEntry';
import { StagingConsole } from '@/components/conversation-staging/StagingConsole';
import { PrivateStagingSignIn } from '@/components/conversation-staging/PrivateStagingSignIn';
// Public shell only; every data operation independently revalidates auth + allowlist.
// The separate private typed test requires server-side approval for each request.
export const Route = createFileRoute('/conversation-staging')({
  head: () => ({ meta: [
    { title: 'Fictional staging — Beauty from Ashes' },
    { name: 'description', content: 'Restricted fictional conversation staging for Beauty from Ashes.' },
    { property: 'og:title', content: 'Fictional staging — Beauty from Ashes' },
    { property: 'og:description', content: 'Restricted fictional conversation staging for Beauty from Ashes.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex' },
  ] }),
  component: import.meta.env.VITE_BFA_PRIVATE_STAGING_SIGN_IN === 'true'
    ? PrivateStagingSignIn
    : import.meta.env.VITE_BFA_PRIVATE_STAGING_SIGN_IN === undefined &&
        import.meta.env.VITE_BFA_PRIVATE_TYPED_REVIEW === undefined
      ? HostedStagingEntry : StagingConsole,
});
