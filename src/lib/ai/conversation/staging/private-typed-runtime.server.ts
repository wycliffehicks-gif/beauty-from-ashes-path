// Private server selection only. No approval, funding or credential is supplied
// by this module or accepted from a browser. Empty configuration fails closed.
import "@tanstack/react-start/server-only";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createPrivateTypedDispatchProvider } from "../service/private-typed-dispatch.server";
import type { PrivateTypedSpendMaterial } from "../service/private-typed-spend.server";
import type { PrivateTypedRequestAuth } from "./private-typed-auth.server";

const uuid = z
  .string()
  .uuid()
  .refine((value) => value === value.toLowerCase());
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const materialSchema = z
  .object({
    approval: z
      .object({
        approvalId: uuid,
        ownerId: uuid,
        authSessionId: uuid,
        threadId: uuid,
        revision: integer,
        requestId: uuid,
        manifestSha256: digest,
        payloadSha256: digest,
        maxMicros: integer.positive(),
      })
      .strict(),
    manifestBytes: z.string().min(1).max(16_384),
    priceSnapshotBytes: z.string().min(1).max(16_384),
  })
  .strict();
const registrySchema = z
  .object({ version: z.literal(1), materials: z.array(materialSchema).max(32) })
  .strict();
const limitsSchema = z.object({
  model: z.literal("gpt-6-luna"),
  maxInputBytes: integer.positive(),
  maxOutputTokens: integer.positive(),
  deadlineMs: integer.positive(),
});

export function privateTypedMode(): "mock" | "private" | "invalid" {
  const selected = process.env["BFA_PRIVATE_TYPED_SEND_ENABLED"];
  if (selected === undefined || selected === "false") return "mock";
  return selected === "true" ? "private" : "invalid";
}

export function selectPrivateTypedMaterial(
  raw: string | undefined,
  binding: Pick<
    PrivateTypedSpendMaterial["approval"],
    "ownerId" | "authSessionId" | "threadId" | "revision" | "requestId"
  >,
): { material: PrivateTypedSpendMaterial; limits: z.infer<typeof limitsSchema> } | null {
  try {
    if (!raw || raw.length > 1_048_576) return null;
    const registry = registrySchema.parse(JSON.parse(raw));
    const matches = registry.materials.filter(
      ({ approval }) =>
        approval.ownerId === binding.ownerId &&
        approval.authSessionId === binding.authSessionId &&
        approval.threadId === binding.threadId &&
        approval.revision === binding.revision &&
        approval.requestId === binding.requestId,
    );
    if (matches.length !== 1) return null;
    const material = matches[0]!;
    // The coordinator independently verifies the full exact hashed manifest,
    // original price bytes, payload bytes and funded SQL association.
    const limits = limitsSchema.parse(JSON.parse(material.manifestBytes));
    return { material, limits };
  } catch {
    return null;
  }
}

export function createStagingPrivateTypedProvider(
  request: PrivateTypedRequestAuth,
  binding: {
    ownerId: string;
    threadId: string;
    revision: number;
    requestId: string;
    envelopeExpiresAt: number;
    readAllowlistExpiresAt: () => number;
  },
) {
  if (privateTypedMode() !== "private" || request.initialAuth.ownerId !== binding.ownerId)
    return null;
  const selected = selectPrivateTypedMaterial(
    process.env["BFA_PRIVATE_TYPED_SEND_MATERIALS_JSON"],
    {
      ownerId: binding.ownerId,
      authSessionId: request.initialAuth.authSessionId,
      threadId: binding.threadId,
      revision: binding.revision,
      requestId: binding.requestId,
    },
  );
  if (!selected) return null;
  const originalMaterial = JSON.stringify(selected.material);
  const currentMaterial = () =>
    selectPrivateTypedMaterial(process.env["BFA_PRIVATE_TYPED_SEND_MATERIALS_JSON"], {
      ownerId: binding.ownerId,
      authSessionId: request.initialAuth.authSessionId,
      threadId: binding.threadId,
      revision: binding.revision,
      requestId: binding.requestId,
    });
  return createPrivateTypedDispatchProvider({
    ...selected,
    rpc: { rpc: (name, args) => supabaseAdmin.rpc(name as never, args as never).retry(false) },
    initialAuth: request.initialAuth,
    envelopeExpiresAt: binding.envelopeExpiresAt,
    readAllowlistExpiresAt: binding.readAllowlistExpiresAt,
    dispatchId: crypto.randomUUID(),
    readAuth: request.readAuth,
    readKey: () => process.env["BFA_PRIVATE_TYPED_OPENAI_API_KEY"],
    transport: globalThis.fetch.bind(globalThis),
    now: () => Date.now(),
    enabled: () =>
      privateTypedMode() === "private" &&
      JSON.stringify(currentMaterial()?.material) === originalMaterial,
  });
}
