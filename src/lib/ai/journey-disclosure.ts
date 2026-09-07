// One versioned, app-specific AI disclosure, shared by the consent surface, the
// Privacy Notice and Important Information.
//
// It is written to be accurate about what this app actually does. It is NOT a
// copy of a provider's generic disclaimer, and it makes NO promise about
// anonymity, retention, geography, model training or confidentiality, because
// none of that has been established in writing yet.
//
// While the release-readiness lock is off, the app is honest that the AI
// reflection is not available yet; the same wording explains what would happen
// if it were switched on, so nothing has to be quietly rewritten later.

/**
 * Bump this whenever the wording below changes materially. A bump invalidates a
 * previously recorded AI choice, so consent is asked for again — exactly once,
 * and only for this AI reflection, never for unrelated terms.
 */
export const JOURNEY_AI_DISCLOSURE_VERSION = "2026-09-07.1";

export const JOURNEY_AI_DISCLOSURE_HEADING = "Before you choose an AI reflection";

/**
 * The disclosure body. Each line is one short paragraph, in the order it is
 * shown. Plain language, no implementation jargon.
 */
export const JOURNEY_AI_DISCLOSURE_POINTS: readonly string[] = [
  "If you choose it, the choices you selected today and the written material for this day are sent over the internet to Lovable’s AI service, which writes a reflection back to you.",
  "Nothing you type in optional notes is sent, and nothing from your earlier days is sent. The reflection is written only from today.",
  "You are not asked for your name. Even so, what you select can be personal and sensitive, so please choose only if you are comfortable sending it.",
  "An AI reflection can be wrong, or can miss what matters most. It is not therapy, diagnosis or treatment, and it is never advice about medication, safety or a major decision.",
  "The reflection you receive is saved on this device and browser only, for as long as saving is available here. Clearing this app’s information removes it.",
  "We cannot promise what Lovable’s AI service does with what is sent, how long it keeps it, or where it is handled. Until that is confirmed in writing, please treat the AI reflection as something sent outside this device.",
  "You never have to use it. The written reflection prepared for this day stays available, and choosing it changes nothing about your journey.",
];

/** Shown wherever the AI reflection is described while it is switched off. */
export const JOURNEY_AI_UNAVAILABLE_NOTICE =
  "The AI reflection is not switched on yet. Until it is, every day uses the written reflection prepared for it, and nothing you choose leaves this device.";

/** Short shared paragraph for the Privacy Notice and Important Information. */
export const JOURNEY_AI_DISCLOSURE_SUMMARY =
  "This app also has an optional AI reflection. It is not switched on yet. If you ever choose it, the choices you selected that day and that day’s written material are sent over the internet to Lovable’s AI service to write a reflection back to you; your notes and your earlier days are not sent. The result is saved on this device only, for as long as saving is available here. An AI reflection can be mistaken, and we cannot promise what the AI service keeps, where it is handled, or for how long. You never have to use it.";
