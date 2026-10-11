import { firecrawlProvider } from "./service-providers";
import { recordSnapshot } from "./data-intel/snapshots.server";
import { readBoundedText } from "./http-safety";

export function isFirecrawlConfigured(): boolean {
  return firecrawlProvider(process.env).keys.every(key => !!process.env[key]?.trim());
}

/** Preserve direct public-page reads through the same immutable source store. */
export async function archiveSourceHtml(url: string, html: string): Promise<string> {
  const hostname = new URL(url).hostname.toLowerCase();
  const source = hostname === "pdga.com" || hostname.endsWith(".pdga.com") ? "pdga"
    : hostname === "discgolfscene.com" || hostname.endsWith(".discgolfscene.com") ? "disc_golf_scene" : "public_web";
  if (!await recordSnapshot({ source, entityType: "source_page", externalId: url, sourceUrl: url, payload: { html }, parserVersion: "public-html-v1" })) throw new Error("The source page could not be archived. Please try again.");
  return html;
}

/** One provider per request; credentials never reach a fetched source page. */
export async function firecrawlRequest(path: "/scrape" | "/search", body: unknown): Promise<Response> {
  const provider = firecrawlProvider(process.env);
  if (!isFirecrawlConfigured()) throw new Error("Firecrawl is not configured.");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (provider.id === "lovable") {
    headers.Authorization = `Bearer ${process.env.LOVABLE_API_KEY!.trim()}`;
    headers["X-Connection-Api-Key"] = process.env.FIRECRAWL_API_KEY!.trim();
  } else headers.Authorization = `Bearer ${process.env.FIRECRAWL_API_KEY!.trim()}`;
  try {
    const response = await fetch(`${provider.endpoint}${path}`, {
      method: "POST", headers, body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000), redirect: "error",
    });
    if (response.ok) {
      const input = body as { url?: string; query?: string };
      const payload = JSON.parse(await readBoundedText(response.clone(), 10 * 1024 * 1024));
      const snapshot = await recordSnapshot({ source: "firecrawl", entityType: path === "/scrape" ? "source_page" : "source_search", externalId: input.url ?? input.query ?? path, sourceUrl: input.url ?? null, payload, parserVersion: "firecrawl-v2" });
      if (!snapshot) throw new Error("Source archive unavailable.");
    }
    return response;
  } catch {
    throw new Error("The page reader could not complete the request. Please try again.");
  }
}
