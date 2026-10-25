// P1 spiritual-access tests — maps to the P1 (contract-level) portions of
// C08, C09 and C10. These fixtures test the boundary logic only; response
// quality requires a later, separately authorized model evaluation.

import { describe, expect, it } from "vitest";
import { resolveSpiritualAccess } from "../grants";

describe("spiritual access resolution", () => {
  it("C08: preference off + religious discussion, no grant permits nothing", () => {
    // Mentioning church/God/hurt is not a grant; no keyword detection exists.
    const access = resolveSpiritualAccess({
      preferenceOn: false,
      restrictions: [],
      grant: null,
      isDirectFollowUp: false,
    });
    expect(access).toEqual({
      devotionalContentPermitted: false,
      prayerPermitted: false,
      scripturePermitted: false,
      reason: "preference-off-no-grant",
    });
  });

  it("C09: preference on is narrowed by a current no-prayer restriction", () => {
    const access = resolveSpiritualAccess({
      preferenceOn: true,
      restrictions: ["no-prayer", "no-bible"],
      grant: null,
      isDirectFollowUp: false,
    });
    expect(access.prayerPermitted).toBe(false);
    expect(access.scripturePermitted).toBe(false);
    expect(access.devotionalContentPermitted).toBe(false);
    expect(access.reason).toBe("preference-on-narrowed-by-current-restriction");
  });

  it("preference on without restrictions permits but never compels", () => {
    const access = resolveSpiritualAccess({
      preferenceOn: true,
      restrictions: [],
      grant: null,
      isDirectFollowUp: false,
    });
    expect(access).toEqual({
      devotionalContentPermitted: true,
      prayerPermitted: true,
      scripturePermitted: true,
      reason: "preference-on",
    });
  });

  it("C10: an explicit prayer grant permits a prayer for the current reply only", () => {
    const access = resolveSpiritualAccess({
      preferenceOn: false,
      restrictions: [],
      grant: { kind: "prayer" },
      isDirectFollowUp: false,
    });
    expect(access).toEqual({
      devotionalContentPermitted: true,
      prayerPermitted: true,
      scripturePermitted: false,
      reason: "scoped-grant-current-reply",
    });
  });

  it("C10: a validated direct follow-up inherits the scoped grant", () => {
    const access = resolveSpiritualAccess({
      preferenceOn: false,
      restrictions: [],
      grant: { kind: "prayer" },
      isDirectFollowUp: true,
    });
    expect(access.reason).toBe("scoped-grant-direct-follow-up");
    expect(access.prayerPermitted).toBe(true);
  });

  it("C10: an unrelated later topic does not inherit the grant", () => {
    const access = resolveSpiritualAccess({
      preferenceOn: false,
      restrictions: [],
      grant: null,
      isDirectFollowUp: false,
    });
    expect(access.devotionalContentPermitted).toBe(false);
    expect(access.reason).toBe("preference-off-no-grant");
  });

  it("a narrower current restriction wins over an explicit grant", () => {
    const access = resolveSpiritualAccess({
      preferenceOn: false,
      restrictions: ["no-prayer"],
      grant: { kind: "prayer" },
      isDirectFollowUp: false,
    });
    expect(access.prayerPermitted).toBe(false);
    expect(access.devotionalContentPermitted).toBe(false);
  });

  it("a passage grant permits scripture but not prayer", () => {
    const access = resolveSpiritualAccess({
      preferenceOn: false,
      restrictions: [],
      grant: { kind: "passage" },
      isDirectFollowUp: false,
    });
    expect(access.scripturePermitted).toBe(true);
    expect(access.prayerPermitted).toBe(false);
  });
});
