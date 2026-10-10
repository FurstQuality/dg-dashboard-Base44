import { afterEach, describe, expect, it, vi } from "vitest";
import { reportRuntimeError } from "./runtime-error-reporting";

afterEach(() => vi.unstubAllGlobals());

describe("runtime error reporting", () => {
  it("does not report during server rendering", () => {
    vi.stubGlobal("window", undefined);
    expect(() => reportRuntimeError(new Error("server"))).not.toThrow();
  });
  it("preserves the original error for native browser reporting", () => {
    const reportError = vi.fn();
    vi.stubGlobal("window", { reportError });
    const error = new Error("boundary failure");
    reportRuntimeError(error);
    expect(reportError).toHaveBeenCalledWith(error);
  });
  it("normalizes thrown responses", () => {
    const reportError = vi.fn();
    vi.stubGlobal("window", { reportError });
    reportRuntimeError(new Response(null, { status: 503 }));
    expect(reportError.mock.calls[0][0].message).toBe("Response 503");
  });
  it("dispatches an error event when native reporting is unavailable", () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("ErrorEvent", class { constructor(public type: string, public options: unknown) {} });
    vi.stubGlobal("window", { dispatchEvent, location: { pathname: "/courses" } });
    reportRuntimeError("boundary failure");
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: "error", options: expect.objectContaining({ message: "boundary failure", filename: "/courses" }),
    }));
  });
});