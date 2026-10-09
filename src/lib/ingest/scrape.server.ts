/**
 * Fetch helpers for the background crawler.
 *
 * PDGA detail pages go through the Firecrawl connector (they are behind heavy
 * bot protection); Disc Golf Scene and UDisc pages are plain HTML fetches.
 * Denials that mean "stop crawling entirely" (payment, policy) are raised as
 * `ScrapeDenied` so the run loop can pause the whole queue.
 */
import { ScrapeDenied } from "./queue.server";

const FIRECRAWL_GATEWAY = "https://connector-gateway.lovable.dev/firecrawl/v2";

/** Minimum gap between outside requests, plus jitter, to stay polite. */
const MIN_INTERVAL_MS = 3500;
const JITTER_MS = 2500;

let lastRequestAt = 0;

export async function politeDelay(): Promise<void> {
  const wait = Math.max(
    0,
    lastRequestAt + MIN_INTERVAL_MS + Math.random() * JITTER_MS - Date.now(),
  );
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

export type ScrapeResult = { markdown?: string; html?: string; status: number };

/** Scrape one page through Firecrawl. Costs one page against the daily budget. */
export async function scrapePage(url: string): Promise<ScrapeResult> {
  const lovable = process.env["LOVABLE_API_KEY"];
  const conn = process.env["FIRECRAWL_API_KEY"];
  if (!lovable || !conn) {
    throw new ScrapeDenied(403, "Web-page reader is not connected");
  }

  // A "too many requests" answer is normal at this volume: wait the amount the
  // reader asks for and try again a couple of times before giving up on the page.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await politeDelay();
    const res = await fetch(`${FIRECRAWL_GATEWAY}/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovable}`,
        "X-Connection-Api-Key": conn,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown", "html"],
        onlyMainContent: false,
        waitFor: 500,
        location: { country: "US", languages: ["en"] },
      }),
    });

    if (res.status === 402 || res.status === 403 || res.status === 401) {
      throw new ScrapeDenied(res.status, `Page reader refused the request (${res.status})`);
    }

    if (res.status === 429) {
      if (attempt === 2) return { status: 429 };
      const retryAfter = Number(res.headers.get("retry-after") ?? "");
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(20_000, retryAfter * 1000)
          : 4_000 * (attempt + 1);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    if (!res.ok) return { status: res.status };

    const json = (await res.json()) as { data?: Record<string, unknown> } & Record<string, unknown>;
    const data = (json.data ?? json) as { markdown?: string; html?: string };
    return { markdown: data.markdown, html: data.html, status: 200 };
  }

  return { status: 429 };
}

/** Plain HTML fetch for sites that do not need the page reader. */
export async function fetchHtml(url: string): Promise<string | null> {
  await politeDelay();
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DGDashboard/1.0)",
        Accept: "text/html",
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}
