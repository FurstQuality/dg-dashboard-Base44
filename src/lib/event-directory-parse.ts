import { stripEventSourceBrands } from "@/lib/event-name";
/**
 * Pure parsers for the live event directory.
 *
 * The directory sweeps three public schedules and normalizes every result into
 * one shape so `/events` can browse them side by side:
 *
 * - PDGA tour search (parsed in `pdga-tour-scrape.server.ts`)
 * - Disc Golf Scene tournament + league listings
 * - UDisc nearby-events listings
 *
 * Parsing is kept side-effect free here so the markup handling is unit
 * testable without network access; fetching and persistence live in
 * `event-directory.server.ts`.
 */

import { normalizeStateCode, stateCodeFromName } from "@/lib/us-states";

export type DirectorySource = "pdga" | "disc_golf_scene" | "udisc";

export type DirectoryEventInput = {
  source: DirectorySource;
  source_event_id: string;
  url: string | null;
  name: string;
  kind: "tournament" | "league";
  tier: string | null;
  sanctioning: string | null;
  start_date: string | null;
  end_date: string | null;
  venue_name: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  registration_status: string | null;
  field_size: number | null;
  field_capacity: number | null;
  cover_url: string | null;
  pdga_event_ref: string | null;
  discovered_via: string | null;
};

const MONTHS: Record<string, number> = {
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

function iso(year: number, month: number, day: number): string | null {
  if (!year || !month || !day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function decodeEntities(value: string): string {
  return value
    .replace(/&middot;/g, "·")
    .replace(/&rsquo;|&#8217;|&#039;|&apos;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;|&quot;/g, '"')
    .replace(/&ndash;|&mdash;/g, "-")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, code: string) => String.fromCharCode(parseInt(code, 16)));
}

export function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Clean an event title for display. Listings sometimes carry markdown emphasis
 * ("**Friday Night Doubles**") or stray separators from the source page.
 */
export function cleanEventName(raw: string): string {
  return stripEventSourceBrands(
    raw
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/[*_`]+/g, "")
      .replace(/\s{2,}/g, " ")
      .replace(/^[-–—·:|,\s]+|[-–—·:|,\s]+$/g, "")
      .trim(),
  );
}


/**
 * Parse a Disc Golf Scene date phrase into an ISO range.
 *
 * Handles "Sat, Sep 5, 2026", "Fri-Sun, Sep 4-6, 2026",
 * "Sat-Sun, Aug 30-Sep 1, 2026" and "Thu, Dec 31, 2026-Jan 2, 2027".
 */
export function parseSceneDatePhrase(
  phrase: string,
): { start: string | null; end: string | null } {
  const text = decodeEntities(phrase).replace(/\s+/g, " ").trim();
  const years = text.match(/\b(20\d{2})\b/g) ?? [];
  const endYear = Number(years[years.length - 1] ?? 0);
  if (!endYear) return { start: null, end: null };
  const startYear = years.length > 1 ? Number(years[0]) : endYear;

  // Drop weekday prefixes ("Fri-Sun, ") so only the month/day part remains.
  const datePart = (text.includes(",") ? text.slice(text.indexOf(",") + 1) : text).replace(
    /\b20\d{2}\b/g,
    " ",
  );
  const tokens = [...datePart.matchAll(/([A-Za-z]{3,})?\.?\s*(\d{1,2})\b/g)];
  const readable = tokens
    .map((m) => ({
      month: m[1] ? (MONTHS[m[1].slice(0, 3).toLowerCase()] ?? 0) : 0,
      day: Number(m[2]),
    }))
    .filter((t) => t.day >= 1 && t.day <= 31);
  if (!readable.length) return { start: null, end: null };

  const first = readable[0];
  const startMonth = first.month;
  const start = iso(startYear, startMonth, first.day);
  const last = readable.length > 1 ? readable[readable.length - 1] : null;
  if (!last) return { start, end: start };
  const end = iso(endYear, last.month || startMonth, last.day);
  return { start, end: end ?? start };
}

/** Pull the tier out of a Disc Golf Scene info line ("PDGA Flex C-tier · ..."). */
export function parseSceneTier(info: string): { tier: string | null; sanctioning: string | null } {
  const text = decodeEntities(info);
  const pdga = text.match(/PDGA\s+(Flex\s+)?([A-Z]{1,2})-tier/i);
  if (pdga) {
    const flex = Boolean(pdga[1]);
    return { tier: `${flex ? "Flex " : ""}${pdga[2].toUpperCase()}`, sanctioning: "PDGA" };
  }
  if (/league/i.test(text)) return { tier: null, sanctioning: null };
  return { tier: null, sanctioning: null };
}

function sceneField(block: string): { size: number | null; capacity: number | null } {
  const m = block.match(/<b>\s*(\d+)\s*\/\s*(\d+)\s*<\/b>/);
  if (!m) return { size: null, capacity: null };
  return { size: Number(m[1]), capacity: Number(m[2]) };
}

/**
 * Split a "City, ST" or "City, Country" location. Only real US states land in
 * `state`; anything else is treated as the country so state filters stay clean.
 */
function splitCityState(raw: string | null): {
  city: string | null;
  state: string | null;
  country: string | null;
} {
  if (!raw) return { city: null, state: null, country: null };
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return { city: parts[0] ?? null, state: null, country: null };
  const region = parts[parts.length - 1];
  const code = normalizeStateCode(region) ?? stateCodeFromName(region);
  if (code) return { city: parts[0], state: code, country: "United States" };
  return { city: parts[0], state: null, country: region };
}

const WEEKDAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

/** Weekday index (0 = Sunday) named in a phrase such as "Mon at 9:00am". */
export function weekdayFromPhrase(text: string): number | null {
  const match = decodeEntities(text)
    .toLowerCase()
    .match(/\b(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*\b/);
  if (!match) return null;
  const stem = match[1].slice(0, 3);
  const index = WEEKDAY_NAMES.findIndex((day) => day.startsWith(stem));
  return index >= 0 ? index : null;
}

/** Next date (ISO yyyy-mm-dd) on or after `from` that falls on `weekday`. */
export function nextWeekdayDate(weekday: number, from: Date = new Date()): string {
  const day = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const shift = (weekday - day.getUTCDay() + 7) % 7;
  day.setUTCDate(day.getUTCDate() + shift);
  return day.toISOString().slice(0, 10);
}

/**
 * Parse a Disc Golf Scene season range into ISO bounds (first day of the
 * opening month, last day of the closing month). Handles both "Jul '25 - Dec
 * '26" and "Apr - Nov 2026", where a single year covers both months.
 */
export function parseSceneSeasonRange(
  text: string,
): { start: string | null; end: string | null } {
  const clean = decodeEntities(text);
  const parts = [
    ...clean.matchAll(/([A-Za-z]{3,})\.?\s*(?:'(\d{2})|(20\d{2}))?/g),
  ]
    .map((m) => ({
      month: MONTHS[m[1].slice(0, 3).toLowerCase()] ?? 0,
      year: m[2] ? 2000 + Number(m[2]) : m[3] ? Number(m[3]) : null,
    }))
    .filter((p) => p.month > 0);
  if (!parts.length) return { start: null, end: null };

  // A month written without a year borrows the nearest year in the phrase.
  const fallbackYear =
    parts.find((p) => p.year != null)?.year ?? new Date().getUTCFullYear();
  const first = parts[0];
  const last = parts[parts.length - 1];
  const startYear = first.year ?? fallbackYear;
  const endYear = last.year ?? fallbackYear;
  const start = iso(startYear, first.month, 1);
  const lastDay = new Date(Date.UTC(endYear, last.month, 0)).getUTCDate();
  return { start, end: iso(endYear, last.month, lastDay) ?? start };
}


/** Parse a Disc Golf Scene league listing (`/leagues`, `/leagues/IN`). */
export function parseSceneLeagueList(
  html: string,
  opts: { discoveredVia: string; today?: Date },
): DirectoryEventInput[] {
  const blocks = html.match(/<div class="list-record league-list">[\s\S]*?<\/a>\s*<\/div>/g) ?? [];
  const today = opts.today ?? new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const out: DirectoryEventInput[] = [];
  for (const block of blocks) {
    const href = block.match(/href="\s*(https?:\/\/[^"\s]*\/league\/[^"\s]+)"/)?.[1];
    if (!href) continue;
    const cleanHref = href.replace(/[?#].*$/, "");
    const idMatch = cleanHref.match(/\/league\/(\d+)\/([^/]+)/);
    if (!idMatch) continue;
    const name = cleanEventName(
      stripTags(block.match(/<span class="name">([\s\S]*?)<\/span>/)?.[1] ?? ""),
    );
    if (!name) continue;

    // The listing splits details across nested spans, each flagged by an icon:
    // map marker = location, clipboard = format, calendar = meeting night.
    const locationRaw =
      stripTags(block.match(/fa-map-marker-alt[^>]*><\/i>([\s\S]*?)<\/span>/)?.[1] ?? "") || null;
    const seasonText = stripTags(
      block.match(/&middot;([\s\S]*?)<\/span>/)?.[1] ??
        block.match(/·([\s\S]*?)<\/span>/)?.[1] ??
        "",
    );
    const formatText = stripTags(block.match(/fa-clipboard-list[^>]*><\/i>([\s\S]*?)<\/span>/)?.[1] ?? "");
    const meetingText = stripTags(block.match(/fa-calendar-alt[^>]*><\/i>([\s\S]*?)<\/span>/)?.[1] ?? "");

    const { city, state, country } = splitCityState(locationRaw);
    const season = parseSceneSeasonRange(seasonText);
    const weekday = weekdayFromPhrase(meetingText);
    // Season ranges usually start in the past. Players need the next night that
    // actually tees off, so a weekly league is dated to its next meeting day.
    const nextMeeting =
      weekday != null && (!season.end || season.end >= todayIso)
        ? nextWeekdayDate(weekday, today)
        : null;
    const start =
      nextMeeting && (!season.start || season.start <= nextMeeting) ? nextMeeting : season.start;

    out.push({
      source: "disc_golf_scene",
      source_event_id: `league-${idMatch[1]}`,
      url: cleanHref,
      name,
      kind: "league",
      tier: formatText || null,
      sanctioning: /sanctioned/i.test(name) ? "PDGA" : null,
      start_date: start,
      end_date: season.end ?? start,
      venue_name: null,
      city,
      state,
      country,
      latitude: null,
      longitude: null,
      registration_status: null,
      field_size: null,
      field_capacity: null,
      cover_url: block.match(/<img src="(https:\/\/m\.discgolfscene\.com\/logos\/[^"]+)"/)?.[1] ?? null,
      pdga_event_ref: null,
      discovered_via: opts.discoveredVia,
    });
  }
  return out;
}


/**
 * Parse a Disc Golf Scene tournament listing page (`/tournaments`,
 * `/tournaments/IN`) into directory rows.
 */
export function parseSceneEventList(
  html: string,
  opts: { kind: "tournament" | "league"; discoveredVia: string },
): DirectoryEventInput[] {
  const blocks =
    html.match(/<div class="(?:tournament|league)-list list-record[\s\S]*?<\/a>\s*<\/div>/g) ?? [];
  const out: DirectoryEventInput[] = [];
  for (const block of blocks) {
    const href = block.match(/href="(https?:\/\/[^"]*\/(?:tournaments|leagues)\/[^"]+)"/)?.[1];
    if (!href) continue;
    const slug = href.replace(/[?#].*$/, "").split("/").filter(Boolean).pop() ?? "";
    if (!slug) continue;
    const nameHtml = block.match(/<span class="name">([\s\S]*?)<\/span>/)?.[1];
    const name = nameHtml ? cleanEventName(stripTags(nameHtml)) : "";
    if (!name) continue;

    const infoHtml = [...block.matchAll(/<span class="info">([\s\S]*?)<\/span>\s*<\/?span/g)].map(
      (m) => m[1],
    );
    const firstInfo = infoHtml[0] ? stripTags(infoHtml[0]) : "";
    const { tier, sanctioning } = parseSceneTier(firstInfo);
    const dates = parseSceneDatePhrase(firstInfo);

    const bolds = [...block.matchAll(/<b>([\s\S]*?)<\/b>/g)].map((m) => stripTags(m[1]));
    const locationBold = bolds.find((b) => /,\s*[A-Za-z]{2,}$/.test(b) && !/\d\s*\/\s*\d/.test(b));
    const venue = bolds.find((b) => b !== locationBold && !/\d\s*\/\s*\d/.test(b) && !/^\d+$/.test(b));
    const { city, state, country } = splitCityState(locationBold ?? null);
    const field = sceneField(block);

    out.push({
      source: "disc_golf_scene",
      source_event_id: slug,
      url: href.replace(/[?#].*$/, ""),
      name,
      kind: opts.kind,
      tier,
      sanctioning,
      start_date: dates.start,
      end_date: dates.end ?? dates.start,
      venue_name: venue ?? null,
      city,
      state,
      country,

      latitude: null,
      longitude: null,
      registration_status: /list-reg-open/.test(block) ? "open" : null,
      field_size: field.size,
      field_capacity: field.capacity,
      cover_url: block.match(/<img src="(https:\/\/m\.discgolfscene\.com\/logos\/[^"]+)"/)?.[1] ?? null,
      pdga_event_ref: null,
      discovered_via: opts.discoveredVia,
    });
  }
  return out;
}

/** Parse the UDisc nearby-events listing (`udisc.com/events?latitude=..&longitude=..`). */
export function parseUdiscEventList(
  html: string,
  opts: { discoveredVia: string },
): DirectoryEventInput[] {
  const blocks = html.split(/<a class="group flex w-full flex-col items-center gap-2 text-left/);
  const out: DirectoryEventInput[] = [];
  const seen = new Set<string>();
  for (const raw of blocks.slice(1)) {
    const block = raw.slice(0, 6000);
    const href = block.match(/href="\/events\/([^"?#]+)/)?.[1];
    if (!href || href === "add") continue;
    const slug = decodeEntities(href);
    if (seen.has(slug)) continue;
    seen.add(slug);

    const texts = [...block.matchAll(/>([^<>]{2,120})<\/div>/g)].map((m) => decodeEntities(m[1]).trim());
    const typeText = texts.find((t) => /^(Tournament|League|Casual Round|Clinic)$/i.test(t)) ?? "";
    // Listings show the league name and the specific night on separate lines
    // ("Duneland" + "Duneland Monday Dubs @ PNW"). Keep both so weekly nights
    // stay tellable apart.
    const nameCandidates = texts
      .filter(
        (t) =>
          t &&
          t !== typeText &&
          !/•/.test(t) &&
          !/^\d+(\.\d+)? mi$/.test(t) &&
          !/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/i.test(t) &&
          !/^(Registration|Waitlist|Sold out|Full|Free|[A-C]\s*Tier)\b/i.test(t) &&
          !/^[A-Za-z]{3,9}\.?\s+\d{1,2},\s*20\d{2}$/.test(t),
      )
      .map((t) => cleanEventName(t))
      .filter(Boolean);
    const group = nameCandidates[0] ?? "";
    const night = nameCandidates[1] ?? "";
    const name = !night
      ? group
      : night.toLowerCase().includes(group.toLowerCase())
        ? night
        : `${group} – ${night}`;
    if (!name) continue;
    const venueLine = texts.find((t) => t.includes("•"));
    let venue: string | null = null;
    let city: string | null = null;
    let state: string | null = null;
    let country: string | null = null;
    if (venueLine) {
      const [venuePart, locPart] = venueLine.split("•").map((p) => p.trim());
      venue = venuePart || null;
      const place = (locPart ?? "").replace(/\s+and \d+ other.*$/i, "").trim();
      const parts = place.split(",").map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        city = parts[0];
        const region = parts[1];
        const code = normalizeStateCode(region) ?? stateCodeFromName(region);
        if (code) {
          state = code;
          country = "United States";
        } else {
          country = region;
        }
      } else if (parts.length === 1) {
        country = parts[0];
      }
    }

    // UDisc used to emit <time datetime="…">; the current listing renders the
    // date as plain text ("Sep 14, 2026"). Read both so either markup works.
    const dates = [
      ...[...block.matchAll(/datetime="(\d{4}-\d{2}-\d{2})/gi)].map((m) => m[1]),
      ...texts.flatMap((t) => {
        const m = t.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),\s*(20\d{2})$/);
        if (!m) return [];
        const value = iso(Number(m[3]), MONTHS[m[1].slice(0, 3).toLowerCase()] ?? 0, Number(m[2]));
        return value ? [value] : [];
      }),
    ];
    out.push({
      source: "udisc",
      source_event_id: slug,
      url: `https://udisc.com/events/${slug}`,
      name,
      kind: /league/i.test(typeText) ? "league" : "tournament",
      tier: null,
      sanctioning: null,
      start_date: dates[0] ?? null,
      end_date: dates[dates.length - 1] ?? dates[0] ?? null,
      venue_name: venue,
      city,
      state,
      country,
      latitude: null,
      longitude: null,
      registration_status: /Registration open/i.test(block) ? "open" : null,
      field_size: null,
      field_capacity: null,
      cover_url: block.match(/background-image:url\((https:\/\/[^)]+)\)/)?.[1] ?? null,
      pdga_event_ref: null,
      discovered_via: opts.discoveredVia,
    });
  }
  return out;
}

/** Normalized key used to cross-link the same event across sources. */
export function directoryMatchKey(row: {
  name: string;
  start_date: string | null;
  city: string | null;
}): string {
  const name = row.name
    .toLowerCase()
    .replace(/\b(presented by|pres\.? by|sponsored by)\b[\s\S]*$/i, "")
    .replace(/\b(20\d{2})\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return [name, row.start_date ?? "", (row.city ?? "").toLowerCase()].join("|");
}
