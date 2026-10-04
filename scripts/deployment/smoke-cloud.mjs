import { spawn } from "node:child_process";
import { access, readFile, readdir } from "node:fs/promises";
import { createServer } from "node:net";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fromCrossJSON, toJSONAsync } from "seroval";

// This smoke check talks only to its own loopback Node process. It neither
// follows redirects nor loads fonts, external URLs, browser scripts or models.
const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const startFile = fileURLToPath(new URL("./start-cloud.mjs", import.meta.url));
const preloadFile = fileURLToPath(new URL("./no-outbound-fetch.mjs", import.meta.url));
const outputRoot = new URL("../../.output/server/", import.meta.url);
const READY_MS = 20_000;
const REQUEST_MS = 2_000;
const MAX_BODY_BYTES = 4_000_000;
const PAGE_PATHS = ["/", "/day/1", "/day/10", "/privacy", "/settings"];
const ASSET_PATH = /^\/assets\/[A-Za-z0-9._-]+-[A-Za-z0-9_-]{6,}\.(js|css)$/;
const JAVASCRIPT_TYPE = /^(?:text|application)\/javascript$/;

class SmokeFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
const fail = (code) => {
  throw new SmokeFailure(code);
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const mime = (response) =>
  (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();

function smokePort() {
  const raw = process.env.BFA_SMOKE_PORT ?? "4178";
  if (!/^[1-9][0-9]{3,4}$/.test(raw)) fail("invalid-smoke-port");
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1024 || value > 65535) fail("invalid-smoke-port");
  return String(value);
}

async function requireUnusedPort(port) {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    const timer = setTimeout(() => {
      probe.close();
      reject(new SmokeFailure("port-check-deadline"));
    }, 2_000);
    probe.once("error", () => {
      clearTimeout(timer);
      reject(new SmokeFailure("smoke-port-unavailable"));
    });
    probe.listen(Number(port), "127.0.0.1", () => {
      probe.close(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  });
}

async function compiledRpcContract() {
  // Inspect generated metadata without importing an app handler or embedding
  // function hashes. Format changes fail this smoke check for explicit review.
  const files = await readdir(outputRoot);
  const resolvers = files.filter((name) =>
    /tanstack-start-server-fn-resolver-[A-Za-z0-9_-]+\.mjs$/.test(name),
  );
  if (resolvers.length !== 1) fail("rpc-resolver-not-unique");
  const resolverUrl = new URL(resolvers[0], outputRoot);
  const resolver = await readFile(resolverUrl, "utf8");
  const entries = [
    ...resolver.matchAll(
      /"([a-f0-9]{16,128})"\s*:\s*\{\s*functionName:\s*"(getJourneyAiAvailability|generateJourneyAiReflection)_createServerFn_handler",\s*importer:\s*\(\)\s*=>\s*import\("(\.\/_ssr\/journey-ai\.functions-[A-Za-z0-9_-]+\.mjs)"\)/g,
    ),
  ];
  if (entries.length !== 2 || new Set(entries.map((match) => match[2])).size !== 2)
    fail("rpc-handlers-not-found");
  const contract = {};
  for (const [, id, name, importer] of entries) {
    const moduleUrl = new URL(importer, resolverUrl);
    const moduleText = await readFile(moduleUrl, "utf8");
    const method = new RegExp(
      `var ${name} = createServerFn\\(\\{ method: "(GET|POST)" \\}\\)`,
    ).exec(moduleText)?.[1];
    const helper = /from "(\.\/createServerRpc-[A-Za-z0-9_-]+\.mjs)"/.exec(moduleText)?.[1];
    if (!method || !helper) fail("rpc-metadata-format-changed");
    const helperText = await readFile(new URL(helper, moduleUrl), "utf8");
    const base = /const url = "(\/_[A-Za-z0-9_-]+\/)" \+ serverFnMeta\.id/.exec(helperText)?.[1];
    if (!base) fail("rpc-base-not-found");
    contract[name] = { path: `${base}${id}`, method };
  }
  if (
    contract.getJourneyAiAvailability.method !== "GET" ||
    contract.generateJourneyAiReflection.method !== "POST"
  )
    fail("rpc-method-changed");

  const ssrFiles = await readdir(new URL("_ssr/", outputRoot));
  async function builtConstant(prefix, constant) {
    const matches = ssrFiles.filter((name) => name.startsWith(prefix) && name.endsWith(".mjs"));
    if (matches.length !== 1) fail("rpc-consent-module-not-unique");
    const text = await readFile(new URL(`_ssr/${matches[0]}`, outputRoot), "utf8");
    const value = new RegExp(`var ${constant} = "([^"\\r\\n]+)"`).exec(text)?.[1];
    if (!value) fail("rpc-consent-version-not-found");
    return value;
  }
  const fixtures = JSON.parse(
    await readFile(
      new URL("../../docs/pilot/fictional-ai-fixtures.v1.json", import.meta.url),
      "utf8",
    ),
  );
  const fixture = fixtures.validCases?.find((item) => item.id === "d1-overwhelm-off");
  if (!fixture?.request) fail("fictional-smoke-fixture-missing");
  const data = {
    request: fixture.request,
    consent: {
      envelopeVersion: await builtConstant("journey-consent-", "JOURNEY_CONSENT_ENVELOPE_VERSION"),
      disclosureVersion: await builtConstant(
        "journey-disclosure-",
        "JOURNEY_AI_DISCLOSURE_VERSION",
      ),
      accepted: true,
    },
  };
  contract.body = JSON.stringify(await toJSONAsync({ data }));
  return contract;
}

async function boundedText(response) {
  if (!response.body) fail("missing-response-body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0,
    text = "",
    complete = false;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        complete = true;
        break;
      }
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BODY_BYTES) fail("response-body-too-large");
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    if (!complete) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function discoverAssets(html, origin) {
  const result = new Set();
  // Covers src/href attributes and quoted import/modulepreload paths. Every
  // candidate is rechecked after URL parsing before any request is made.
  for (const match of html.matchAll(/["']([^"'<>\s]+\.(?:js|css)(?:\?[^"'<>\s]*)?)["']/g)) {
    let url;
    try {
      url = new URL(match[1], origin);
    } catch {
      continue;
    }
    if (url.origin !== origin || url.search || url.hash || !ASSET_PATH.test(url.pathname)) continue;
    result.add(url.pathname);
  }
  if (result.size > 32) fail("too-many-discovered-assets");
  if (![...result].some((path) => path.endsWith(".js"))) fail("missing-hashed-javascript");
  if (![...result].some((path) => path.endsWith(".css"))) fail("missing-hashed-css");
  return [...result].sort();
}

async function main() {
  const port = smokePort();
  const origin = `http://127.0.0.1:${port}`;
  try {
    await access(startFile);
  } catch {
    fail("missing-cloud-start-script");
  }
  try {
    await access(preloadFile);
  } catch {
    fail("missing-fetch-guard");
  }
  const rpc = await compiledRpcContract();
  // Fail instead of accidentally checking a previously running app on this
  // port. The child exit checks below also catch a startup bind failure.
  await requireUnusedPort(port);

  let child;
  let childExited = false;
  let childExitCode = null;
  let childExitSignal = null;
  let spawnFailed = false;
  let stdoutBytes = 0,
    stderrBytes = 0;
  let guardInstalled = false,
    outboundFetchAttempted = false,
    guardStatus;
  let phase = "startup";
  let result;
  let primaryError;

  // Deliberately do not spread process.env: no credentials, NODE_OPTIONS,
  // proxies, Lovable markers, cloud identities or builder settings are inherited.
  const env = {
    NODE_ENV: "production",
    JOURNEY_AI_ENABLED: "false",
    JOURNEY_AI_RELEASE_READY: "false",
    LIVE_AI_ENABLED: "false",
    HOST: "127.0.0.1",
    PORT: port,
  };
  child = spawn(process.execPath, ["--import", pathToFileURL(preloadFile).href, startFile], {
    cwd: projectRoot,
    env,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  const exited = new Promise((resolve) => {
    child.once("exit", (code, signal) => {
      childExited = true;
      childExitCode = code;
      childExitSignal = signal;
      resolve();
    });
    child.once("error", () => {
      spawnFailed = true;
      childExited = true;
      resolve();
    });
  });
  // Drain output to avoid blocking the child, retaining only byte counts.
  child.stdout.on("data", (chunk) => {
    stdoutBytes += chunk.byteLength;
  });
  child.stderr.on("data", (chunk) => {
    stderrBytes += chunk.byteLength;
  });
  child.on("message", (message) => {
    if (message?.type !== "bfa-smoke-fetch-guard") return;
    if (message.event === "installed") guardInstalled = true;
    if (message.event === "blocked") outboundFetchAttempted = true;
    if (message.event === "status") guardStatus = message;
  });

  async function fetchLocal(path, init = {}) {
    const url = new URL(path, origin);
    if (url.origin !== origin || url.search || url.hash) fail("nonlocal-request-refused");
    return fetch(url, {
      ...init,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_MS),
    });
  }

  async function stop() {
    if (childExited) return;
    child.kill("SIGTERM");
    await waitForExit(3_000);
    if (childExited) return;
    child.kill("SIGKILL");
    await waitForExit(2_000);
    if (!childExited) fail("child-shutdown-unconfirmed");
  }

  async function waitForExit(ms) {
    let timer;
    try {
      await Promise.race([
        exited,
        new Promise((resolve) => {
          timer = setTimeout(resolve, ms);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  const interrupt = () => {
    void stop()
      .then(() => {
        process.stderr.write('{"ok":false,"code":"smoke-interrupted"}\n');
        process.exit(1);
      })
      .catch(() => {
        process.stderr.write('{"ok":false,"code":"child-shutdown-unconfirmed"}\n');
        process.exit(1);
      });
  };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);

  try {
    const deadline = Date.now() + READY_MS;
    let rootResponse;
    while (Date.now() < deadline) {
      if (spawnFailed) fail("child-spawn-failed");
      if (childExited) fail("child-exited-before-ready");
      try {
        rootResponse = await fetchLocal("/");
        break;
      } catch {
        /* Retry only local readiness; no model or external request. */
      }
      await delay(200);
    }
    if (!rootResponse) fail("local-readiness-deadline");
    if (!guardInstalled) fail("fetch-guard-not-installed");

    let rootHtml = "";
    for (const path of PAGE_PATHS) {
      phase = `page:${path}`;
      const response = path === "/" ? rootResponse : await fetchLocal(path);
      if (response.status !== 200) fail("page-status-not-200");
      if (mime(response) !== "text/html") fail("page-mime-not-html");
      const html = await boundedText(response);
      if (!/<html\b/i.test(html)) fail("page-document-missing");
      if (path === "/") rootHtml = html;
    }

    phase = "service-worker";
    const worker = await fetchLocal("/sw.js");
    if (worker.status !== 200 || !JAVASCRIPT_TYPE.test(mime(worker)))
      fail("service-worker-response-invalid");
    await boundedText(worker);

    phase = "manifest";
    // The repository's actual public filename is manifest.json.
    const manifest = await fetchLocal("/manifest.json");
    if (
      manifest.status !== 200 ||
      !["application/manifest+json", "application/json"].includes(mime(manifest))
    )
      fail("manifest-response-invalid");
    let parsedManifest;
    try {
      parsedManifest = JSON.parse(await boundedText(manifest));
    } catch {
      fail("manifest-json-invalid");
    }
    if (parsedManifest?.start_url !== "/" || parsedManifest?.scope !== "/")
      fail("manifest-root-scope-invalid");

    phase = "discover-assets";
    const assets = discoverAssets(rootHtml, origin);
    for (const path of assets) {
      phase = path.endsWith(".js") ? "javascript-asset" : "css-asset";
      const response = await fetchLocal(path);
      if (response.status !== 200) fail("asset-status-not-200");
      if (
        path.endsWith(".js") ? !JAVASCRIPT_TYPE.test(mime(response)) : mime(response) !== "text/css"
      )
        fail("asset-mime-invalid");
      await boundedText(response);
    }

    for (const [name, field] of [
      ["getJourneyAiAvailability", "available"],
      ["generateJourneyAiReflection", "ok"],
    ]) {
      phase = name === "getJourneyAiAvailability" ? "availability-rpc" : "generation-rpc";
      const fn = rpc[name];
      const headers = {
        "x-tsr-serverFn": "true",
        accept: "application/json",
        origin,
        "sec-fetch-site": "same-origin",
      };
      if (fn.method === "POST") headers["content-type"] = "application/json";
      const response = await fetchLocal(fn.path, {
        method: fn.method,
        headers,
        ...(fn.method === "POST" ? { body: rpc.body } : {}),
      });
      if (
        response.status !== 200 ||
        mime(response) !== "application/json" ||
        response.headers.get("x-tss-serialized") !== "true"
      )
        fail("rpc-response-invalid");
      let decoded;
      try {
        decoded = fromCrossJSON(JSON.parse(await boundedText(response)), {});
      } catch {
        fail("rpc-response-decode-failed");
      }
      const result = decoded?.result;
      if (
        decoded?.error !== undefined ||
        !result ||
        Object.keys(result).length !== 2 ||
        result[field] !== false ||
        result.code !== "ai-not-activated"
      )
        fail("rpc-ai-off-refusal-missing");
    }

    phase = "fetch-guard-status";
    child.send({ type: "bfa-smoke-fetch-guard-status" });
    const guardDeadline = Date.now() + 1_000;
    while (!guardStatus && !childExited && Date.now() < guardDeadline) await delay(20);
    if (!guardStatus?.installed || !Number.isSafeInteger(guardStatus.attempts))
      fail("fetch-guard-status-unconfirmed");
    if (guardStatus.attempts !== 0 || outboundFetchAttempted) fail("outbound-fetch-attempted");
    if (childExited) fail("child-exited-during-checks");
    result = {
      ok: true,
      mode: "local-ai-off",
      origin,
      pagesChecked: PAGE_PATHS.length,
      serviceWorker: "/sw.js",
      manifest: "/manifest.json",
      hashedAssetsChecked: assets.length,
      compiledRpcRefusalsChecked: 2,
      childGlobalFetchAttempts: 0,
    };
  } catch (error) {
    primaryError = error instanceof SmokeFailure ? error : new SmokeFailure("local-request-failed");
  } finally {
    try {
      await stop();
    } catch (error) {
      primaryError = error;
      phase = "shutdown";
    }
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
  }

  if (outboundFetchAttempted && !primaryError) {
    primaryError = new SmokeFailure("outbound-fetch-attempted");
    phase = "shutdown";
  }

  if (primaryError) {
    // Never print child logs, HTML, exception text, request headers or bodies.
    process.stderr.write(
      JSON.stringify({
        ok: false,
        code: primaryError instanceof SmokeFailure ? primaryError.code : "smoke-failed",
        phase,
        childExitCode,
        childExitSignal,
        stdoutBytes,
        stderrBytes,
      }) + "\n",
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(JSON.stringify(result) + "\n");
}

main().catch((error) => {
  process.stderr.write(
    JSON.stringify({
      ok: false,
      code: error instanceof SmokeFailure ? error.code : "smoke-failed",
    }) + "\n",
  );
  process.exitCode = 1;
});
