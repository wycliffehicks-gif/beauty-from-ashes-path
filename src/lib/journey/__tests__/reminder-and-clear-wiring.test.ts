// Source-level wiring proofs for the two lifecycle rules that cannot be
// observed without a browser: the reminder timer is mounted exactly once at the
// root (so it survives navigation to a day or a practice), and the clear notice
// lives above the app so it stays visible after moving to the opening.
//
// No user data, no rendering, no timers, no network.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("the reminder scheduler is mounted once, at the root", () => {
  const root = read("src/routes/__root.tsx");
  const reminder = read("src/lib/journey/reminder.ts");
  const settings = read("src/routes/_shell.settings.tsx");

  test("root mounts exactly one scheduler, inside the existing gates", () => {
    expect(root).toContain("import { ReminderScheduler }");
    expect(root.match(/<ReminderScheduler \/>/g) ?? []).toHaveLength(1);
    const scheduler = root.indexOf("<ReminderScheduler />");
    const gate = root.indexOf("<AgreementGate>");
    const outlet = root.indexOf("<Outlet />");
    expect(gate).toBeGreaterThan(-1);
    expect(scheduler).toBeGreaterThan(gate);
    expect(scheduler).toBeLessThan(outlet);
  });

  test("the scheduler is not confined to the _shell layout", () => {
    for (const file of ["src/routes/_shell.tsx", "src/routes/_shell.index.tsx"]) {
      expect(read(file)).not.toContain("ReminderScheduler");
    }
  });

  test("Settings uses controls only and creates no second timer", () => {
    expect(settings).toContain("useReminder()");
    expect(settings).not.toContain("ReminderScheduler");
    expect(settings).not.toContain("setTimeout");
  });

  test("the controls hook holds no timer of its own", () => {
    const controls = reminder.slice(reminder.indexOf("export function useReminder()"));
    expect(controls).not.toContain("setTimeout");
  });

  test("the scheduler cleans up its timer on unmount, including StrictMode", () => {
    const block = reminder.slice(
      reminder.indexOf("export function ReminderScheduler"),
      reminder.indexOf("export function scheduleReminder"),
    );
    expect(block).toContain("return () => cancel?.()");
    // One shot only: no interval and no self re-arming.
    expect(reminder).not.toContain("setInterval");
  });

  test("no permission is requested automatically", () => {
    const block = reminder.slice(reminder.indexOf("export function scheduleReminder"));
    expect(block).not.toContain("requestPermission");
  });

  test("the notification wording is unchanged", () => {
    expect(reminder).toContain('export const REMINDER_TITLE = "Beauty from Ashes";');
    expect(reminder).toContain(
      'export const REMINDER_BODY = "A quiet moment is here if you would like one.";',
    );
  });

  test("the on-note is honest about a closed app and home-screen installation", () => {
    const note = settings.slice(settings.indexOf('data-testid="reminder-on-note"'));
    expect(note).toContain("only arrive while this app is still open");
    expect(note).toContain("Adding the app to your home screen does not change that");
  });
});

describe("the clear notice survives the move to the opening", () => {
  const splash = read("src/components/SplashGate.tsx");
  const settings = read("src/routes/_shell.settings.tsx");

  test("it is rendered above the app, alongside the saving notice", () => {
    expect(splash).toContain("<StorageNotice suppressed={noticeSuppressed} />");
    expect(splash).toContain("<ClearNotice suppressed={noticeSuppressed} />");
    expect(splash.indexOf("<ClearNotice")).toBeLessThan(splash.indexOf("{children}"));
  });

  test("it reuses the existing notice markup and styles", () => {
    const status = read("src/lib/storage-status.tsx");
    const shared = 'className="border-b border-border bg-card px-4 py-3"';
    expect(status.match(new RegExp(shared.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? [])
      .toHaveLength(2);
    expect(status).toContain('data-testid="clear-notice"');
  });

  test("Settings clears once and does not repeat removals", () => {
    const handler = settings.slice(
      settings.indexOf('data-testid="clear-journey-confirmed"'),
      settings.indexOf("Yes, clear it"),
    );
    expect(handler).toContain("clearJourney()");
    expect(handler).not.toContain("clearEntitlement()");
    expect(handler).not.toContain("clearReminder()");
    expect(handler).not.toContain("resetAll()");
    expect(handler).toContain('navigate({ to: "/onboarding", replace: true })');
  });
});
