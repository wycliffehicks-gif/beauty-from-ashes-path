// Local controller/service regression only: fictional mock responses, no
// browser, live provider, persistence or real voice acceptance.
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConversationPreviewStore } from "../preview/store";
import { createMockProvider, type MockProviderRequest } from "../service/mock-provider";
import { ConversationService } from "../service/service";

const REPORT = "I came home yesterday and couldn't talk to anyone.";
const DRAFT = "SYNTHETIC_DISCARDED_COMPOSER";
const EXCERPT = "SYNTHETIC_CONFIRMED_EXCERPT_TO_DISCARD";

afterEach(() => vi.restoreAllMocks());

async function harness(withService: boolean) {
  const scheduled: Array<() => void> = [];
  const providerResponses: Array<() => void> = [];
  const requests: MockProviderRequest[] = [];
  const turns: Array<ReturnType<ConversationService["runTurn"]>> = [];
  const service = withService
    ? new ConversationService({
        provider: createMockProvider({
          // Deliberately permit a cancelled request to resolve. The real
          // service/store must reject its late completion themselves.
          ignoreAbort: true,
          schedule: (fn) => providerResponses.push(fn),
          onDispatch: (request) => requests.push(request),
        }),
      })
    : undefined;
  if (service) {
    await service.ready();
    const run = service.runTurn.bind(service);
    vi.spyOn(service, "runTurn").mockImplementation((...args) => {
      const turn = run(...args);
      turns.push(turn);
      return turn;
    });
  }
  const store = new ConversationPreviewStore({
    service,
    schedule: (fn) => scheduled.push(fn),
    readSpiritualPreference: () => false,
    nowIso: () => "2026-11-06T12:00:00.000Z",
  });
  // Match the established Node store fixtures; no browser hydration is run.
  (store as unknown as { ensureBrowserInit(): void }).ensureBrowserInit = () => {};
  (store as unknown as { state: object }).state = {
    ...store.getSnapshot(),
    hydrated: true,
  };
  const flushScheduled = () => {
    while (scheduled.length) scheduled.shift()!();
  };
  const dispatch = async () => {
    flushScheduled();
    if (service) {
      await expect.poll(() => providerResponses.length).toBe(1);
    }
  };
  const release = async () => {
    while (providerResponses.length) providerResponses.shift()!();
    await Promise.all(turns);
  };
  const send = async (text: string) => {
    store.setDraft(text);
    expect(store.sendDraft()).toEqual({ ok: true });
    await dispatch();
    await release();
    expect(store.activeThread()!.messages.at(-1)!.status).toBe("sent");
  };
  return { store, service, requests, dispatch, release, send, flushScheduled };
}

/** Include live Maps/Sets, but not detached requests retained by this fixture. */
function serviceContents(service: ConversationService) {
  return JSON.stringify(service, (_key, value) => {
    if (value instanceof Map) return [...value.entries()];
    if (value instanceof Set) return [...value];
    return value;
  });
}

async function savedTargets(h: Awaited<ReturnType<typeof harness>>) {
  const unrelated = h.store.createThread();
  await h.send("SYNTHETIC_UNRELATED_SAVED");
  expect(h.store.saveActiveThread("Unrelated saved conversation").ok).toBe(true);
  expect(h.store.requestSwitch({ kind: "new" }).ok).toBe(true);
  const target = h.store.activeThread()!;
  await h.send("SYNTHETIC_SAVED_DESTINATION");
  expect(h.store.saveActiveThread("Saved destination").ok).toBe(true);
  const snapshots = [unrelated.id, target.id].map((id) => ({
    id,
    saved: h.store.getSnapshot().threads.find((t) => t.id === id)!.savedSnapshot,
    service: h.service?.inspect(id),
    binding: h.service?.getThreadLifecycleBinding(id),
  }));
  expect(h.store.requestSwitch({ kind: "new" }).ok).toBe(true);
  return { target, snapshots };
}

describe("discarding a never-saved conversation while switching", () => {
  for (const targetKind of ["new", "saved"] as const) {
    for (const stage of ["completed", "scheduled", "in-flight"] as const) {
      it(`purges the actual service at ${stage} before switching to ${targetKind}`, async () => {
        const h = await harness(true);
        const { target, snapshots } = await savedTargets(h);
        const discarded = h.store.activeThread()!;
        const binding = h.service!.getThreadLifecycleBinding(discarded.id)!;
        h.store.setDraft(REPORT);
        expect(h.store.sendDraft().ok).toBe(true);
        if (stage !== "scheduled") await h.dispatch();
        if (stage === "completed") await h.release();
        expect(h.service!.inspect(discarded.id)!.derived.length).toBeGreaterThan(0);
        // Synthetic already-confirmed service selection, not private-writing
        // retrieval or a change to the preview's sharing surface.
        h.service!.recordSharedExcerpt(
          discarded.id,
          "synthetic-excerpt-message",
          EXCERPT,
          "synthetic-revision",
          new Date().toISOString(),
        );
        h.store.setDraft(DRAFT);
        const requestCount = h.requests.length;
        const next =
          targetKind === "new"
            ? ({ kind: "new" } as const)
            : ({ kind: "open", threadId: target.id } as const);
        expect(h.store.requestSwitch(next)).toEqual({ ok: false, reason: "needs-decision" });
        expect(h.store.resolveSwitchDecision("discard")).toEqual({ ok: true });

        // Resolve queued/ignoring-abort work even after deliberate discard.
        h.flushScheduled();
        await h.release();
        const active = h.store.activeThread()!;
        expect(active.id).not.toBe(discarded.id);
        if (targetKind === "saved") expect(active.id).toBe(target.id);
        else expect(active.messages).toEqual([]);
        expect(h.store.getSnapshot()).toMatchObject({
          draft: "",
          draftThreadId: active.id,
          pendingSwitch: null,
          pendingTranscript: null,
          voice: "off",
        });
        expect(h.store.getSnapshot().threads.some((t) => t.id === discarded.id)).toBe(false);
        expect(h.service!.inspect(discarded.id)).toBeNull();
        expect(binding.isCurrent()).toBe(false);
        expect(h.service!.getThreadLifecycleBinding(discarded.id)).toBeNull();
        expect(() => h.service!.exportAuthority(discarded.id)).toThrow("Unavailable");
        expect(h.service!.openThread(discarded.id)).toBe(false);
        expect(h.store.requestSwitch({ kind: "open", threadId: discarded.id })).toEqual({
          ok: false,
          reason: "unknown-thread",
        });
        expect(h.requests).toHaveLength(requestCount);
        for (const snapshot of snapshots) {
          expect(
            h.store.getSnapshot().threads.find((t) => t.id === snapshot.id)!.savedSnapshot,
          ).toBe(snapshot.saved);
          expect(h.service!.inspect(snapshot.id)).toEqual(snapshot.service);
          expect(snapshot.binding!.isCurrent()).toBe(true);
        }
        for (const removed of [REPORT, DRAFT, EXCERPT]) {
          expect(JSON.stringify(h.store.getSnapshot())).not.toContain(removed);
          expect(serviceContents(h.service!)).not.toContain(removed);
        }
        await h.send("SYNTHETIC_FRESH_DESTINATION_TURN");
        const freshRequest = JSON.stringify(h.requests.at(-1));
        for (const removed of [REPORT, DRAFT, EXCERPT, "SYNTHETIC_UNRELATED_SAVED"]) {
          expect(freshRequest).not.toContain(removed);
        }
        expect(freshRequest.includes("SYNTHETIC_SAVED_DESTINATION")).toBe(targetKind === "saved");
      });
    }

    for (const stage of ["completed", "scheduled", "draft-only"] as const) {
      it(`removes the no-service ${stage} thread before switching to ${targetKind}`, async () => {
        const h = await harness(false);
        const { target, snapshots } = await savedTargets(h);
        const discarded = h.store.activeThread()!;
        if (stage !== "draft-only") {
          h.store.setDraft(REPORT);
          expect(h.store.sendDraft().ok).toBe(true);
          if (stage === "completed") h.flushScheduled();
        }
        h.store.setDraft(DRAFT);
        expect(
          h.store.requestSwitch(
            targetKind === "new" ? { kind: "new" } : { kind: "open", threadId: target.id },
          ).ok,
        ).toBe(false);
        expect(h.store.resolveSwitchDecision("discard")).toEqual({ ok: true });
        h.flushScheduled();
        const active = h.store.activeThread()!;
        if (targetKind === "saved") expect(active.id).toBe(target.id);
        else expect(active.messages).toEqual([]);
        expect(h.store.getSnapshot()).toMatchObject({
          draft: "",
          draftThreadId: active.id,
          pendingSwitch: null,
          pendingTranscript: null,
          voice: "off",
        });
        expect(h.store.getSnapshot().threads.some((t) => t.id === discarded.id)).toBe(false);
        expect(h.store.requestSwitch({ kind: "open", threadId: discarded.id })).toEqual({
          ok: false,
          reason: "unknown-thread",
        });
        for (const removed of [REPORT, DRAFT]) {
          expect(JSON.stringify(h.store.getSnapshot())).not.toContain(removed);
        }
        for (const snapshot of snapshots) {
          expect(
            h.store.getSnapshot().threads.find((t) => t.id === snapshot.id)!.savedSnapshot,
          ).toBe(snapshot.saved);
        }
      });
    }
  }
});

describe.each([false, true])("switch decisions with service=%s", (withService) => {
  it("restores the saved snapshot instead of deleting a previously saved thread", async () => {
    const h = await harness(withService);
    const original = h.store.createThread();
    await h.send("SYNTHETIC_KEPT_SAVED_TURN");
    expect(h.store.saveActiveThread("Original saved title").ok).toBe(true);
    const saved = h.store.activeThread()!.savedSnapshot;
    const savedEvents = h.service?.inspect(original.id)!.events;
    const binding = h.service?.getThreadLifecycleBinding(original.id);
    await h.send(REPORT);
    h.store.renameActiveThread("Unsaved title");
    h.store.setDraft(DRAFT);
    expect(h.store.requestSwitch({ kind: "new" }).ok).toBe(false);
    expect(h.store.resolveSwitchDecision("discard")).toEqual({ ok: true });
    expect(h.store.requestSwitch({ kind: "open", threadId: original.id })).toEqual({ ok: true });
    expect(h.store.activeThread()).toMatchObject({
      title: "Original saved title",
      messages: saved!.messages,
      dirty: false,
    });
    expect(h.store.activeThread()!.savedSnapshot).toBe(saved);
    expect(h.store.activeDraft()).toBe("");
    if (h.service) {
      expect(h.service.inspect(original.id)!.events).toEqual(savedEvents);
      expect(binding!.isCurrent()).toBe(true);
      expect(serviceContents(h.service)).not.toContain(REPORT);
    }
  });

  it("Cancel preserves the exact draft and pending turn, which can still complete", async () => {
    const h = await harness(withService);
    h.store.createThread();
    h.store.setDraft(REPORT);
    expect(h.store.sendDraft().ok).toBe(true);
    h.store.setDraft(DRAFT);
    const before = h.store.getSnapshot();
    const serviceBefore = h.service?.exportAuthority(h.store.activeThread()!.id);
    expect(h.store.requestSwitch({ kind: "new" }).ok).toBe(false);
    expect(h.store.resolveSwitchDecision("cancel")).toEqual({ ok: true });
    expect(h.store.getSnapshot()).toEqual(before);
    expect(h.service?.exportAuthority(h.store.activeThread()!.id)).toEqual(serviceBefore);
    await h.dispatch();
    await h.release();
    expect(h.store.activeThread()!.messages.at(-1)!.status).toBe("sent");
    expect(h.store.activeDraft()).toBe(DRAFT);
  });

  it("Save refuses draft, pending reply and failed save before a deliberate successful switch", async () => {
    const h = await harness(withService);
    const original = h.store.createThread();
    h.store.setDraft(REPORT);
    expect(h.store.sendDraft().ok).toBe(true);
    h.store.setDraft(DRAFT);
    expect(h.store.requestSwitch({ kind: "new" }).ok).toBe(false);
    const withDraft = h.store.getSnapshot();
    expect(h.store.resolveSwitchDecision("save")).toEqual({ ok: false, reason: "unsent-draft" });
    expect(h.store.getSnapshot()).toBe(withDraft);
    h.store.setDraft("");
    const pending = h.store.getSnapshot();
    expect(h.store.resolveSwitchDecision("save")).toEqual({
      ok: false,
      reason: "response-pending",
    });
    expect(h.store.getSnapshot()).toBe(pending);
    await h.dispatch();
    await h.release();
    h.store.setSimulateSaveFailure(true);
    const failed = h.store.getSnapshot();
    expect(h.store.resolveSwitchDecision("save")).toEqual({ ok: false, reason: "save-failed" });
    expect(h.store.getSnapshot()).toBe(failed);
    h.store.setSimulateSaveFailure(false);
    expect(h.store.resolveSwitchDecision("save")).toEqual({ ok: true });
    expect(h.store.activeThread()!.id).not.toBe(original.id);
    const kept = h.store.getSnapshot().threads.find((t) => t.id === original.id)!;
    expect(kept.savedSnapshot!.messages).toEqual(kept.messages);
    expect(kept.messages[0].text).toBe(REPORT);
    if (h.service) expect(h.service.inspect(original.id)!.saved!.eventCount).toBe(2);
  });
});
