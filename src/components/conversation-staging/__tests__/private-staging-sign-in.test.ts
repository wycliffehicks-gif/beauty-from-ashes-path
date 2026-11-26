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
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
  listener: null as null | ((event: string, session: { user: { id: string } } | null) => void),
}));
vi.mock("react", async (original) => ({ ...(await original<object>()), ...harness.hooks }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));
vi.mock("@/components/conversation-staging/StagingConsole", () => ({
  StagingConsole: () => "EXISTING_MOCK_CONSOLE",
}));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => options }));

import { PrivateStagingSignIn } from "@/components/conversation-staging/PrivateStagingSignIn";
import { StagingConsole } from "@/components/conversation-staging/StagingConsole";

type Props = {
  children?: ReactNode;
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
function render(effects = true) {
  let tree: ReactElement,
    rounds = 0;
  do {
    harness.h.index = 0;
    harness.h.dirty = false;
    tree = PrivateStagingSignIn();
    if (effects) harness.h.effects.splice(0).forEach((fn) => fn());
    if (++rounds > 20) throw new Error("Component did not settle");
  } while (effects && harness.h.dirty);
  return { tree: tree!, html: renderToStaticMarkup(tree!) };
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
  it.each([undefined, "false", "TRUE", "1", "true"])(
    "route opt-in uses only exact build string %j",
    async (flag) => {
      vi.resetModules();
      vi.stubEnv("VITE_BFA_PRIVATE_STAGING_SIGN_IN", flag);
      const { Route } = await import("@/routes/conversation-staging");
      const selected = (Route as unknown as { component: () => unknown }).component;
      expect(selected.name).toBe(flag === "true" ? "PrivateStagingSignIn" : "StagingConsole");
    },
  );
});
