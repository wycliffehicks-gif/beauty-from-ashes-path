import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { reviewStagingMessage } from "@/lib/ai/conversation/staging/private-typed-review.functions";
import type { ActiveThread } from "@/lib/ai/conversation/staging/adapter.server";

type Review = Awaited<ReturnType<typeof reviewStagingMessage>>;
interface Props {
  active: ActiveThread;
  message: string;
  preferenceOn: boolean;
  disabled: boolean;
  send: (requestId: string) => void;
  matchesPrivateSession?: () => Promise<boolean>;
}

export function PrivateTypedReview({
  active,
  message,
  preferenceOn,
  disabled,
  send,
  matchesPrivateSession,
}: Props) {
  const review = useServerFn(reviewStagingMessage);
  const ticket = useRef(0);
  const busy = useRef(false);
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState("");
  const [reviewed, setReviewed] = useState<{
    result: Review;
    thread: ActiveThread;
    draft: string;
    preference: boolean;
  } | null>(null);
  // Keep the request ID only for this exact in-memory draft and authority.
  // Changing either, leaving the page, or starting a send retires it.
  useEffect(() => {
    setReviewed(null);
    setFailure("");
    setWorking(false);
    busy.current = false;
    return () => {
      ticket.current += 1;
    };
  }, [active, message, preferenceOn, disabled]);

  const current =
    !disabled &&
    reviewed?.thread === active &&
    reviewed.draft === message &&
    reviewed.preference === preferenceOn
      ? reviewed.result
      : null;
  async function prepare() {
    if (disabled || busy.current || !message.trim()) return;
    const id = ++ticket.current;
    busy.current = true;
    setWorking(true);
    setFailure("");
    setReviewed(null);
    try {
      if (!(await matchesPrivateSession?.()) || ticket.current !== id) return;
      const requestId = crypto.randomUUID();
      const result = await review({
        data: {
          thread: active.thread,
          revision: active.revision,
          token: active.token,
          message,
          preferenceOn,
          requestId,
        },
      });
      if (ticket.current !== id) return;
      const visible = await matchesPrivateSession?.();
      if (!visible || ticket.current !== id) return;
      if (
        result.requestId !== requestId ||
        result.threadId !== active.thread ||
        result.revision !== active.revision
      )
        throw new Error();
      setReviewed({ result, thread: active, draft: message, preference: preferenceOn });
    } catch {
      if (ticket.current === id)
        setFailure("This message could not be prepared. Check that the private test is available.");
    } finally {
      if (ticket.current === id) {
        busy.current = false;
        setWorking(false);
      }
    }
  }
  function submit() {
    if (!current || busy.current || disabled) return;
    busy.current = true;
    ++ticket.current;
    setReviewed(null);
    send(current.requestId);
  }
  return (
    <div className="mt-3 space-y-2">
      {current ? (
        <>
          <p role="status" className="text-sm">
            Message prepared. Send after the test operator approves this request.
          </p>
          <details>
            <summary>Test operator details</summary>
            <pre className="mt-2 max-w-full overflow-auto text-xs">
              {JSON.stringify(current, null, 2)}
            </pre>
          </details>
          <Button onClick={submit}>Send reviewed message</Button>
        </>
      ) : (
        <Button disabled={disabled || working || !message.trim()} onClick={prepare}>
          {working ? "Preparing message…" : "Prepare fictional message"}
        </Button>
      )}
      {failure && (
        <p role="status" className="text-sm">
          {failure}
        </p>
      )}
    </div>
  );
}
