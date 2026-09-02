// Beauty from Ashes — international crisis-resource registry.
//
// Human-maintained. Deterministic. No geolocation, no AI selection.
//
// Only entries with a verified `lastVerified` date are shipped. Adding a
// new country requires: verifying every number/URL with the operator's own
// published source on the day of the change, filling in `sourceUrl`, and
// updating `lastVerified`.
//
// This build is an explicitly Canada-only private pilot. International
// localization is NOT complete; people outside Canada are pointed to the
// global Find A Helpline directory only.

import type { RegionCode } from "@/lib/ai/types";

export const CRISIS_REGISTRY_VERSION = "2026-08-02.1";

export interface CrisisLine {
  name: string;
  detail: string;
  /** Voice number, rendered as its own clearly labelled Call action. */
  tel?: string;
  /** Text number, rendered as its own clearly labelled Text action. */
  sms?: string;
  /** What to type when texting, e.g. "CONNECT". */
  smsKeyword?: string;
  url?: string;
  urlLabel?: string;
  /** A short, concrete caution shown with this entry only. */
  caution?: string;
}

export interface RegionResource {
  code: RegionCode;
  label: string;
  /** Deterministic emergency guidance, human-authored. No invented numbers. */
  emergencyGuidance: string;
  emergencyTel?: string;
  crisisLines: CrisisLine[];
  /** Restrained non-crisis navigation and safety options. */
  supportLines?: CrisisLine[];
  sourceUrl?: string;
  /** Additional sources consulted when verifying this region. */
  sourceUrls?: string[];
  lastVerified: string; // ISO date, YYYY-MM-DD
}

export const CA_REGION: RegionResource = {
  code: "CA",
  label: "Canada",
  emergencyGuidance:
    "If you are in immediate danger, call 911 where it is available, go to your nearest emergency department, or use your local emergency service. Emergency numbers can differ by location.",
  emergencyTel: "911",
  crisisLines: [
    {
      name: "9-8-8 Suicide Crisis Helpline (Canada)",
      detail:
        "24/7/365, for suicide crisis support or when you are concerned about someone else. Available by phone and by text.",
      tel: "988",
      sms: "988",
    },
    {
      name: "Kids Help Phone",
      detail: "For young people, 24/7, by phone or text.",
      tel: "18006686868",
      sms: "686868",
      smsKeyword: "CONNECT",
    },
    {
      name: "Hope for Wellness Helpline",
      detail:
        "For Indigenous people across Canada, 24/7 in English and French, with Cree, Ojibway and Inuktitut telephone support available on request subject to availability.",
      tel: "18552423310",
    },
  ],
  supportLines: [
    {
      name: "211 Canada",
      detail:
        "Help finding community, social and government services near you. This is not a crisis line. Hours, languages and the ways you can reach 211 can vary by region.",
      url: "https://211.ca/",
      urlLabel: "Open 211.ca",
    },
    {
      name: "Family and gender-based violence services (Government of Canada)",
      detail:
        "Provincial and territorial listings of services for people experiencing family or gender-based violence.",
      url: "https://www.canada.ca/en/public-health/services/health-promotion/stop-family-violence/services.html",
      urlLabel: "Open the provincial and territorial listings",
    },
    {
      name: "ShelterSafe",
      detail:
        "A map of shelters across Canada for women and children seeking safety and support.",
      url: "https://sheltersafe.ca/",
      urlLabel: "Open sheltersafe.ca",
      caution:
        "If someone may be able to see this device, consider using a safer device or phoning instead.",
    },
    {
      name: "Mental health help (Government of Canada)",
      detail: "Where to find mental-health help and services across Canada.",
      url: "https://www.canada.ca/en/public-health/services/mental-health-services/mental-health-get-help.html",
      urlLabel: "Open the Government of Canada page",
    },
  ],
  sourceUrl:
    "https://www.canada.ca/en/public-health/services/mental-health-services/mental-health-get-help.html",
  sourceUrls: [
    "https://www.canada.ca/en/public-health/services/mental-health-services/mental-health-get-help.html",
    "https://211.ca/",
    "https://www.canada.ca/en/public-health/services/health-promotion/stop-family-violence/services.html",
    "https://sheltersafe.ca/",
  ],
  lastVerified: "2026-08-02",
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
      urlLabel: "Open findahelpline.com",
    },
  ],
  sourceUrl: "https://findahelpline.com/",
  lastVerified: "2026-08-02",
};

export const CRISIS_REGISTRY: Record<RegionCode, RegionResource> = {
  CA: CA_REGION,
  GLOBAL: GLOBAL_REGION,
};

export function getRegion(code: RegionCode): RegionResource {
  return CRISIS_REGISTRY[code] ?? GLOBAL_REGION;
}
