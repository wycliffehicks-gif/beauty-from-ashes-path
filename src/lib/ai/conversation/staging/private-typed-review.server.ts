import "@tanstack/react-start/server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ConversationService } from "../service/service";
import { describePrivateTypedWire } from "../service/openai-provider.server";
import { unseal } from "./seal.server";
import { createPrivateTypedRequestAuth } from "./private-typed-auth.server";
import { privateTypedReviewInput } from "./private-typed-review-input";

// An engineering profile for reviewing one fictional message. The funded
// operator manifest must independently pin its own limits and exact bytes.
const reviewProfile = Object.freeze({
  model: "gpt-6-luna",
  maxOutputTokens: 512,
  maxInputBytes: 12_000,
  deadlineMs: 20_000,
});
type Description = NonNullable<ReturnType<typeof describePrivateTypedWire>>;

export async function reviewPrivateTypedMessage(
  raw: unknown,
  client: SupabaseClient<Database>,
  initialClaims: unknown,
  originalBearer: string,
) {
  const unavailable = () => new Error("Private message review unavailable.");
  if (process.env.BFA_PRIVATE_TYPED_SEND_ENABLED !== "true") throw unavailable();
  const input = privateTypedReviewInput.parse(raw);
  if (!input.message.trim()) throw unavailable();
  const auth = await createPrivateTypedRequestAuth(client, initialClaims, originalBearer);
  if (!auth) throw unavailable();
  const { initialAuth: first, readAuth } = auth;
  const start = first.verifiedAt;
  let previous = start;
  let ceiling = first.expiresAt;
  function clock() {
    const now = Date.now();
    if (!Number.isSafeInteger(now) || now < previous || now - start >= 30_000 || now >= ceiling)
      throw unavailable();
    previous = now;
  }
  async function checkAuth() {
    const observed = await readAuth();
    if (
      !observed ||
      observed.ownerId !== first.ownerId ||
      observed.authSessionId !== first.authSessionId
    )
      throw unavailable();
    ceiling = Math.min(ceiling, observed.expiresAt);
    clock();
  }
  async function checkAssociation() {
    const [access, thread] = await Promise.all([
      supabaseAdmin
        .from("bfa_p3b_staging_accounts")
        .select("user_id,admitted,expires_at")
        .eq("user_id", first.ownerId)
        .maybeSingle(),
      client
        .from("bfa_p3b_threads")
        .select("id,owner_id,revision,deleted_at")
        .eq("id", input.thread)
        .eq("owner_id", first.ownerId)
        .maybeSingle(),
    ]);
    const expires = access.data && Date.parse(access.data.expires_at);
    if (
      access.error ||
      !access.data ||
      access.data.admitted !== true ||
      access.data.user_id !== first.ownerId ||
      typeof expires !== "number" ||
      !Number.isSafeInteger(expires) ||
      thread.error ||
      !thread.data ||
      thread.data.deleted_at !== null ||
      thread.data.id !== input.thread ||
      thread.data.owner_id !== first.ownerId ||
      thread.data.revision !== input.revision
    )
      throw unavailable();
    ceiling = Math.min(ceiling, expires);
    clock();
  }
  await checkAssociation();
  const envelope = await unseal(input.token, first.ownerId, input.thread, input.revision);
  if (!Number.isSafeInteger(envelope.expires)) throw unavailable();
  ceiling = Math.min(ceiling, envelope.expires);
  clock();
  // Run from a disposable copy of the real sealed thread. Capturing its wire
  // description is the terminal operation. No response or snapshot is saved.
  let description: Description | undefined;
  const service = new ConversationService({
    verifiedOwnerId: first.ownerId,
    provider: {
      async generate(request) {
        clock();
        description = describePrivateTypedWire(request, reviewProfile) ?? undefined;
        throw unavailable();
      },
    },
  });
  service.restoreAuthority(envelope.authority, input.thread);
  if (service.inspect(input.thread)?.preferenceOn !== input.preferenceOn) throw unavailable();
  await service.ready();
  const turn = service.admitUserMessage(input.thread, input.requestId, input.message);
  await service.runTurn(input.thread, turn, { accept: () => true, apply() {} });
  if (!description) throw unavailable();
  await checkAuth();
  await checkAssociation();
  await checkAuth();
  return {
    threadId: input.thread,
    revision: input.revision,
    requestId: input.requestId,
    ...description,
  };
}
