// Actual VoiceControls + service/binding in an isolated fictional browser fixture.
// No app route, real device, credentials, provider transport or external request.
// Run with BFA_PLAYWRIGHT_MODULE and optional BFA_CHROMIUM_EXECUTABLE.
// BFA_UI_CSS supplies generated production CSS for 390px layout checks.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const esbuild = require("esbuild");
const { chromium } = require(process.env.BFA_PLAYWRIGHT_MODULE || "playwright");
const { expect } = require(path.join(process.env.BFA_PLAYWRIGHT_MODULE || "playwright", "test"));

const root = process.cwd();
const out = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), "bfa-voice-controls-"));
fs.mkdirSync(out, { recursive: true });
const css = process.env.BFA_UI_CSS ? fs.readFileSync(process.env.BFA_UI_CSS, "utf8") : "";
const fixture = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConversationService } from '@/lib/ai/conversation/service/service';
import { ConversationVoiceBinding } from '@/lib/ai/conversation/service/voice-service-binding';
import { VoiceControls } from '@/components/conversation-preview/VoiceControls';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function boot() {
  const jobs = [], turns = [], attempts = [], commands = [], cancellations = [], faults = [];
  const settings = { deferCapture: false, deferClose: false, deferMute: false, deferStop: false, failCancel: false };
  const pendingActions = new Set();
  let captureGate = null, closeGate = null, muteGate = null, stopGate = null, publish = () => {}, sequence = 0;
  const service = new ConversationService({ provider: {
    generate(request, signal) {
      const gate = deferred();
      jobs.push({ request, signal, gate });
      // Ignore abort deliberately: the real service must reject the late reply.
      return gate.promise;
    },
  }});
  await service.ready();
  service.ensureThread('a', false);
  service.ensureThread('b', false);
  // Explicit one-shot failure seam: the provider has no cancel() method.
  // Every successful call delegates to the real service cancellation boundary.
  const realCancel = service.cancelThread.bind(service);
  service.cancelThread = (storeId, reason) => {
    cancellations.push({ storeId, reason });
    if (settings.failCancel) { settings.failCancel = false; throw new Error('fictional cancellation failure'); }
    return realCancel(storeId, reason);
  };
  const ports = {
    async admit(attempt) {
      const item = { attempt, acquired: false, connected: false, inputMuted: true,
        closes: { admission: 0, capture: 0, connection: 0, playback: 0 }, muteCalls: [], stops: 0 };
      const close = async name => {
        item.closes[name]++;
        if (name === 'connection' && settings.deferClose) {
          settings.deferClose = false;
          closeGate = deferred();
          await closeGate.promise;
        }
      };
      item.admission = { close: () => close('admission'), revalidate: async () => true };
      item.capture = { close: () => close('capture'), setMuted: async muted => {
        item.muteCalls.push(muted);
        if (settings.deferMute) {
          settings.deferMute = false;
          muteGate = deferred();
          await muteGate.promise;
        }
        item.inputMuted = muted;
      }};
      item.connection = { close: () => close('connection') };
      item.playback = { close: () => close('playback'), stop: async () => {
        item.stops++;
        if (settings.deferStop) { settings.deferStop = false; stopGate = deferred(); await stopGate.promise; }
      } };
      attempts.push(item);
      return item.admission;
    },
    async acquireCapture(attempt) {
      const item = attempts.find(value => value.attempt === attempt);
      item.acquired = true;
      if (settings.deferCapture) {
        settings.deferCapture = false;
        captureGate = { ...deferred(), item };
        return captureGate.promise;
      }
      return { kind: 'granted', capture: item.capture };
    },
    async connect(attempt) {
      const item = attempts.find(value => value.attempt === attempt);
      item.connected = true;
      return { connection: item.connection, playback: item.playback };
    },
  };
  const binding = new ConversationVoiceBinding(service, ports);
  await binding.switchThread('a');
  function invoke(name) {
    commands.push(name);
    pendingActions.add(name);
    const operations = {
      start: () => binding.start(binding.snapshot().storeId),
      mute: () => binding.setMuted(true), unmute: () => binding.setMuted(false),
      'stop-answer': () => binding.stopAnswer(), pause: () => binding.pause(),
      resume: () => binding.resume(), 'finish-talking': () => binding.finishTalking(),
      'type-instead': () => binding.typeInstead(), 'retry-shutdown': () => binding.retryShutdown(),
    };
    let result;
    try { result = operations[name](); }
    catch (error) { faults.push(String(error)); }
    finally { publish(); }
    const finish = () => { pendingActions.delete(name); publish(); };
    Promise.resolve(result).then(finish, error => { faults.push(String(error)); finish(); });
  }
  function Host() {
    const [snapshot, setSnapshot] = useState(() => binding.snapshot());
    publish = () => setSnapshot(binding.snapshot());
    return <main className='mx-auto max-w-2xl p-4'>
      <p>Offline UI fixture. All voice resources and replies are fictional.</p>
      <VoiceControls snapshot={snapshot} pendingActions={[...pendingActions]} onAction={invoke}/>
      <button type='button' id='fixture-other-control'>Fictional separate control</button>
    </main>;
  }
  window.voiceHarness = {
    state: () => ({ snapshot: binding.snapshot(), commands, cancellations, faults, pendingActions: [...pendingActions],
      attempts: attempts.map(item => ({ acquired: item.acquired, connected: item.connected,
        closes: item.closes, muteCalls: item.muteCalls, stops: item.stops, inputMuted: item.inputMuted })),
      jobs: jobs.map(job => ({ aborted: job.signal.aborted })),
      turns: turns.map(turn => ({ storeId: turn.storeId, outcome: turn.outcome, applied: turn.applied })),
      capturePending: !!captureGate, closePending: !!closeGate, mutePending: !!muteGate, stopPending: !!stopGate }),
    configure: options => Object.assign(settings, options),
    resolveCapture: () => {
      if (!captureGate) throw new Error('No deferred capture');
      const gate = captureGate; captureGate = null;
      gate.resolve({ kind: 'granted', capture: gate.item.capture }); publish();
    },
    resolveClose: success => {
      if (!closeGate) throw new Error('No deferred close');
      const gate = closeGate; closeGate = null;
      if (success) gate.resolve(); else gate.reject(new Error('fictional shutdown failure'));
      publish();
    },
    resolveMute: () => {
      if (!muteGate) throw new Error('No deferred mute');
      const gate = muteGate; muteGate = null; gate.resolve(); publish();
    },
    resolveStop: () => {
      if (!stopGate) throw new Error('No deferred playback stop');
      const gate = stopGate; stopGate = null; gate.resolve(); publish();
    },
    switchTo: async storeId => { const result = binding.switchThread(storeId); publish(); await result; publish(); },
    recover: () => { binding.networkRecovered(); publish(); },
    submit: storeId => {
      const turnId = service.admitUserMessage(storeId, 'ui-message-' + ++sequence, 'FICTIONAL_TYPED_MESSAGE', null);
      const turn = { storeId, outcome: null, applied: 0 };
      turns.push(turn);
      service.runTurn(storeId, turnId, { accept: () => true, apply: () => turn.applied++ })
        .then(result => { turn.outcome = result; publish(); });
      publish();
    },
    resolveJob: index => {
      jobs[index].gate.resolve({ text: 'FICTIONAL_LATE_REPLY', sourceIds: [], interpretation: null });
      publish();
    },
  };
  createRoot(document.getElementById('root')).render(<Host/>);
}
boot().catch(error => { window.fixtureBootError = String(error.stack || error); });
`;

async function bundle() {
  const result = await esbuild.build({
    stdin: { contents: fixture, loader: "tsx", resolveDir: root },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    alias: { "@": path.join(root, "src") },
  });
  return (
    '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>' +
    css +
    '</style></head><body><div id="root"></div><script>' +
    result.outputFiles[0].text.replaceAll("</script", "<\\/script") +
    "</script></body></html>"
  );
}

async function main() {
  const html = await bundle();
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.BFA_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.BFA_CHROMIUM_EXECUTABLE }
      : {}),
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  const checks = [],
    focusAfterActions = [],
    errors = [],
    blocked = [];
  let microphoneAttempts = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  await context.addInitScript(() => {
    window.realMicrophoneAttempts = 0;
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: () => {
          window.realMicrophoneAttempts++;
          return Promise.reject(new Error("Real microphone forbidden in local fixture"));
        },
      },
    });
  });
  await context.route("**/*", (route) => {
    if (
      route.request().url() === "http://localhost/__bfa_voice_controls" &&
      route.request().resourceType() === "document"
    )
      return route.fulfill({ status: 200, contentType: "text/html", body: html });
    blocked.push(route.request().url());
    return route.abort();
  });
  await page.routeWebSocket("**/*", (socket) => {
    blocked.push(socket.url());
    socket.close();
  });
  const button = (name) => page.getByRole("button", { name, exact: true });
  const snapshot = () => page.evaluate(() => window.voiceHarness.state());
  const configure = (options) =>
    page.evaluate((value) => window.voiceHarness.configure(value), options);
  const waitState = (state) =>
    page.waitForFunction((value) => window.voiceHarness.state().snapshot.state === value, state);
  const reset = async () => {
    const previous = await page.evaluate(() => window.voiceHarness?.state());
    if (previous) assert.deepEqual(previous.faults, []);
    microphoneAttempts += await page.evaluate(() => window.realMicrophoneAttempts || 0);
    assert.equal(microphoneAttempts, 0);
    await page.goto("http://localhost/__bfa_voice_controls");
    await page.waitForFunction(() => window.voiceHarness || window.fixtureBootError);
    assert.equal(await page.evaluate(() => window.fixtureBootError), undefined);
    await button("Start voice").waitFor();
  };
  const status = () => page.getByRole("status");
  const recordFocus = async (action) => {
    await page.waitForFunction(() => window.voiceHarness.state().pendingActions.length === 0);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
    focusAfterActions.push(
      await page.evaluate((action) => {
        const element = document.activeElement;
        return {
          action,
          tag: element?.tagName,
          role: element?.getAttribute("role"),
          label: element?.tagName === "BODY" ? null : element?.textContent,
          disabled: element?.matches(":disabled"),
        };
      }, action),
    );
    if (focusAfterActions.at(-1).role === "status") {
      await expect(status()).toHaveAttribute("aria-atomic", "true");
      await page.keyboard.press("Tab");
      await expect(
        page
          .getByRole("group", { name: "Voice actions" })
          .locator("button:not([disabled])")
          .first(),
      ).toBeFocused();
    }
  };
  const noPrivateAssurance = async () => {
    assert.equal((await snapshot()).snapshot.privatePracticeAvailable, false);
    await expect(status()).not.toContainText("Private practice is available");
  };
  const unsafeDisabled = async () => {
    for (const name of ["Start voice", "Resume voice"]) await expect(button(name)).toBeDisabled();
    await expect(page.getByRole("button", { name: /^(Mute|Unmute)$/ })).toBeDisabled();
    await noPrivateAssurance();
  };
  const start = async () => {
    await button("Start voice").click();
    await waitState("active");
  };
  const submit = async (storeId, expectedJobs) => {
    await page.evaluate((value) => window.voiceHarness.submit(value), storeId);
    await page.waitForFunction(
      (count) => window.voiceHarness.state().jobs.length === count,
      expectedJobs,
    );
  };
  const mobile = async (name) => {
    if (!css) return;
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      true,
    );
    const bounds = await status().boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 391);
    for (const control of await page.getByRole("button").all()) {
      const box = await control.boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= 391);
    }
    await page.screenshot({ path: path.join(out, name + "-390px.png"), fullPage: true });
    checks.push(name + ": status and controls fit 390px with no horizontal overflow");
  };
  let failure = null;
  try {
    await reset();
    assert.equal((await snapshot()).attempts.length, 0);
    await page.evaluate(() => window.voiceHarness.recover());
    assert.equal((await snapshot()).attempts.length, 0);
    checks.push("construction and network recovery do not acquire resources");
    await page.keyboard.press("Tab");
    await expect(button("Start voice")).toBeFocused();
    await page.keyboard.press("Enter");
    await waitState("active");
    await expect(button("Mute")).toBeEnabled();
    assert.equal((await snapshot()).attempts.length, 1);
    checks.push("keyboard Start opens one fictional resource attempt");
    await recordFocus("Start");

    await configure({ deferMute: true });
    await button("Mute").focus();
    await page.keyboard.press("Space");
    await page.waitForFunction(() => window.voiceHarness.state().mutePending);
    assert.equal((await snapshot()).snapshot.inputChangePending, true);
    await expect(status()).toContainText("Changing microphone input");
    await expect(page.getByRole("button", { name: /^(Mute|Unmute)$/ })).toBeDisabled();
    for (const name of ["Stop answer", "Pause voice", "Finish talking", "Type instead"])
      await expect(button(name)).toBeEnabled();
    await noPrivateAssurance();
    checks.push("pending Mute shows input changing and preserves cancellation actions");
    await page.evaluate(() => window.voiceHarness.resolveMute());
    await page.waitForFunction(() => !window.voiceHarness.state().snapshot.inputChangePending);
    await expect(button("Unmute")).toBeEnabled();
    assert.equal((await snapshot()).attempts[0].inputMuted, true);
    await button("Unmute").focus();
    await page.keyboard.press("Enter");
    await expect(button("Mute")).toBeEnabled();
    assert.equal((await snapshot()).attempts[0].inputMuted, false);
    checks.push("confirmed Mute and keyboard Unmute alter input without closing the session");

    await submit("a", 1);
    await configure({ deferStop: true });
    await button("Stop answer").click();
    await page.waitForFunction(() => window.voiceHarness.state().jobs[0].aborted);
    assert.equal((await snapshot()).snapshot.state, "active");
    assert.equal((await snapshot()).attempts[0].stops, 1);
    await page.waitForFunction(() => window.voiceHarness.state().stopPending);
    await expect(button("Mute")).toBeEnabled();
    await button("Mute").click();
    await expect(button("Unmute")).toBeEnabled();
    assert.equal((await snapshot()).attempts[0].inputMuted, true);
    await page.evaluate(() => window.voiceHarness.resolveStop());
    await expect(button("Stop answer")).toBeEnabled();
    checks.push("Mute remains independently available while playback Stop is pending");
    assert.deepEqual((await snapshot()).attempts[0].closes, {
      admission: 0,
      capture: 0,
      connection: 0,
      playback: 0,
    });
    await page.evaluate(() => window.voiceHarness.resolveJob(0));
    await page.waitForFunction(() => window.voiceHarness.state().turns[0].outcome === "stale");
    assert.equal((await snapshot()).turns[0].applied, 0);
    checks.push("Stop answer fences a real service turn and playback while leaving voice open");
    await mobile("active");
    await button("Pause voice").click();
    await waitState("paused");
    assert.equal((await snapshot()).snapshot.privatePracticeAvailable, true);
    await expect(button("Resume voice")).toBeEnabled();
    assert.deepEqual((await snapshot()).attempts[0].closes, {
      admission: 1,
      capture: 1,
      connection: 1,
      playback: 1,
    });
    await page.evaluate(() => window.voiceHarness.recover());
    assert.equal((await snapshot()).attempts.length, 1);
    checks.push("Pause closes four resources; recovery does not automatically resume");
    await recordFocus("Pause");
    await button("Resume voice").focus();
    await page.keyboard.press("Space");
    await waitState("active");
    assert.equal((await snapshot()).attempts.length, 2);
    checks.push("keyboard Resume requires a fresh explicit resource attempt");
    await recordFocus("Resume");
    await button("Finish talking").click();
    await waitState("ended");
    await expect(button("Start voice")).toBeEnabled();
    await expect(button("Resume voice")).toBeDisabled();
    await noPrivateAssurance();
    checks.push("Finish ends voice and offers Start rather than Resume");
    await start();
    await button("Type instead").click();
    await waitState("ended");
    assert.deepEqual((await snapshot()).attempts[2].closes, {
      admission: 1,
      capture: 1,
      connection: 1,
      playback: 1,
    });
    await noPrivateAssurance();
    checks.push("Type instead closes voice and retains no private-practice assurance");

    await reset();
    await configure({ deferCapture: true });
    await button("Start voice").click();
    await page.waitForFunction(() => window.voiceHarness.state().capturePending);
    await waitState("starting");
    for (const name of ["Pause voice", "Finish talking", "Type instead"])
      await expect(button(name)).toBeEnabled();
    await button("Pause voice").click();
    await waitState("stopping");
    await unsafeDisabled();
    assert.equal((await snapshot()).snapshot.acquisitionPending, true);
    checks.push(
      "Pause during pending acquisition immediately blocks unsafe actions and reassurance",
    );
    await page.evaluate(() => window.voiceHarness.resolveCapture());
    await waitState("paused");
    assert.equal((await snapshot()).attempts[0].connected, false);
    assert.equal((await snapshot()).attempts[0].closes.capture, 1);
    assert.equal((await snapshot()).snapshot.privatePracticeAvailable, true);
    await expect(button("Resume voice")).toBeEnabled();
    checks.push("late capture after Pause is closed without connecting or restarting");

    await reset();
    await configure({ deferCapture: true });
    await button("Start voice").click();
    await page.waitForFunction(() => window.voiceHarness.state().capturePending);
    await button("Fictional separate control").click();
    await page.evaluate(() => window.voiceHarness.resolveCapture());
    await waitState("active");
    await page.waitForFunction(() => window.voiceHarness.state().pendingActions.length === 0);
    await expect(button("Fictional separate control")).toBeFocused();
    checks.push("late Start completion preserves focus after the user moves to another control");

    await reset();
    await start();
    await configure({ deferClose: true });
    await button("Pause voice").click();
    await page.waitForFunction(() => window.voiceHarness.state().closePending);
    await unsafeDisabled();
    await expect(status()).toContainText(/closing|stopping|shutdown/i);
    checks.push("unconfirmed close cannot advertise private practice or permit Start/Mute/Resume");
    await page.evaluate(() => window.voiceHarness.resolveClose(false));
    await waitState("failed");
    await unsafeDisabled();
    await expect(button("Retry shutdown")).toBeEnabled();
    await expect(status()).toContainText(/could not|unconfirmed|not confirmed/i);
    await mobile("shutdown-failed");
    const attemptsBefore = (await snapshot()).attempts.length;
    await page.evaluate(() => window.voiceHarness.recover());
    assert.equal((await snapshot()).attempts[0].closes.connection, 1);
    checks.push("failed close remains visible and recovery does not retry it");
    await button("Type instead").click();
    await waitState("failed");
    await unsafeDisabled();
    assert.equal((await snapshot()).attempts[0].closes.connection, 1);
    checks.push("Type instead cannot erase a failed shutdown or silently retry the resource");
    await configure({ deferClose: true });
    await button("Retry shutdown").focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.voiceHarness.state().closePending);
    await unsafeDisabled();
    await page.evaluate(() => window.voiceHarness.resolveClose(true));
    await waitState("ended");
    assert.equal((await snapshot()).attempts.length, attemptsBefore);
    assert.equal((await snapshot()).attempts[0].closes.connection, 2);
    await noPrivateAssurance();
    checks.push("explicit keyboard Retry closes only failed resource without acquiring voice");
    await recordFocus("Retry");

    await reset();
    await start();
    await submit("a", 1);
    await configure({ failCancel: true });
    await button("Stop answer").click();
    await waitState("failed");
    assert.equal((await snapshot()).snapshot.cancellationUnconfirmed, true);
    assert.equal((await snapshot()).jobs[0].aborted, false);
    await unsafeDisabled();
    await expect(status()).toContainText(/cancel|work|shutdown/i);
    await expect(button("Retry shutdown")).toBeEnabled();
    const failedCalls = (await snapshot()).cancellations.length;
    await page.evaluate(() => window.voiceHarness.recover());
    assert.equal((await snapshot()).cancellations.length, failedCalls);
    checks.push("failed work cancellation stays uncertain without automatic retry");
    await button("Retry shutdown").click();
    await page.waitForFunction(() => window.voiceHarness.state().snapshot.cleanupComplete);
    assert.equal((await snapshot()).jobs[0].aborted, true);
    await page.evaluate(() => window.voiceHarness.resolveJob(0));
    await page.waitForFunction(() => window.voiceHarness.state().turns[0].outcome === "stale");
    assert.equal((await snapshot()).turns[0].applied, 0);
    checks.push(
      "Retry after cancellation fault invokes real fence and rejects the late service reply",
    );

    await reset();
    await start();
    await page.evaluate(() => window.voiceHarness.switchTo("b"));
    assert.equal((await snapshot()).snapshot.selectedThreadId, "bfa-thread-b");
    assert.equal((await snapshot()).snapshot.threadId, "bfa-thread-a");
    await expect(button("Start voice")).toBeEnabled();
    await expect(button("Resume voice")).toBeDisabled();
    await expect(button("Mute")).toBeDisabled();
    await noPrivateAssurance();
    assert.equal((await snapshot()).attempts.length, 1);
    checks.push("selecting B keeps old attempt A closed and cannot offer its Resume/Mute");
    await submit("a", 1);
    await submit("b", 2);
    await button("Stop answer").click();
    await page.waitForFunction(() => window.voiceHarness.state().jobs[1].aborted);
    assert.equal((await snapshot()).jobs[0].aborted, false);
    await page.evaluate(() => {
      window.voiceHarness.resolveJob(0);
      window.voiceHarness.resolveJob(1);
    });
    await page.waitForFunction(() =>
      window.voiceHarness.state().turns.every((turn) => turn.outcome),
    );
    assert.deepEqual(
      (await snapshot()).turns.map((turn) => [turn.storeId, turn.outcome, turn.applied]),
      [
        ["a", "committed", 1],
        ["b", "stale", 0],
      ],
    );
    checks.push("Stop after selection fences B typed work while independent A work remains valid");
    await start();
    assert.equal((await snapshot()).snapshot.threadId, "bfa-thread-b");
    assert.equal((await snapshot()).attempts.length, 2);
    checks.push("selected B voice starts only after its own explicit Start");

    assert.deepEqual((await snapshot()).faults, []);
    assert.equal(
      focusAfterActions.every((focus) => focus.tag !== "BODY" && !focus.disabled),
      true,
      "Action completion must retain focus on a surviving enabled control or status",
    );
    checks.push(
      "Start/Pause/Resume/Retry retain usable focus and status fallback supports onward Tab",
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(blocked, []);
    microphoneAttempts += await page.evaluate(() => window.realMicrophoneAttempts || 0);
    assert.equal(microphoneAttempts, 0);
  } catch (error) {
    failure = String(error.stack || error);
    failure +=
      "\nFixture: " + JSON.stringify(await page.evaluate(() => window.voiceHarness?.state()));
    await page.screenshot({ path: path.join(out, "failure.png"), fullPage: true });
  } finally {
    const result = {
      status: failure ? "FAILED" : "PASSED",
      count: checks.length,
      checks,
      focusAfterActions,
      pageErrors: errors,
      blockedRequests: blocked,
      realProviderCalls: 0,
      microphoneAttempts,
      browserVersion: browser.version(),
      viewport: { width: 390, height: 844 },
      styled: !!css,
      scope:
        "Real React component and service/binding with deferred fictional resource/provider doubles; not device, authenticated staging, screen-reader or live voice acceptance.",
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
