// OWNER-ONLY synthetic evaluation. Never import this from an app route or endpoint.
// No participant activation flags are read or changed. Only this explicit command
// can read the existing gateway key. Exactly ten fixed cases, no paid retries.
//
// bun scripts/ai-eval/run-current-journey.ts --plan     (no key reads or calls)
// bun scripts/ai-eval/run-current-journey.ts --case 1  (one selected attempt)
// bun scripts/ai-eval/run-current-journey.ts --all     (remaining cases in order)

import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseJourneyRequest } from "@/lib/ai/journey-contract";
import { prepareJourneyGeneration } from "@/lib/ai/journey-policy";
import { composeJourneyResponseIdentity } from "@/lib/ai/journey-identity";
import {
  generateJourneyReflection,
  JOURNEY_MODEL_ID,
  JOURNEY_MAX_OUTPUT_TOKENS,
  JOURNEY_DEADLINE_MS,
  JOURNEY_MAX_PREPARED_CHARS,
  type JourneyModelProvider,
} from "@/lib/ai/journey-generation";
import { MAX_JOURNEY_OUTPUT_CHARS } from "@/lib/ai/journey-response";
import { createJourneyLiveTransport } from "@/lib/ai/journey-transport.server";

const scriptPath = fileURLToPath(import.meta.url);
const here = dirname(scriptPath);
const outputDir = resolve(here, "../../src/lib/ai/eval/current-journey-pilot-2026-09-07");
const schema = "current-journey-synthetic-evaluation-1";
const maxCases = 10;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
class EvaluationStop extends Error {}
function stop(code: string): never {
  throw new EvaluationStop(code);
}
const readJson = (path: string): Record<string, unknown> => {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value))
    stop("invalid-existing-artifact");
  return value as Record<string, unknown>;
};
const writeNew = (path: string, value: unknown) =>
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });

function fixtures() {
  const raw: unknown = JSON.parse(
    readFileSync(join(here, "current-journey-fixtures.json"), "utf8"),
  );
  if (!Array.isArray(raw) || raw.length !== maxCases) stop("invalid-fixed-fixture-count");
  return (raw as unknown[]).map((request, index) => {
    const parsed = parseJourneyRequest(request);
    if (!parsed.ok || parsed.request.day.day !== index + 1) stop("invalid-fixed-fixture");
    const prepared = prepareJourneyGeneration(parsed.request);
    const preparedChars = prepared.policy.length + prepared.groundedPayload.length;
    if (preparedChars > JOURNEY_MAX_PREPARED_CHARS) stop("fixed-fixture-too-large");
    return {
      day: index + 1,
      request,
      preparedChars,
      expectedIdentitySha256: sha(
        composeJourneyResponseIdentity(prepared.identity, "live-model").canonicalIdentity,
      ),
      requestSha256: sha(JSON.stringify(request)),
    };
  });
}
type Fixture = ReturnType<typeof fixtures>[number];
type CaseStatus = "not-attempted" | "started-unfinished" | "accepted" | "rejected";
type State = { day: number; status: CaseStatus; gatewayFetchAttempts: number };
const casePath = (day: number, suffix: string) =>
  join(outputDir, `case-${String(day).padStart(2, "0")}.${suffix}.json`);

function stateFor(fixture: Fixture): State {
  const startedPath = casePath(fixture.day, "started");
  const resultPath = casePath(fixture.day, "result");
  if (!existsSync(startedPath)) {
    if (existsSync(resultPath)) stop("result-without-reservation");
    return { day: fixture.day, status: "not-attempted", gatewayFetchAttempts: 0 };
  }
  const started = readJson(startedPath);
  if (
    started.schema !== schema ||
    started.day !== fixture.day ||
    started.expectedIdentitySha256 !== fixture.expectedIdentitySha256 ||
    started.requestSha256 !== fixture.requestSha256
  )
    stop("existing-evaluation-baseline-mismatch");
  if (!existsSync(resultPath))
    return { day: fixture.day, status: "started-unfinished", gatewayFetchAttempts: 0 };
  const result = readJson(resultPath);
  if (
    result.schema !== schema ||
    result.day !== fixture.day ||
    result.expectedIdentitySha256 !== fixture.expectedIdentitySha256 ||
    result.requestSha256 !== fixture.requestSha256 ||
    (result.status !== "accepted" && result.status !== "rejected") ||
    (result.gatewayFetchAttempts !== 0 && result.gatewayFetchAttempts !== 1)
  )
    stop("invalid-existing-result");
  return {
    day: fixture.day,
    status: result.status,
    gatewayFetchAttempts: result.gatewayFetchAttempts,
  };
}

function safeUsage(raw: unknown): Record<string, number> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const output: Record<string, number> = {};
  for (const key of ["inputTokens", "outputTokens", "reasoningTokens", "totalTokens"]) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 10_000_000)
      output[key] = value;
  }
  return Object.keys(output).length ? output : undefined;
}
function safeMetadata(raw: unknown): string | undefined {
  return typeof raw === "string" && /^[a-zA-Z0-9_./:-]{1,160}$/.test(raw) ? raw : undefined;
}

export async function runCurrentJourneyEvaluation(args: string[]) {
  const planOnly = args.length === 1 && args[0] === "--plan";
  const all = args.length === 1 && args[0] === "--all";
  const selected =
    args.length === 2 && args[0] === "--case" && /^(?:[1-9]|10)$/.test(args[1] ?? "")
      ? Number(args[1])
      : undefined;
  if (!planOnly && !all && selected === undefined) stop("use-only-plan-case-1-to-10-or-all");
  const cases = fixtures();
  if (planOnly) {
    console.log(
      JSON.stringify(
        {
          schema,
          mode: "plan",
          gatewayFetchAttempts: 0,
          maxCases,
          model: JOURNEY_MODEL_ID,
          maxOutputTokens: JOURNEY_MAX_OUTPUT_TOKENS,
          deadlineMs: JOURNEY_DEADLINE_MS,
          cases: cases.map(({ request: _request, ...summary }) => summary),
        },
        null,
        2,
      ),
    );
    return;
  }

  // Intentionally read only during an explicitly executed live owner command.
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) stop("configured-gateway-key-unavailable-no-calls");
  mkdirSync(outputDir, { recursive: true });
  const ownerId = randomUUID();
  const lockPath = join(outputDir, "owner.lock.json");
  try {
    writeNew(lockPath, { schema, ownerId });
  } catch {
    stop("evaluation-locked-inspect-existing-status-before-continuing");
  }
  let commandFetchAttempts = 0;
  const manifestPath = join(outputDir, "manifest.json");
  const persistManifest = (states: State[]) => {
    if (existsSync(manifestPath) && readJson(manifestPath).schema !== schema)
      stop("foreign-manifest-refused");
    const manifest = {
      schema,
      updatedAt: new Date().toISOString(),
      model: JOURNEY_MODEL_ID,
      maxCases,
      maxOutputTokens: JOURNEY_MAX_OUTPUT_TOKENS,
      deadlineMs: JOURNEY_DEADLINE_MS,
      gatewayFetchAttemptsKnown: states.reduce((sum, state) => sum + state.gatewayFetchAttempts, 0),
      commandFetchAttempts,
      incompleteAttemptCount: states.filter((state) => state.status === "started-unfinished")
        .length,
      cases: states,
    };
    const temporary = `${manifestPath}.${ownerId}.next`;
    writeNew(temporary, manifest);
    renameSync(temporary, manifestPath);
    return manifest;
  };

  try {
    let states = cases.map(stateFor);
    persistManifest(states);
    if (
      states.some((state) => state.status === "rejected" || state.status === "started-unfinished")
    ) {
      stop("prior-failed-or-unfinished-case-no-automatic-retry");
    }
    if (selected !== undefined && states[selected - 1]?.status !== "not-attempted")
      stop("selected-case-already-attempted");
    for (const fixture of cases) {
      if (selected !== undefined && fixture.day !== selected) continue;
      if (states[fixture.day - 1]!.status === "accepted") continue;
      const startedAt = new Date().toISOString();
      // Immutable reservation is written BEFORE any possible dispatch. A crash
      // leaves an unfinished marker, so a repeated command cannot charge again.
      writeNew(casePath(fixture.day, "started"), {
        schema,
        ...fixture,
        startedAt,
        modelRequested: JOURNEY_MODEL_ID,
        maxOutputTokens: JOURNEY_MAX_OUTPUT_TOKENS,
        deadlineMs: JOURNEY_DEADLINE_MS,
      });
      states = cases.map(stateFor);
      persistManifest(states);
      let caseFetchAttempts = 0;
      let candidate: Record<string, unknown> | undefined;
      const transport = createJourneyLiveTransport({
        apiKey,
        fetchImpl: async (...fetchArgs) => {
          if (caseFetchAttempts !== 0 || commandFetchAttempts >= maxCases)
            stop("fixed-call-budget-exceeded");
          caseFetchAttempts += 1;
          commandFetchAttempts += 1;
          return fetch(...fetchArgs);
        },
      });
      const provider: JourneyModelProvider = {
        provenance: "live-model",
        async generate(request) {
          const response = await transport.generate(request);
          if (response.ok) {
            const text =
              typeof response.text === "string" && response.text.length <= MAX_JOURNEY_OUTPUT_CHARS
                ? response.text
                : undefined;
            candidate = {
              text,
              candidateTextOmitted: text === undefined,
              returnedModel: safeMetadata(response.model),
              finishReason: safeMetadata(response.finishReason),
              usage: safeUsage(response.usage),
            };
          }
          return response;
        },
      };
      const result = await generateJourneyReflection({
        rawRequest: fixture.request,
        gates: { activationEnabled: true, consentEstablished: true, pilotAdmitted: true },
        provider,
      });
      const accepted = result.ok && result.meta.acceptedAsLiveAi && caseFetchAttempts === 1;
      writeNew(casePath(fixture.day, "result"), {
        schema,
        ...fixture,
        startedAt,
        finishedAt: new Date().toISOString(),
        status: accepted ? "accepted" : "rejected",
        gatewayFetchAttempts: caseFetchAttempts,
        modelRequested: JOURNEY_MODEL_ID,
        maxOutputTokens: JOURNEY_MAX_OUTPUT_TOKENS,
        deadlineMs: JOURNEY_DEADLINE_MS,
        candidate,
        verdict: result.ok
          ? {
              ok: true,
              acceptedAsLiveAi: result.meta.acceptedAsLiveAi,
              actualIdentitySha256: sha(result.meta.identity.canonicalIdentity),
              usage: result.meta.usage,
            }
          : { ok: false, code: result.code, providerCalled: result.providerCalled },
      });
      states = cases.map(stateFor);
      persistManifest(states);
      if (!accepted) break;
    }
    const summary = persistManifest(cases.map(stateFor));
    console.log(
      JSON.stringify(
        {
          schema,
          commandFetchAttempts,
          gatewayFetchAttemptsKnown: summary.gatewayFetchAttemptsKnown,
          accepted: summary.cases.filter((state) => state.status === "accepted").length,
          rejected: summary.cases.filter((state) => state.status === "rejected").length,
          notAttempted: summary.cases.filter((state) => state.status === "not-attempted").length,
          cases: summary.cases,
        },
        null,
        2,
      ),
    );
    if (summary.cases.some((state) => state.status === "rejected")) process.exitCode = 1;
  } finally {
    // Remove only our own lock. A crash preserves it for explicit owner review.
    if (existsSync(lockPath) && readJson(lockPath).ownerId === ownerId) unlinkSync(lockPath);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  runCurrentJourneyEvaluation(process.argv.slice(2)).catch((error: unknown) => {
    console.error(
      JSON.stringify({
        status: "stopped",
        code:
          error instanceof EvaluationStop ? error.message : "evaluation-failed-inspect-artifacts",
      }),
    );
    process.exitCode = 1;
  });
}
