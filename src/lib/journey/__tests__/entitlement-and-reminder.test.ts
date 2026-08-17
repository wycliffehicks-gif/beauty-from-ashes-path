import { describe, expect, test } from "bun:test";
import {
  FREE_DAYS,
  LOCKED,
  firstPaidDay,
  isDayUnlocked,
  normalizeEntitlement,
} from "../entitlement";
import { isValidTime, msUntilNext, normalizeReminder, REMINDER_OFF } from "../reminder";

describe("entitlement", () => {
  test("the first four days are always available", () => {
    for (let day = 1; day <= FREE_DAYS; day += 1) {
      expect(isDayUnlocked(day, LOCKED)).toBe(true);
    }
    expect(firstPaidDay()).toBe(FREE_DAYS + 1);
  });

  test("later days require an unlock", () => {
    for (let day = FREE_DAYS + 1; day <= 10; day += 1) {
      expect(isDayUnlocked(day, LOCKED)).toBe(false);
      expect(isDayUnlocked(day, { unlocked: true, source: "pilot" })).toBe(true);
    }
  });

  test("non-days and junk read as locked", () => {
    expect(isDayUnlocked(0, { unlocked: true, source: "pilot" })).toBe(false);
    expect(isDayUnlocked(-1, { unlocked: true, source: "pilot" })).toBe(false);
    expect(isDayUnlocked(1.5, LOCKED)).toBe(false);
  });

  test("unknown stored shapes fail closed", () => {
    expect(normalizeEntitlement(null)).toEqual(LOCKED);
    expect(normalizeEntitlement("unlocked")).toEqual(LOCKED);
    expect(normalizeEntitlement({ unlocked: "yes" })).toEqual(LOCKED);
    expect(normalizeEntitlement({ unlocked: true, source: "hacked" })).toEqual({
      unlocked: true,
      source: "pilot",
    });
  });
});

describe("gentle reminder", () => {
  test("is off by default and fails closed on junk", () => {
    expect(normalizeReminder(null)).toEqual(REMINDER_OFF);
    expect(normalizeReminder({ enabled: "true", time: "99:99" })).toEqual(REMINDER_OFF);
    expect(normalizeReminder({ enabled: true, time: "07:30" })).toEqual({
      enabled: true,
      time: "07:30",
    });
  });

  test("only accepts 24-hour times", () => {
    expect(isValidTime("00:00")).toBe(true);
    expect(isValidTime("23:59")).toBe(true);
    expect(isValidTime("24:00")).toBe(false);
    expect(isValidTime("7:30")).toBe(false);
  });

  test("schedules the next occurrence, today or tomorrow", () => {
    const now = new Date(2026, 7, 17, 12, 0, 0, 0);
    expect(msUntilNext("13:00", now)).toBe(60 * 60 * 1000);
    expect(msUntilNext("11:00", now)).toBe(23 * 60 * 60 * 1000);
    expect(msUntilNext("bad", now)).toBe(0);
  });
});
