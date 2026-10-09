/** Push delivery is an outbound server request, so even saved endpoints need validation. */
export function assertPushEndpoint(raw: string): string {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  const allowed =
    ["fcm.googleapis.com", "android.googleapis.com", "web.push.apple.com"].includes(host) ||
    host.endsWith(".push.services.mozilla.com") ||
    host === "push.services.mozilla.com" ||
    host.endsWith(".notify.windows.com");
  if (url.protocol !== "https:" || url.port || url.username || url.password || !allowed) {
    throw new Error("Unsupported push service");
  }
  return url.href;
}

export function safeNotificationPath(raw: string | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || /[\\\u0000-\u001f]/.test(raw))
    return "/";
  return raw;
}
