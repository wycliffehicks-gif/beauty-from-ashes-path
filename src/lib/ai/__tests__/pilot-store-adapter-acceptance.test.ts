// Offline SIMULATED adapter acceptance, not actual database durability evidence.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  pilotStoreAcceptanceScenarios, runPilotStoreAcceptanceScenario,
} from "../testing/pilot-store-acceptance";
import { createSimulatedPilotStoreHarness } from "../testing/pilot-store-simulated";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("NETWORK_FORBIDDEN_IN_ADAPTER_REHEARSAL"); }));
});
afterEach(() => {
  expect(globalThis.fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe("reusable pilot store adapter scenarios — simulated reference only", () => {
  for (const scenario of pilotStoreAcceptanceScenarios) {
    it(scenario.name, () => runPilotStoreAcceptanceScenario(createSimulatedPilotStoreHarness, scenario.name), 5_000);
  }
});

describe("acceptance assertions reject deliberately broken adapters", () => {
  it("rejects independent per-handle ledgers", async () => {
    await expect(runPilotStoreAcceptanceScenario(
      () => createSimulatedPilotStoreHarness("per-handle-state"),
      "independent handles contend for one final shared allowance",
    )).rejects.toThrow("exactly one reservation may commit");
  });
  it("rejects success returned before the held commit", async () => {
    await expect(runPilotStoreAcceptanceScenario(
      () => createSimulatedPilotStoreHarness("early-ack"),
      "transaction success waits for committed state",
    )).rejects.toThrow("success must not precede commit");
  });
  it("rejects callback aliases that corrupt committed data on throw", async () => {
    await expect(runPilotStoreAcceptanceScenario(
      () => createSimulatedPilotStoreHarness("mutates-committed-input"),
      "callback mutation followed by an exception cannot change committed state",
    )).rejects.toThrow("callback mutation must not alter committed state");
  });
});
