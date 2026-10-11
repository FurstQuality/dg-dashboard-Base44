/** Baseline headers compatible with map tiles, hosted checkout and local preview frames. */
export function secureResponse(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // Inline hydration currently prevents a strict script-src policy. These directives
  // still block injected base tags, plugins and unapproved third-party framing.
  const url = new URL(request.url);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const previewOrigins = (process.env.PREVIEW_APP_ORIGINS ?? process.env.SANDBOX_PREVIEW_URL ?? "")
    .split(",")
    .flatMap((raw) => {
      try {
        const target = new URL(raw.trim());
        return target.protocol === "https:" && !target.username && !target.password
          ? [target.origin]
          : [];
      } catch {
        return [];
      }
    });
  if (local) previewOrigins.push("http://127.0.0.1:5190", "http://localhost:5190");
  const deviceAllowlist = [
    "self",
    ...new Set(previewOrigins.map((origin) => JSON.stringify(origin))),
  ].join(" ");
  headers.set(
    "Permissions-Policy",
    `camera=(${deviceAllowlist}), microphone=(), geolocation=(${deviceAllowlist}), payment=(self)`,
  );
  const frameOrigins = (process.env.PREVIEW_FRAME_ORIGINS ?? "").split(",").flatMap((raw) => {
    try {
      const origin = new URL(raw.trim());
      return origin.protocol === "https:" && !origin.username && !origin.password
        ? [origin.origin]
        : [];
    } catch {
      return [];
    }
  });
  headers.set(
    "Content-Security-Policy",
    `base-uri 'self'; object-src 'none'; frame-ancestors 'self'${local ? " http://localhost:* http://127.0.0.1:*" : ""}${frameOrigins.length ? " " + frameOrigins.join(" ") : ""}`,
  );
  if (url.protocol === "https:") headers.set("Strict-Transport-Security", "max-age=31536000");
  if (
    request.headers.has("authorization") ||
    headers.has("set-cookie") ||
    url.pathname.startsWith("/_serverFn/") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth") ||
    url.pathname.startsWith("/admin") ||
    url.pathname === "/billing" ||
    url.pathname === "/google-calendar-callback"
  ) {
    headers.set("Cache-Control", "private, no-store");
  }
  if (url.pathname === "/google-calendar-callback") headers.set("Referrer-Policy", "no-referrer");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
