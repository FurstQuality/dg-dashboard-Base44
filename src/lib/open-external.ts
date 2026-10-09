/**
 * Open a URL in a new browser tab reliably, even when the app is running
 * inside a sandboxed preview iframe. Plain `target="_blank"` sometimes ends
 * up navigating inside the frame — third-party sites (YouTube, etc.) then
 * block themselves with X-Frame-Options and the user sees "refused to
 * connect". Calling `window.open` from a user click uses the popup channel,
 * which the browser routes to a top-level tab.
 */
export function openExternal(url: string): void {
  if (typeof window === "undefined") return;
  // With `noopener`, browsers may return null even when the new tab opened.
  // Never use that return value to decide whether to navigate the current app.
  window.open(url, "_blank", "noopener,noreferrer");
}
