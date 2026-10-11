/** Editor page names from the original scaffold point to the imported app's routes. */
const pages: Record<string, { path: string; mode?: string }> = {
  "/ForgotPassword": { path: "/auth", mode: "forgot" },
  "/Login": { path: "/auth" },
  "/Register": { path: "/auth", mode: "signup" },
  "/ResetPassword": { path: "/reset-password" },
  "/OAuthConsent": { path: "/.lovable/oauth/consent" },
};

export function previewPageRedirect(request: Request): Response | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);
  const page = pages[url.pathname];
  if (!page) return null;
  url.pathname = page.path;
  if (page.mode) url.searchParams.set("mode", page.mode);
  return new Response(null, {
    status: 307,
    headers: { Location: `${url.pathname}${url.search}`, "Cache-Control": "private, no-store" },
  });
}