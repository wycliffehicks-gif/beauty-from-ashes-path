// Real React/Radix components with fictional local doubles and blocked transport.
// No application route, credential, microphone or provider is used.
// Run from repository root:
// BFA_PLAYWRIGHT_MODULE=/path/to/playwright node scripts/conversation-ui/check-focus.cjs /tmp/bfa-ui-focus
// Optional BFA_CHROMIUM_EXECUTABLE points to an installed Chromium executable.
// BFA_UI_CSS may point to the generated production styles for layout spot checks.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const esbuild = require("esbuild");
const { chromium } = require(process.env.BFA_PLAYWRIGHT_MODULE || "playwright");
const { expect } = require(path.join(process.env.BFA_PLAYWRIGHT_MODULE || "playwright", "test"));

const root = process.cwd();
const out = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), "bfa-ui-focus-"));
fs.mkdirSync(out, { recursive: true });
const css = process.env.BFA_UI_CSS ? fs.readFileSync(process.env.BFA_UI_CSS, "utf8") : "";
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
    checks = [];
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
  const pending = (action) =>
    page.waitForFunction((a) => window.p3bHarness.pending().some((p) => p.action === a), action);
  const resolve = (value) => page.evaluate((v) => window.p3bHarness.resolve(v), value);
  const stagedNew = async () => {
    await page.goto("http://localhost/__bfa_focus_staging");
    await page.getByRole("button", { name: "New conversation", exact: true }).click();
    await pending("create");
    await resolve(active());
    await page.getByLabel("Fictional message", { exact: true }).fill("KEEP_FICTIONAL_DRAFT");
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
      scope:
        "Actual Chromium React/Radix keyboard behavior against local fictional doubles; not physical device, assistive technology, authenticated staging or live voice acceptance.",
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
