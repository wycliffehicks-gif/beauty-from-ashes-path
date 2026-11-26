// Actual preview/service with fictional mock voice and controlled callbacks.
// Rendered controls prove ordering; coordinate/browser evidence is separate.
// No microphone, live provider, persistence or real voice acceptance.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConversationPreview } from "@/components/conversation-preview/ConversationPreview";
import { ConversationPreviewStore } from "../preview/store";
import { createMockProvider } from "../service/mock-provider";
import { ConversationService } from "../service/service";

const projection = vi.hoisted(() => ({ read: null as null | (() => unknown) }));
vi.mock("../preview/store", async (original) => ({
  ...(await original<typeof import("../preview/store")>()),
  useConversationPreview: () => projection.read!(),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/lib/journey/progress", () => ({
  useJourneyProgress: () => ({ progress: { locator: null, completedDays: [] } }),
  hasMeaningfulProgress: () => false,
}));

afterEach(() => {
  projection.read = null;
});

async function harness() {
  const callbacks: Array<() => void> = [];
  const dispatch = vi.fn();
  const service = new ConversationService({
    provider: createMockProvider({ onDispatch: dispatch }),
  });
  await service.ready();
  const store = new ConversationPreviewStore({
    service,
    schedule: (fn) => callbacks.push(fn),
    readSpiritualPreference: () => false,
    nowIso: () => "2026-11-26T12:00:00.000Z",
  });
  (store as unknown as { ensureBrowserInit(): void }).ensureBrowserInit = () => {};
  (store as unknown as { state: object }).state = { ...store.getSnapshot(), hydrated: true };
  store.acknowledgeIntro();
  store.createThread();
  store.setDraft("KEEP_SYNTHETIC_TYPED_DRAFT");
  projection.read = () => ({ state: store.getSnapshot(), store });
  const step = () => {
    expect(callbacks.length).toBeGreaterThan(0);
    callbacks.shift()!();
  };
  const flush = () => {
    while (callbacks.length) callbacks.shift()!();
  };
  const connecting = (resume: boolean) => {
    store.startTalking();
    if (resume) {
      step();
      expect(service.voice.state).toBe("active");
      store.pauseVoice();
      step();
      expect(service.voice.state).toBe("paused");
      store.resumeVoice();
    }
    expect(store.getSnapshot().voice).toBe("connecting");
    expect(service.voice.state).toBe("idle");
  };
  const assertFinished = () => {
    expect(store.getSnapshot()).toMatchObject({ voice: "off", voiceMuted: false });
    expect(service.voice).toMatchObject({
      state: "idle",
      sessionId: null,
      capture: "closed",
      transport: "closed",
      muted: false,
    });
    expect(store.activeDraft()).toBe("KEEP_SYNTHETIC_TYPED_DRAFT");
    expect(store.activeThread()!.messages).toEqual([]);
    expect(dispatch).not.toHaveBeenCalled();
  };
  return { store, service, callbacks, dispatch, step, flush, connecting, assertFinished };
}

function voiceButtons() {
  const markup = renderToStaticMarkup(createElement(ConversationPreview));
  const panel = markup.slice(markup.indexOf("Voice — state simulator only"));
  // End before the separately labelled developer fixtures; these are the
  // real rendered primary controls, not a parallel state/layout model.
  const controls = panel.slice(0, panel.indexOf("Finish talking") + "Finish talking".length + 9);
  return [...controls.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((match) =>
    match[1].replace(/<[^>]*>/g, "").trim(),
  );
}

describe("preview Finish talking through a simulated connection transition", () => {
  for (const resume of [false, true]) {
    const action = resume ? "Resume" : "Talk";
    it(`${action}: Finish during Connecting fences its pending timer and preserves the typed draft`, async () => {
      const h = await harness();
      h.connecting(resume);
      const threadId = h.store.activeThread()!.id;
      h.store.finishTalking();
      h.assertFinished();
      h.flush();
      h.assertFinished();
      expect(h.store.activeThread()!.id).toBe(threadId);
    });

    it(`${action}: the rendered Finish control keeps its place when Mute becomes available`, async () => {
      const h = await harness();
      h.connecting(resume);
      const connecting = voiceButtons();
      const finishIndex = connecting.indexOf("Finish talking");
      expect(finishIndex).toBeGreaterThanOrEqual(0);
      h.step();
      expect(h.store.getSnapshot().voice).toBe("listening");
      const listening = voiceButtons();
      expect(listening[finishIndex]).toBe("Finish talking");
      expect(listening.slice(0, finishIndex)).toEqual(connecting.slice(0, finishIndex));
    });

    it(`${action}: the finished connection timer cannot advance or close a later deliberate session`, async () => {
      const h = await harness();
      h.connecting(resume);
      h.store.finishTalking();
      h.store.startTalking();
      h.step(); // Old connecting callback must not open the new session early.
      expect(h.store.getSnapshot().voice).toBe("connecting");
      expect(h.service.voice.state).toBe("idle");
      h.step();
      const currentSession = h.service.voice.sessionId;
      expect(currentSession).not.toBeNull();
      expect(h.store.getSnapshot()).toMatchObject({ voice: "listening", voiceMuted: false });
      expect(h.service.voice).toMatchObject({
        state: "active",
        capture: "open",
        transport: "open",
      });
      h.flush();
      expect(h.service.voice.sessionId).toBe(currentSession);
      expect(h.store.activeDraft()).toBe("KEEP_SYNTHETIC_TYPED_DRAFT");
      h.store.finishTalking();
      h.assertFinished();
    });
  }

  it("Finish during pending Pause cannot let its late shutdown close a later session", async () => {
    const h = await harness();
    h.store.startTalking();
    h.step();
    const oldSession = h.service.voice.sessionId;
    h.store.pauseVoice();
    expect(h.store.getSnapshot().voice).toBe("pausing");
    h.store.finishTalking();
    h.assertFinished();
    h.store.startTalking();
    const stalePause = h.callbacks.shift()!;
    h.step();
    const currentSession = h.service.voice.sessionId;
    expect(currentSession).not.toBe(oldSession);
    stalePause();
    expect(h.service.voice.sessionId).toBe(currentSession);
    expect(h.store.getSnapshot()).toMatchObject({ voice: "listening", voiceMuted: false });
    expect(h.service.voice.state).toBe("active");
    h.store.finishTalking();
    h.assertFinished();
  });
});
