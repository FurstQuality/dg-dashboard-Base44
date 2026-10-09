/**
 * Direct PDGA tour-search scraper.
 *
 * pdga.com/tour/search renders results as server-side HTML (Drupal views
 * table), so we can read the live schedule without a scraping vendor. Used as
 * the primary ingest path for `pdga_tour_events`; the Firecrawl extractor
 * remains a fallback when the markup changes.
 */

export type ScrapedPdgaEvent = {
  pdga_event_id: string;
  name: string;
  url: string;
  start_date: string | null;
  end_date: string | null;
  tier: string | null;
  sanctioning: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  location: string | null;
};

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function iso(year: number, month: number, day: number): string | null {
  if (!month || !day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Parse PDGA date cells: "August 30, 2026", "October 2 - 4, 2026",
 * "May 12 - September 1, 2026", or a cross-year "December 30, 2026 - January 2, 2027".
 */
export function parsePdgaDateRange(text: string): { start: string | null; end: string | null } {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return { start: null, end: null };
  const years = clean.match(/\b(20\d{2})\b/g) ?? [];
  const endYear = Number(years[years.length - 1] ?? 0);
  const startYear = years.length > 1 ? Number(years[0]) : endYear;
  if (!endYear) return { start: null, end: null };

  const [left, right] = clean.split(/\s*[-–]\s*/, 2);
  const readPart = (part: string | undefined) => {
    if (!part) return { month: 0, day: 0 };
    const m = part.match(/([A-Za-z]+)?\s*(\d{1,2})\b/);
    const month = m?.[1] ? (MONTHS[m[1].toLowerCase()] ?? 0) : 0;
    const day = m?.[2] ? Number(m[2]) : 0;
    return { month, day };
  };

  const a = readPart(left);
  if (!right) {
    const d = iso(endYear, a.month, a.day);
    return { start: d, end: d };
  }
  const b = readPart(right);
  const endMonth = b.month || a.month;
  return {
    start: iso(startYear, a.month, a.day),
    end: iso(endYear, endMonth, b.day),
  };
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function cell(rowHtml: string, field: string): string {
  const m = rowHtml.match(new RegExp(`views-field-${field}(?:[ "][^>]*)?>([\\s\\S]*?)</td>`, "i"));
  return m ? stripTags(m[1]) : "";
}

/** Two-letter region codes that are a state or province, never a country. */
const REGION_CODE = /^[A-Z]{2}$/;
const NON_COUNTRY_CODES = new Set([
  // Canadian provinces and territories, which PDGA writes as "Ottawa, ON".
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

export function splitLocation(raw: string): {
  city: string | null;
  state: string | null;
  country: string | null;
} {
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return { city: null, state: null, country: null };
  if (parts.length === 1) return { city: null, state: null, country: parts[0] };
  if (parts.length === 2) {
    // "Ottawa, ON" is a city and a province, not a city and a country: a bare
    // two-letter code is always a region, so the country stays unknown rather
    // than being filled with something wrong.
    const tail = parts[1].toUpperCase();
    if (REGION_CODE.test(tail)) {
      return {
        city: parts[0],
        state: parts[1],
        country: NON_COUNTRY_CODES.has(tail) ? "Canada" : null,
      };
    }
    return { city: parts[0], state: null, country: parts[1] };
  }
  return { city: parts[0], state: parts[1], country: parts.slice(2).join(", ") };
}

/** Parse a single PDGA tour-search results page. */
export function parsePdgaSearchPage(html: string): ScrapedPdgaEvent[] {
  const rows = html.match(/<tr class="[^"]*tid-\d+[^"]*">[\s\S]*?<\/tr>/g) ?? [];
  const out: ScrapedPdgaEvent[] = [];
  for (const row of rows) {
    const idMatch = row.match(/tid-(\d+)/);
    if (!idMatch) continue;
    const id = idMatch[1];
    const name = cell(row, "OfficialName");
    if (!name) continue;
    const locationRaw = cell(row, "Location");
    const { city, state, country } = splitLocation(locationRaw);
    const { start, end } = parsePdgaDateRange(cell(row, "StartDate"));
    const tier = cell(row, "Tier") || null;
    const classification = cell(row, "Classification") || null;
    const statusMatch = row.match(/status-([A-Za-z]+)/);
    out.push({
      pdga_event_id: id,
      name,
      url: `https://www.pdga.com/tour/event/${id}`,
      start_date: start,
      end_date: end ?? start,
      tier,
      sanctioning: statusMatch?.[1] ?? classification,
      city,
      state,
      country: country || "United States",
      location: locationRaw || null,
    });
  }
  return out;
}

/**
 * Tier buckets scraped separately.
 *
 * PDGA's default search sorts by start date, and long-running leagues (tier L)
 * start months earlier than the tournaments happening this week, so an unfiltered
 * paged crawl fills up with leagues and never reaches sanctioned tournaments.
 * Scraping each bucket with its own `Tier[]` filter guarantees tournament
 * coverage regardless of how many leagues are running.
 */
const TOURNAMENT_TIERS = [
  "NT",
  "M",
  "A",
  "B",
  "C",
  "XA",
  "XB",
  "XC",
  "XM",
  "ES",
  "W",
  "D",
] as const;
const LEAGUE_TIERS = ["L"] as const;

async function scrapeTierPages(params: {
  year: number;
  from: string;
  to: string;
  tier: string | null;
  maxPages: number;
  seen: Map<string, ScrapedPdgaEvent>;
}): Promise<void> {
  const { year, from, to, tier, maxPages, seen } = params;
  for (let page = 0; page < maxPages; page += 1) {
    const url =
      `https://www.pdga.com/tour/search?year=${year}` +
      `&date_filter%5Bmin%5D%5Bdate%5D=${encodeURIComponent(from)}` +
      `&date_filter%5Bmax%5D%5Bdate%5D=${encodeURIComponent(to)}` +
      (tier ? `&Tier%5B%5D=${encodeURIComponent(tier)}` : "") +
      `&order=StartDate&sort=asc&page=${page}`;
    let html: string;
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; DGDashboard/1.0)",
          Accept: "text/html",
        },
      });
      if (!res.ok) break;
      html = await res.text();
    } catch {
      break;
    }
    const events = parsePdgaSearchPage(html);
    if (!events.length) break;
    let added = 0;
    for (const e of events) {
      if (!seen.has(e.pdga_event_id)) {
        seen.set(e.pdga_event_id, e);
        added += 1;
      }
    }
    if (added === 0) break;
  }
}

/**
 * Fetch upcoming PDGA events straight from pdga.com. Tournament tiers are
 * crawled first, then leagues, so the mirror always carries both.
 */
export async function scrapePdgaTourEvents(opts?: {
  year?: number;
  from?: string;
  to?: string;
  /** Pages per tier bucket. */
  maxPages?: number;
  /** Pages for the league bucket (leagues are long-running and numerous). */
  leaguePages?: number;
  includeLeagues?: boolean;
}): Promise<ScrapedPdgaEvent[]> {
  const today = new Date();
  const year = opts?.year ?? today.getUTCFullYear();
  const from = opts?.from ?? today.toISOString().slice(0, 10);
  const to = opts?.to ?? `${year + 1}-12-31`;
  const maxPages = opts?.maxPages ?? 4;
  const leaguePages = opts?.leaguePages ?? 4;
  const includeLeagues = opts?.includeLeagues ?? true;

  const seen = new Map<string, ScrapedPdgaEvent>();
  for (const tier of TOURNAMENT_TIERS) {
    await scrapeTierPages({ year, from, to, tier, maxPages, seen });
  }
  if (includeLeagues) {
    for (const tier of LEAGUE_TIERS) {
      await scrapeTierPages({ year, from, to, tier, maxPages: leaguePages, seen });
    }
  }
  return Array.from(seen.values());
}

/* --------------------- pdga.com/tour/events/upcoming --------------------- */

const UPCOMING_URL = "https://www.pdga.com/tour/events/upcoming";

export type ScrapedPdgaUpcomingEvent = ScrapedPdgaEvent & {
  latitude: number | null;
  longitude: number | null;
  /** Human tier label straight from PDGA, e.g. "Pro-Am C-Tier". */
  tier_label: string | null;
};

const SHORT_MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/** "Sep 17 to Sep 20 2026" / "Oct 08 2026" / "Dec 30 to Jan 02 2027". */
export function parseUpcomingDateRange(text: string): { start: string | null; end: string | null } {
  const clean = text.replace(/\s+/g, " ").trim();
  const year = Number(clean.match(/\b(20\d{2})\b/)?.[1] ?? 0);
  if (!year) return { start: null, end: null };
  const parts = clean.split(/\s+to\s+/i);
  const read = (part: string | undefined) => {
    if (!part) return null;
    const m = part.match(/([A-Za-z]{3,})\s+(\d{1,2})\b/);
    if (!m) return null;
    const month = SHORT_MONTHS[m[1].slice(0, 3).toLowerCase()] ?? 0;
    const day = Number(m[2]);
    return month && day ? { month, day } : null;
  };
  const a = read(parts[0]);
  const b = parts.length > 1 ? read(parts[1]) : a;
  if (!a || !b) return { start: null, end: null };
  // A range that wraps the new year ends in the labelled year, so it starts the year before.
  const startYear = a.month > b.month ? year - 1 : year;
  return { start: iso(startYear, a.month, a.day), end: iso(year, b.month, b.day) };
}

/** Map PDGA's tier wording onto the tier codes used by tour search. */
export function tierCodeFromLabel(label: string | null): string | null {
  if (!label) return null;
  const l = label.toLowerCase();
  const experimental = l.includes("experimental");
  if (l.includes("elite series")) return "ES";
  if (l.includes("major")) return experimental ? "XM" : "M";
  if (l.includes("league")) return "L";
  if (l.includes("silver")) return "SS";
  if (l.includes("national tour")) return "NT";
  if (l.includes("unsanctioned")) return "UNS";
  // PDGA writes the letter tiers as "Pro-Am C-Tier", "Am B/C-Tier" and
  // occasionally "C Tier", so the separator has to allow a hyphen or slash.
  const letter = l.match(/\b([abc])[\s/-]*(?:[abc][\s/-]*)?tier\b/)?.[1]?.toUpperCase();
  if (letter) return (experimental ? "X" : "") + letter;
  return null;
}

/**
 * Read the live "upcoming events" feed. The page renders a Leaflet map whose
 * markers are embedded in `Drupal.settings`, which means every upcoming event
 * arrives with real coordinates — the one thing tour search never provides.
 */
export function parsePdgaUpcomingPage(html: string): ScrapedPdgaUpcomingEvent[] {
  const marker = "jQuery.extend(Drupal.settings, ";
  const at = html.indexOf(marker);
  if (at < 0) return [];
  const tail = html.slice(at + marker.length);
  // The settings blob is followed by ");", so read just the leading JSON value.
  let settings: unknown = null;
  for (let end = tail.indexOf("});"); end > 0; end = tail.indexOf("});", end + 1)) {
    try {
      settings = JSON.parse(tail.slice(0, end + 1));
      break;
    } catch {
      /* keep looking for the real end of the object */
    }
  }
  const leaflet = (settings as { leaflet?: Array<{ features?: unknown }> } | null)?.leaflet;
  const features = Array.isArray(leaflet) ? (leaflet[0]?.features ?? []) : [];
  if (!Array.isArray(features)) return [];

  const out: ScrapedPdgaUpcomingEvent[] = [];
  const seen = new Set<string>();
  for (const raw of features) {
    const f = raw as { lat?: string; lon?: string; popup?: string };
    const popup = typeof f.popup === "string" ? f.popup : "";
    const idMatch = popup.match(/\/tour\/event\/(\d+)/);
    if (!idMatch) continue;
    const id = idMatch[1];
    if (seen.has(id)) continue;
    const lines = popup.split(/<br\s*\/?>/i);
    const name = stripTags(lines[0] ?? "");
    if (!name) continue;
    const tierLabel = stripTags(lines[1] ?? "") || null;
    const { start, end } = parseUpcomingDateRange(stripTags(lines[2] ?? ""));
    const lat = Number(f.lat);
    const lon = Number(f.lon);
    seen.add(id);
    out.push({
      pdga_event_id: id,
      name,
      url: `https://www.pdga.com/tour/event/${id}`,
      start_date: start,
      end_date: end ?? start,
      tier: tierCodeFromLabel(tierLabel),
      sanctioning: tierLabel,
      tier_label: tierLabel,
      city: null,
      state: null,
      country: null,
      location: null,
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lon) ? lon : null,
    });
  }
  return out;
}

/** Fetch and parse pdga.com/tour/events/upcoming. */
export async function scrapePdgaUpcomingEvents(): Promise<ScrapedPdgaUpcomingEvent[]> {
  const res = await fetch(UPCOMING_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; DGDashboard/1.0)",
      Accept: "text/html",
    },
  });
  if (!res.ok) throw new Error(`PDGA upcoming events fetch failed (${res.status})`);
  return parsePdgaUpcomingPage(await res.text());
}
