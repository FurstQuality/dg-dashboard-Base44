/**
 * Fetch a public PDGA page. pdga.com often blocks server requests (403),
 * so a blocked or failed direct read falls back to the Firecrawl connector.
 */
const FIRECRAWL_GATEWAY = "https://connector-gateway.lovable.dev/firecrawl/v2";

export async function fetchPdgaHtml(url: string): Promise<string> {
  let status = 0;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    status = res.status;
    if (res.ok) return await res.text();
    if (res.status === 404) throw new Error(`PDGA page not found (404) for ${url}`);
  } catch (e) {
    if (e instanceof Error && e.message.includes("404")) throw e;
  }
  const lovable = process.env.LOVABLE_API_KEY;
  const conn = process.env.FIRECRAWL_API_KEY;
  if (!lovable || !conn) throw new Error(`PDGA fetch failed (${status}) for ${url}`);
  const res = await fetch(`${FIRECRAWL_GATEWAY}/scrape`, {
    method: "POST",
    headers: { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": conn, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["html"], onlyMainContent: false, location: { country: "US", languages: ["en"] } }),
  });
  if (!res.ok) throw new Error(`PDGA is not answering right now (${status || res.status}). Try again in a few minutes.`);
  const json = (await res.json()) as { data?: { html?: string; rawHtml?: string } };
  const html = json.data?.html ?? json.data?.rawHtml;
  if (!html) throw new Error(`PDGA returned an empty page for ${url}`);
  return html;
}
