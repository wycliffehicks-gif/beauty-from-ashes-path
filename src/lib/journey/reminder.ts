// Opt-in, device-only gentle return reminder.
//
// RULES
//  - Off by default. Chosen by the person, cancellable at any time.
//  - No server, no push tokens, no accounts, no analytics.
//  - Local notification only, scheduled while the app is open in this browser.
//  - Never a streak, never a count, never a guilt line.

import { useCallback, useEffect, useState } from "react";

import { readLocal, removeLocal, writeLocal } from "@/lib/storage-status";

const KEY = "bfa.reminder.v1";
const EVENT = "bfa:reminder";

/** Exported so an explicit clear can notify subscribers and scope its removal. */
export const REMINDER_EVENT = EVENT;
export const REMINDER_STORAGE_KEY = KEY;

/** Deliberately plain and non-urgent wording. */
export const REMINDER_TITLE = "Beauty from Ashes";
export const REMINDER_BODY = "A quiet moment is here if you would like one.";

export interface ReminderSettings {
  enabled: boolean;
  /** 24-hour "HH:MM" local time. */
  time: string;
}

export const REMINDER_OFF: ReminderSettings = { enabled: false, time: "20:00" };

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(time: string): boolean {
  return TIME_RE.test(time);
}

export function normalizeReminder(raw: unknown): ReminderSettings {
  if (!raw || typeof raw !== "object") return REMINDER_OFF;
  const r = raw as Record<string, unknown>;
  const time = typeof r.time === "string" && isValidTime(r.time) ? r.time : REMINDER_OFF.time;
  return { enabled: r.enabled === true, time };
}

/** Pure: milliseconds from `now` until the next occurrence of `time`. */
export function msUntilNext(time: string, now: Date): number {
  if (!isValidTime(time)) return 0;
  const [h, m] = time.split(":").map(Number);
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
  return target.getTime() - now.getTime();
}

export function readReminder(): ReminderSettings {
  if (typeof window === "undefined") return REMINDER_OFF;
  try {
    const raw = readLocal(KEY);
    return raw ? normalizeReminder(JSON.parse(raw)) : REMINDER_OFF;
  } catch {
    return REMINDER_OFF;
  }
}

/**
 * Same key, same schema, through the shared storage layer: if the browser
 * refuses to persist the choice, turning the reminder on or off still takes
 * effect for this tab rather than silently reverting.
 */
export function saveReminder(next: ReminderSettings) {
  if (typeof window === "undefined") return;
  writeLocal(KEY, JSON.stringify(normalizeReminder(next)));
  try {
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* ignore */
  }
}

export function clearReminder() {
  if (typeof window === "undefined") return;
  removeLocal(KEY);
  try {
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* ignore */
  }
}


export type NotificationSupport = "unsupported" | "default" | "granted" | "denied";

export function notificationSupport(): NotificationSupport {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  const p = window.Notification.permission;
  return p === "granted" || p === "denied" ? p : "default";
}

/**
 * Live reminder state, shared by every subscriber. Deliberately holds NO timer:
 * scheduling belongs to the single persistent scheduler below, so a screen that
 * merely displays or edits the setting can never own, duplicate or cancel it.
 */
function useReminderState() {
  const [settings, setSettings] = useState<ReminderSettings>(REMINDER_OFF);
  const [hydrated, setHydrated] = useState(false);
  const [support, setSupport] = useState<NotificationSupport>("unsupported");

  useEffect(() => {
    const sync = () => setSettings(readReminder());
    sync();
    setSupport(notificationSupport());
    setHydrated(true);
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return { settings, hydrated, support, setSupport };
}

/**
 * The ONE reminder timer for the whole app, mounted once at the root so it
 * survives moving between Your Journey, a day, a practice and Settings. It
 * renders nothing.
 *
 * Behaviour is unchanged and deliberately modest: a single one-shot local
 * notification at the chosen time, only while the app is open, with no
 * recurrence, no server, no push token and no permission request of its own.
 * The timer is replaced or cancelled whenever the setting changes, the reminder
 * is turned off, the data is cleared, or this component unmounts.
 */
export function ReminderScheduler(): null {
  const { settings, hydrated } = useReminderState();

  useEffect(() => {
    if (!hydrated) return;
    const cancel = scheduleReminder(settings);
    return () => cancel?.();
  }, [hydrated, settings.enabled, settings.time]);

  return null;
}

/**
 * The one scheduling step, kept pure enough to test directly: it either creates
 * a SINGLE one-shot timer and returns its canceller, or declines and returns
 * null. It never requests permission and never re-arms itself.
 */
export function scheduleReminder(
  settings: ReminderSettings,
  now: Date = new Date(),
): (() => void) | null {
  if (typeof window === "undefined") return null;
  if (!settings.enabled) return null;
  if (notificationSupport() !== "granted") return null;
  const timer = window.setTimeout(() => {
    try {
      new window.Notification(REMINDER_TITLE, { body: REMINDER_BODY });
    } catch {
      // A refused or unavailable notification is not an error worth surfacing.
    }
  }, msUntilNext(settings.time, now));
  return () => window.clearTimeout(timer);
}


/**
 * Controls for the Settings screen: current state plus the three actions. No
 * timer is created here, so opening or leaving Settings cannot start a second
 * reminder or cancel the running one.
 */
export function useReminder() {
  const { settings, hydrated, support, setSupport } = useReminderState();


  const enable = useCallback(async (time: string) => {
    if (typeof window === "undefined" || !("Notification" in window)) return false;
    let permission = window.Notification.permission;
    if (permission === "default") {
      try {
        permission = await window.Notification.requestPermission();
      } catch {
        return false;
      }
    }
    setSupport(permission === "granted" ? "granted" : permission === "denied" ? "denied" : "default");
    if (permission !== "granted") return false;
    saveReminder({ enabled: true, time: isValidTime(time) ? time : REMINDER_OFF.time });
    return true;
  }, []);

  const disable = useCallback(() => {
    saveReminder({ enabled: false, time: readReminder().time });
  }, []);

  const setTime = useCallback((time: string) => {
    if (!isValidTime(time)) return;
    const current = readReminder();
    saveReminder({ enabled: current.enabled, time });
  }, []);

  return { settings, hydrated, support, enable, disable, setTime };
}
