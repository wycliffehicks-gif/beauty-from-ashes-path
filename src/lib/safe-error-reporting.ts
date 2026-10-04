// Error reporting intentionally has no payload/context argument. Reflection
// selections, private writing, credentials, URLs and exception text never belong
// in these application-owned events. These codes are diagnostic categories only.
export const SAFE_ERROR_CODES = [
  "client-boundary",
  "server-handler",
  "server-middleware",
  "server-ssr",
  "server-framework-error",
  "server-framework-warning",
  "server-runtime",
  "server-unhandled-rejection",
] as const;

export type SafeErrorCode = (typeof SAFE_ERROR_CODES)[number];
const EVENT_MARKER = "BFA_EVENT";

function isSafeCode(value: unknown): value is SafeErrorCode {
  return typeof value === "string" && (SAFE_ERROR_CODES as readonly string[]).includes(value);
}

export function reportSafeError(code: SafeErrorCode): void {
  // Runtime validation also protects against an untyped caller passing content.
  console.error(EVENT_MARKER, isSafeCode(code) ? code : "server-framework-error");
}

/**
 * Install before the server entry imports its framework. Unknown arguments are
 * discarded without inspecting, stringifying or retaining the original value.
 * This covers console.error/warn through this process, not hosting telemetry,
 * provider logs, stdout/stderr writes or framework hooks outside this console.
 */
export function installSafeServerConsole(target: Pick<Console, "error" | "warn">): () => void {
  const originalError = target.error;
  const originalWarn = target.warn;
  target.error = (...args: unknown[]) => {
    const code =
      args.length === 2 && args[0] === EVENT_MARKER && isSafeCode(args[1])
        ? args[1]
        : "server-framework-error";
    originalError.call(target, EVENT_MARKER, code);
  };
  target.warn = () => originalWarn.call(target, EVENT_MARKER, "server-framework-warning");
  return () => {
    target.error = originalError;
    target.warn = originalWarn;
  };
}
