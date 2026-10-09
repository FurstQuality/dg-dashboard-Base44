/**
 * Pure HTML/markdown parsers for PDGA pages. No I/O — safe to unit-test.
 * All extractors are defensive: PDGA markup changes often, so we always
 * return partial data plus the raw payload for later reprocessing.
 */

export type ParsedCourse = {
  pdga_course_id: string | null;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  hole_count: number | null;
  designer: string | null;
  year_established: number | null;
};

export type ParsedPlayer = {
  pdga_number: number;
  name: string;
  rating: number | null;
  class: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  member_since: number | null;
  official_status: string | null;
  career_wins: number | null;
};

export type ParsedEvent = {
  pdga_event_id: string;
  name: string;
  tier: string | null;
  start_date: string | null;
  end_date: string | null;
  host_club: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  course_refs: string[];
};

// ---------- helpers ----------
const num = (v: string | null | undefined): number | null => {
  if (!v) return null;
  const n = parseFloat(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

const int = (v: string | null | undefined): number | null => {
  const n = num(v);
  return n == null ? null : Math.round(n);
};

function textAfter(source: string, label: RegExp): string | null {
  const re = new RegExp(
    label.source + `\\s*[:\\-]?\\s*([^\\n<|]+)`,
    label.flags.includes("i") ? "i" : "i",
  );
  const m = source.match(re);
  return m ? m[1].trim().replace(/\s+/g, " ") : null;
}

function pickMeta(html: string, props: string[]): string | null {
  for (const p of props) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${p}["'][^>]+content=["']([^"']+)["']`,
      "i",
    );
    const m = html.match(re);
    if (m) return m[1];
  }
  return null;
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- Course ----------
export function parseCoursePage(input: {
  url: string;
  html?: string;
  markdown?: string;
}): ParsedCourse | null {
  const html = input.html ?? "";
  const md = input.markdown ?? "";
  const text = md || stripTags(html);
  if (!text) return null;

  const idMatch =
    input.url.match(/\/course-directory\/course\/(\d+)/i) || input.url.match(/\/course\/(\d+)/i);
  const title =
    pickMeta(html, ["og:title", "twitter:title"]) ||
    (html.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1] ?? "").trim() ||
    "Untitled course";

  const cityStateZip = text.match(/([A-Za-z .'-]+),\s*([A-Z]{2})\s*(\d{5})?/) || null;
  const country = textAfter(text, /country/i);
  const holes = int(textAfter(text, /\b(?:hole count|holes)\b/i));
  const designer = textAfter(text, /designer/i);
  const year = int(textAfter(text, /(?:established|year built|year)/i));

  // Geo: PDGA course pages often embed a lat/lng in JSON blocks
  const geoRe =
    /"?lat(?:itude)?"?\s*[:=]\s*(-?\d+\.\d+)[\s,;"']+"?(?:lng|lon|longitude)"?\s*[:=]\s*(-?\d+\.\d+)/i;
  const geo = html.match(geoRe) || md.match(geoRe);

  return {
    pdga_course_id: idMatch?.[1] ?? null,
    name: title.replace(/\s+\|\s+PDGA.*$/i, "").trim(),
    city: cityStateZip?.[1]?.trim() ?? null,
    state: cityStateZip?.[2] ?? null,
    country: country?.slice(0, 40) ?? null,
    postal_code: cityStateZip?.[3] ?? null,
    latitude: geo ? parseFloat(geo[1]) : null,
    longitude: geo ? parseFloat(geo[2]) : null,
    hole_count: holes,
    designer,
    year_established: year,
  };
}

// ---------- Player ----------
export function parsePlayerPage(input: {
  url: string;
  html?: string;
  markdown?: string;
}): ParsedPlayer | null {
  const idMatch = input.url.match(/\/player\/(\d+)/i);
  if (!idMatch) return null;
  const html = input.html ?? "";
  const md = input.markdown ?? "";
  const text = md || stripTags(html);

  const nameFromTitle =
    pickMeta(html, ["og:title"]) || html.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1] || "";
  const nameOnly = nameFromTitle
    .replace(/#\s*\d+\s*$/, "")
    .replace(/\s+\|\s+.*$/, "")
    .trim();

  const rating = int(textAfter(text, /current rating/i));
  const cls = textAfter(text, /classification/i);
  const memberSince = int(textAfter(text, /member since/i));
  const wins = int(textAfter(text, /career wins/i));
  const official = textAfter(text, /official(?: status)?/i);
  const location = textAfter(text, /(?:location|city)/i);

  let city: string | null = null;
  let state: string | null = null;
  let country: string | null = null;
  if (location) {
    const parts = location.split(",").map((s) => s.trim());
    city = parts[0] ?? null;
    state = parts[1] ?? null;
    country = parts[2] ?? null;
  }

  return {
    pdga_number: parseInt(idMatch[1], 10),
    name: nameOnly || `PDGA #${idMatch[1]}`,
    rating,
    class: cls,
    city,
    state,
    country,
    member_since: memberSince,
    official_status: official,
    career_wins: wins,
  };
}

// ---------- Event ----------
export function parseEventPage(input: {
  url: string;
  html?: string;
  markdown?: string;
}): ParsedEvent | null {
  const idMatch =
    input.url.match(/\/tour\/event\/(\d+)/i) ||
    input.url.match(/\/event\/(\d+)/i) ||
    input.url.match(/\/live\/event\/(\d+)/i);
  if (!idMatch) return null;
  const html = input.html ?? "";
  const md = input.markdown ?? "";
  const text = md || stripTags(html);

  const title =
    pickMeta(html, ["og:title"]) || html.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1] || "Untitled event";
  const tier = textAfter(text, /tier/i);
  const dateRange = text.match(
    /(\d{1,2})[-–\s](?:to\s)?(\d{1,2})?\s*[-–]?\s*([A-Za-z]{3,9})[-\s]+(\d{4})/,
  );
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  const host = textAfter(text, /host(?:ed)? by/i);
  const cityState = text.match(/([A-Za-z .'-]+),\s*([A-Z]{2})/);
  const country = textAfter(text, /country/i);

  // Course references (link to /course-directory/course/xxx)
  const courseRefs = Array.from((html + md).matchAll(/\/course-directory\/course\/(\d+)/gi)).map(
    (m) => m[1],
  );

  const geoRe =
    /"?lat(?:itude)?"?\s*[:=]\s*(-?\d+\.\d+)[\s,;"']+"?(?:lng|lon|longitude)"?\s*[:=]\s*(-?\d+\.\d+)/i;
  const geo = html.match(geoRe) || md.match(geoRe);

  return {
    pdga_event_id: idMatch[1],
    name: title.replace(/\s+\|\s+PDGA.*$/i, "").trim(),
    tier,
    start_date: iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : (dateRange?.[0] ?? null),
    end_date: null,
    host_club: host,
    city: cityState?.[1]?.trim() ?? null,
    state: cityState?.[2] ?? null,
    country: country?.slice(0, 40) ?? null,
    postal_code: null,
    latitude: geo ? parseFloat(geo[1]) : null,
    longitude: geo ? parseFloat(geo[2]) : null,
    course_refs: Array.from(new Set(courseRefs)),
  };
}

// ---------- Distance ----------
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function classifyPdgaUrl(url: string): {
  kind: "course" | "player" | "event" | "unknown";
  key: string | null;
} {
  if (/\/course-directory\/course\/(\d+)/i.test(url))
    return {
      kind: "course",
      key: url.match(/\/course-directory\/course\/(\d+)/i)![1],
    };
  if (/\/player\/(\d+)/i.test(url))
    return { kind: "player", key: url.match(/\/player\/(\d+)/i)![1] };
  if (/\/(?:tour\/event|live\/event|event)\/(\d+)/i.test(url))
    return {
      kind: "event",
      key: url.match(/\/(?:tour\/event|live\/event|event)\/(\d+)/i)![1],
    };
  return { kind: "unknown", key: null };
}
