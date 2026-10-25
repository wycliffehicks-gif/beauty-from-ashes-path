import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { stagingInput } from './input';
export const runStagingOperation = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth]).inputValidator(v => stagingInput.parse(v))
  .handler(async ({ data, context }) => {
    const { stagingOperation } = await import('./adapter.server');
    try { return await stagingOperation(data, context.supabase); }
    catch { throw new Error('Staging request unavailable or stale; nothing was retried.'); }
  });
