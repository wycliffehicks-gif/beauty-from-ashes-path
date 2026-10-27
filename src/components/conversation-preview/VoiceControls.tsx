// Reusable, inactive presentation. No application route imports this component.
// The host owns selection, lifecycle calls and publication of current snapshots.
import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  deriveVoiceControls,
  type VoiceControlAction,
  type VoiceControlsSnapshot,
} from "@/lib/ai/conversation/service/voice-controls";

export interface VoiceControlsProps {
  snapshot: VoiceControlsSnapshot;
  /** Invoke the coordinator synchronously, publish its snapshot plus pending
   * metadata immediately, then publish again on settlement. The host handles
   * rejected commands and errors; this component neither awaits nor polls. */
  onAction: (action: VoiceControlAction) => void;
  /** Host promises, not evidence of input state or shutdown. */
  pendingActions?: readonly VoiceControlAction[];
  className?: string;
}

export function VoiceControls({
  snapshot,
  onAction,
  pendingActions = [],
  className,
}: VoiceControlsProps) {
  const id = useId();
  const view = deriveVoiceControls(snapshot, pendingActions);
  const status = useRef<HTMLDivElement>(null);
  const invokedButton = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const preserveNewFocus = (event: FocusEvent) => {
      if (event.target !== invokedButton.current && event.target !== document.body)
        invokedButton.current = null;
    };
    document.addEventListener("focusin", preserveNewFocus);
    return () => document.removeEventListener("focusin", preserveNewFocus);
  }, []);

  useLayoutEffect(() => {
    const origin = invokedButton.current;
    // Consume this intent on its first published render, even if the control
    // stays enabled. It must not affect a later external snapshot or tab focus.
    invokedButton.current = null;
    if (!origin || !document.hasFocus()) return;
    const current = document.activeElement;
    if (current !== origin && current !== document.body) return;
    if (!origin.isConnected || origin.disabled) {
      // Repair only focus lost by this person's action. A later completion or
      // external snapshot must not move focus they have placed elsewhere.
      status.current?.focus();
    }
  });

  return (
    <section aria-labelledby={`${id}-heading`} className={cn("space-y-3", className)}>
      <h2 id={`${id}-heading`} className="font-serif text-lg">
        Voice controls
      </h2>
      <div
        ref={status}
        role="status"
        aria-atomic="true"
        tabIndex={-1}
        className={cn(
          "space-y-1 rounded-md border p-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
          view.tone === "warning"
            ? "border-destructive text-foreground"
            : "border-border bg-muted text-foreground",
        )}
      >
        <p className="font-medium">{view.status}</p>
        <p id={`${id}-detail`}>{view.detail}</p>
      </div>
      <div
        role="group"
        aria-label="Voice actions"
        aria-describedby={`${id}-detail`}
        className="flex flex-wrap gap-2"
      >
        {view.actions.map(({ action, label, disabled, pending }) => (
          <Button
            key={action === "mute" || action === "unmute" ? "input-toggle" : action}
            type="button"
            variant={action === "start" || action === "resume" ? "default" : "outline"}
            disabled={disabled}
            aria-busy={pending || undefined}
            className="min-h-11 h-auto whitespace-normal px-3 py-2"
            onClick={(event) => {
              invokedButton.current = event.currentTarget;
              onAction(action);
            }}
          >
            {label}
          </Button>
        ))}
      </div>
    </section>
  );
}
