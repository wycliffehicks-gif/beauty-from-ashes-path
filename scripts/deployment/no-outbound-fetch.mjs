// Smoke-test preload only. Production startup does not import this file.
// This is a global-fetch canary, not a firewall for other networking APIs.
import { writeSync } from "node:fs";

let attempts = 0;
function report(event, extra = {}) {
  if (typeof process.send === "function" && process.connected) {
    try {
      process.send({ type: "bfa-smoke-fetch-guard", event, ...extra }, () => {});
    } catch {}
  }
}
const guardedFetch = async () => {
  attempts += 1;
  // No request URL, headers, body, credentials or exception details are read.
  if (attempts === 1) {
    report("blocked", { attempts });
    try {
      writeSync(2, "BFA_SMOKE_FETCH outbound-blocked\n");
    } catch {}
  }
  throw new Error("BFA_SMOKE_FETCH_BLOCKED");
};
globalThis.fetch = guardedFetch;
report("installed");
process.on("message", (message) => {
  if (message?.type === "bfa-smoke-fetch-guard-status") {
    report("status", { attempts, installed: globalThis.fetch === guardedFetch });
  }
});
