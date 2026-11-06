/** Offline stdin/stdout adapter for the existing immutable cutover preflight.
 * No database client, environment credential lookup, network or privilege write.
 * The owned native harness supplies the catalog collected from its own fixture.
 */
import process from "node:process";
import {
  P5_V2_CUTOVER_CATALOG_SQL,
  P5_V2_CUTOVER_FUNCTIONS,
  evaluateP5V2CutoverCatalog,
} from "./cutover-inventory";

const MAX_INPUT_BYTES = 1_048_576;

async function main(): Promise<void> {
  if (process.argv.length !== 2) throw new Error("unexpected-arguments");
  const version = (process.versions as Record<string, string | undefined>).bun;
  if (!version || !/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][a-zA-Z0-9.-]+)?$/.test(version)) {
    throw new Error("explicit-bun-runtime-required");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_INPUT_BYTES) throw new Error("input-too-large");
    chunks.push(bytes);
  }
  const request: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (request === null || typeof request !== "object" || Array.isArray(request)) {
    throw new Error("invalid-request");
  }
  const input = request as Record<string, unknown>;
  const runtime = Object.freeze({ name: "bun", version });
  let output: unknown;
  if (input.operation === "describe" && Object.keys(input).length === 1) {
    output = {
      protocol: 1,
      deployable: false,
      runtime,
      inventoryVersion: 1,
      catalogSql: P5_V2_CUTOVER_CATALOG_SQL,
      functions: P5_V2_CUTOVER_FUNCTIONS,
    };
  } else if (
    input.operation === "evaluate" &&
    Object.keys(input).length === 3 &&
    Object.hasOwn(input, "catalog") &&
    typeof input.trustedOwnerRole === "string"
  ) {
    output = {
      protocol: 1,
      deployable: false,
      runtime,
      report: evaluateP5V2CutoverCatalog(input.catalog, {
        trustedOwnerRole: input.trustedOwnerRole,
      }),
    };
  } else {
    throw new Error("invalid-request");
  }
  process.stdout.write(JSON.stringify(output) + "\n");
}

main().catch(() => {
  // Do not echo input catalog, paths, credentials or arbitrary thrown text.
  process.stderr.write("Offline cutover bridge rejected the request.\n");
  process.exitCode = 1;
  process.stdin.destroy();
});
