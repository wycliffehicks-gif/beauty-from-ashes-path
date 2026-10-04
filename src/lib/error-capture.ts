// Initialized before the server framework. Keep only bounded event codes; do not
// retain a process-wide "last error" that can contain another request's data.
import { installSafeServerConsole, reportSafeError } from "./safe-error-reporting";

let initialized = false;

// Explicit invocation keeps this initializer in builds with sideEffects:false.
export function initializeSafeServerErrorReporting(): void {
  if (initialized) return;
  initialized = true;
  installSafeServerConsole(console);
  if (typeof globalThis.addEventListener === "function") {
    globalThis.addEventListener("error", () => reportSafeError("server-runtime"));
    globalThis.addEventListener("unhandledrejection", () =>
      reportSafeError("server-unhandled-rejection"),
    );
  }
}
