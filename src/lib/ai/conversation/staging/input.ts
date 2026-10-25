import { z } from 'zod';
export const stagingInput = z.object({
  action: z.enum(['create','list','read','append','save','discard','reopen','delete','cancel','context','source','excerpt','preference','voice']),
  thread: z.string().uuid().optional(), revision: z.number().int().nonnegative().optional(),
  token: z.string().max(350000).optional(), requestId: z.string().uuid().optional(),
  message: z.string().min(1).max(4000).optional(), preferenceOn: z.boolean().optional(),
  sourceKey: z.string().max(64).optional(), sourceHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  selection: z.object({ start: z.number().int().nonnegative(), end: z.number().int().positive(),
    sourceRevision: z.string().max(64), excerptHash: z.string().regex(/^[0-9a-f]{64}$/) }).strict().optional(),
}).strict();
export type StagingInput = z.infer<typeof stagingInput>;
