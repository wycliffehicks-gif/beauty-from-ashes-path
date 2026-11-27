import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { StagingConsole } from "./StagingConsole";

import {
  privateSessionVisibilityKey,
  privateTypedReviewEnabled,
} from "./private-session-visibility";

type View = "checking" | "signed-out" | "signed-in" | "unavailable";

/** Private UI entry only. Every staging operation still verifies Auth and its
 * expiring allowlist on the server; a displayed session grants no access. */
export function PrivateStagingSignIn({
  privateReview = privateTypedReviewEnabled(),
  previewIsOpen,
}: { privateReview?: boolean; previewIsOpen?: () => boolean } = {}) {
  const [view, setView] = useState<View>("checking");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Checking sign-in status…");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consoleKey, setConsoleKey] = useState(0);
  const alive = useRef(false);
  const epoch = useRef(0);
  const pending = useRef(false);
  const identity = useRef<string | null>(null);
  const generation = useRef(0);
  const subscription = useRef<(() => void) | null>(null);
  // Deliberate local sign-out keeps this page closed even if its request fails
  // or an earlier session notification arrives. Only a new manual sign-in
  // clears this local UI fence; server authorization remains independent.
  const signedOut = useRef(false);

  function showIdentity(id: string | null, reset = false) {
    if (identity.current !== id || reset) {
      identity.current = id;
      generation.current += 1;
      setConsoleKey(generation.current);
    }
    setEmail("");
    setPassword("");
    setView(id ? "signed-in" : "signed-out");
  }

  function unavailableSession() {
    showIdentity(null, true);
    setView("unavailable");
    setStatus(
      "Your testing session changed or could not be checked. Check sign-in status to continue.",
    );
  }

  // The callback belongs to this mounted generation. Check SDK storage again
  // before sending or displaying a result, even if its Auth event is delayed.
  async function matchesPrivateSession() {
    const current = () =>
      previewIsOpen?.() !== false &&
      alive.current &&
      consoleKey === generation.current &&
      !!identity.current;
    if (!current()) return false;
    try {
      const { data, error } = await supabase.auth.getSession();
      if (!current()) return false;
      if (!error && privateSessionVisibilityKey(data.session) === identity.current) return true;
    } catch {
      if (!current()) return false;
    }
    unavailableSession();
    return false;
  }

  function subscribe() {
    if (subscription.current) return;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive.current || event === "INITIAL_SESSION" || signedOut.current) return;
      ++epoch.current;
      pending.current = false;
      setBusy(false);
      const id =
        event === "SIGNED_OUT"
          ? null
          : privateReview
            ? privateSessionVisibilityKey(session)
            : (session?.user.id ?? null);
      if (session && event !== "SIGNED_OUT" && !id) {
        unavailableSession();
        return;
      }
      showIdentity(id, event === "SIGNED_OUT");
      setStatus(id ? "Signed in for fictional testing." : "You are signed out.");
    });
    subscription.current = () => data.subscription.unsubscribe();
  }

  async function checkIdentity() {
    if (pending.current || signedOut.current) return;
    const ticket = ++epoch.current;
    pending.current = true;
    setBusy(true);
    setView("checking");
    setStatus("Checking sign-in status…");
    try {
      subscribe();
      const { data, error } = await supabase.auth.getUser();
      if (!alive.current || ticket !== epoch.current) return;
      if (error && error.name !== "AuthSessionMissingError") throw new Error();
      let id = error ? null : (data.user?.id ?? null);
      if (id && privateReview) {
        const local = await supabase.auth.getSession();
        if (!alive.current || ticket !== epoch.current) return;
        if (local.error || local.data.session?.user.id !== id) throw new Error();
        id = privateSessionVisibilityKey(local.data.session);
        if (!id) throw new Error();
      }
      showIdentity(id);
      setStatus(
        data.user && !error
          ? "Signed in for fictional testing."
          : "Sign in with your existing fictional tester account.",
      );
    } catch {
      if (!alive.current || ticket !== epoch.current) return;
      showIdentity(null, true);
      setView("unavailable");
      setStatus("We couldn’t check sign-in status. Please try again.");
    } finally {
      if (alive.current && ticket === epoch.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }

  useEffect(() => {
    alive.current = true;
    void checkIdentity();
    return () => {
      alive.current = false;
      // Invalidate the latest operation, not the mount's earlier counter value.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++epoch.current;
      pending.current = false;
      subscription.current?.();
      subscription.current = null;
    };
    // This subscription is owned by this mount. Its callbacks use only refs
    // and stable setters, never a captured credential or rendered session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      previewIsOpen?.() === false ||
      pending.current ||
      view !== "signed-out" ||
      !email.trim() ||
      !password
    )
      return;
    const submittedEmail = email.trim();
    const submittedPassword = password;
    // Credentials are used only for this deliberate SDK request. The form
    // clears before the await; this component never persists or logs them.
    setEmail("");
    setPassword("");
    signedOut.current = false;
    pending.current = true;
    const ticket = ++epoch.current;
    setBusy(true);
    setStatus("Signing in…");
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: submittedEmail,
        password: submittedPassword,
      });
      if (!alive.current || ticket !== epoch.current) return;
      if (error || !data.session || !data.user || data.session.user.id !== data.user.id)
        throw new Error();
      const id = privateReview ? privateSessionVisibilityKey(data.session) : data.user.id;
      if (!id) throw new Error();
      showIdentity(id);
      setStatus("Signed in for fictional testing.");
    } catch {
      if (!alive.current || ticket !== epoch.current) return;
      showIdentity(null);
      setStatus("Sign-in was not completed. Check your details and try again.");
    } finally {
      if (alive.current && ticket === epoch.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }

  async function signOut() {
    if (pending.current) return;
    signedOut.current = true;
    pending.current = true;
    const ticket = ++epoch.current;
    // Clear the private console synchronously, before any remote logout wait.
    showIdentity(null, true);
    setBusy(true);
    setStatus("Signing out on this device…");
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (!alive.current || ticket !== epoch.current) return;
      if (error) throw new Error();
      setStatus("Signed out on this device.");
    } catch {
      if (!alive.current || ticket !== epoch.current) return;
      setView("unavailable");
      setStatus("We couldn’t confirm sign-out. The conversation is hidden. Try signing out again.");
    } finally {
      if (alive.current && ticket === epoch.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <>
      <section
        className="conversation-ui mx-auto max-w-3xl px-5 pt-10"
        aria-labelledby="private-staging-auth-heading"
      >
        <h1 id="private-staging-auth-heading" className="font-serif text-2xl">
          Private fictional testing
        </h1>
        <p className="mt-3">
          {privateReview
            ? "Use your existing fictional tester account. An approved message can be sent to the AI provider. The microphone stays off."
            : "Use your existing fictional tester account. Replies are simulated and the microphone stays off."}
        </p>
        <p
          role="status"
          aria-live="polite"
          data-testid="private-staging-auth-status"
          className="my-4"
        >
          {status}
        </p>
        {view === "signed-out" && (
          <form
            method="post"
            data-testid="private-staging-sign-in"
            onSubmit={signIn}
            className="space-y-3"
          >
            <div>
              <label htmlFor="private-staging-email">Tester email</label>
              <input
                id="private-staging-email"
                data-testid="private-staging-email"
                type="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                maxLength={254}
                value={email}
                disabled={busy}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2"
              />
            </div>
            <div>
              <label htmlFor="private-staging-password">Password</label>
              <input
                id="private-staging-password"
                data-testid="private-staging-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                disabled={busy}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2"
              />
            </div>
            <Button type="submit" data-testid="private-staging-submit" disabled={busy}>
              Sign in for fictional testing
            </Button>
          </form>
        )}
        {view === "unavailable" && !signedOut.current && (
          <Button
            data-testid="private-staging-auth-retry"
            disabled={busy}
            onClick={() => void checkIdentity()}
          >
            Check sign-in status
          </Button>
        )}
        {(view === "signed-in" || view === "unavailable") && (
          <Button
            data-testid="private-staging-sign-out"
            variant="outline"
            className="mt-3"
            disabled={busy}
            onClick={() => void signOut()}
          >
            Sign out on this device
          </Button>
        )}
      </section>
      {view === "signed-in" && (
        <StagingConsole
          key={consoleKey}
          matchesPrivateSession={privateReview ? matchesPrivateSession : undefined}
        />
      )}
    </>
  );
}
