import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { privateTypedReviewInput } from "./private-typed-review-input";

export const reviewStagingMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => privateTypedReviewInput.parse(value))
  .handler(async ({ data, context }) => {
    try {
      const { readPrivateTypedBearer } = await import("./private-typed-auth.server");
      const bearer = readPrivateTypedBearer(getRequest().headers);
      if (bearer) {
        const { reviewPrivateTypedMessage } = await import("./private-typed-review.server");
        return await reviewPrivateTypedMessage(data, context.supabase, context.claims, bearer);
      }
    } catch {
      /* Only report a generic refusal to the client. */
    }
    throw new Error("Private message review unavailable.");
  });
