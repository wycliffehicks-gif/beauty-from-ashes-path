// Request-owned private testing Auth. Never returns or logs the bearer token.
import "@tanstack/react-start/server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";
import type { PrivateTypedAuthObservation } from "../service/private-typed-spend.server";

const id = z
  .string()
  .uuid()
  .refine((value) => value === value.toLowerCase());
const claimsSchema = z.object({
  sub: id,
  session_id: id,
  exp: z.number().int().positive().max(8_640_000_000_000),
});
const safeTime = (value: number) =>
  Number.isSafeInteger(value) && value > 0 && value <= 8_640_000_000_000_000;

export interface PrivateTypedRequestAuth {
  readonly initialAuth: PrivateTypedAuthObservation;
  readonly readAuth: () => Promise<PrivateTypedAuthObservation | null>;
}

export function readPrivateTypedBearer(headers: Headers): string | null {
  const value = headers.get("authorization");
  if (!value || value.length > 32_768) return null;
  return /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(value)?.[1] ?? null;
}

export async function createPrivateTypedRequestAuth(
  client: Pick<SupabaseClient<Database>, "auth">,
  initialClaims: unknown,
  bearerToken: string,
  now: () => number = Date.now,
): Promise<PrivateTypedRequestAuth | null> {
  try {
    const pinned = claimsSchema.parse(initialClaims);
    if (
      typeof bearerToken !== "string" ||
      bearerToken.length > 32_768 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(bearerToken)
    )
      return null;
    let ceiling = pinned.exp * 1000;
    if (!safeTime(ceiling)) return null;
    let last = 0;
    const sample = () => {
      const at = now();
      if (!safeTime(at) || at < last || at >= ceiling) throw new Error();
      last = at;
      return at;
    };
    const readAuth = async (): Promise<PrivateTypedAuthObservation | null> => {
      try {
        // Keep this conservative start through both real SDK awaits.
        const start = sample();
        const verified = await client.auth.getClaims(bearerToken);
        const afterClaims = sample();
        if (verified.error || !verified.data?.claims) return null;
        const current = claimsSchema.parse(verified.data.claims);
        if (current.sub !== pinned.sub || current.session_id !== pinned.session_id) return null;
        ceiling = Math.min(ceiling, current.exp * 1000);
        if (!safeTime(ceiling) || afterClaims >= ceiling || afterClaims - start >= 30_000)
          return null;
        // getClaims can verify a JWT locally; getUser additionally asks current Auth.
        const user = await client.auth.getUser(bearerToken);
        const end = sample();
        if (user.error || user.data.user?.id !== pinned.sub || end - start >= 30_000) return null;
        return Object.freeze({
          ownerId: pinned.sub,
          authSessionId: pinned.session_id,
          verifiedAt: start,
          expiresAt: ceiling,
        });
      } catch {
        return null;
      }
    };
    const initialAuth = await readAuth();
    return initialAuth ? Object.freeze({ initialAuth, readAuth }) : null;
  } catch {
    return null;
  }
}
