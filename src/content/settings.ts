// Settings information architecture and Privacy & Confidentiality copy.
//
// PROVISIONAL — final wording requires Ontario legal / privacy review.

export type SettingsSectionId =
  | "privacy-confidentiality"
  | "support-safety"
  | "important-information"
  | "terms-and-privacy"
  | "about-beauty-from-ashes"
  | "about-resurgence"
  | "clear-or-restart";

export interface SettingsSection {
  id: SettingsSectionId;
  title: string;
  summary: string;
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "privacy-confidentiality",
    title: "Privacy & Confidentiality",
    summary: "What is kept, what is not, and who can see it.",
  },
  {
    id: "support-safety",
    title: "Support & Safety",
    summary: "Crisis lines and how to reach a person.",
  },
  {
    id: "important-information",
    title: "Important Information",
    summary: "Scope, limits and what this journey is not.",
  },
  {
    id: "terms-and-privacy",
    title: "Terms and Privacy",
    summary: "The documents you agreed to before beginning.",
  },
  {
    id: "about-beauty-from-ashes",
    title: "About Beauty from Ashes",
    summary: "Why this journey exists.",
  },
  {
    id: "about-resurgence",
    title: "About Resurgence Therapeutics",
    summary: "The practice behind this work.",
  },
  {
    id: "clear-or-restart",
    title: "Clear or Restart My Journey",
    summary: "Remove what is saved on this device and begin again.",
  },
];

export const PRIVACY_CONFIDENTIALITY_POINTS: string[] = [
  "No Resurgence Therapeutics staff member is watching or reading your answers in real time.",
  "The app saves your place, selected answers, reflections and finished days in this browser when storage is available; otherwise they may last only in the current tab. No account is needed. Choosing an AI reflection, when available, sends today’s selected answers and relevant day material to an external AI service.",
  "The responses you select are saved as short coded option identifiers rather than the wording of the option, and never as anything you typed.",
  "Written reflections are assembled on this device from the approved wording for that day and the options you selected. AI reflections are generated only after a separate informed choice. See the Privacy Notice for processing details and availability.",
  "Your saved journey does not sync to another device or browser. Clearing this browser’s data removes the local copy, not any records held by an external service.",
  "Anyone with access to this device or browser profile may be able to see what is saved here, so this is not the same as a confidential record.",
  "Please avoid names and identifying details about yourself or anyone else.",
  "You can ask Settings to clear this app’s saved information. The app tells you if removal cannot be confirmed.",
  "Using this app is not the same legally protected confidential relationship as psychotherapy.",
  "This app is not monitored for emergencies and cannot respond if someone is in danger.",
  "On Day 10, “Show earlier choices” can temporarily gather compatible current-version coded choices from earlier days on this device. The gathered wording is hidden until you ask for it, is not saved or added to your reflection, and disappears when you hide it, leave the page or reload.",
  "That optional Day 10 gathering is assembled locally and deterministically. It is not sent to Resurgence Therapeutics, a server, artificial intelligence, analytics or any other external service.",
];


/**
 * The short, plain-language summary shown in Settings. The full detail lives on
 * the Privacy Notice page, which is linked directly beneath it — nothing is
 * removed from there.
 */
export const PRIVACY_SUMMARY_POINTS: string[] = [
  "When browser storage is available, your saved journey information stays in this browser on this device. If storage is unavailable, information may exist only in the current tab and can be lost when that tab closes or reloads.",
  "No account is needed. Visitor analytics is off. Written reflections are prepared on this device. AI reflections, when available and separately chosen, send today’s selected answers and relevant material to an external service. Read the Privacy Notice before choosing AI.",
  "Anyone who can use this device or browser profile may be able to see what is saved here, so it is not a confidential record.",
  "You can ask the app to clear or restart your saved journey information from this page. If removal cannot be confirmed, the app will tell you.",

  "The optional Day 10 earlier-choices view is assembled only when you ask to see it. It is not saved or sent and disappears when hidden, when you leave, or when the page reloads.",
];

export const PRIVACY_SUMMARY_LINK_LABEL = "Read the full Privacy Notice";

export const PRIVACY_CONFIDENTIALITY_REVIEW_NOTE =
  "This wording is provisional. Ontario legal and privacy review is still required before any public or paid release.";

export const SPIRITUAL_TOGGLE_TITLE = "Scripture & spiritual reflection";

export const SPIRITUAL_TOGGLE_DESCRIPTION =
  "Off by default, and changeable any time. Turn it on to include optional Christian Scripture and prayer where a day offers them. The complete nonreligious journey remains available without it.";

export const ABOUT_BEAUTY_FROM_ASHES =
  "Beauty from Ashes is a guided psycho-spiritual reflection journey for adults who feel emotionally weighed down, hidden, guarded, disconnected, numb, ashamed, overwhelmed or stuck. It is educational and reflective, and it does not promise a cure or an outcome.";

export const ABOUT_RESURGENCE =
  "Resurgence Therapeutics is a psychotherapy practice grounded in the belief that people are worth returning to. Awaken, Rediscover, Hope is not a slogan here; it is the order in which most healing seems to happen.";

export const CREATOR_ATTRIBUTION =
  "Created by Carl Wycliffe Hicks Jr., BRE, MDiv, RP, founder of Resurgence Therapeutics.";

export const CREATOR_SCOPE_NOTE =
  "This educational resource is informed by psychotherapy and spiritual-care experience, but using it does not create a therapist-client, pastoral-care or other professional relationship.";

export const CLEAR_CONFIRM_QUESTION =
  "Clear everything this app has saved on this device? Your saved place, the choices you selected, your reflections, your finished days and your preferences will all be removed. This cannot be undone.";
