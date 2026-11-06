// Real React/Radix components with fictional local doubles and blocked transport.
// No application route, credential, microphone or provider is used.
// Run from repository root:
// BFA_PLAYWRIGHT_MODULE=/path/to/playwright node scripts/conversation-ui/check-focus.cjs /tmp/bfa-ui-focus
// Optional BFA_CHROMIUM_EXECUTABLE points to an installed Chromium executable.
// BFA_UI_CSS is required: generated production CSS for layout/media assertions.
// Enlargement is controlled root/body font sizing, not browser text zoom or WCAG acceptance.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const esbuild = require("esbuild");
const { createHash } = require("node:crypto");
const { chromium } = require(process.env.BFA_PLAYWRIGHT_MODULE || "playwright");
const { expect } = require(path.join(process.env.BFA_PLAYWRIGHT_MODULE || "playwright", "test"));

const root = process.cwd();
const out = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), "bfa-ui-focus-"));
fs.mkdirSync(out, { recursive: true });
const cssPath = process.env.BFA_UI_CSS ? path.resolve(process.env.BFA_UI_CSS) : null;
assert.ok(cssPath, "BFA_UI_CSS must identify generated production CSS for accessibility checks");
const css = fs.readFileSync(cssPath, "utf8");
assert.ok(css.trim(), "Generated production CSS must not be empty");
const cssSha256 = createHash("sha256").update(css).digest("hex");
fs.copyFileSync(cssPath, path.join(out, "production.css"));
const previewMocks = `
import React from 'react';
export const readPrefs = () => ({ showSpiritual: false });
export const APP_CLEAR_EVENT = 'bfa-app-clear';
export const useJourneyProgress = () => ({ progress: { locator: null, completedDays: [] } });
export const hasMeaningfulProgress = () => false;
export const Link = ({ children }) => React.createElement('a', { href: '#fixture-journey' }, children);
`;

async function bundle(kind) {
  const staging = kind === "staging";
  const modulePath = staging
    ? "conversation-staging/StagingConsole"
    : "conversation-preview/ConversationPreview";
  const component = staging ? "StagingConsole" : "ConversationPreview";
  const contents = `import React from 'react'; import { createRoot } from 'react-dom/client';
import { ${component} } from '${root}/src/components/${modulePath}';
${
  staging
    ? ""
    : `import { useConversationPreview } from '${root}/src/lib/ai/conversation/preview/store';
function Harness() { const { store } = useConversationPreview(); window.previewHarness = { store }; return <ConversationPreview/>; }`
}
createRoot(document.getElementById('root')).render(<${staging ? component : "Harness"}/>);`;
  const result = await esbuild.build({
    stdin: { contents, loader: "jsx", resolveDir: root },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    alias: {
      "@": path.join(root, "src"),
      ...(staging
        ? {
            "@tanstack/react-start": path.join(root, "scripts/p3b/ui-mocks.ts"),
            "@/integrations/supabase/client": path.join(root, "scripts/p3b/ui-mocks.ts"),
            "@/lib/prefs": path.join(root, "scripts/p3b/ui-mocks.ts"),
            "@/lib/ai/conversation/staging/staging.functions": path.join(
              root,
              "scripts/p3b/ui-mocks.ts",
            ),
          }
        : {}),
    },
    plugins: staging
      ? []
      : [
          {
            name: "fictional-local-ui-only",
            setup(build) {
              build.onResolve(
                { filter: /^(@tanstack\/react-router|@\/lib\/prefs|@\/lib\/journey\/progress)$/ },
                (args) => ({ path: args.path, namespace: "ui-fixtures" }),
              );
              build.onLoad({ filter: /.*/, namespace: "ui-fixtures" }, () => ({
                contents: previewMocks,
                loader: "js",
                resolveDir: root,
              }));
            },
          },
        ],
  });
  return (
    '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>' +
    css +
    '</style></head><body><div id="root"></div><script>' +
    result.outputFiles[0].text.replaceAll("</script", "<\\/script") +
    "</script></body></html>"
  );
}

const active = (patch = {}) => ({
  kind: "active",
  thread: "A",
  revision: 0,
  token: "synthetic-local-state",
  saved: false,
  microphone: "off",
  inspection: { preferenceOn: false, events: [], restrictions: [], derived: [], lastRequest: null },
  ...patch,
});

async function main() {
  const html = { staging: await bundle("staging"), preview: await bundle("preview") };
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.BFA_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.BFA_CHROMIUM_EXECUTABLE }
      : {}),
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  const errors = [],
    blocked = [],
    checks = [],
    accessibilityObservations = [],
    accessibilityFailures = [],
    forbiddenCalls = [];
  let currentMode = null;
  let previewClockInstalled = false;
  page.on("console", (message) => {
    const prefix = "BFA_OFFLINE_FORBIDDEN:";
    if (message.text().startsWith(prefix)) forbiddenCalls.push(message.text().slice(prefix.length));
  });
  await context.addInitScript(() => {
    const denied = (kind) => {
      console.warn("BFA_OFFLINE_FORBIDDEN:" + kind);
      throw new Error("Real " + kind + " forbidden in local UI fixture");
    };
    window.fetch = () => denied("fetch");
    window.WebSocket = class {
      constructor() {
        denied("WebSocket");
      }
    };
    window.RTCPeerConnection = class {
      constructor() {
        denied("RTCPeerConnection");
      }
    };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: () => denied("microphone"),
        getDisplayMedia: () => denied("display-capture"),
      },
    });
  });
  await page.routeWebSocket("**/*", (socket) => {
    blocked.push(socket.url());
    socket.close();
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await context.route("**/*", (route) => {
    const kind =
      route.request().url() === "http://localhost/__bfa_focus_staging"
        ? "staging"
        : route.request().url() === "http://localhost/__bfa_focus_preview"
          ? "preview"
          : null;
    if (kind && route.request().resourceType() === "document")
      return route.fulfill({ status: 200, contentType: "text/html", body: html[kind] });
    blocked.push(route.request().url());
    return route.abort();
  });
  const focused = async (locator) => {
    await expect(locator).toBeFocused({ timeout: 6000 });
  };
  const mobilePage = async (name) => {
    if (!css) return;
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      true,
    );
    checks.push(`${name}: 390px viewport has no horizontal overflow`);
  };
  const mobileDialog = async (name, dialog, cancelName = "Cancel") => {
    if (!css) return;
    await expect(dialog).toHaveCSS("opacity", "1");
    for (const locator of [dialog, dialog.getByRole("button", { name: cancelName, exact: true })]) {
      await expect(locator).toBeVisible();
      await expect
        .poll(() =>
          locator.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            return (
              bounds.width > 0 &&
              bounds.height > 0 &&
              bounds.left >= -1 &&
              bounds.top >= -1 &&
              bounds.right <= window.innerWidth + 1 &&
              bounds.bottom <= window.innerHeight + 1
            );
          }),
        )
        .toBe(true);
    }
    await page.screenshot({ path: path.join(out, `${name}-390px-dialog.png`) });
    checks.push(`${name}: dialog and ${cancelName} fit within 390x844 viewport`);
  };
  const fontSamples = () =>
    page.evaluate(() => {
      const font = (selector) => {
        const node = document.querySelector(selector);
        return node ? Number.parseFloat(getComputedStyle(node).fontSize) : null;
      };
      return {
        root: font("html"),
        body: font("body"),
        heading: font("h1"),
        paragraph: font("main p"),
        button: font("main button"),
        composer: font("#staging-message, #preview-composer"),
        visualViewportScale: window.visualViewport?.scale ?? null,
      };
    });
  const applyMode = async (fixture) => {
    if (!currentMode) return;
    const before = await fontSamples();
    if (currentMode.enlarge)
      await page.evaluate(
        ({ rootFont, bodyFont }) => {
          document.documentElement.style.setProperty("font-size", `${rootFont * 2}px`, "important");
          document.body.style.setProperty("font-size", `${bodyFont * 2}px`, "important");
        },
        { rootFont: before.root, bodyFont: before.body },
      );
    const after = await fontSamples();
    const media = await page.evaluate(() => ({
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      forcedColors: matchMedia("(forced-colors: active)").matches,
      width: innerWidth,
      height: innerHeight,
    }));
    accessibilityObservations.push({
      mode: currentMode.name,
      fixture,
      kind: "fonts-and-media",
      before,
      after,
      media,
    });
    assert.equal(
      after.visualViewportScale,
      1,
      "Controlled font sizing must not be reported as viewport/pinch zoom",
    );
    assert.equal(media.reducedMotion, currentMode.reducedMotion === "reduce");
    assert.equal(media.forcedColors, currentMode.forcedColors === "active");
    assert.deepEqual([media.width, media.height], [390, 844]);
    if (currentMode.enlarge)
      for (const key of ["root", "body", "heading", "button", "composer"]) {
        assert.ok(before[key] > 0, `${fixture} ${key} baseline font exists`);
        assert.ok(
          Math.abs(after[key] - before[key] * 2) <= 0.1,
          `${fixture} ${key} doubles under controlled root/body sizing`,
        );
      }
  };
  const keyboardReach = async (locator, label) => {
    await expect(locator).toBeEnabled();
    let found = false;
    for (let i = 0; i < 100; i++) {
      await page.keyboard.press("Tab");
      if (await locator.evaluate((element) => document.activeElement === element)) {
        found = true;
        break;
      }
    }
    assert.ok(found, `${label} is reachable through sequential keyboard Tab navigation`);
    await focused(locator);
    const observation = await locator.evaluate((element) => {
      const rect = element.getBoundingClientRect(),
        style = getComputedStyle(element);
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return {
        bounds: {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
        width: innerWidth,
        height: innerHeight,
        hit: hit === element || element.contains(hit),
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
        focusVisible: element.matches(":focus-visible"),
        color: style.color,
        background: style.backgroundColor,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        outlineColor: style.outlineColor,
        borderColor: style.borderColor,
        borderWidth: style.borderWidth,
        boxShadow: style.boxShadow,
        forcedColorAdjust: style.forcedColorAdjust,
      };
    });
    accessibilityObservations.push({
      mode: currentMode?.name,
      kind: "keyboard-control",
      label,
      ...observation,
    });
    const r = observation.bounds;
    assert.ok(
      r.width > 0 &&
        r.height > 0 &&
        r.left >= -1 &&
        r.right <= observation.width + 1 &&
        r.top >= -1 &&
        r.bottom <= observation.height + 1 &&
        observation.hit,
      `${label} is visible and unobscured after keyboard scrolling`,
    );
    assert.ok(
      observation.scrollWidth <= observation.clientWidth + 1 &&
        observation.scrollHeight <= observation.clientHeight + 1,
      `${label} text is not clipped inside its control`,
    );
    if (currentMode?.forcedColors === "active") {
      assert.ok(observation.focusVisible, `${label} has keyboard focus-visible state`);
      assert.ok(
        observation.outlineStyle !== "none" &&
          Number.parseFloat(observation.outlineWidth) > 0 &&
          observation.outlineColor !== "transparent" &&
          observation.outlineColor !== "rgba(0, 0, 0, 0)" &&
          observation.outlineColor !== observation.background,
        `${label} retains a visible outline when forced colours suppress shadow rings`,
      );
      assert.equal(observation.forcedColorAdjust, "auto");
    }
  };
  const pageLayout = async (label) => {
    const observation = await page.evaluate(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflow: [...document.querySelectorAll("main button, main textarea, main h1, main p")]
        .filter(
          (element) =>
            element.getBoundingClientRect().right > innerWidth + 1 ||
            element.getBoundingClientRect().left < -1,
        )
        .map((element) => ({
          tag: element.tagName,
          text: element.textContent?.slice(0, 120),
          left: element.getBoundingClientRect().left,
          right: element.getBoundingClientRect().right,
        })),
    }));
    accessibilityObservations.push({
      mode: currentMode.name,
      kind: "page-layout",
      label,
      ...observation,
    });
    assert.ok(
      observation.scrollWidth <= observation.width + 1,
      `${label} has no horizontal page overflow`,
    );
  };
  const dialogEvidence = async (dialog, label) => {
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS("opacity", "1");
    const observation = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect(),
        style = getComputedStyle(element);
      const durations = (value) =>
        value
          .split(",")
          .map((item) => Number.parseFloat(item) * (item.trim().endsWith("ms") ? 1 : 1000));
      return {
        bounds: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
        width: innerWidth,
        height: innerHeight,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        animationName: style.animationName,
        animationMs: durations(style.animationDuration),
        transitionMs: durations(style.transitionDuration),
        animations: element.getAnimations({ subtree: true }).map((animation) => ({
          state: animation.playState,
          duration: animation.effect?.getTiming().duration,
        })),
      };
    });
    accessibilityObservations.push({
      mode: currentMode.name,
      kind: "dialog-style",
      label,
      ...observation,
    });
    const r = observation.bounds;
    assert.ok(
      r.left >= -1 &&
        r.right <= observation.width + 1 &&
        r.top >= -1 &&
        r.bottom <= observation.height + 1,
      `${label} fits the narrow viewport; tall content needs usable internal scrolling`,
    );
    assert.ok(
      observation.scrollWidth <= observation.clientWidth + 1,
      `${label} does not clip text horizontally`,
    );
    if (currentMode.reducedMotion === "reduce") {
      assert.ok(
        [...observation.animationMs, ...observation.transitionMs].every(
          (duration) => duration <= 0.01,
        ),
        `${label} respects the existing reduced-motion duration rule`,
      );
      assert.ok(
        observation.animations.every(
          (animation) => animation.state !== "running" || Number(animation.duration) <= 0.01,
        ),
        `${label} has no continuing substantial animation in reduced-motion mode`,
      );
    }
    const count = await dialog
      .locator("button:enabled, a[href], input:not(:disabled), textarea:not(:disabled)")
      .count();
    for (const direction of ["Tab", "Shift+Tab"])
      for (let i = 0; i < count + 2; i++) {
        await page.keyboard.press(direction);
        assert.ok(
          await dialog.evaluate((element) => element.contains(document.activeElement)),
          `${label} contains ${direction} focus`,
        );
      }
  };
  const probe = async (name, operation) => {
    const id = `${currentMode.name}-${name}`;
    try {
      await operation();
      checks.push(`${id}: actual keyboard, media/style and draft assertions`);
      await page.screenshot({ path: path.join(out, `${id}.png`), fullPage: true });
    } catch (error) {
      accessibilityFailures.push({
        name: id,
        failure: String(error.stack || error),
        activeElement: await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 1000)),
      });
      await page.screenshot({ path: path.join(out, `${id}-failure.png`), fullPage: true });
    }
  };
  const pending = (action) =>
    page.waitForFunction((a) => window.p3bHarness.pending().some((p) => p.action === a), action);
  const resolve = (value) => page.evaluate((v) => window.p3bHarness.resolve(v), value);
  const stagedNew = async () => {
    await page.goto("http://localhost/__bfa_focus_staging");
    await page.getByRole("button", { name: "New conversation", exact: true }).click();
    await pending("create");
    await resolve(active());
    await page.getByLabel("Fictional message", { exact: true }).fill("KEEP_FICTIONAL_DRAFT");
    await applyMode("staging");
  };
  const previewNew = async () => {
    await page.goto("http://localhost/__bfa_focus_preview");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Start conversation", exact: true }).click();
    await page
      .getByLabel("Your message (use fictional test text)", { exact: true })
      .fill("A fictional test message.");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page
      .getByRole("button", { name: "Save conversation (simulated)", exact: true })
      .waitFor();
    await page.waitForFunction(
      () =>
        !window.previewHarness.store.hasPendingResponse(window.previewHarness.store.activeThread()),
    );
    await applyMode("preview");
  };
  let failure = null;
  try {
    for (const action of ["Delete", "Discard"]) {
      for (const close of ["Escape", "Cancel"]) {
        await stagedNew();
        if (action === "Delete" && close === "Escape") await mobilePage("staging");
        const opener = page.getByRole("button", { name: action, exact: true });
        await opener.click();
        const dialog = page.getByRole("dialog");
        await focused(dialog.getByRole("button", { name: "Cancel", exact: true }));
        if (action === "Delete" && close === "Escape") await mobileDialog("staging", dialog);
        if (close === "Escape") await page.keyboard.press("Escape");
        else await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
        await focused(opener);
        assert.equal(
          await page.getByLabel("Fictional message", { exact: true }).inputValue(),
          "KEEP_FICTIONAL_DRAFT",
        );
        assert.deepEqual(await page.evaluate(() => window.p3bHarness.calls.map((c) => c.action)), [
          "create",
        ]);
        checks.push(`staging ${action}: initial Cancel and ${close} restores opener`);
      }
    }
    for (const close of ["Escape", "Cancel"]) {
      await stagedNew();
      const opener = page.getByRole("button", { name: "New conversation", exact: true });
      await opener.click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      if (close === "Escape") await page.keyboard.press("Escape");
      else await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await focused(opener);
      assert.equal(
        await page.getByLabel("Fictional message", { exact: true }).inputValue(),
        "KEEP_FICTIONAL_DRAFT",
      );
      checks.push(`staging navigation: ${close} restores opener and draft`);
    }
    await stagedNew();
    await page.getByRole("button", { name: "Send fictional message", exact: true }).click();
    await pending("append");
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    const deletion = page.getByRole("dialog");
    await focused(deletion.getByRole("button", { name: "Cancel", exact: true }));
    assert.equal(
      await deletion.getByRole("button", { name: "Confirm delete", exact: true }).isEnabled(),
      true,
    );
    await deletion.getByRole("button", { name: "Confirm delete", exact: true }).click();
    await pending("delete");
    await resolve(active({ revision: 1 }));
    await resolve({ kind: "deleted", thread: "A", revision: 1 });
    await focused(
      page.getByRole("heading", { name: "Fictional staging conversation", exact: true }),
    );
    assert.equal(await page.getByLabel("Fictional message", { exact: true }).count(), 0);
    checks.push(
      "staging Delete during pending append stays usable, old reply fenced, focus uses surviving heading",
    );

    await previewNew();
    const composer = page.getByLabel("Your message (use fictional test text)", { exact: true });
    await composer.fill("UNSENT_FICTIONAL_DRAFT");
    const finish = page.getByRole("button", { name: "Finish conversation", exact: true });
    await mobilePage("preview");
    await finish.click();
    await page.getByRole("alertdialog").waitFor();
    await mobileDialog("preview", page.getByRole("alertdialog"), "Keep working");
    await page.keyboard.press("Escape");
    await focused(finish);
    assert.equal(await composer.inputValue(), "UNSENT_FICTIONAL_DRAFT");
    checks.push("preview Finish Escape restores opener and draft");
    const fresh = page.getByRole("button", { name: "New conversation", exact: true });
    await fresh.click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await focused(fresh);
    assert.equal(await composer.inputValue(), "UNSENT_FICTIONAL_DRAFT");
    checks.push("preview switch Cancel restores opener and draft");

    const chooser = page.getByRole("button", { name: "Choose teaching to share", exact: true });
    await chooser.click();
    await page.getByRole("button", { name: /^Day 1 ·/ }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await focused(chooser);
    checks.push("preview source Cancel uses stable chooser after source button unmounts");

    await composer.fill("");
    await page.getByRole("button", { name: "Save conversation (simulated)", exact: true }).click();
    await page.getByRole("button", { name: "Finish conversation", exact: true }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Save & finish (simulated)", exact: true })
      .click();
    await focused(page.getByRole("heading", { name: "Conversation preview", exact: true }));
    checks.push("preview confirmed Finish focuses surviving start heading");

    await page.getByRole("button", { name: "Rename", exact: true }).click();
    const rename = page.getByLabel("Rename conversation", { exact: true });
    const originalTitle = await rename.inputValue();
    await rename.fill("   ");
    await page.getByRole("button", { name: "Save name", exact: true }).click();
    assert.equal(await page.getByRole("alert").innerText(), "Enter a conversation name.");
    assert.equal(await rename.getAttribute("aria-invalid"), "true");
    const errorId = await rename.getAttribute("aria-describedby");
    assert.equal(await page.locator(`[id="${errorId}"]`).innerText(), "Enter a conversation name.");
    assert.equal(
      await page.evaluate(() => window.previewHarness.store.getSnapshot().threads[0].title),
      originalTitle,
    );
    checks.push("preview blank rename has accurate associated error and preserves saved title");
    await page.evaluate(() => window.previewHarness.store.setSimulateSaveFailure(true));
    await rename.fill("A fictional renamed conversation");
    await page.getByRole("button", { name: "Save name", exact: true }).click();
    assert.equal(
      await page.getByRole("alert").innerText(),
      "Name not saved (simulated failure). Nothing changed.",
    );
    assert.equal(
      await page.evaluate(() => window.previewHarness.store.getSnapshot().threads[0].title),
      originalTitle,
    );
    checks.push("preview simulated rename failure remains distinct and preserves saved title");
    await page.evaluate(() => window.previewHarness.store.setSimulateSaveFailure(false));
    await page.getByRole("button", { name: "Save name", exact: true }).click();
    assert.equal(await page.getByRole("alert").count(), 0);
    assert.equal(await page.getByLabel("Rename conversation", { exact: true }).count(), 0);
    assert.equal(
      await page.evaluate(() => window.previewHarness.store.getSnapshot().threads[0].title),
      "A fictional renamed conversation",
    );
    checks.push("preview successful rename clears error");

    const savedDelete = page.getByRole("button", { name: "Delete", exact: true });
    await savedDelete.click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await focused(savedDelete);
    checks.push("preview saved Delete Cancel restores opener");
    await savedDelete.click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await focused(page.getByRole("heading", { name: "Conversation preview", exact: true }));
    checks.push("preview confirmed saved Delete focuses surviving heading");
    for (const mode of [
      {
        name: "controlled-font-200",
        enlarge: true,
        reducedMotion: "no-preference",
        forcedColors: "none",
      },
      { name: "reduced-motion", enlarge: false, reducedMotion: "reduce", forcedColors: "none" },
      {
        name: "forced-colours",
        enlarge: false,
        reducedMotion: "no-preference",
        forcedColors: "active",
      },
    ]) {
      currentMode = mode;
      await page.emulateMedia({
        reducedMotion: mode.reducedMotion,
        forcedColors: mode.forcedColors,
      });
      await probe("staging-delete-cancel", async () => {
        await stagedNew();
        await pageLayout("staging");
        const opener = page.getByRole("button", { name: "Delete", exact: true });
        await keyboardReach(opener, "staging Delete");
        await page.keyboard.press("Enter");
        const dialog = page.getByRole("dialog");
        await focused(dialog.getByRole("button", { name: "Cancel", exact: true }));
        await dialogEvidence(dialog, "staging delete dialog");
        await keyboardReach(
          dialog.getByRole("button", { name: "Cancel", exact: true }),
          "staging Cancel",
        );
        await page.keyboard.press("Escape");
        await focused(opener);
        assert.equal(
          await page.getByLabel("Fictional message", { exact: true }).inputValue(),
          "KEEP_FICTIONAL_DRAFT",
        );
        assert.deepEqual(
          await page.evaluate(() => window.p3bHarness.calls.map((call) => call.action)),
          ["create"],
        );
      });
      await probe("staging-navigation-cancel", async () => {
        await stagedNew();
        const opener = page.getByRole("button", { name: "New conversation", exact: true });
        await keyboardReach(opener, "staging New conversation");
        await page.keyboard.press("Enter");
        const dialog = page.getByRole("dialog");
        await dialogEvidence(dialog, "staging unsaved dialog");
        await keyboardReach(
          dialog.getByRole("button", { name: "Cancel", exact: true }),
          "staging navigation Cancel",
        );
        await page.keyboard.press("Enter");
        await focused(opener);
        assert.equal(
          await page.getByLabel("Fictional message", { exact: true }).inputValue(),
          "KEEP_FICTIONAL_DRAFT",
        );
        assert.deepEqual(
          await page.evaluate(() => window.p3bHarness.calls.map((call) => call.action)),
          ["create"],
        );
      });
      await probe("staging-pending-stop", async () => {
        await stagedNew();
        await keyboardReach(
          page.getByRole("button", { name: "Send fictional message", exact: true }),
          "staging Send",
        );
        await page.keyboard.press("Enter");
        await pending("append");
        await keyboardReach(
          page.getByRole("button", { name: "Stop", exact: true }),
          "staging Stop during pending append",
        );
        await page.keyboard.press("Enter");
        await pending("cancel");
        await resolve(active({ revision: 1 }));
        await resolve({ kind: "stopped", thread: "A", revision: 1 });
        await expect(
          page.getByText(
            "Stopped. Unsaved changes were not recovered. Reopen only a confirmed saved snapshot.",
            { exact: true },
          ),
        ).toBeVisible();
        assert.deepEqual(
          await page.evaluate(() => window.p3bHarness.calls.map((call) => call.action)),
          ["create", "append", "cancel"],
        );
      });
      await probe("preview-finish-keep", async () => {
        await previewNew();
        await pageLayout("preview");
        const composer = page.getByLabel("Your message (use fictional test text)", { exact: true });
        await composer.fill("UNSENT_FICTIONAL_DRAFT");
        const opener = page.getByRole("button", { name: "Finish conversation", exact: true });
        await keyboardReach(opener, "preview Finish");
        await page.keyboard.press("Enter");
        const dialog = page.getByRole("alertdialog");
        await dialogEvidence(dialog, "preview finish dialog");
        await keyboardReach(
          dialog.getByRole("button", { name: "Keep working", exact: true }),
          "preview Keep working",
        );
        await page.keyboard.press("Enter");
        await focused(opener);
        assert.equal(await composer.inputValue(), "UNSENT_FICTIONAL_DRAFT");
      });
      await probe("preview-switch-cancel", async () => {
        await previewNew();
        const composer = page.getByLabel("Your message (use fictional test text)", { exact: true });
        await composer.fill("UNSENT_FICTIONAL_DRAFT");
        const opener = page.getByRole("button", { name: "New conversation", exact: true });
        await keyboardReach(opener, "preview New conversation");
        await page.keyboard.press("Enter");
        const dialog = page.getByRole("alertdialog");
        await dialogEvidence(dialog, "preview switch dialog");
        await keyboardReach(
          dialog.getByRole("button", { name: "Cancel", exact: true }),
          "preview Cancel",
        );
        await page.keyboard.press("Escape");
        await focused(opener);
        assert.equal(await composer.inputValue(), "UNSENT_FICTIONAL_DRAFT");
      });
      await probe("preview-retry-stop", async () => {
        await previewNew();
        const composer = page.getByLabel("Your message (use fictional test text)", { exact: true });
        await page.evaluate(() => window.previewHarness.store.setSimulateSendFailure(true));
        await composer.fill("ORIGINAL_FICTIONAL_FAILED_MESSAGE");
        await keyboardReach(
          page.getByRole("button", { name: "Send", exact: true }),
          "preview Send",
        );
        await page.keyboard.press("Enter");
        const retry = page.getByRole("button", { name: "Retry send", exact: true });
        await expect(retry).toBeVisible();
        await composer.fill("NEWER_FICTIONAL_DRAFT");
        await keyboardReach(retry, "preview Retry send");
        // Hold only this fictional pending-response interval so keyboard traversal
        // cannot race a canned reply. This is not application timing acceptance.
        if (!previewClockInstalled) {
          await page.clock.install({ time: new Date("2026-11-06T12:00:00Z") });
          previewClockInstalled = true;
        }
        await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
        try {
          await page.evaluate(() => window.previewHarness.store.setSimulateSendFailure(false));
          await page.keyboard.press("Enter");
          const stop = page.getByRole("button", { name: "Stop response", exact: true });
          await expect(stop).toBeVisible();
          assert.equal(await composer.inputValue(), "NEWER_FICTIONAL_DRAFT");
          await keyboardReach(stop, "preview Stop response");
          await page.keyboard.press("Enter");
          await expect(stop).toHaveCount(0);
          assert.equal(await composer.inputValue(), "NEWER_FICTIONAL_DRAFT");
        } finally {
          await page.clock.resume();
        }
      });
      if (mode.forcedColors === "active")
        await probe("staging-switch-focus", async () => {
          await stagedNew();
          const toggle = page.getByRole("switch", { name: "Christian content", exact: true });
          await keyboardReach(toggle, "staging Christian-content switch");
          const styles = await toggle.evaluate((element) => {
            const track = getComputedStyle(element),
              thumb = getComputedStyle(element.querySelector("span"));
            return {
              trackBackground: track.backgroundColor,
              trackBorder: track.borderColor,
              thumbBackground: thumb.backgroundColor,
              thumbBorder: thumb.borderColor,
              thumbBorderWidth: thumb.borderWidth,
              thumbShadow: thumb.boxShadow,
              checked: element.getAttribute("aria-checked"),
            };
          });
          accessibilityObservations.push({ mode: mode.name, kind: "switch-appearance", ...styles });
          assert.equal(styles.checked, "false");
          assert.ok(
            styles.thumbBackground !== styles.trackBackground ||
              (Number.parseFloat(styles.thumbBorderWidth) > 0 &&
                styles.thumbBorder !== styles.thumbBackground),
            "Forced-colour switch thumb remains distinguishable from its track without relying on a shadow",
          );
        });
    }
    assert.deepEqual(accessibilityFailures, [], "All accessibility mode probes must pass");
    assert.deepEqual(forbiddenCalls, []);
    assert.deepEqual(errors, []);
    assert.deepEqual(blocked, []);
  } catch (error) {
    failure = String(error.stack || error);
    failure +=
      "\nActive element: " +
      (await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 1000)));
    await page.screenshot({ path: path.join(out, "failure.png"), fullPage: true });
  } finally {
    const result = {
      status: failure ? "FAILED" : "PASSED",
      checks,
      count: checks.length,
      pageErrors: errors,
      blockedRequests: blocked,
      realProviderCalls: 0,
      forbiddenCalls,
      accessibilityObservations,
      accessibilityFailures,
      enlargementMethod:
        "Controlled computed root and body font sizes doubled in the fixture; visualViewport.scale remains 1; not native browser text zoom or WCAG conformance.",
      cssPath,
      cssSha256,
      scope:
        "Actual Chromium React/Radix keyboard and emulated-media behavior against local fictional doubles, with controlled root/body fonts and a paused fictional reply timer; not native text zoom, WCAG conformance, physical device, assistive technology, authenticated staging or live voice acceptance.",
      styled: !!css,
      ...(failure ? { failure } : {}),
    };
    fs.writeFileSync(path.join(out, "result.json"), JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify(result, null, 2));
    await browser.close();
  }
  if (failure) process.exitCode = 1;
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
