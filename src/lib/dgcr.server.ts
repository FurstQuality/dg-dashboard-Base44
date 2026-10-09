/**
 * Disc Golf Course Review (DGCR) ingest helpers.
 * Server-only: reads Firecrawl credentials and parses scraped course pages.
 */

export type DgcrCourseRecord = {
  dgcr_id: string;
  slug: string | null;
  name: string;
  park_name: string | null;
  city: string | null;
  state: string | null;
  country: string;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  review_count: number | null;
  hole_count: number | null;
  basket_count: number | null;
  water_holes: number | null;
  length_min_ft: number | null;
  length_max_ft: number | null;
  terrain: string | null;
  foliage: string | null;
  designer: string | null;
  year_established: number | null;
  tee_type: string | null;
  basket_type: string | null;
  conditions: string | null;
  course_type: string | null;
  pars: number[];
  sse: number[];
  rounds_recorded: number | null;
  avg_score: number | null;
  description: string | null;
  directions: string | null;
  url: string;
  raw: { markdown: string };
};

export type DgcrSearchHit = {
  dgcr_id: string;
  slug: string;
  name: string;
  url: string;
  snippet: string | null;
  /** "City, ST" pulled from the search result when it is stated there. */
  location: string | null;
};

const US_STATES = new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
]);

const CA_PROVINCES = new Set([
  "AB",
  "BC",
  "MB",
  "NB",
  "NL",
  "NS",
  "NT",
  "NU",
  "ON",
  "PE",
  "QC",
  "SK",
  "YT",
]);

/**
 * Pulls a readable "City, ST" out of a DGCR search title/description so people
 * can tell two same-named courses apart before importing one.
 */
export function extractDgcrLocation(
  title: string | undefined,
  description: string | undefined,
): string | null {
  const patterns = [
    /\bin\s+([A-Za-z][A-Za-z .'\-]{1,40}),\s*([A-Za-z]{2})\b/,
    /([A-Za-z][A-Za-z .'\-]{1,40}),\s*([A-Za-z]{2})\b/,
  ];
  for (const text of [title, description]) {
    if (!text) continue;
    for (const re of patterns) {
      const m = text.match(re);
      if (!m) continue;
      const region = m[2].toUpperCase();
      if (!US_STATES.has(region) && !CA_PROVINCES.has(region)) continue;
      const city = m[1].trim().replace(/\s+/g, " ");
      if (!city || /disc golf|course review/i.test(city)) continue;
      return `${city}, ${region}`;
    }
  }
  return null;
}

const GATEWAY = "https://connector-gateway.lovable.dev/firecrawl/v2";
const DIRECT = "https://api.firecrawl.dev/v2";

function firecrawlRequest(path: string, body: unknown): Promise<Response> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("Course data service is not connected yet.");

  if (key.startsWith("fc-")) {
    return fetch(`${DIRECT}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
  }

  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) throw new Error("Course data service is not configured.");
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

async function callFirecrawl<T>(path: string, body: unknown): Promise<T> {
  const res = await firecrawlRequest(path, body);
  if (!res.ok) {
    const text = await res.text();
    console.error(`DGCR fetch failed [${res.status}]: ${text}`);
    throw new Error(`Course lookup failed (${res.status}). Try again in a moment.`);
  }
  return (await res.json()) as T;
}

/** Pulls the numeric DGCR id and slug out of any dgcoursereview course URL. */
export function parseDgcrUrl(url: string): { slug: string; dgcr_id: string } | null {
  const m = url.match(/dgcoursereview\.com\/courses\/([a-z0-9-]+)\.(\d+)/i);
  if (!m) return null;
  return { slug: m[1], dgcr_id: m[2] };
}

/**
 * Collapses search results that point at the same real-world course.
 *
 * DGCR sometimes lists a venue more than once (renamed course, duplicate
 * submission). Entries with the same name and stated location are merged into
 * one row, keeping the richest details and preferring an entry already in the
 * app so members never see the same course twice.
 */
export function mergeDuplicateDgcrHits<T extends DgcrSearchHit & { imported?: boolean }>(
  hits: T[],
): T[] {
  const groupKey = (hit: T) =>
    `${hit.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()}|${(hit.location ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()}`;

  const groups = new Map<string, T>();
  for (const hit of hits) {
    const key = groupKey(hit);
    const current = groups.get(key);
    if (!current) {
      groups.set(key, hit);
      continue;
    }
    // Prefer the already-imported entry as the one we keep, then fill gaps.
    const keep = !current.imported && hit.imported ? hit : current;
    const other = keep === current ? hit : current;
    groups.set(key, {
      ...keep,
      location: keep.location ?? other.location,
      snippet:
        (keep.snippet?.length ?? 0) >= (other.snippet?.length ?? 0) ? keep.snippet : other.snippet,
      imported: Boolean(keep.imported || other.imported),
    });
  }
  return [...groups.values()];
}

export async function searchDgcrCourses(query: string, limit = 8): Promise<DgcrSearchHit[]> {
  const payload = await callFirecrawl<{
    data?:
      | { web?: { url: string; title?: string; description?: string }[] }
      | { url: string; title?: string; description?: string }[];
  }>("/search", {
    query: `site:dgcoursereview.com/courses ${query} disc golf course`,
    limit: Math.min(20, Math.max(limit, 5)),
  });

  const raw = payload.data;
  const rows = Array.isArray(raw) ? raw : (raw?.web ?? []);
  const seen = new Set<string>();
  const hits: DgcrSearchHit[] = [];

  for (const row of rows) {
    const parsed = parseDgcrUrl(row.url ?? "");
    if (!parsed) continue;
    // Skip review/photo/sub pages — we only want the course profile itself.
    if (/\.\d+\/[a-z]/i.test(row.url)) continue;
    if (seen.has(parsed.dgcr_id)) continue;
    seen.add(parsed.dgcr_id);
    hits.push({
      dgcr_id: parsed.dgcr_id,
      slug: parsed.slug,
      name: (row.title ?? parsed.slug.replace(/-/g, " ")).replace(/\s*[-|].*$/, "").trim(),
      url: `https://www.dgcoursereview.com/courses/${parsed.slug}.${parsed.dgcr_id}`,
      snippet: row.description ?? null,
      location: extractDgcrLocation(row.title, row.description),
    });
    if (hits.length >= limit) break;
  }
  return mergeDuplicateDgcrHits(hits);
}

function num(value: string | undefined | null): number | null {
  if (!value) return null;
  const n = Number(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function afterLabel(md: string, label: string): string | null {
  const re = new RegExp(`${label}\\s*:?\\s*\\n*([^\\n]+)`, "i");
  const m = md.match(re);
  return m ? m[1].trim() : null;
}

/** Converts a scraped DGCR course page (markdown) into a structured record. */
export function parseDgcrCourse(markdown: string, url: string): DgcrCourseRecord | null {
  const ids = parseDgcrUrl(url);
  if (!ids) return null;

  const name = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? ids.slug.replace(/-/g, " ");

  const ratingMatch = markdown.match(/([\d.]+)\s*\(based on\s*([\d,]+)\s*reviews?\)/i);
  const lengthMatch = markdown.match(/([\d,]+)\s*ft\.\s*-\s*([\d,]+)\s*ft\./i);
  const singleLength = markdown.match(/\n\s*([\d,]+)\s*ft\.\s*Metric/i);

  const holes = num(markdown.match(/(\d+)\s*Holes/i)?.[1]);
  const baskets = num(markdown.match(/(\d+)\s*Baskets/i)?.[1]);
  const water = num(markdown.match(/(\d+)\s*Water in play/i)?.[1]);

  const terrain =
    markdown.match(/(Mostly Flat|Moderately Hilly|Very Hilly|Mostly Open|Rolling Hills)/i)?.[1] ??
    null;
  const foliage =
    markdown.match(
      /(Heavily Wooded|Moderately Wooded|Lightly Wooded|Mostly Open|Not Wooded)/i,
    )?.[1] ?? null;

  const designer = afterLabel(markdown, "Designer\\(s\\)");
  const year = num(afterLabel(markdown, "Year established")?.replace(/\D/g, "") ?? null);
  const teeType = afterLabel(markdown, "Tee Type");
  const basketType = afterLabel(markdown, "Hole Type");

  // "Par Info:" and "DGCR SSE:" are followed by one number per tee/layout.
  function numberBlock(label: RegExp): number[] {
    const idx = markdown.search(label);
    if (idx < 0) return [];
    const tail = markdown.slice(idx).split("\n").slice(1, 14);
    const out: number[] = [];
    for (const line of tail) {
      const t = line.trim();
      if (!t) continue;
      if (!/^[\d.]+$/.test(t)) {
        if (out.length) break;
        continue;
      }
      out.push(Number(t));
    }
    return out;
  }

  const pars = numberBlock(/Par Info\s*:/i).map((n) => Math.round(n));
  const sse = numberBlock(/DGCR SSE\s*:/i);

  const roundsMatch = markdown.match(
    /Rounds Recorded \/ Average Score\s*:\s*\[?\s*([\d,]+)\s*\/\s*([\d,]+)/i,
  );
  const coords = markdown.match(
    /Latitude \/ Longitude\s*:?\s*\n*\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/i,
  );
  const zip = markdown.match(/[?&]zip=(\d{5})/)?.[1] ?? null;

  const locBlock = markdown.match(/###\s*Location\s*\n+([\s\S]{0,400}?)\n\n/i)?.[1] ?? "";
  const park = locBlock.match(/^([^[\n\\]+?)(?:\\\[|\[|,)/)?.[1]?.trim() || null;
  const cityLine = locBlock.match(/\]([^[\n]*?),\s*(?:\[)?(\d{5})?/)?.[1]?.trim() ?? null;
  const headerCity =
    markdown.match(/\n([A-Z][A-Za-z .'-]+),\s*\n+\[([A-Z]{2})\]\(/)?.slice(1) ?? null;
  const stateName = markdown.match(/courses\/state\/([a-z-]+)\.\d+/i)?.[1] ?? null;

  const description =
    markdown.match(/\n\n([^\n[#*]{60,600})\n\nDesigner\(s\)/)?.[1]?.trim() ??
    markdown.match(/\n\n([^\n[#*]{60,600})\n\nYear established/)?.[1]?.trim() ??
    null;
  const directions = afterLabel(markdown, "Local Directions");
  const conditions =
    markdown.match(/(Unplayable|Bad|Decent|Good|Perfect)\s+conditions/i)?.[1] ?? null;

  return {
    dgcr_id: ids.dgcr_id,
    slug: ids.slug,
    name,
    park_name: park && park.toLowerCase() !== name.toLowerCase() ? park : null,
    city: headerCity?.[0] ?? cityLine ?? null,
    state: headerCity?.[1] ?? (stateName ? stateName.replace(/-/g, " ") : null),
    country: "USA",
    postal_code: zip,
    latitude: coords ? Number(coords[1]) : null,
    longitude: coords ? Number(coords[2]) : null,
    rating: ratingMatch ? Number(ratingMatch[1]) : null,
    review_count: ratingMatch ? num(ratingMatch[2]) : null,
    hole_count: holes,
    basket_count: baskets,
    water_holes: water,
    length_min_ft: lengthMatch ? num(lengthMatch[1]) : num(singleLength?.[1] ?? null),
    length_max_ft: lengthMatch ? num(lengthMatch[2]) : num(singleLength?.[1] ?? null),
    terrain,
    foliage,
    designer,
    year_established: year && year > 1900 && year < 2100 ? year : null,
    tee_type: teeType,
    basket_type: basketType,
    conditions,
    course_type: markdown.match(/\n(Permanent|Temporary)\s+course/i)?.[1] ?? null,
    pars,
    sse,
    rounds_recorded: roundsMatch ? num(roundsMatch[1]) : null,
    avg_score: roundsMatch ? num(roundsMatch[2]) : null,
    description,
    directions,
    url: `https://www.dgcoursereview.com/courses/${ids.slug}.${ids.dgcr_id}`,
    raw: { markdown: markdown.slice(0, 20000) },
  };
}

/** Scrapes a DGCR course page and returns the parsed record. */
export async function fetchDgcrCourse(url: string): Promise<DgcrCourseRecord> {
  // Domain/format gate before the outbound scrape so the scraper can never be
  // pointed at an arbitrary URL.
  if (!parseDgcrUrl(url)) {
    throw new Error("Only Disc Golf Course Review course URLs can be imported.");
  }
  const payload = await callFirecrawl<{
    data?: { markdown?: string; metadata?: { statusCode?: number } };
  }>("/scrape", { url, formats: ["markdown"], onlyMainContent: true });
  const markdown = payload.data?.markdown ?? "";
  const status = payload.data?.metadata?.statusCode ?? 200;
  if (status >= 400 || !markdown) {
    throw new Error("That course page could not be read on Disc Golf Course Review.");
  }
  const record = parseDgcrCourse(markdown, url);
  if (!record) throw new Error("That link is not a Disc Golf Course Review course page.");
  return record;
}
