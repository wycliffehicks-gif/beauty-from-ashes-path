import { afterEach, describe, expect, it, vi } from "vitest";
import { installSafeServerConsole, reportSafeError } from "../safe-error-reporting";
import { reportLovableError } from "../lovable-error-reporting";

const SECRET = "FICTIONAL_PRIVATE_WRITING_8b3f_DO_NOT_LOG";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("bounded application error reporting", () => {
  it("drops raw strings, objects, error causes and warnings without reading getters", () => {
    const error = vi.fn();
    const warn = vi.fn();
    const target = { error, warn };
    const restore = installSafeServerConsole(target);
    const hostile = {
      get message() {
        throw new Error(SECRET);
      },
      toString() {
        throw new Error(SECRET);
      },
    };
    target.error(new Error(SECRET, { cause: new Error(SECRET) }), { writing: SECRET });
    target.error(SECRET, hostile);
    target.warn(SECRET, new Error(SECRET));
    target.error("BFA_EVENT", "server-handler");
    expect(error.mock.calls).toEqual([
      ["BFA_EVENT", "server-framework-error"],
      ["BFA_EVENT", "server-framework-error"],
      ["BFA_EVENT", "server-handler"],
    ]);
    expect(warn.mock.calls).toEqual([["BFA_EVENT", "server-framework-warning"]]);
    expect(JSON.stringify([error.mock.calls, warn.mock.calls])).not.toContain(SECRET);
    restore();
    expect(target.error).toBe(error);
  });

  it("runtime-validates even a forged safe-event code", () => {
    const sink = vi.spyOn(console, "error").mockImplementation(() => {});
    reportSafeError(SECRET as "server-handler");
    expect(sink).toHaveBeenCalledWith("BFA_EVENT", "server-framework-error");
  });

  it("forwards only fixed browser codes, omitting errors, route, context and stack", () => {
    const captureException = vi.fn();
    const report = vi.fn();
    vi.stubGlobal("window", {
      __lovableEvents: { captureException },
      __lovableReportRuntimeError: report,
      get location() {
        throw new Error(SECRET);
      },
    });
    reportLovableError(new Error(SECRET, { cause: SECRET }), { notes: SECRET, token: SECRET });
    expect(captureException).toHaveBeenCalledWith(
      "BFA:client-boundary",
      { source: "react_error_boundary", code: "client-boundary" },
      { mechanism: "react_error_boundary", handled: false, severity: "error" },
    );
    expect(report).toHaveBeenCalledWith({ message: "BFA:client-boundary" });
    expect(JSON.stringify([captureException.mock.calls, report.mock.calls])).not.toContain(SECRET);
  });

  it("does not inspect thrown objects or leak errors from failing reporting hooks", () => {
    const sink = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("window", {
      __lovableEvents: {
        captureException() {
          throw new Error(SECRET);
        },
      },
      __lovableReportRuntimeError() {
        throw new Error(SECRET);
      },
    });
    expect(() =>
      reportLovableError({
        toString() {
          throw new Error(SECRET);
        },
      }),
    ).not.toThrow();
    expect(sink).not.toHaveBeenCalled();
  });
});
