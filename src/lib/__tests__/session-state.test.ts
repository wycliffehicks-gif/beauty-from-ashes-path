import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_NOTE_LENGTH,
  clearSessionState,
  emptySessionState,
  readSessionState,
  sanitizeNote,
  sanitizeSessionState,
  writeSessionState,
} from "@/lib/session-state";

const ID = "week-01";

describe("session state privacy and sanitization", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("starts at the first stage with no choices", () => {
    const s = emptySessionState();
    expect(s.stage).toBe("arrival");
    expect(s.choices).toEqual({});
    expect(s.note).toBeUndefined();
  });

  it("caps note length and strips control characters", () => {
    expect(sanitizeNote("a\u0000b\u001fc")).toBe("a b c");
    expect(sanitizeNote("x".repeat(1000)).length).toBe(MAX_NOTE_LENGTH);
    expect(sanitizeNote(42)).toBe("");
  });

  it("rejects malformed stages and choice ids", () => {
    const s = sanitizeSessionState({
      stage: "not-a-stage",
      choices: { noticing: ["numb", "<script>", 5], bogus: ["x"] },
      readiness: "have-space",
    });
    expect(s.stage).toBe("arrival");
    expect(s.choices.noticing).toEqual(["numb"]);
    expect(s.choices).not.toHaveProperty("bogus");
    expect(s.readiness).toBe("have-space");
  });

  it("writes to sessionStorage only, never localStorage", () => {
    writeSessionState(ID, {
      stage: "naming",
      choices: { naming: ["grief"] },
      note: "a few words",
    });
    expect(window.sessionStorage.getItem("bfa.session.week-01")).toContain("naming");
    expect(window.localStorage.length).toBe(0);
  });

  it("resumes the stored stage, choices and note", () => {
    writeSessionState(ID, {
      stage: "noticing",
      choices: { noticing: ["body-heavy"] },
      note: "hello",
    });
    const restored = readSessionState(ID);
    expect(restored.stage).toBe("noticing");
    expect(restored.choices.noticing).toEqual(["body-heavy"]);
    expect(restored.note).toBe("hello");
  });

  it("clearing removes everything for that session", () => {
    writeSessionState(ID, { stage: "naming", choices: {}, note: "private" });
    clearSessionState(ID);
    expect(window.sessionStorage.getItem("bfa.session.week-01")).toBeNull();
    expect(readSessionState(ID)).toEqual(emptySessionState());
  });

  it("recovers safely from corrupt stored data", () => {
    window.sessionStorage.setItem("bfa.session.week-01", "{not json");
    expect(readSessionState(ID)).toEqual(emptySessionState());
  });
});
