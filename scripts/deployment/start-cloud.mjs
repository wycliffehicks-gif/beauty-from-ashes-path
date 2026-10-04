// This portable preparation image is deliberately AI-off. Changing a container
// environment variable cannot turn it into an approved live-AI deployment.
import { writeSync } from "node:fs";

const activationFlags = ["JOURNEY_AI_ENABLED", "JOURNEY_AI_RELEASE_READY", "LIVE_AI_ENABLED"];

function fail(code) {
  // Never stringify an exception, its cause, environment, arguments or paths.
  try {
    writeSync(2, `BFA_CLOUD_STARTUP ${code}\n`);
  } catch {
    // A broken diagnostic stream must not prevent termination.
  }
  process.exit(1);
}

// An uncaughtException listener suppresses Node's default raw stack output;
// exiting is essential, since continuing after an uncaught failure is unsafe.
process.once("uncaughtException", () => fail("uncaught-exception"));
process.once("unhandledRejection", () => fail("unhandled-rejection"));

const args = process.argv.slice(2);
const checkOnly = args.length === 1 && args[0] === "--check";
if (args.length !== 0 && !checkOnly) fail("invalid-arguments");

// Match the existing application's trim/case-insensitive true-or-1 semantics.
// Each flag is independently prohibited, including the separate legacy flag.
if (
  activationFlags.some((name) => {
    const value = process.env[name]?.trim().toLowerCase();
    return value === "true" || value === "1";
  })
) {
  fail("ai-must-remain-disabled");
}

if (checkOnly) {
  writeSync(1, "BFA_CLOUD_STARTUP configuration-valid-ai-off\n");
} else {
  try {
    await import(new URL("../../.output/server/index.mjs", import.meta.url).href);
  } catch {
    fail("server-start-failed");
  }
}
