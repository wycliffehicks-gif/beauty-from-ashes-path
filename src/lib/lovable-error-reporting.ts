type LovableErrorOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

type LovableEvents = {
  captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
    options?: LovableErrorOptions,
  ) => void;
};

declare global {
  interface Window {
    __lovableEvents?: LovableEvents;
    __lovableReportRuntimeError?: (payload: {
      message: string;
      stack?: string;
      filename?: string;
    }) => void;
  }
}

export function reportLovableError(_error: unknown, _context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  // Preserve a diagnostic signal without sending the exception, cause, stack,
  // caller context, URL or route. Installed platform hooks may have independent
  // collection; their configuration still needs a deployed canary check.
  try {
    window.__lovableEvents?.captureException?.(
      "BFA:client-boundary",
      { source: "react_error_boundary", code: "client-boundary" },
      { mechanism: "react_error_boundary", handled: false, severity: "error" },
    );
  } catch {
    // A reporter failure must not recursively expose its own raw exception.
  }
  try {
    window.__lovableReportRuntimeError?.({ message: "BFA:client-boundary" });
  } catch {
    // Diagnostic forwarding is best effort, never a new application failure.
  }
}
