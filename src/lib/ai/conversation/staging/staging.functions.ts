import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { stagingInput } from './input';
export const runStagingOperation = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth]).inputValidator(v => stagingInput.parse(v))
  .handler(async ({ data, context }) => {
    const { stagingOperation } = await import('./adapter.server');
    try {
      let privateRequest;
      if (data.action === 'private-append' && process.env['BFA_PRIVATE_TYPED_SEND_ENABLED'] !== 'true') throw new Error();
      if (data.action === 'private-append' || (data.action === 'append' && process.env['BFA_PRIVATE_TYPED_SEND_ENABLED'] === 'true')) {
        const { getRequest } = await import('@tanstack/react-start/server');
        const { createPrivateTypedRequestAuth, readPrivateTypedBearer } = await import('./private-typed-auth.server');
        const token = readPrivateTypedBearer(getRequest().headers);
        if (!token) throw new Error();
        privateRequest = await createPrivateTypedRequestAuth(context.supabase, context.claims, token);
        if (!privateRequest) throw new Error();
      }
      return await stagingOperation(data, context.supabase, privateRequest);
    }
    catch { throw new Error('Staging request unavailable or stale; nothing was retried.'); }
  });
