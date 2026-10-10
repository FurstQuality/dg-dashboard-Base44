/** Reports boundary-caught errors through standard browser error reporting. */
export function reportRuntimeError(error: unknown) {
  if (typeof window === "undefined") return;
  const normalized = error instanceof Error ? error : new Error(
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : String(error),
  );
  if (typeof window.reportError === "function") {
    window.reportError(normalized);
    return;
  }
  window.dispatchEvent(new ErrorEvent("error", {
    error: normalized,
    message: normalized.message,
    filename: window.location.pathname,
  }));
}