/** Invitation links use a configured origin, never a request Host/forwarded header. */
export function publicAppOrigin(env: Record<string, string | undefined> = process.env): string {
  const raw = env.PUBLIC_APP_URL?.trim();
  if (!raw) throw new Error("Set PUBLIC_APP_URL before sending invitations.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("PUBLIC_APP_URL must be the app's HTTPS origin.");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && local && env.NODE_ENV === "development"))
  ) {
    throw new Error("PUBLIC_APP_URL must be the app's HTTPS origin.");
  }
  return url.origin;
}
