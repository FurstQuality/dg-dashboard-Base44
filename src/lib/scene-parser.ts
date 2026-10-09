/**
 * Disc Golf Scene event page parser.
 *
 * discgolfscene.com has no public API. Event pages are static HTML we can
 * fetch server-side. This parser extracts the fields we care about — title,
 * date, location, tier, entry fee, divisions, spots, deadlines — using
 * layout-tolerant regex against the rendered markup. It is intentionally
 * defensive: any missing field is returned as null so partial parses are
 * still useful.
 */

export type SceneParsed = {
  title: string;
  event_url: string;
  external_id: string | null;
  registration_url: string | null;
  location: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  tier: string | null;
  starts_on: string | null; // ISO date
  ends_on: string | null;
  registration_deadline: string | null; // ISO datetime
  entry_fee_cents: number | null;
  currency: string;
  divisions: string[];
  spots_total: number | null;
  spots_taken: number | null;
};

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function metaContent(html: string, prop: string): string | null {
  const rx = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*content=["']([^"']+)["']`,
    "i",
  );
  const m = html.match(rx);
  return m ? m[1].trim() : null;
}

function parseIsoDate(s: string): string | null {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  sept: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function parseHumanDateRange(text: string): { starts_on: string | null; ends_on: string | null } {
  // Match patterns like "Sat, Aug 15, 2026" or "Aug 15-17, 2026" or "Aug 15 - Aug 17, 2026"
  const yearMatch = text.match(/\b(20\d{2})\b/);
  const year = yearMatch ? +yearMatch[1] : new Date().getUTCFullYear();

  // "Aug 15 - 17, 2026" or "Aug 15 - Aug 17, 2026"
  const range = text.match(
    /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*(?:-|–|to)\s*(?:([A-Za-z]{3,9})\.?\s+)?(\d{1,2})/,
  );
  if (range) {
    const m1 = MONTHS[range[1].toLowerCase().slice(0, 3)];
    const m2 = MONTHS[(range[3] ?? range[1]).toLowerCase().slice(0, 3)];
    const d1 = +range[2];
    const d2 = +range[4];
    if (m1 != null && m2 != null) {
      const s = new Date(Date.UTC(year, m1, d1));
      const e = new Date(Date.UTC(year, m2, d2));
      return {
        starts_on: s.toISOString().slice(0, 10),
        ends_on: e.toISOString().slice(0, 10),
      };
    }
  }

  // Single date
  const single = text.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s*(20\d{2})?\b/);
  if (single) {
    const m = MONTHS[single[1].toLowerCase().slice(0, 3)];
    if (m != null) {
      const y = single[3] ? +single[3] : year;
      const d = new Date(Date.UTC(y, m, +single[2]));
      const iso = d.toISOString().slice(0, 10);
      return { starts_on: iso, ends_on: iso };
    }
  }

  return { starts_on: null, ends_on: null };
}

function extractTier(text: string): string | null {
  const m = text.match(
    /\b(XA|Major|National Tour|Elite Series|A[- ]?Tier|B[- ]?Tier|C[- ]?Tier|League|Sanctioned|Non[- ]?Sanctioned|Unsanctioned)\b/i,
  );
  if (!m) return null;
  return m[1].replace(/\s+/g, " ").replace(/-/g, "-");
}

function extractLocation(text: string): {
  location: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
} {
  // Common Scene pattern: "City, ST" or "City, State, USA"
  const m = text.match(
    /([A-Z][A-Za-z .'-]+),\s*([A-Z]{2})\b(?:,?\s*(USA|United States|Canada|[A-Z][A-Za-z]+))?/,
  );
  if (m) {
    return {
      location: `${m[1]}, ${m[2]}${m[3] ? ", " + m[3] : ""}`,
      city: m[1].trim(),
      state: m[2].trim(),
      country: (m[3] ?? "USA").trim(),
    };
  }
  return { location: null, city: null, state: null, country: null };
}

function extractFeeCents(text: string): number | null {
  // Prefer explicit "Entry Fee $X" patterns; fall back to the largest $ value.
  const labelled = text.match(/(?:Entry Fee|Registration Fee|Fee)[^$]*\$\s?(\d{1,4}(?:\.\d{2})?)/i);
  const raw = labelled ? labelled[1] : null;
  if (raw) return Math.round(parseFloat(raw) * 100);
  const all = [...text.matchAll(/\$\s?(\d{1,4}(?:\.\d{2})?)/g)];
  if (!all.length) return null;
  const top = Math.max(...all.map((a) => parseFloat(a[1])));
  return Math.round(top * 100);
}

function extractDivisions(text: string): string[] {
  // Divisions on Scene appear as "MPO", "FPO", "MA1", "MA40", etc.
  const set = new Set<string>();
  for (const m of text.matchAll(
    /\b(MPO|FPO|MA\d{1,3}|FA\d{1,3}|MP\d{2,3}|FP\d{2,3}|MJ\d{1,2}|FJ\d{1,2}|MPG\d{2}|FPG\d{2}|MPE|FPE|DGPT)\b/g,
  )) {
    set.add(m[1]);
  }
  return [...set].slice(0, 40);
}

function extractSpots(text: string): { taken: number | null; total: number | null } {
  // "23 of 72 registered" or "23/72"
  const m = text.match(/(\d{1,4})\s*(?:of|\/)\s*(\d{1,4})\s*(?:registered|players|spots)?/i);
  if (m) return { taken: +m[1], total: +m[2] };
  return { taken: null, total: null };
}

function extractDeadline(text: string): string | null {
  const m = text.match(
    /(?:Registration\s+(?:Ends|Closes|Deadline)|Ends|Closes)\s*(?:on|at)?\s*[:\-]?\s*([A-Za-z]{3,9}\.?\s+\d{1,2}(?:,?\s*20\d{2})?(?:\s+(?:at\s+)?\d{1,2}:\d{2}\s*(?:AM|PM))?)/i,
  );
  if (!m) return null;
  const d = new Date(m[1]);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function extractExternalId(url: string): string | null {
  const m = url.match(/discgolfscene\.com\/tournaments\/([^/?#]+)/i);
  return m ? m[1] : null;
}

export function parseSceneHtml(html: string, sourceUrl: string): SceneParsed | null {
  const cleanText = stripTags(html);

  const ogTitle = metaContent(html, "og:title");
  const titleTag = html.match(/<title>([\s\S]*?)<\/title>/i);
  const title = (ogTitle ?? (titleTag ? stripTags(titleTag[1]) : ""))
    .replace(/\s*[·|-]\s*Disc Golf Scene\s*$/i, "")
    .trim();
  if (!title) return null;

  const ogDescription =
    metaContent(html, "og:description") ?? metaContent(html, "description") ?? "";
  const searchText = `${title} ${ogDescription} ${cleanText}`;

  const { starts_on, ends_on } = parseHumanDateRange(searchText);
  const location = extractLocation(cleanText);
  const tier = extractTier(searchText);
  const entry_fee_cents = extractFeeCents(cleanText);
  const divisions = extractDivisions(cleanText);
  const spots = extractSpots(cleanText);
  const deadline = extractDeadline(cleanText);

  const registrationUrl = (() => {
    const m = html.match(/href="([^"]*\/(?:register|registration)[^"]*)"/i);
    if (!m) return null;
    return m[1].startsWith("http") ? m[1] : new URL(m[1], sourceUrl).toString();
  })();

  return {
    title: title.slice(0, 200),
    event_url: sourceUrl,
    external_id: extractExternalId(sourceUrl),
    registration_url: registrationUrl,
    location: location.location,
    city: location.city,
    state: location.state,
    country: location.country,
    tier,
    starts_on: starts_on ?? parseIsoDate(metaContent(html, "event:start_time") ?? ""),
    ends_on: ends_on ?? parseIsoDate(metaContent(html, "event:end_time") ?? ""),
    registration_deadline: deadline,
    entry_fee_cents,
    currency: "USD",
    divisions,
    spots_total: spots.total,
    spots_taken: spots.taken,
  };
}

/* -------------------- DGS ↔ PDGA cross-linking helpers -------------------- */

/**
 * Pull a PDGA event ref (numeric id) from a Disc Golf Scene tournament page.
 * Scene consistently cites the PDGA event via /tour/event/<id> or the live
 * scoring endpoint apps/tournament/live/event?eventId=<id>.
 */
export function extractPdgaEventRefFromScene(html: string): string | null {
  const tour = html.match(/pdga\.com\/tour\/event\/(\d+)/i);
  if (tour) return tour[1];
  const live = html.match(/pdga\.com\/apps\/tournament\/live\/event\?eventId=(\d+)/i);
  if (live) return live[1];
  return null;
}

/**
 * Pull the DGS course link out of a Scene tournament page.
 *
 * Scene writes the venue link inside the "Location" block, and it may be
 * relative (/course/<id>/<slug>) or fully qualified
 * (https://www.discgolfscene.com/course/<id>/<slug>). The anchor often wraps a
 * photo instead of text, so the readable name is taken from the anchor text
 * when present and otherwise derived from the slug; the course page parse
 * overrides it with the official name when available.
 */
export function extractSceneCourseLink(
  html: string,
  sourceUrl: string,
): { url: string; id: string; slug: string; name: string | null } | null {
  const m = html.match(
    /href="((?:https?:\/\/(?:www\.)?discgolfscene\.com)?\/course\/(\d+)\/([^"#?]+))"([\s\S]{0,400}?)<\/a>/i,
  );
  if (!m) return null;
  const abs = new URL(m[1], sourceUrl).toString();
  const slug = m[3];
  const inner = (
    stripTags(m[4] ?? "")
      .replace(/[>\u203a\u00bb]/g, " ")
      .split("\n")[0] ?? ""
  )
    .replace(/\s+/g, " ")
    .replace(/\s+[A-Za-z .'-]+,\s*[A-Z]{2}\s*$/, "")
    .trim();
  const fromSlug = slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return {
    url: abs,
    id: m[2],
    slug,
    name: inner || fromSlug || null,
  };
}

/**
 * Pull the DGS tournament link out of an arbitrary HTML blob (used against
 * PDGA event pages, which sometimes link to Scene registration).
 */
export function extractSceneEventLink(html: string): { url: string; slug: string } | null {
  const m = html.match(/https?:\/\/(?:www\.)?discgolfscene\.com\/tournaments?\/([A-Za-z0-9_\-]+)/i);
  if (!m) return null;
  const slug = m[1];
  return { url: `https://www.discgolfscene.com/tournament/${slug}`, slug };
}

export type SceneCourseParsed = {
  url: string;
  id: string;
  slug: string;
  name: string;
  city: string | null;
  state: string | null;
  holes: number | null;
  par: number | null;
  length_ft: number | null;
  layouts: string[];
};

/**
 * Parse a Disc Golf Scene course page (/course/<id>/<slug>). Uses meta tags
 * and body text patterns; layout tolerant — every field is optional.
 */
export function parseSceneCoursePage(html: string, sourceUrl: string): SceneCourseParsed | null {
  const m = sourceUrl.match(/discgolfscene\.com\/course(?:s)?\/(\d+)\/([^/?#]+)/i);
  if (!m) return null;
  const id = m[1];
  const slug = m[2];

  const cleanText = stripTags(html);
  // Scene serves a site-wide og:title on some course pages, so the <title>
  // tag ("<Course> \u00b7 <City>, <ST> \u00b7 Disc Golf Scene") is the reliable source.
  const ogTitleRaw = metaContent(html, "og:title");
  const ogTitle =
    ogTitleRaw && !/^\s*disc\s*golf\s*scene(\.com)?\s*$/i.test(ogTitleRaw) ? ogTitleRaw : null;
  const titleTag = html.match(/<title>([\s\S]*?)<\/title>/i);
  const titleText = titleTag
    ? stripTags(titleTag[1])
        .replace(/&(?:middot|#183|#xB7);/gi, "\u00b7")
        .replace(/&amp;/gi, "&")
    : "";
  const rawTitle = (titleText || ogTitle || "")
    .replace(/\s*[\u00b7|]\s*Disc Golf Scene\s*$/i, "")
    .split(/\s*[\u00b7|]\s*/)[0];
  const name = rawTitle.trim() || slug.replace(/-/g, " ");

  const loc = extractLocation(cleanText);
  const holesMatch = cleanText.match(/(\d{1,2})\s*hole/i);
  const holes = holesMatch ? +holesMatch[1] : null;
  const parMatch = cleanText.match(/\bPar\s*[:\-]?\s*(\d{2,3})\b/i);
  const par = parMatch ? +parMatch[1] : null;
  const lenMatch = cleanText.match(/(\d{3,5})\s*(?:ft|feet|')\b/i);
  const length_ft = lenMatch ? +lenMatch[1] : null;

  const layouts: string[] = [];
  for (const l of cleanText.matchAll(
    /\b(Blue|Red|Gold|White|Long|Short|Am|Pro|Championship|Recreational)\s+(?:tees?|layout)\b/gi,
  )) {
    const label = l[1];
    if (!layouts.includes(label)) layouts.push(label);
  }

  return {
    url: sourceUrl,
    id,
    slug,
    name: name.slice(0, 200),
    city: loc.city,
    state: loc.state,
    holes,
    par,
    length_ft,
    layouts: layouts.slice(0, 8),
  };
}

/* ------------------------------ UDisc parser ------------------------------ */

export type UdiscLayoutSummary = {
  name: string;
  holes: number | null;
  par: number | null;
  length_ft: number | null;
  difficulty: string | null;
};

export type UdiscHoleRow = {
  hole: number;
  distance_ft: number | null;
  par: number | null;
};

export type UdiscReview = {
  author: string | null;
  rounds_played: number | null;
  reviewed_on: string | null;
  body: string;
  layout: string | null;
};

export type UdiscCourseParsed = {
  url: string;
  slug: string;
  short_id: string | null;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  description: string | null;
  established_year: number | null;
  holes: number | null;
  estimated_time_minutes: number | null;
  estimated_length_mi: number | null;
  elevation: string | null;
  designer: string | null;
  layouts: UdiscLayoutSummary[];
  awards: string[];
  /** Community rating out of 5 from UDisc's structured data. */
  rating: number | null;
  rating_count: number | null;
  /** Per-category community scores (Upkeep, Tee areas, …) out of 5. */
  category_ratings: { label: string; value: number }[];
  latitude: number | null;
  longitude: number | null;
  image_url: string | null;
  difficulty: string | null;
  tee_surface: string | null;
  fees: string | null;
  amenities: string[];
  /** Latest community conditions report, when one is posted. */
  conditions_status: string | null;
  conditions_note: string | null;
  contact: string | null;
  website: string | null;
  /** Hole-by-hole distances and pars for the popular layout. */
  holes_detail: UdiscHoleRow[];
  /** Reviews visible on the course page (the reviews tab holds more). */
  reviews: UdiscReview[];
};

function titleCase(value: string | null): string | null {
  if (!value) return null;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function textFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Tag-delimited text: keeps element boundaries so lists stay separable. */
function pipeText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, "|")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t\r\n]+/g, " ")
    .replace(/(\s*\|\s*)+/g, " | ")
    .trim();
}

/**
 * Extract every UDisc layout summary from the course page. Layout cards link
 * to `/layouts/<id>/caddie-book` (older pages used `/v2/layouts/<id>`) and
 * their text reads `<Name> [Popular] Holes <N> Par <N> <ft> ft <difficulty>`.
 */
function extractUdiscLayouts(html: string): UdiscLayoutSummary[] {
  const out: UdiscLayoutSummary[] = [];
  const seen = new Set<string>();
  const anchorRe =
    /<a[^>]+href="[^"]*\/(?:v2\/)?layouts\/\d+(?:\/caddie-book)?"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html))) {
    const text = textFromHtml(m[1]);
    const parts = text.match(
      /^(.*?)\s*(?:Popular\s*)?Holes\s+(\d{1,2})\s+Par\s+(\d{2,3})\s+([\d,]{2,6})\s*ft\s*([A-Z][A-Za-z \-]{2,20}?)?(?:\s+Par rating|\s*$)/i,
    );
    if (!parts) continue;
    const name = parts[1].replace(/\s*Popular\s*$/i, "").trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({
      name: name.slice(0, 120),
      holes: +parts[2],
      par: +parts[3],
      length_ft: +parts[4].replace(/,/g, ""),
      difficulty: parts[5]?.trim() || null,
    });
  }
  return out;
}

/**
 * Newer UDisc course pages render layout cards from an embedded, de-duplicated
 * data payload instead of plain links, so the anchor reader above finds nothing.
 * In that payload a layout appears as its name, its numeric id, then the array
 * of its hole references: `"18 Hole Layout: Longs",35439,[1003,1004,...]`. The
 * array length is the hole count. Par and length live behind further pointer
 * hops we deliberately do not follow — name and hole count are enough to create
 * the layout, and the per-layout refresh fills in the rest.
 */
function extractUdiscLayoutsFromPayload(html: string): UdiscLayoutSummary[] {
  const out: UdiscLayoutSummary[] = [];
  const seen = new Set<string>();
  const re = /\\"([^"\\]{2,120})\\",(\d{3,9}),\[((?:\d+,){1,53}\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const name = m[1]
      .replace(/\\u0026/g, "&")
      .replace(/\\+/g, "")
      .trim();
    const holes = m[3].split(",").length;
    if (holes < 3 || holes > 54) continue;
    if (!/[a-z]/i.test(name) || /^https?:/i.test(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: name.slice(0, 120), holes, par: null, length_ft: null, difficulty: null });
  }
  return out;
}

/** Hole grid rows: `| 1 | 230 | 3 |` repeated under a `Holes Dist Par` header. */
function extractUdiscHoleRows(pipe: string): UdiscHoleRow[] {
  const rows = new Map<number, UdiscHoleRow>();
  const blocks = pipe.split(/Holes \| Dist \| Par/i).slice(1);
  for (const block of blocks) {
    const rowRe = /\|\s*(\d{1,2})\s*\|\s*(\d{2,4})\s*\|\s*(\d)\s*(?=\|)/g;
    let m: RegExpExecArray | null;
    while ((m = rowRe.exec(block))) {
      const hole = +m[1];
      const distance = +m[2];
      const par = +m[3];
      if (hole < 1 || hole > 36 || par < 2 || par > 6) continue;
      if (!rows.has(hole)) rows.set(hole, { hole, distance_ft: distance, par });
    }
    if (rows.size >= 18) break;
  }
  return [...rows.values()].sort((a, b) => a.hole - b.hole);
}

function extractUdiscCategoryRatings(html: string): { label: string; value: number }[] {
  const out: { label: string; value: number }[] = [];
  const re =
    /truncate text-subtle">([A-Za-z /\-]{3,30})<\/div>[\s\S]{0,600}?text-right text-subtle">([\d.]{1,4})<\/div>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const label = m[1].trim();
    const value = Number(m[2]);
    if (!label || !Number.isFinite(value)) continue;
    if (out.some((r) => r.label.toLowerCase() === label.toLowerCase())) continue;
    out.push({ label, value });
    if (out.length >= 10) break;
  }
  return out;
}

/**
 * Reviews are rendered as `@ | <handle> | <rounds> | <date> | <body> [| After
 * playing | <layout>]`. Works on the course page and the /reviews page.
 */
export function parseUdiscReviews(html: string, limit = 24): UdiscReview[] {
  const pipe = pipeText(html);
  const out: UdiscReview[] = [];
  const re =
    /\|\s*@\s*([A-Za-z0-9_.\-]{2,32})\s*\|\s*(\d{1,5})\s*\|\s*([A-Z][a-z]{2} \d{1,2}, \d{4})\s*\|\s*([^|]{1,1200}?)\s*(?=\|)(?:\s*\|\s*After playing\s*\|\s*([^|]{1,60}?)\s*(?=\|))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pipe))) {
    const body = m[4].trim();
    if (!body || body.length < 2) continue;
    if (out.some((r) => r.author === m![1] && r.body === body)) continue;
    out.push({
      author: m[1],
      rounds_played: Number(m[2]) || null,
      reviewed_on: m[3],
      body: body.slice(0, 1200),
      layout: m[5]?.trim() || null,
    });
    if (out.length >= limit) break;
  }
  return out;
}

function extractUdiscLocation(html: string): {
  city: string | null;
  state: string | null;
  country: string | null;
} {
  // UDisc breadcrumb links: /places/united-states, /places/us/<state>-united-states,
  // /places/us/<state>/<city>-<state-abbr>. Grab the last two as city / state.
  const country = html.match(/href="\/places\/([^"/]+)"[^>]*>([^<]+)<\/a>/i)?.[2]?.trim() ?? null;
  const state =
    html.match(/href="\/places\/[^"]+\/([a-z]+)-[a-z\-]+"[^>]*>([^<]+)<\/a>/i)?.[2]?.trim() ?? null;
  const city =
    html.match(/href="\/places\/[a-z]+\/[a-z\-]+\/[a-z\-]+"[^>]*>([^<]+)<\/a>/i)?.[1]?.trim() ??
    null;
  return { city, state, country };
}

type LdJson = Record<string, unknown>;

function extractLdJson(html: string): LdJson[] {
  const out: LdJson[] = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1]) as LdJson | LdJson[];
      if (Array.isArray(parsed)) out.push(...parsed);
      else out.push(parsed);
    } catch {
      /* ignore malformed blocks */
    }
  }
  return out;
}

export function parseUdiscCoursePage(html: string, sourceUrl: string): UdiscCourseParsed | null {
  const slugMatch = sourceUrl.match(/udisc\.com\/courses\/([^/?#]+)/i);
  if (!slugMatch) return null;
  const slugFull = slugMatch[1];
  const shortIdMatch = slugFull.match(/-([A-Za-z0-9]{2,6})$/);
  const shortId = shortIdMatch ? shortIdMatch[1] : null;
  const slug = shortIdMatch ? slugFull.slice(0, -shortIdMatch[0].length) : slugFull;

  const og = metaContent(html, "og:title");
  const rawTitle = (og ?? html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "")
    .replace(/\s*[-–|]\s*[^|]*\|\s*UDisc.*$/i, "")
    .replace(/\s*[·|-]\s*UDisc.*$/i, "");
  const name = textFromHtml(rawTitle).replace(/^"|"$/g, "").trim() || slug.replace(/-/g, " ");

  const cleanText = textFromHtml(html);
  const pipe = pipeText(html);
  const loc = extractUdiscLocation(html);

  const ld = extractLdJson(html);
  const place = ld.find((d) => String(d["@type"] ?? "").includes("SportsActivityLocation"));
  const agg = (place?.aggregateRating ?? null) as null | {
    ratingValue?: number;
    ratingCount?: number;
  };
  const address = (place?.address ?? null) as null | {
    addressLocality?: string;
    addressRegion?: string;
    addressCountry?: string;
  };
  const faq = ld.find((d) => String(d["@type"] ?? "") === "FAQPage");
  const faqText = faq
    ? (
        (faq.mainEntity as { name?: string; acceptedAnswer?: { text?: string } }[] | undefined) ??
        []
      )
        .map((q) => `${q.name ?? ""} ${q.acceptedAnswer?.text ?? ""}`)
        .join(" \n")
    : "";

  const coordMatch = (faqText || cleanText).match(/(-?\d{1,3}\.\d{3,8}),\s*(-?\d{1,3}\.\d{3,8})/);
  const latitude = coordMatch ? Number(coordMatch[1]) : null;
  const longitude = coordMatch ? Number(coordMatch[2]) : null;

  const estTime = cleanText.match(/(\d+)h\s*(\d+)m\b/);
  const estimated_time_minutes = estTime ? +estTime[1] * 60 + +estTime[2] : null;
  const estLen = cleanText.match(/([\d.]+)\s*mi\b/);
  const estimated_length_mi = estLen ? +estLen[1] : null;
  const elevation =
    cleanText.match(/\b(Very hilly|Hilly|Rolling|Slight|Mostly flat|Flat)\b/i)?.[1] ?? null;
  const holes =
    +(cleanText.match(/\b(9|18|21|24|27|36)\s*holes\b/i)?.[1] ?? "") ||
    +(faqText.match(/has (\d{1,2}) disc golf holes/i)?.[1] ?? "") ||
    null;
  const established_year = +(cleanText.match(/Established in (\d{4})/i)?.[1] ?? "") || null;
  const designer =
    cleanText
      .match(/Designed by ([A-Za-z .'\-]+?)(?:\s+Show more|\s+\d+\s*holes|$)/)?.[1]
      ?.trim() ??
    cleanText.match(/(?:Course )?designed by ([A-Za-z .'\-]{3,40}?)\./i)?.[1]?.trim() ??
    null;
  const difficulty =
    titleCase(faqText.match(/difficulty rating of\s*"?([A-Za-z]+)"?/i)?.[1] ?? null) ??
    cleanText.match(/\b(Easy|Moderate|Advanced|Intermediate|Expert)\s+difficulty\b/i)?.[1] ??
    null;
  const tee_surface = pipe.match(/\|\s*([A-Za-z]+)\s+Tees\s*\|/i)?.[1] ?? null;
  const fees = /is free to play/i.test(faqText)
    ? "Free to play"
    : /pay to play|fee/i.test(faqText)
      ? (faqText.match(/(?:Do I need to pay[^?]*\?)\s*([^\n]{10,180})/i)?.[1]?.trim() ??
        "Paid course")
      : null;

  const amenityLine =
    faqText.match(/offers the following amenities:\s*([^.\n]{3,300})/i)?.[1] ?? "";
  const amenities = amenityLine
    .split(/,|\band\b/)
    .map((a) => a.trim())
    .filter((a) => a.length > 2 && a.length < 60)
    .slice(0, 12);

  const conditions_status =
    pipe.match(/\|\s*((?:Great|Good|Fair|Poor|Excellent)\s+conditions)\s*\|/i)?.[1] ?? null;
  // UDisc's own FAQ answer sometimes serializes the report as "[object Object]",
  // so read the note rendered next to the conditions chip first.
  const faqCondition = faqText
    .match(/Current disc golf course conditions:\s*([^\n]{5,400})/i)?.[1]
    ?.trim();
  const conditions_note =
    (conditions_status
      ? pipe
          .match(
            new RegExp(`\\|\\s*${conditions_status}\\s*\\|\\s*([^|]{10,600}?)\\s*\\|`, "i"),
          )?.[1]
          ?.trim()
      : null) ?? (faqCondition && !/\[object Object\]/.test(faqCondition) ? faqCondition : null);

  const contact =
    pipe.match(/\|\s*Contact\s*\|\s*([^|]{3,80}\(\d[\d\-() ]{6,}\))/i)?.[1]?.trim() ?? null;
  const website =
    pipe.match(/\|\s*((?:https?:\/\/|www\.)[^\s|]{6,200})\s*\|/i)?.[1]?.trim() ?? null;

  // About / description
  const aboutMatch = html.match(/About the course[\s\S]{0,80}?<\/h[23]>([\s\S]{0,2000}?)<h[23]/i);
  const description =
    (aboutMatch ? textFromHtml(aboutMatch[1]).slice(0, 1000) : null) ??
    metaContent(html, "og:description") ??
    null;

  const awardsMatch = html.match(/Awards[\s\S]*?<\/h2>([\s\S]{0,4000}?)<h[23]/i);
  const awards: string[] = [];
  if (awardsMatch) {
    for (const a of awardsMatch[1].matchAll(/#\d+\s+in\s+[A-Za-z .]+/g)) {
      if (!awards.includes(a[0])) awards.push(a[0]);
    }
  }

  return {
    url: sourceUrl,
    slug,
    short_id: shortId,
    name: name.slice(0, 200),
    city: address?.addressLocality ?? loc.city,
    state: address?.addressRegion ?? loc.state,
    country: address?.addressCountry ?? loc.country,
    description,
    established_year,
    holes,
    estimated_time_minutes,
    estimated_length_mi,
    elevation,
    designer,
    layouts: (extractUdiscLayouts(html).length
      ? extractUdiscLayouts(html)
      : extractUdiscLayoutsFromPayload(html)
    ).slice(0, 20),
    awards: awards.slice(0, 6),
    rating: typeof agg?.ratingValue === "number" ? Math.round(agg.ratingValue * 100) / 100 : null,
    rating_count: typeof agg?.ratingCount === "number" ? agg.ratingCount : null,
    category_ratings: extractUdiscCategoryRatings(html),
    latitude,
    longitude,
    image_url:
      typeof place?.image === "string" ? (place.image as string) : metaContent(html, "og:image"),
    difficulty,
    tee_surface,
    fees,
    amenities,
    conditions_status,
    conditions_note,
    contact,
    website,
    holes_detail: extractUdiscHoleRows(pipe),
    reviews: parseUdiscReviews(html, 6),
  };
}

export type SceneScheduleEntry = {
  /** Raw date heading, e.g. "Fri Jul 24". */
  date_label: string;
  /** ISO date (YYYY-MM-DD) when the heading could be resolved against the event year. */
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  course_name: string | null;
  course_url: string | null;
  /** Description line, e.g. "Flex C Tier @ Brady Park" or "MPO/FPO Round 1". */
  detail: string | null;
};

const SCHEDULE_MONTHS: Record<string, number> = {
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

function resolveScheduleDate(label: string, yearHint: number | null): string | null {
  const m = label.match(/([A-Za-z]{3,})\s+(\d{1,2})/);
  if (!m) return null;
  const mon = SCHEDULE_MONTHS[m[1].slice(0, 3).toLowerCase()];
  if (!mon) return null;
  const day = Number(m[2]);
  const year = yearHint ?? new Date().getUTCFullYear();
  return `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Parse the "Schedule" block of a Disc Golf Scene tournament details page.
 *
 * DGS is where TDs actually publish round times — the PDGA event page often
 * has none, which is why tee times show as "TBD" in-app. Markup shape:
 *
 *   <ul class="tournament-schedule">
 *     <li><div class="schedule-date"><h4>Fri<br />Jul 24</h4></div>
 *         <div class="schedule-detail">
 *           <h5>9:00am - 4:00pm at <a href="...">Brady Park</a></h5>
 *           <p>Flex C Tier @ Brady Park</p>
 *           ... (repeats for multiple blocks on the same day)
 *         </div></li>
 *   </ul>
 *
 * Tolerant by design: any missing piece becomes null rather than dropping the row.
 */
export function parseSceneSchedule(
  html: string,
  yearHint: number | null = null,
): SceneScheduleEntry[] {
  const listMatch = html.match(
    /<ul[^>]*class="[^"]*tournament-schedule[^"]*"[^>]*>([\s\S]*?)<\/ul>/i,
  );
  if (!listMatch) return [];
  const items = listMatch[1].match(/<li[^>]*>[\s\S]*?<\/li>/gi) ?? [];
  const out: SceneScheduleEntry[] = [];

  for (const li of items) {
    const dateBlock = li.match(/class="schedule-date"[\s\S]*?<h4[^>]*>([\s\S]*?)<\/h4>/i);
    const dateLabel = dateBlock
      ? stripTags(dateBlock[1].replace(/<br\s*\/?>/gi, " "))
          .replace(/\s+/g, " ")
          .trim()
      : "";
    const detailBlock = li.match(/class="schedule-detail"([\s\S]*)$/i);
    const body = detailBlock ? detailBlock[1] : li;

    // Each <h5> starts a time slot; its following <p> (if any) is the detail line.
    const slotRe = /<h5[^>]*>([\s\S]*?)<\/h5>\s*(?:<p[^>]*>([\s\S]*?)<\/p>)?/gi;
    let slot: RegExpExecArray | null;
    let found = false;
    while ((slot = slotRe.exec(body))) {
      found = true;
      const rawHead = slot[1];
      const link = rawHead.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      const times = stripTags(rawHead.replace(/<a[\s\S]*?<\/a>/gi, ""))
        .replace(/\s+/g, " ")
        .replace(/\bat\s*$/i, "")
        .trim();
      const timeParts = times.match(
        /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|–|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
      );
      const single = timeParts ? null : times.match(/\d{1,2}(?::\d{2})?\s*(?:am|pm)/i);
      out.push({
        date_label: dateLabel,
        date: resolveScheduleDate(dateLabel, yearHint),
        start_time: timeParts ? timeParts[1].trim() : single ? single[0].trim() : null,
        end_time: timeParts ? timeParts[2].trim() : null,
        course_name: link ? stripTags(link[2]).trim() || null : null,
        course_url: link ? link[1] : null,
        detail: slot[2] ? stripTags(slot[2]).replace(/\s+/g, " ").trim() || null : null,
      });
    }
    if (!found && dateLabel) {
      out.push({
        date_label: dateLabel,
        date: resolveScheduleDate(dateLabel, yearHint),
        start_time: null,
        end_time: null,
        course_name: null,
        course_url: null,
        detail: null,
      });
    }
  }
  return out;
}
