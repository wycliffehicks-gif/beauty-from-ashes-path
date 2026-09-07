import { describe, expect, it, vi } from "vitest";
import { classifyPilotStatus, createPilotStatusCheck, isPublicPilotPath, PUBLIC_PILOT_PATHS, type PilotStatus } from "@/lib/pilot-status";

describe("pilot access status", () => {
  it.each([null, undefined, {}, [], true, { required: false }, { required: "false", unlocked: false }])("does not admit a malformed response %j", (value) => {
    expect(classifyPilotStatus(value)).toBe("unavailable");
  });
  it("preserves normal unlocked, no-gate and locked states", () => {
    expect(classifyPilotStatus({ required: true, unlocked: true })).toBe("open");
    expect(classifyPilotStatus({ required: false, unlocked: true })).toBe("open");
    expect(classifyPilotStatus({ required: true, unlocked: false })).toBe("locked");
  });
  it("allows precisely the public safety/legal paths and their children", () => {
    for (const path of PUBLIC_PILOT_PATHS) {
      expect(isPublicPilotPath(path)).toBe(true);
      expect(isPublicPilotPath(`${path}/details`)).toBe(true);
      expect(isPublicPilotPath(`${path}-other`)).toBe(false);
    }
    expect(isPublicPilotPath("/day/1")).toBe(false);
  });
  it.each([true, false])("offers retry after rejection then resolves unlocked=%s", async (unlocked) => {
    const check = vi.fn().mockRejectedValueOnce(new Error("synthetic unavailable")).mockResolvedValueOnce({ required: true, unlocked });
    const seen: PilotStatus[] = [];
    const controller = createPilotStatusCheck(check, (state) => seen.push(state));
    await controller.retry();
    expect(seen).toEqual(["checking", "unavailable"]);
    await controller.retry();
    expect(seen).toEqual(["checking", "unavailable", "checking", unlocked ? "open" : "locked"]);
  });
  it("deduplicates retries and ignores late unmounted results", async () => {
    let resolve!: (value: unknown) => void;
    const check = vi.fn(() => new Promise((done) => { resolve = done; }));
    const publish = vi.fn();
    const controller = createPilotStatusCheck(check, publish);
    const first = controller.retry();
    await controller.retry();
    expect(check).toHaveBeenCalledTimes(1);
    controller.dispose();
    resolve({ required: true, unlocked: true });
    await first;
    expect(publish.mock.calls).toEqual([["checking"]]);
  });
});
