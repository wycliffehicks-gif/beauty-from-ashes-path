// The single source of the identity string that decides whether a stored
// response still belongs to an exact request.
//
// This module exists so the server boundary and the on-device response store
// can never build that string differently. Nothing here is a cryptographic
// trust claim: it is a local match test only.

import { LIVE_MODEL_ID } from "@/lib/ai/live-provider";
import {
  JOURNEY_OUTPUT_VERSION,
  JOURNEY_VALIDATOR_VERSION,
} from "@/lib/ai/journey-response";
import type {
  JourneyPreparationIdentity,
  JourneyResponseIdentity,
  JourneyResponseProvenance,
} from "@/lib/ai/journey-policy";

/**
 * Bumped from "journey-gen1" when the provider-failure envelope was tightened
 * (whitelisted codes only) and the output validator gained structural-format
 * rejection, so an identity produced under the older behaviour stops matching.
 */
export const JOURNEY_GENERATION_VERSION = "journey-gen2";

/** The only model identity this path will accept. Callers cannot change it. */
export const JOURNEY_MODEL_ID = LIVE_MODEL_ID;

/**
 * Compose the full response identity from a prepared request plus the honest
 * provenance declared by the trusted server-side transport.
 *
 * The canonical string carries the prepared identity (full grounded source,
 * exact policy text, selected meaning, spiritual preference and versions) plus
 * the generation, output, validator and model versions and the provenance. A
 * mock response can therefore never match a live-model identity.
 */
export function composeJourneyResponseIdentity(
  prepared: JourneyPreparationIdentity,
  provenance: JourneyResponseProvenance,
): JourneyResponseIdentity {
  return {
    ...prepared,
    provenance,
    canonicalIdentity: [
      prepared.canonicalIdentity,
      JOURNEY_GENERATION_VERSION,
      JOURNEY_OUTPUT_VERSION,
      JOURNEY_VALIDATOR_VERSION,
      JOURNEY_MODEL_ID,
      provenance,
    ].join("|"),
  };
}
