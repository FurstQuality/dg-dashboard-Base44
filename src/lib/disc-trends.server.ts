/**
 * Disc market trend ingest.
 * Server-only: scrapes the published weekly best-seller rankings (rank, flight
 * numbers, ratings) so the app can show what the disc golf market is buying.
 */

export type DiscTrendRecord = {
  rank: number;
  name: string;
  plastic: string | null;
  image_url: string | null;
  product_url: string;
  rating: number | null;
  review_count: number | null;
  speed: number | null;
  glide: number | null;
  turn: number | null;
  fade: number | null;
  description: string | null;
};

const GATEWAY = "https://connector-gateway.lovable.dev/firecrawl/v2";
const DIRECT = "https://api.firecrawl.dev/v2";
const SOURCE_URL = "https://infinitediscs.com/top-selling/discs-last-week";

function firecrawlRequest(path: string, body: unknown): Promise<Response> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("Disc data service is not connected yet.");

  if (key.startsWith("fc-")) {
    return fetch(`${DIRECT}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
  }

  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) throw new Error("Disc data service is not connected yet.");
  return fetch(`${GATEWAY}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": key,
    },
    body: JSON.stringify(body),
  });
}

async function scrapeMarkdown(url: string): Promise<string> {
  const res = await firecrawlRequest("/scrape", {
    url,
    formats: ["markdown"],
    onlyMainContent: true,
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`Disc trend scrape failed [${res.status}]: ${text}`);
    throw new Error(`Could not reach the disc rankings right now (${res.status}).`);
  }
  const payload = (await res.json()) as { markdown?: string; data?: { markdown?: string } };
  const markdown = payload.markdown ?? payload.data?.markdown;
  if (!markdown) throw new Error("The disc rankings page returned no readable content.");
  return markdown;
}

function num(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function titleCase(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Parses the weekly best-seller page into ranked disc records. */
export function parseDiscTrends(markdown: string): DiscTrendRecord[] {
  const entry =
    /\n(\d{1,3})\n+\[!\[([^\]]*)\]\((https?:\/\/[^)]+)\)\]\((https?:\/\/[^)]+)\)\n+# ([^\n]+)/g;
  const matches = Array.from(markdown.matchAll(entry));
  const out: DiscTrendRecord[] = [];

  matches.forEach((match, index) => {
    const start = match.index! + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index! : markdown.length;
    const block = markdown.slice(start, end);

    const rating = block.match(/\*\*([\d.]+)\*\*/);
    const reviews = block.match(/\((\d[\d,]*)\s+Reviews?\)/i);
    const flight = block.match(
      /Manufacturer Flight Numbers\s+\*\*(-?[\d.]+)\/(-?[\d.]+)\/(-?[\d.]+)\/(-?[\d.]+)\*\*/,
    );
    const description = block
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 60 && !line.startsWith("#") && !line.startsWith("["));

    const productUrl = match[4].split("?")[0];
    const plasticSlug = productUrl.split("/").filter(Boolean).pop() ?? "";

    out.push({
      rank: Number(match[1]),
      name: match[5].trim(),
      plastic: plasticSlug ? titleCase(plasticSlug) : null,
      image_url: match[3],
      product_url: productUrl,
      rating: num(rating?.[1]),
      review_count: reviews ? Number(reviews[1].replace(/,/g, "")) : null,
      speed: num(flight?.[1]),
      glide: num(flight?.[2]),
      turn: num(flight?.[3]),
      fade: num(flight?.[4]),
      description: description ?? null,
    });
  });

  return out
    .filter((r) => Number.isFinite(r.rank) && r.name.length > 0)
    .sort((a, b) => a.rank - b.rank);
}

/** Fetches and parses this week's best-selling discs. */
export async function fetchDiscTrends(): Promise<DiscTrendRecord[]> {
  const markdown = await scrapeMarkdown(SOURCE_URL);
  const rows = parseDiscTrends(markdown);
  if (rows.length === 0) throw new Error("No rankings were found on the source page.");
  return rows;
}

/** Monday of the week a ranking belongs to, in YYYY-MM-DD form. */
export function weekStart(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
  return d.toISOString().slice(0, 10);
}
