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
    const raw = window.localStorage.getItem(KEY);
    return raw ? normalizeReminder(JSON.parse(raw)) : REMINDER_OFF;
  } catch {
    return REMINDER_OFF;
  }
}

export function saveReminder(next: ReminderSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(normalizeReminder(next)));
  } catch {
    // Volatile storage: the choice simply does not persist.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function clearReminder() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
  window.dispatchEvent(new Event(EVENT));
}

export type NotificationSupport = "unsupported" | "default" | "granted" | "denied";

export function notificationSupport(): NotificationSupport {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  const p = window.Notification.permission;
  return p === "granted" || p === "denied" ? p : "default";
}

/**
 * Reminder state plus a single local timer. The timer only exists while the app
 * is open; nothing is queued on a server and nothing survives a closed browser.
 */
export function useReminder() {
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

  useEffect(() => {
    if (!hydrated || !settings.enabled) return;
    if (notificationSupport() !== "granted") return;
    const delay = msUntilNext(settings.time, new Date());
    const timer = window.setTimeout(() => {
      try {
        new window.Notification(REMINDER_TITLE, { body: REMINDER_BODY });
      } catch {
        // A refused or unavailable notification is not an error worth surfacing.
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [hydrated, settings.enabled, settings.time]);

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
