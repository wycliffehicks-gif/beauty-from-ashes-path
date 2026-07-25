// Beauty from Ashes — international crisis-resource registry.
//
// Human-maintained. Deterministic. No geolocation, no AI selection.
//
// Only entries with a verified `lastVerified` date are shipped. Adding a
// new country requires: verifying every number/URL with the operator's own
// published source on the day of the change, filling in `sourceUrl`, and
// updating `lastVerified`.

import type { RegionCode } from "@/lib/ai/types";

export const CRISIS_REGISTRY_VERSION = "2026-07-25.1";

export interface CrisisLine {
  name: string;
  detail: string;
  tel?: string; // E.164-ish or local dial string used in tel: links
  sms?: string;
  url?: string;
}

export interface RegionResource {
  code: RegionCode;
  label: string;
  /** Deterministic emergency guidance, human-authored. No invented numbers. */
  emergencyGuidance: string;
  emergencyTel?: string;
  crisisLines: CrisisLine[];
  sourceUrl?: string;
  lastVerified: string; // ISO date, YYYY-MM-DD
}

export const CA_REGION: RegionResource = {
  code: "CA",
  label: "Canada",
  emergencyGuidance:
    "If you are in immediate danger, please call 911 or go to your nearest emergency department.",
  emergencyTel: "911",
  crisisLines: [
    {
      name: "9-8-8 Suicide Crisis Helpline (Canada)",
      detail:
        "Call or text 988. 24/7/365, for suicide crisis support or when you are concerned about someone else.",
      tel: "988",
      sms: "988",
    },
    {
      name: "Kids Help Phone",
      detail:
        "For young people, 24/7. Call 1-800-668-6868, or text CONNECT to 686868.",
      tel: "18006686868",
      sms: "686868",
    },
    {
      name: "Hope for Wellness Helpline",
      detail:
        "For Indigenous people across Canada, 24/7 in English and French, with Cree, Ojibway and Inuktitut telephone support available on request subject to availability. Call 1-855-242-3310.",
      tel: "18552423310",
    },
  ],
  lastVerified: "2026-07-25",
};

export const GLOBAL_REGION: RegionResource = {
  code: "GLOBAL",
  label: "Outside Canada / global fallback",
  emergencyGuidance:
    "If you are in immediate danger, please contact your local emergency services now. Numbers vary by country. If you can, reach a trusted person nearby who can stay with you.",
  crisisLines: [
    {
      name: "Find A Helpline",
      detail:
        "A global directory of verified crisis and mental-health helplines. Choose your country to find a local, free and confidential line.",
      url: "https://findahelpline.com/",
    },
  ],
  sourceUrl: "https://findahelpline.com/",
  lastVerified: "2026-07-25",
};

export const CRISIS_REGISTRY: Record<RegionCode, RegionResource> = {
  CA: CA_REGION,
  GLOBAL: GLOBAL_REGION,
};

export function getRegion(code: RegionCode): RegionResource {
  return CRISIS_REGISTRY[code] ?? GLOBAL_REGION;
}
