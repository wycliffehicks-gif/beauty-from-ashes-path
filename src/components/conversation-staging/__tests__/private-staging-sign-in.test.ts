import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Actual component/handlers with a local hook runner and SDK doubles. These
// tests make no Auth/network request and do not establish deployed access.
const harness = vi.hoisted(() => {
  type Slot = { value?: unknown; deps?: readonly unknown[]; cleanup?: (() => void) | void };
  const h = { slots: [] as Slot[], index: 0, effects: [] as Array<() => void>, dirty: false };
  return {
    h,
    hooks: {
      useState<T>(initial: T | (() => T)) {
        const i = h.index++;
        if (!h.slots[i])
          h.slots[i] = { value: typeof initial === "function" ? (initial as () => T)() : initial };
        return [
          h.slots[i].value,
          (next: T | ((old: T) => T)) => {
            const value =
              typeof next === "function" ? (next as (old: T) => T)(h.slots[i].value as T) : next;
            if (!Object.is(value, h.slots[i].value)) {
              h.slots[i].value = value;
              h.dirty = true;
            }
          },
        ];
      },
      useRef<T>(value: T) {
        const i = h.index++;
        h.slots[i] ??= { value: { current: value } };
        return h.slots[i].value;
      },
      useEffect(effect: () => void | (() => void), deps: readonly unknown[]) {
        const i = h.index++,
          old = h.slots[i];
        if (
          !old?.deps ||
          deps.length !== old.deps.length ||
          deps.some((v, n) => !Object.is(v, old.deps?.[n]))
        ) {
          h.slots[i] = { deps };
          h.effects.push(() => {
            old?.cleanup?.();
            h.slots[i].cleanup = effect();
          });
        }
      },
    },
  };
});
const auth = vi.hoisted(() => ({
  getUser: vi.fn(),
  getSession: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
  listener: null as
    | null
    | ((event: string, session: { user: { id: string }; access_token?: string } | null) => void),
}));
const request = vi.hoisted(() => ({ review: vi.fn(), run: vi.fn(), preview: vi.fn() }));
vi.mock("@/lib/ai/conversation/staging/private-preview.functions", () => ({
  readPrivatePreviewAvailability: request.preview,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/ai/conversation/staging/staging.functions", () => ({
  runStagingOperation: request.run,
}));
vi.mock("@/lib/ai/conversation/staging/private-typed-review.functions", () => ({
  reviewStagingMessage: request.review,
}));
vi.mock("@/lib/prefs", () => ({
  readPrefs: () => ({ showSpiritual: false }),
  usePrefs: () => [{ showSpiritual: false }, () => {}, true],
}));
vi.mock("react", async (original) => ({ ...(await original<object>()), ...harness.hooks }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));
vi.mock("@/components/conversation-staging/StagingConsole", () => ({
  StagingConsole: () => "EXISTING_MOCK_CONSOLE",
}));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => options }));

import { HostedStagingEntry } from "@/components/conversation-staging/HostedStagingEntry";
import { PrivateStagingSignIn } from "@/components/conversation-staging/PrivateStagingSignIn";
import { StagingConsole } from "@/components/conversation-staging/StagingConsole";

import { PrivateTypedReview } from "@/components/conversation-staging/PrivateTypedReview";
import { ConversationService } from "@/lib/ai/conversation/service/service";
import type { ActiveThread } from "@/lib/ai/conversation/staging/adapter.server";

type Props = {
  send?: (requestId: string) => void;
  id?: string;
  children?: ReactNode;
  matchesPrivateSession?: () => Promise<boolean>;
  "data-testid"?: string;
  onClick?: () => void;
  onSubmit?: (event: { preventDefault: () => void }) => Promise<void>;
  onChange?: (event: { target: { value: string } }) => void;
  value?: string;
  disabled?: boolean;
  method?: string;
  name?: string;
  type?: string;
};
function nodes(value: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const element = value as ReactElement<Props>;
  return [element, ...nodes(element.props.children)];
}
function renderTree(component: () => ReactElement, effects = true) {
  let tree: ReactElement,
    rounds = 0;
  do {
    harness.h.index = 0;
    harness.h.dirty = false;
    tree = component();
    if (effects) harness.h.effects.splice(0).forEach((fn) => fn());
    if (++rounds > 20) throw new Error("Component did not settle");
  } while (effects && harness.h.dirty);
  return tree!;
}
function render(effects = true) {
  const tree = renderTree(PrivateStagingSignIn, effects);
  return { tree, html: renderToStaticMarkup(tree) };
}
function element(id: string) {
  const value = nodes(render().tree).find((n) => n.props["data-testid"] === id);
  expect(value, id).toBeDefined();
  return value!;
}
function consoleNode() {
  return nodes(render().tree).find((n) => n.type === StagingConsole);
}
async function settle() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  return render();
}
function event(name: string, owner: string | null) {
  auth.listener?.(name, owner ? { user: { id: owner } } : null);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function user(id: string | null) {
  return { data: { user: id ? { id } : null }, error: null };
}
function session(id: string) {
  return { data: { user: { id }, session: { user: { id } } }, error: null };
}
function fill() {
  element("private-staging-email").props.onChange!({
    target: { value: "  fictional@example.invalid  " },
  });
  element("private-staging-password").props.onChange!({
    target: { value: " fictional password " },
  });
}
function submit() {
  return element("private-staging-sign-in").props.onSubmit!({ preventDefault: vi.fn() });
}
function unmount() {
  harness.h.slots.forEach((slot) => {
    slot.cleanup?.();
    slot.cleanup = undefined;
  });
}

beforeEach(() => {
  unmount();
  harness.h.slots = [];
  harness.h.effects = [];
  harness.h.dirty = false;
  vi.clearAllMocks();
  auth.listener = null;
  auth.getUser.mockResolvedValue(user(null));
  auth.signInWithPassword.mockResolvedValue(session("owner-a"));
  auth.signOut.mockResolvedValue({ error: null });
  auth.onAuthStateChange.mockImplementation((listener: typeof auth.listener) => {
    auth.listener = listener;
    return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
  });
});
afterEach(() => {
  unmount();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("opted-in private fictional staging sign-in", () => {
  it("SSR/pre-hydration displays checking only, never a credential form or console", () => {
    const html = render(false).html;
    expect(html).toContain("Checking sign-in status");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("EXISTING_MOCK_CONSOLE");
    expect(auth.getUser).not.toHaveBeenCalled();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });
  it("checks existing Auth and renders a manually submitted POST form without credential names", async () => {
    render();
    await settle();
    expect(auth.getUser).toHaveBeenCalledTimes(1);
    expect(auth.onAuthStateChange).toHaveBeenCalledTimes(1);
    expect(element("private-staging-sign-in").props.method).toBe("post");
    expect(element("private-staging-email").props.name).toBeUndefined();
    expect(element("private-staging-password").props.name).toBeUndefined();
    expect(element("private-staging-password").props.type).toBe("password");
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
  });
  it("handles an ordinary missing-session SDK result as signed out", async () => {
    auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthSessionMissingError" },
    });
    render();
    await settle();
    expect(element("private-staging-sign-in")).toBeDefined();
    expect(consoleNode()).toBeUndefined();
  });
  it("restores an already verified user without sending credentials", async () => {
    auth.getUser.mockResolvedValue(user("owner-a"));
    render();
    await settle();
    expect(consoleNode()).toBeDefined();
    expect(render().html).toContain("Signed in for fictional testing.");
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });
  it("ignores INITIAL_SESSION until the independent initial getUser result settles", async () => {
    const pending = deferred<ReturnType<typeof user>>();
    auth.getUser.mockReturnValue(pending.promise);
    render();
    event("INITIAL_SESSION", "cached-owner");
    expect(consoleNode()).toBeUndefined();
    pending.resolve(user(null));
    await settle();
    expect(consoleNode()).toBeUndefined();
  });
  it("a sign-out event fences a late initial identity response", async () => {
    const pending = deferred<ReturnType<typeof user>>();
    auth.getUser.mockReturnValue(pending.promise);
    render();
    event("SIGNED_OUT", null);
    pending.resolve(user("owner-a"));
    await settle();
    expect(consoleNode()).toBeUndefined();
    expect(render().html).toContain("You are signed out.");
  });
  it("clears credentials before awaiting one manual sign-in and ignores duplicate submission", async () => {
    const pending = deferred<ReturnType<typeof session>>();
    auth.signInWithPassword.mockReturnValue(pending.promise);
    render();
    await settle();
    fill();
    const send = submit();
    expect(element("private-staging-email").props.value).toBe("");
    expect(element("private-staging-password").props.value).toBe("");
    expect(element("private-staging-submit").props.disabled).toBe(true);
    await submit();
    expect(auth.signInWithPassword).toHaveBeenCalledExactlyOnceWith({
      email: "fictional@example.invalid",
      password: " fictional password ",
    });
    pending.resolve(session("owner-a"));
    await send;
    await settle();
    expect(consoleNode()).toBeDefined();
  });
  it.each(["returned", "thrown"])(
    "keeps %s sign-in failure generic and performs no retry",
    async (kind) => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const failure = new Error("SENSITIVE_PROVIDER_AND_PASSWORD_CANARY");
      if (kind === "returned")
        auth.signInWithPassword.mockResolvedValue({
          data: { user: null, session: null },
          error: failure,
        });
      else auth.signInWithPassword.mockRejectedValue(failure);
      render();
      await settle();
      fill();
      await submit();
      await settle();
      expect(render().html).toContain("Sign-in was not completed");
      expect(render().html).not.toContain(failure.message);
      expect(render().html).not.toContain("fictional password");
      expect(spy).not.toHaveBeenCalled();
      expect(auth.signInWithPassword).toHaveBeenCalledTimes(1);
      expect(consoleNode()).toBeUndefined();
    },
  );
  it.each([null, { user: { id: "other-owner" } }])(
    "refuses a missing or mismatched successful session: %j",
    async (suppliedSession) => {
      auth.signInWithPassword.mockResolvedValue({
        data: { user: { id: "owner-a" }, session: suppliedSession },
        error: null,
      });
      render();
      await settle();
      fill();
      await submit();
      await settle();
      expect(consoleNode()).toBeUndefined();
    },
  );
  it("ignores a late sign-in completion after an intervening sign-out event", async () => {
    const pending = deferred<ReturnType<typeof session>>();
    auth.signInWithPassword.mockReturnValue(pending.promise);
    render();
    await settle();
    fill();
    const send = submit();
    event("SIGNED_OUT", null);
    pending.resolve(session("owner-a"));
    await send;
    await settle();
    expect(consoleNode()).toBeUndefined();
  });
  function privateSessionFixture() {
    vi.stubEnv("VITE_BFA_PRIVATE_STAGING_SIGN_IN", "true");
    vi.stubEnv("VITE_BFA_PRIVATE_TYPED_REVIEW", "true");
    const owner = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const make = (id: string, generation = 0) => ({
      user: { id: owner },
      access_token:
        "e30." +
        Buffer.from(JSON.stringify({ sub: owner, session_id: id, generation })).toString(
          "base64url",
        ) +
        ".YQ",
    });
    const initial = make(sessionId);
    const stored = (value: typeof initial) => ({ data: { session: value }, error: null });
    auth.getSession.mockResolvedValue(stored(initial));
    auth.getUser.mockResolvedValue(user(owner));
    return { make, sessionId, initial, stored, owner };
  }
  it("private testing preserves refreshed tokens for one session and fences a delayed result across same-owner replacement", async () => {
    const { make, sessionId, stored } = privateSessionFixture();
    render();
    await settle();
    const original = consoleNode()!;
    const check = original.props.matchesPrivateSession!;
    const rotated = make(sessionId, 1);
    auth.getSession.mockResolvedValue(stored(rotated));
    auth.listener?.("TOKEN_REFRESHED", rotated);
    expect(consoleNode()?.key).toBe(original.key);
    expect(await check()).toBe(true);
    const delayed = deferred<ReturnType<typeof stored>>();
    auth.getSession.mockReturnValueOnce(delayed.promise);
    const result = check();
    const replacement = make(crypto.randomUUID());
    auth.getSession.mockResolvedValue(stored(replacement));
    auth.listener?.("SIGNED_IN", replacement);
    expect(consoleNode()?.key).not.toBe(original.key);
    delayed.resolve(stored(rotated));
    expect(await result).toBe(false);
    expect(await check()).toBe(false);
    expect(await consoleNode()?.props.matchesPrivateSession?.()).toBe(true);
    expect(render().html).not.toContain(rotated.access_token);
    expect(render().html).not.toContain("Replies are simulated");
  });
  it("retires private results before rendering even when the storage change precedes the Auth event", async () => {
    const { make, stored } = privateSessionFixture();
    render();
    await settle();
    const check = consoleNode()!.props.matchesPrivateSession!;
    auth.getSession.mockResolvedValue(stored(make(crypto.randomUUID())));
    expect(await check()).toBe(false);
    expect(consoleNode()).toBeUndefined();
    expect(render().html).toContain("Check sign-in status");
  });
  it.each(["invalid-token", "missing-session-id", "foreign-user"])(
    "keeps the private console closed for %s even when getUser previously succeeded",
    async (mode) => {
      const { make, owner, stored } = privateSessionFixture();
      const raw = make(crypto.randomUUID());
      if (mode === "invalid-token") raw.access_token = "invalid";
      if (mode === "missing-session-id")
        raw.access_token =
          "e30." + Buffer.from(JSON.stringify({ sub: owner })).toString("base64url") + ".YQ";
      if (mode === "foreign-user") raw.user.id = crypto.randomUUID();
      auth.getSession.mockResolvedValue(stored(raw));
      render();
      await settle();
      expect(consoleNode()).toBeUndefined();
      expect(render().html).not.toContain(raw.access_token);
    },
  );
  it("preserves same-user token refresh but remounts on account switch and same-user sign-out/sign-in", async () => {
    auth.getUser.mockResolvedValue(user("owner-a"));
    render();
    await settle();
    const first = consoleNode()!.key;
    event("TOKEN_REFRESHED", "owner-a");
    expect(consoleNode()!.key).toBe(first);
    event("SIGNED_IN", "owner-b");
    const other = consoleNode()!.key;
    expect(other).not.toBe(first);
    event("SIGNED_OUT", null);
    event("SIGNED_IN", "owner-b");
    expect(consoleNode()!.key).not.toBe(other);
    expect(auth.getUser).toHaveBeenCalledTimes(1); // No SDK call from inside the event listener.
  });
  it("a newer Auth event suppresses an older failed sign-in result", async () => {
    const pending = deferred<unknown>();
    auth.signInWithPassword.mockReturnValue(pending.promise);
    render();
    await settle();
    fill();
    const send = submit();
    event("SIGNED_IN", "owner-b");
    pending.resolve({ error: new Error("OLD_FAILURE"), data: { session: null, user: null } });
    await send;
    await settle();
    expect(consoleNode()).toBeDefined();
    expect(render().html).not.toContain("not completed");
  });
  it("hides the console before local sign-out waits and refuses late session notifications", async () => {
    const pending = deferred<{ error: null }>();
    auth.signOut.mockReturnValue(pending.promise);
    auth.getUser.mockResolvedValue(user("owner-a"));
    render();
    await settle();
    element("private-staging-sign-out").props.onClick!();
    expect(consoleNode()).toBeUndefined();
    expect(auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
    event("SIGNED_IN", "owner-a");
    expect(consoleNode()).toBeUndefined();
    pending.resolve({ error: null });
    await settle();
    event("TOKEN_REFRESHED", "owner-a");
    expect(consoleNode()).toBeUndefined();
    expect(render().html).toContain("Signed out on this device.");
    fill();
    await submit();
    await settle();
    expect(consoleNode()).toBeDefined();
  });
  it("logout failure stays closed, discloses uncertainty and offers only deliberate retry", async () => {
    auth.getUser.mockResolvedValue(user("owner-a"));
    auth.signOut.mockResolvedValueOnce({ error: new Error("SECRET_LOGOUT_FAILURE") });
    render();
    await settle();
    element("private-staging-sign-out").props.onClick!();
    await settle();
    expect(consoleNode()).toBeUndefined();
    expect(render().html).toContain("couldn’t confirm sign-out");
    expect(render().html).not.toContain("SECRET_LOGOUT_FAILURE");
    event("SIGNED_IN", "owner-a");
    expect(consoleNode()).toBeUndefined();
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    element("private-staging-sign-out").props.onClick!();
    await settle();
    expect(auth.signOut).toHaveBeenCalledTimes(2);
    expect(render().html).toContain("Signed out on this device.");
  });
  it("a failed initial status check has a manual retry without credential submission", async () => {
    auth.getUser.mockRejectedValueOnce(new Error("PRIVATE_ERROR"));
    render();
    await settle();
    expect(render().html).toContain("couldn’t check sign-in status");
    expect(render().html).not.toContain("PRIVATE_ERROR");
    element("private-staging-auth-retry").props.onClick!();
    await settle();
    expect(auth.getUser).toHaveBeenCalledTimes(2);
    expect(auth.onAuthStateChange).toHaveBeenCalledTimes(1);
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });
  it("retries subscription setup before showing a console after setup failure", async () => {
    auth.onAuthStateChange.mockImplementationOnce(() => {
      throw new Error("CONFIG_FAILURE");
    });
    render();
    await settle();
    expect(auth.getUser).not.toHaveBeenCalled();
    element("private-staging-auth-retry").props.onClick!();
    await settle();
    expect(auth.onAuthStateChange).toHaveBeenCalledTimes(2);
    expect(auth.getUser).toHaveBeenCalledTimes(1);
  });
  it("unsubscribes and ignores an asynchronous completion after unmount", async () => {
    const pending = deferred<ReturnType<typeof user>>();
    auth.getUser.mockReturnValue(pending.promise);
    render();
    unmount();
    harness.h.dirty = false;
    pending.resolve(user("owner-a"));
    await Promise.resolve();
    await Promise.resolve();
    expect(auth.unsubscribe).toHaveBeenCalledTimes(1);
    expect(harness.h.dirty).toBe(false);
  });
  function activeThread(): ActiveThread {
    const service = new ConversationService({ verifiedOwnerId: crypto.randomUUID() });
    const thread = crypto.randomUUID();
    service.ensureThread(thread, false);
    return {
      kind: "active",
      thread,
      saved: false,
      token: "private-seal",
      revision: 0,
      microphone: "off",
      inspection: service.inspect(thread),
    };
  }
  async function flush() {
    for (let i = 0; i < 12; i++) await Promise.resolve();
  }
  it("drops a delayed reviewed UUID before rendering the Send button if its session changed", async () => {
    const active = activeThread();
    const pending = deferred<object>();
    request.review.mockReturnValue(pending.promise);
    let sessionCurrent = true;
    const check = vi.fn(async () => sessionCurrent);
    const send = vi.fn();
    const tree = () =>
      renderTree(() =>
        PrivateTypedReview({
          active,
          message: "fictional draft",
          preferenceOn: false,
          disabled: false,
          send,
          matchesPrivateSession: check,
        }),
      );
    const prepare = nodes(tree()).find((n) => n.props.children === "Prepare fictional message")!;
    prepare.props.onClick!();
    await flush();
    expect(request.review).toHaveBeenCalledTimes(1);
    sessionCurrent = false;
    pending.resolve({
      requestId: request.review.mock.calls[0]![0].data.requestId,
      threadId: active.thread,
      revision: active.revision,
    });
    await flush();
    expect(check).toHaveBeenCalledTimes(2);
    expect(nodes(tree()).some((n) => n.props.children === "Send reviewed message")).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
  it("drops an already-completed private reply after browser session replacement without invoking another send", async () => {
    privateSessionFixture();
    vi.stubGlobal("window", new EventTarget());
    const { StagingConsole: ActualConsole } = await vi.importActual<
      typeof import("@/components/conversation-staging/StagingConsole")
    >("@/components/conversation-staging/StagingConsole");
    const active = activeThread();
    const pending = deferred<ActiveThread>();
    request.run.mockResolvedValueOnce(active).mockReturnValueOnce(pending.promise);
    let sessionCurrent = true;
    const check = vi.fn(async () => sessionCurrent);
    const tree = () => renderTree(() => ActualConsole({ matchesPrivateSession: check }));
    nodes(tree()).find((n) => n.props.children === "New conversation")!.props.onClick!();
    await flush();
    const input = nodes(tree()).find((n) => n.props.id === "staging-message")!;
    input.props.onChange!({ target: { value: "fictional draft" } });
    const requestId = crypto.randomUUID();
    nodes(tree()).find((n) => !!n.props.send)!.props.send!(requestId);
    await flush();
    expect(request.run.mock.calls.map((call) => call[0].data.action)).toEqual([
      "create",
      "private-append",
    ]);
    expect(request.run.mock.calls[1]![0].data.requestId).toBe(requestId);
    sessionCurrent = false;
    pending.resolve({
      ...active,
      revision: 1,
      inspection: {
        ...active.inspection!,
        events: [
          {
            eventId: "event",
            role: "assistant",
            text: "OLD_SESSION_REPLY",
            turnId: "turn",
          } as NonNullable<ActiveThread["inspection"]>["events"][number],
        ],
      },
    });
    await flush();
    expect(nodes(tree()).some((n) => n.props.children === "OLD_SESSION_REPLY")).toBe(false);
    expect(nodes(tree()).find((n) => n.props.id === "staging-message")?.props.value).toBe(
      "fictional draft",
    );
    expect(request.run).toHaveBeenCalledTimes(2);
  });
  it.each([
    [undefined, undefined, "HostedStagingEntry"],
    [undefined, "true", "StagingConsole"],
    [undefined, "false", "StagingConsole"],
    ["false", "true", "StagingConsole"],
    ["TRUE", undefined, "StagingConsole"],
    ["1", undefined, "StagingConsole"],
    ["", undefined, "StagingConsole"],
    ["true", undefined, "PrivateStagingSignIn"],
    ["true", "false", "PrivateStagingSignIn"],
    ["true", "true", "PrivateStagingSignIn"],
  ])("respects the existing build switches %j/%j", async (flag, reviewFlag, expected) => {
    vi.resetModules();
    vi.stubEnv("VITE_BFA_PRIVATE_STAGING_SIGN_IN", flag);
    vi.stubEnv("VITE_BFA_PRIVATE_TYPED_REVIEW", reviewFlag);
    const { Route } = await import("@/routes/conversation-staging");
    const selected = (Route as unknown as { component: () => unknown }).component;
    expect(selected.name).toBe(expected);
  });
});

describe("private preview visibility after hydration", () => {
  const editor = "https://id-preview--62fcd5e5-2179-45ff-b8f1-2aef8df3ece3.lovable.app";
  const preview = "https://preview--beauty-from-ashes-path.lovable.app";
  function useLocation(origin: string) {
    const target = Object.assign(new EventTarget(), {
      location: { href: origin + "/conversation-staging" },
    });
    vi.stubGlobal("window", target);
    return target;
  }
  afterEach(() => vi.useRealTimers());
  it("server and first browser render expose only a neutral shell", () => {
    useLocation(editor);
    const html = renderToStaticMarkup(renderTree(HostedStagingEntry, false));
    expect(html).toContain("Checking staging availability");
    expect(html).not.toContain("<form");
    expect(request.preview).not.toHaveBeenCalled();
  });
  it.each([
    "https://beauty-from-ashes-path.lovable.app",
    "http://127.0.0.1:4178",
    "https://example.invalid",
  ])("keeps the ordinary private route on %s without a server window lookup", (origin) => {
    useLocation(origin);
    const tree = renderTree(HostedStagingEntry);
    expect(renderToStaticMarkup(tree)).toBe("EXISTING_MOCK_CONSOLE");
    expect(request.preview).not.toHaveBeenCalled();
  });
  it.each([editor, preview])(
    "opens only with server confirmation and closes without a mock control on %s",
    async (origin) => {
      const page = useLocation(origin);
      request.preview.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      renderTree(HostedStagingEntry);
      await Promise.resolve();
      const active = renderTree(HostedStagingEntry) as ReactElement<{
        privateReview: boolean;
        previewIsOpen: () => boolean;
      }>;
      expect(active.type).toBe(PrivateStagingSignIn);
      expect(active.props.privateReview).toBe(true);
      expect(active.props.previewIsOpen()).toBe(true);
      page.dispatchEvent(new Event("focus"));
      await Promise.resolve();
      expect(renderToStaticMarkup(renderTree(HostedStagingEntry))).toContain(
        "Private testing is closed",
      );
      expect(active.props.previewIsOpen()).toBe(false);
    },
  );
  it("closes a hanging first check and ignores its late answer", async () => {
    vi.useFakeTimers();
    useLocation(preview);
    const late = deferred<boolean>();
    request.preview.mockReturnValueOnce(late.promise);
    renderTree(HostedStagingEntry);
    await vi.advanceTimersByTimeAsync(30_001);
    const status = () => renderToStaticMarkup(renderTree(HostedStagingEntry));
    expect(status()).toContain("Private testing is closed");
    late.resolve(true);
    await Promise.resolve();
    expect(status()).toContain("Private testing is closed");
  });
  it("a delayed renewal cannot reopen the expired private UI or revive its old guard", async () => {
    vi.useFakeTimers();
    const page = useLocation(preview);
    const late = deferred<boolean>();
    request.preview.mockResolvedValueOnce(true).mockReturnValueOnce(late.promise);
    renderTree(HostedStagingEntry);
    await Promise.resolve();
    const active = renderTree(HostedStagingEntry) as ReactElement<{ previewIsOpen: () => boolean }>;
    expect(active.type).toBe(PrivateStagingSignIn);
    await vi.advanceTimersByTimeAsync(30_001);
    expect(active.props.previewIsOpen()).toBe(false);
    expect(renderToStaticMarkup(renderTree(HostedStagingEntry))).toContain(
      "Private testing is closed",
    );
    late.resolve(true);
    await Promise.resolve();
    expect(renderToStaticMarkup(renderTree(HostedStagingEntry))).toContain(
      "Private testing is closed",
    );
    expect(request.preview).toHaveBeenCalledTimes(2);
    request.preview.mockResolvedValueOnce(true);
    page.dispatchEvent(new Event("focus"));
    await Promise.resolve();
    const reopened = renderTree(HostedStagingEntry) as ReactElement<{
      previewIsOpen: () => boolean;
    }>;
    expect(reopened.type).toBe(PrivateStagingSignIn);
    expect(reopened.props.previewIsOpen()).toBe(true);
    expect(active.props.previewIsOpen()).toBe(false);
  });
});
