import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Controlled hooks execute the actual controller, with deferred server results.
// No browser package, provider, credential or network is involved.
const h = vi.hoisted(() => {
  const state = { slots: [] as any[], index: 0, effects: [] as Array<() => void>, dirty: false,
    generate: vi.fn(), availability: vi.fn() };
  const equal = (a: any[], b: any[]) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const hooks = {
    useState(initial: any) { const i = state.index++; if (!(i in state.slots)) state.slots[i] = typeof initial === "function" ? initial() : initial; return [state.slots[i], (v: any) => { const next = typeof v === "function" ? v(state.slots[i]) : v; if (!Object.is(next, state.slots[i])) { state.slots[i] = next; state.dirty = true; } }]; },
    useRef(initial: any) { const i = state.index++; return state.slots[i] ?? (state.slots[i] = { current: initial }); },
    useMemo(fn: () => any, deps: any[]) { const i = state.index++; if (!state.slots[i] || !equal(state.slots[i].deps, deps)) state.slots[i] = { deps, value: fn() }; return state.slots[i].value; },
    useCallback(fn: () => any, deps: any[]) { return hooks.useMemo(() => fn, deps); },
    useEffect(fn: () => any, deps: any[]) { const i = state.index++; if (!state.slots[i] || !equal(state.slots[i].deps, deps)) { const previous = state.slots[i]; state.slots[i] = { deps }; state.effects.push(() => { previous?.cleanup?.(); state.slots[i].cleanup = fn(); }); } },
  };
  return { state, hooks };
});
vi.mock("react", async importOriginal => ({ ...(await importOriginal<object>()), ...h.hooks }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/ai/journey-ai.functions", () => ({ generateJourneyAiReflection: h.state.generate, getJourneyAiAvailability: h.state.availability }));

import { getFirstJourneyDay } from "@/content/first-journey";
import { dayIdFor } from "@/content/journey";
import { parseJourneyRequest } from "@/lib/ai/journey-contract";
import { prepareJourneyGeneration } from "@/lib/ai/journey-policy";
import { composeJourneyResponseIdentity } from "@/lib/ai/journey-identity";
import { useJourneyAiReflection, JOURNEY_AVAILABILITY_WAIT_MS, JOURNEY_GENERATION_WAIT_MS, type JourneyAiRequestInput } from "@/lib/ai/useJourneyAiReflection";
import { JOURNEY_AI_EVENT, JOURNEY_AI_STORAGE_KEY, JOURNEY_AI_CONSENT_KEY, saveAiReflection, readAiReflection, saveAiMode, clearAllAiReflections, recordAiConsent, resolveSavedAiPresentation } from "@/lib/ai/journey-ai-store";
import { CLEAR_STATUS_EVENT, resetStorageStatusForTests } from "@/lib/storage-status";
import { buildReflectionExport, buildPrintableExport } from "@/lib/journey/export";
import { emptyProgress } from "@/lib/journey/progress";

const disk = new Map<string, string>();
let denyWrite = false;
function input(day = 1, spiritual = false): JourneyAiRequestInput { return { day, spiritual, answers: [], answerMeaningVersion: getFirstJourneyDay(day)!.answerMeaningVersion }; }
function identity(request: JourneyAiRequestInput) { const p = parseJourneyRequest(request); if (!p.ok) throw Error(p.error); return composeJourneyResponseIdentity(prepareJourneyGeneration(p.request).identity, "live-model"); }
function success(request: JourneyAiRequestInput, text = "You may leave what feels unclear unnamed. Nothing more is required.") { return { ok: true as const, text, paragraphs: [text], identity: identity(request) }; }
function save(request: JourneyAiRequestInput, text = "A saved reflection can leave room for what remains unclear.") { return saveAiReflection({ dayId: dayIdFor(request.day), ...success(request, text) }); }
function render(request: JourneyAiRequestInput | null, flush = true) {
  let result: ReturnType<typeof useJourneyAiReflection>;
  let n = 0;
  do {
    h.state.index = 0; h.state.dirty = false;
    result = useJourneyAiReflection(request);
    if (flush) { const effects = h.state.effects.splice(0); effects.forEach(fn => fn()); }
    if (++n > 25) throw Error("Hook failed to settle");
  } while (flush && h.state.dirty);
  return result!;
}
function unmount() { h.state.slots.forEach(slot => slot?.cleanup?.()); h.state.slots = []; h.state.effects = []; }
async function ticks() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
async function mounted(request: JourneyAiRequestInput) { render(request); await ticks(); return render(request); }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; }
function storageClear(key: string | null) { if (key) disk.delete(key); else disk.clear(); const e = new Event("storage"); Object.assign(e, { key, newValue: null }); window.dispatchEvent(e); }

beforeEach(() => {
  unmount(); disk.clear(); denyWrite = false; resetStorageStatusForTests(); h.state.generate.mockReset(); h.state.availability.mockReset(); h.state.availability.mockResolvedValue({ available: true });
  const target = new EventTarget();
  Object.assign(target, { localStorage: { getItem: (k: string) => disk.get(k) ?? null, setItem: (k: string, v: string) => { if (denyWrite) throw Error("quota"); disk.set(k, v); }, removeItem: (k: string) => disk.delete(k), key: (i: number) => [...disk.keys()][i] ?? null, get length() { return disk.size; } } });
  vi.stubGlobal("window", target);
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("Network is forbidden in simulated controller checks"); }));
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); unmount(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("exact selected AI cache and export", () => {
  it("uses canonical IDs for every day and retains both spiritual paths", () => {
    for (let day = 1; day <= 10; day++) {
      const on = input(day, true), off = input(day, false);
      expect(save(on, "There can be room for prayer without finding an answer.")).toBe(true);
      expect(save(off)).toBe(true);
      expect(readAiReflection(dayIdFor(day), identity(on).canonicalIdentity)?.text).toContain("prayer");
      expect(readAiReflection(dayIdFor(day), identity(off).canonicalIdentity)).not.toBeNull();
    }
    expect(Object.keys(JSON.parse(disk.get(JOURNEY_AI_STORAGE_KEY)!).byDay)).toHaveLength(10);
    expect(disk.has("bfa.journey.v1")).toBe(false);
  });
  it("revalidates text and ignores separately tampered paragraphs/provenance", () => {
    const request = input(); save(request);
    const stored = JSON.parse(disk.get(JOURNEY_AI_STORAGE_KEY)!);
    stored.byDay["day-01"].off.paragraphs = ["God guarantees healing."];
    disk.set(JOURNEY_AI_STORAGE_KEY, JSON.stringify(stored));
    expect(readAiReflection("day-01", identity(request).canonicalIdentity)?.paragraphs.join(" ")).not.toContain("God");
    stored.byDay["day-01"].off.provenance = "mock"; disk.set(JOURNEY_AI_STORAGE_KEY, JSON.stringify(stored));
    expect(readAiReflection("day-01", identity(request).canonicalIdentity)).toBeNull();
  });
  it("exports exactly the selected saved text and never replaces missing AI with authored text", () => {
    const request = input(), text = "This is the exact AI reflection you already read.";
    save(request, text);
    const progress = { ...emptyProgress, completedDays: ["day-01"] };
    const opts = { hydrated: true, showSpiritual: false };
    expect(buildReflectionExport(progress, opts).text).toContain(text);
    expect(buildPrintableExport(progress, opts).html).toContain(text);
    saveAiMode("day-01", false, "authored");
    expect(buildReflectionExport(progress, opts).text).not.toContain(text);
    clearAllAiReflections(); saveAiMode("day-01", false, "ai");
    const missing = buildReflectionExport(progress, opts);
    expect(missing.text).toContain("No matching AI reflection is saved");
    expect(missing.text).not.toContain("Your reflection:");
    expect(missing.summary.reflectionCount).toBe(0);
  });
  it("keeps the selected mode and exact response in the authoritative failed-write overlay", () => {
    denyWrite = true; const request = input(); expect(save(request)).toBe(false);
    expect(resolveSavedAiPresentation(request)?.stored).not.toBeNull();
    expect(resolveSavedAiPresentation(request)?.mode).toBe("ai");
  });
});

describe("actual controller with controlled hooks and deferred server", () => {
  it("uses server availability, keeps cached output when OFF, and requires recorded consent", async () => {
    h.state.availability.mockResolvedValue({ available: false, code: "ai-not-activated" });
    const request = input(); save(request);
    let ui = await mounted(request);
    expect(ui.available).toBe(false); expect(ui.status).toBe("shown"); expect(ui.ready).toBe(true);
    await ui.generate(); expect(h.state.generate).not.toHaveBeenCalled();
    unmount(); clearAllAiReflections(); h.state.availability.mockResolvedValue({ available: true });
    ui = await mounted(request); await ui.generate();
    expect(h.state.generate).not.toHaveBeenCalled(); expect(render(request).failureMessage).toContain("Please read");
  });
  it("waits for availability and does not persist a default AI mode before a user choice", async () => {
    const request = input();
    expect(render(request).ready).toBe(false);
    await ticks(); const ui = render(request);
    expect(ui.available).toBe(true); expect(ui.mode).toBe("ai");
    expect(resolveSavedAiPresentation(request)?.explicitMode).toBeNull();
    expect(disk.has(JOURNEY_AI_STORAGE_KEY)).toBe(false);
  });
  it("withholds old text synchronously before effects when spiritual mode changes", async () => {
    const on = input(1, true), off = input(1, false); save(on, "Prayer may be left unfinished.");
    await mounted(on); expect(render(off, false).text).toBeNull();
  });
  it("does not display or save a late on-path response after switching off", async () => {
    recordAiConsent(true); const on = input(1, true), off = input(1, false); const d = deferred<ReturnType<typeof success>>(); h.state.generate.mockReturnValue(d.promise);
    const ui = await mounted(on); const running = ui.generate(); await ticks(); render(off);
    d.resolve(success(on, "Prayer may be left unfinished.")); await running;
    expect(render(off).text).toBeNull(); expect(readAiReflection("day-01", identity(on).canonicalIdentity)).toBeNull();
  });
  it.each(["custom clear", "native clear", "consent clear", "clear begins"])("does not resurrect a late result after %s", async kind => {
    recordAiConsent(true); const request = input(); const d = deferred<ReturnType<typeof success>>(); h.state.generate.mockReturnValue(d.promise);
    const ui = await mounted(request); const running = ui.generate(); await ticks();
    if (kind === "custom clear") { clearAllAiReflections(); window.dispatchEvent(new Event(JOURNEY_AI_EVENT)); }
    else if (kind === "clear begins") window.dispatchEvent(new Event(CLEAR_STATUS_EVENT));
    else storageClear(kind === "native clear" ? JOURNEY_AI_STORAGE_KEY : JOURNEY_AI_CONSENT_KEY);
    d.resolve(success(request)); await running;
    expect(render(request).text).toBeNull(); expect(readAiReflection("day-01", identity(request).canonicalIdentity)).toBeNull();
  });
  it("deduplicates repeat presses and same-session remounts without a second paid request", async () => {
    recordAiConsent(true); const request = input(); const d = deferred<ReturnType<typeof success>>(); h.state.generate.mockReturnValue(d.promise);
    const first = await mounted(request); const one = first.generate(); const two = first.generate(); await ticks();
    unmount(); const again = await mounted(request); const three = again.generate(); await ticks();
    expect(h.state.generate).toHaveBeenCalledTimes(1);
    d.resolve(success(request)); await Promise.all([one, two, three]);
    expect(render(request).text).toContain("Nothing more is required");
    expect(h.state.generate).toHaveBeenCalledTimes(1);
  });

  it("settles an unavailable availability check without making a generation request", async () => {
    h.state.availability.mockRejectedValue(new Error("simulated disconnected request"));
    const request = input();
    const ui = await mounted(request);
    expect(ui.availabilityLoading).toBe(false);
    expect(ui.available).toBe(false);
    expect(ui.mode).toBe("authored");
    expect(ui.ready).toBe(true);
    await ui.generate();
    expect(h.state.generate).not.toHaveBeenCalled();
  });

  it("shows timeout failure, retries only on explicit request, and restores the successful saved text", async () => {
    recordAiConsent(true);
    const request = input();
    h.state.generate.mockResolvedValueOnce({ ok: false, code: "provider-timeout" })
      .mockResolvedValueOnce(success(request, "You can leave this reflection unfinished and return when you choose."));
    await (await mounted(request)).generate();
    let ui = render(request);
    expect(ui.status).toBe("failed");
    expect(ui.failureMessage).toContain("check your connection");
    expect(ui.mode).toBe("ai");
    expect(ui.ready).toBe(false);
    expect(ui.text).toBeNull();
    expect(readAiReflection("day-01", identity(request).canonicalIdentity)).toBeNull();
    await ticks(); render(request);
    expect(h.state.generate).toHaveBeenCalledTimes(1);
    await ui.generate();
    ui = render(request);
    expect(ui.status).toBe("shown");
    expect(ui.ready).toBe(true);
    expect(ui.failureMessage).toBeNull();
    expect(ui.text).toContain("leave this reflection unfinished");
    unmount();
    ui = await mounted(request);
    expect(ui.text).toContain("leave this reflection unfinished");
    await ui.generate();
    expect(h.state.generate).toHaveBeenCalledTimes(2);
  });

  it("turns a rejected server call into a generic failure and allows a deliberate retry", async () => {
    recordAiConsent(true);
    const request = input();
    h.state.generate.mockRejectedValueOnce(new Error("PRIVATE SIMULATED ERROR DETAIL"))
      .mockResolvedValueOnce(success(request));
    await (await mounted(request)).generate();
    const failed = render(request);
    expect(failed.status).toBe("failed");
    expect(failed.failureMessage).toContain("check your connection");
    expect(failed.failureMessage).not.toContain("PRIVATE");
    expect(failed.text).toBeNull();
    await failed.generate();
    expect(render(request).status).toBe("shown");
    expect(h.state.generate).toHaveBeenCalledTimes(2);
  });

  it("does not save a late response after the reflection screen unmounts", async () => {
    recordAiConsent(true);
    const request = input(), d = deferred<ReturnType<typeof success>>();
    h.state.generate.mockReturnValue(d.promise);
    const running = (await mounted(request)).generate();
    await ticks();
    expect(render(request).status).toBe("generating");
    unmount();
    d.resolve(success(request)); await running;
    expect(readAiReflection("day-01", identity(request).canonicalIdentity)).toBeNull();
    expect((await mounted(request)).status).toBe("ready");
    expect(h.state.generate).toHaveBeenCalledTimes(1);
  });

  it("keeps the written choice after interruption and does not start a replacement call until the abandoned one settles", async () => {
    recordAiConsent(true);
    const request = input(), d = deferred<ReturnType<typeof success>>();
    h.state.generate.mockReturnValueOnce(d.promise).mockResolvedValueOnce(success(request));
    let ui = await mounted(request);
    const running = ui.generate(); await ticks();
    ui = render(request);
    expect(ui.status).toBe("generating");
    ui.setMode("authored");
    ui = render(request);
    expect(ui.mode).toBe("authored");
    expect(ui.ready).toBe(true);
    ui.setMode("ai");
    await render(request).generate();
    expect(h.state.generate).toHaveBeenCalledTimes(1);
    render(request).setMode("authored");
    d.resolve(success(request)); await running;
    expect(render(request).mode).toBe("authored");
    expect(render(request).text).toBeNull();
    expect(readAiReflection("day-01", identity(request).canonicalIdentity)).toBeNull();
    render(request).setMode("ai");
    await render(request).generate();
    expect(render(request).status).toBe("shown");
    expect(h.state.generate).toHaveBeenCalledTimes(2);
  });

  it("rejects a mismatched response identity without saving or silently using authored text", async () => {
    recordAiConsent(true);
    const request = input();
    h.state.generate.mockResolvedValue(success(input(2)));
    await (await mounted(request)).generate();
    const ui = render(request);
    expect(ui.status).toBe("failed");
    expect(ui.mode).toBe("ai");
    expect(ui.text).toBeNull();
    expect(ui.ready).toBe(false);
    expect(readAiReflection("day-01", identity(request).canonicalIdentity)).toBeNull();
  });

  it("returns to the exact saved faith-on and faith-off responses without regeneration", async () => {
    const on = input(1, true), off = input(1, false);
    save(on, "Prayer may be left unfinished.");
    save(off, "Quiet can be enough for this moment.");
    expect((await mounted(on)).text).toBe("Prayer may be left unfinished.");
    expect(render(off, false).text).toBe("Quiet can be enough for this moment.");
    expect(render(off).text).not.toContain("Prayer");
    expect(render(on).text).toBe("Prayer may be left unfinished.");
    unmount();
    expect((await mounted(off)).text).toBe("Quiet can be enough for this moment.");
    expect(h.state.generate).not.toHaveBeenCalled();
  });

  it("stops waiting for unavailable admission status and ignores a success arriving after the deadline", async () => {
    vi.useFakeTimers();
    const request = input(), d = deferred<{ available: boolean }>();
    h.state.availability.mockReturnValue(d.promise);
    expect((await mounted(request)).availabilityLoading).toBe(true);
    await vi.advanceTimersByTimeAsync(JOURNEY_AVAILABILITY_WAIT_MS);
    const ui = render(request);
    expect(ui.availabilityLoading).toBe(false);
    expect(ui.available).toBe(false);
    expect(ui.mode).toBe("authored");
    expect(ui.ready).toBe(true);
    await ui.generate();
    d.resolve({ available: true }); await ticks();
    expect(render(request).available).toBe(false);
    expect(h.state.generate).not.toHaveBeenCalled();
  });

  it("stops the spinner at the client deadline without releasing a pending request or saving its late result", async () => {
    vi.useFakeTimers(); recordAiConsent(true);
    const request = input(), d = deferred<ReturnType<typeof success>>();
    h.state.generate.mockReturnValueOnce(d.promise).mockResolvedValueOnce(success(request));
    const running = (await mounted(request)).generate(); await ticks();
    expect(render(request).status).toBe("generating");
    await vi.advanceTimersByTimeAsync(JOURNEY_GENERATION_WAIT_MS);
    await running;
    let ui = render(request);
    expect(ui.status).toBe("failed");
    expect(ui.failureMessage).toContain("cannot confirm whether it finished");
    expect(ui.text).toBeNull();
    expect(ui.ready).toBe(false);
    await ui.generate();
    expect(h.state.generate).toHaveBeenCalledTimes(1);
    unmount();
    ui = await mounted(request);
    await ui.generate();
    expect(render(request).status).toBe("failed");
    expect(h.state.generate).toHaveBeenCalledTimes(1);
    render(request).setMode("authored");
    expect(render(request).ready).toBe(true);
    d.resolve(success(request, "This late simulated result must not be saved.")); await ticks();
    expect(readAiReflection("day-01", identity(request).canonicalIdentity)).toBeNull();
    expect(render(request).mode).toBe("authored");
    render(request).setMode("ai");
    await render(request).generate();
    expect(render(request).status).toBe("shown");
    expect(h.state.generate).toHaveBeenCalledTimes(2);
  });

  it.each(["success", "rejection"])("shares the original deadline across a remount and stays settled after late %s", async outcome => {
    vi.useFakeTimers(); recordAiConsent(true);
    const request = input(), d = deferred<ReturnType<typeof success>>();
    h.state.generate.mockReturnValue(d.promise);
    const original = (await mounted(request)).generate(); await ticks();
    await vi.advanceTimersByTimeAsync(JOURNEY_GENERATION_WAIT_MS - 10_000);
    unmount();
    const joined = (await mounted(request)).generate(); await ticks();
    expect(render(request).status).toBe("generating");
    expect(h.state.generate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    await Promise.all([original, joined]);
    expect(render(request).status).toBe("failed");
    expect(render(request).failureMessage).toContain("cannot confirm whether it finished");
    await vi.advanceTimersByTimeAsync(10_000);
    if (outcome === "success") d.resolve(success(request));
    else d.reject(new Error("late fictional rejection"));
    await ticks();
    expect(render(request).status).toBe("failed");
    expect(render(request).text).toBeNull();
    expect(readAiReflection("day-01", identity(request).canonicalIdentity)).toBeNull();
    expect(h.state.generate).toHaveBeenCalledTimes(1);
  });
});
