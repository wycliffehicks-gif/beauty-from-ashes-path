import { describe, expect, it } from "vitest";
import { emptySessionState } from "@/lib/session-state";
import { SESSION_DAY, isResumableSession } from "@/lib/session/day-three";

describe("day-three session link", () => {
  it("anchors the deep session to Day 3", () => {
    expect(SESSION_DAY).toBe(3);
  });

  it("treats an untouched session as not resumable", () => {
    expect(isResumableSession(emptySessionState())).toBe(false);
  });

  it("treats a finished session as not resumable", () => {
    expect(
      isResumableSession({ ...emptySessionState(), stage: "naming", finished: true }),
    ).toBe(false);
  });

  it("treats progress past arrival as resumable", () => {
    expect(isResumableSession({ ...emptySessionState(), stage: "noticing" })).toBe(true);
  });

  it("treats a recorded choice as resumable", () => {
    expect(
      isResumableSession({ ...emptySessionState(), choices: { noticing: ["heavy"] } }),
    ).toBe(true);
  });
});
