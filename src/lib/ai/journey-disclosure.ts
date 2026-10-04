// One versioned, app-specific AI disclosure, shared by the consent surface, the
// Privacy Notice and Important Information.
//
// It is written to be accurate about what this app actually does. It is NOT a
// copy of a provider's generic disclaimer, and it makes NO promise about
// anonymity, retention, geography, model training or confidentiality, because
// none of that has been established in writing yet.
//
// While the release-readiness lock is off, the app is honest that the AI
// reflection is not available yet. The wording describes the disabled connection
// currently in the code; it must be reviewed and updated before any AI release.

/**
 * Bump this whenever the wording below changes materially. A bump invalidates a
 * previously recorded AI choice, so consent is asked for again — exactly once,
 * and only for this AI reflection, never for unrelated terms.
 */
export const JOURNEY_AI_DISCLOSURE_VERSION = "2026-10-04.1";

export const JOURNEY_AI_DISCLOSURE_HEADING = "Before you choose an AI reflection";

/**
 * The disclosure body. Each line is one short paragraph, in the order it is
 * shown. Plain language, no implementation jargon.
 */
export const JOURNEY_AI_DISCLOSURE_POINTS: readonly string[] = [
  "AI generation is unavailable right now. The app’s disabled AI connection is set up to send today’s selected answers, your Scripture and spiritual-reflection preference, and relevant journey material through Lovable to its AI provider, only after your separate choice.",
  "Nothing you type in optional notes is sent, and nothing from your earlier days is sent. The reflection is written only from today.",
  "You are not asked for your name. Even so, what you select can be personal and sensitive, so please choose only if you are comfortable sending it.",
  "An AI reflection can be wrong, or can miss what matters most. It is not therapy, diagnosis or treatment, and it is never advice about medication, safety or a major decision.",
  "The app saves a copy in this browser when storage is available. Otherwise it may last only in this tab. Settings can ask your browser to remove it and will report if removal cannot be confirmed. Clearing this device does not delete records held by a service.",
  "Provider processing and retention details are still being confirmed for this pilot. AI generation will stay unavailable until those details are resolved and the Privacy Notice is updated.",
  "You never have to use it. The written reflection prepared for this day stays available, and choosing it changes nothing about your journey.",
];

/** Shown wherever the AI reflection is described while it is switched off. */
export const JOURNEY_AI_UNAVAILABLE_NOTICE =
  "AI generation is unavailable right now. Written reflections are prepared on this device from the journey’s authored material.";

/** Short shared paragraph for the Privacy Notice and Important Information. */
export const JOURNEY_AI_DISCLOSURE_SUMMARY =
  "AI generation is unavailable right now. AI reflections, if made available, are optional and require your separate choice. The app’s disabled AI connection is set up to send today’s selected answers, your Scripture and spiritual-reflection preference, and relevant journey material through Lovable to its AI provider. Notes and earlier-day answers are not sent. Selections can be sensitive even without a name. The app saves a local copy when browser storage is available; that does not mean the service keeps no records. AI can be mistaken. Provider processing and retention details are still being confirmed, and generation remains unavailable until they are resolved and this notice is updated. Written reflections remain available on this device.";
