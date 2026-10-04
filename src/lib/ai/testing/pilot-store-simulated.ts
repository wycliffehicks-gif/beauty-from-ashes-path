/**
 * SIMULATED MEMORY ONLY. Not a database adapter, durability implementation,
 * recovery authority or production dependency. Reopen shares this fixture's
 * memory; it does NOT simulate an operating-system/process restart.
 * Deliberately broken modes exist solely to prove the acceptance checks fail.
 */
import type { AtomicPilotControlStore, PilotControlDecision } from "../journey-participant-attempt";
import type {
  PilotStoreAcceptanceHarness, PilotStoreCommitGate, PilotStoreTestConnection,
} from "./pilot-store-acceptance";

export type BrokenPilotStoreMode = "per-handle-state" | "early-ack" | "mutates-committed-input";
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

export async function createSimulatedPilotStoreHarness(
  broken?: BrokenPilotStoreMode,
): Promise<PilotStoreAcceptanceHarness> {
  const records = new Map<string, unknown>();
  const connections = new Set<PilotStoreTestConnection>();
  const releases = new Set<() => void>();
  const background = new Set<Promise<void>>();
  let tail: Promise<unknown> = Promise.resolve();
  let now = 0;
  let fault: "before-commit" | "after-commit-before-ack" | undefined;
  let retry: { timeMs: number; state?: unknown } | undefined;
  let held: { reached: () => void; wait: Promise<void> } | undefined;

  return {
    async connect() {
      let closed = false;
      const target = broken === "per-handle-state"
        ? new Map([...records].map(([key, value]) => [key, structuredClone(value)]))
        : records;
      const store: AtomicPilotControlStore = {
        transact<T>(pilotId: string, decide: (state: unknown, time: unknown) => PilotControlDecision<T>) {
          const operation = tail.then(async () => {
            if (closed) throw new Error("SIMULATED_CONNECTION_CLOSED");
            const snapshot = () => broken === "mutates-committed-input"
              ? target.get(pilotId)
              : structuredClone(target.get(pilotId));
            let decision = decide(snapshot(), now);
            if (retry) {
              const change = retry;
              retry = undefined;
              now = change.timeMs;
              if (Object.hasOwn(change, "state")) target.set(pilotId, structuredClone(change.state));
              // The discarded evaluation's nextState must never be published.
              decision = decide(snapshot(), now);
            }
            if (decision.nextState) {
              const gate = held, fail = fault;
              held = undefined;
              fault = undefined;
              const commit = async () => {
                if (gate) { gate.reached(); await gate.wait; }
                if (fail === "before-commit") throw new Error("SIMULATED_WRITE_REJECTED");
                target.set(pilotId, structuredClone(decision.nextState));
                if (fail === "after-commit-before-ack") throw new Error("SIMULATED_ACK_UNKNOWN");
              };
              if (broken === "early-ack" && gate) {
                const unfinished = commit();
                background.add(unfinished);
                void unfinished.finally(() => background.delete(unfinished)).catch(() => {});
              } else {
                await commit();
              }
            }
            return structuredClone(decision.result);
          });
          tail = operation.catch(() => {});
          return operation;
        },
      };
      const connection = { store, async close() { closed = true; } };
      connections.add(connection);
      return connection;
    },
    async seed(pilotId, state) { records.set(pilotId, structuredClone(state)); },
    async remove(pilotId) { records.delete(pilotId); },
    async readCommitted(pilotId) { return structuredClone(records.get(pilotId)); },
    setTime(value) { now = value; },
    holdNextCommit(): PilotStoreCommitGate {
      if (held) throw new Error("SIMULATED_GATE_ALREADY_ARMED");
      const entered = deferred(), release = deferred();
      held = { reached: entered.resolve, wait: release.promise };
      releases.add(release.resolve);
      return { reached: entered.promise, release: release.resolve };
    },
    failNextCommit(mode) { fault = mode; },
    retryNextEvaluation(change) { retry = structuredClone(change); },
    async dispose() {
      for (const release of releases) release();
      await tail;
      await Promise.allSettled([...background]);
      for (const connection of connections) await connection.close();
      records.clear();
    },
  };
}
