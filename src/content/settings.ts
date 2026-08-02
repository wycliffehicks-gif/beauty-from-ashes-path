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
  "Your saved place, the responses you selected, your reflections and your finished days are kept in this browser's own storage only. They are not sent to Resurgence Therapeutics and there is no account behind them.",
  "The responses you select are saved as short coded option identifiers rather than the wording of the option, and never as anything you typed.",
  "Your personalized reflection is assembled on this device, locally and deterministically, from the approved wording for that day and the options you selected. Nothing is sent anywhere to produce it.",
  "Because everything is local, your journey will not appear on another device or browser, and clearing this browser's data will remove it.",
  "Anyone with access to this device or browser profile may be able to see what is saved here, so this is not the same as a confidential record.",
  "Please avoid names and identifying details about yourself or anyone else.",
  "You can clear everything this app has saved here in Settings, at any time.",
  "Using this app is not the same legally protected confidential relationship as psychotherapy.",
  "This app is not monitored for emergencies and cannot respond if someone is in danger.",
];


export const PRIVACY_CONFIDENTIALITY_REVIEW_NOTE =
  "This wording is provisional and is being finalized with legal and privacy review.";

export const ABOUT_BEAUTY_FROM_ASHES =
  "Beauty from Ashes is a guided psycho-spiritual reflection journey for adults who feel heavy, hidden, guarded, disconnected, numb, ashamed, overwhelmed or stuck. It is educational and reflective, and it does not promise a cure or an outcome.";

export const ABOUT_RESURGENCE =
  "Resurgence Therapeutics is a psychotherapy practice grounded in the belief that people are worth returning to. Awaken, Rediscover, Hope is not a slogan here; it is the order in which most healing seems to happen.";

export const CLEAR_CONFIRM_QUESTION =
  "Clear everything this app has saved on this device? Your saved place, the choices you selected, your reflections, your finished days and your preferences will all be removed. This cannot be undone.";

