import { z } from "zod";

// A review has neither an operator approval nor a provider credential.
export const privateTypedReviewInput = z
  .object({
    thread: z.string().uuid(),
    revision: z.number().int().nonnegative().safe(),
    token: z.string().min(1).max(350_000),
    message: z.string().min(1).max(4_000),
    preferenceOn: z.boolean(),
    requestId: z.string().uuid(),
  })
  .strict();
export type PrivateTypedReviewInput = z.infer<typeof privateTypedReviewInput>;
