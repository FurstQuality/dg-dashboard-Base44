import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { extractAboutText } from "@/lib/event-about";

/* ----------------- PDGA scraping (public /player pages) ----------------- */

async function fetchText(url: string): Promise<string> {
  const { fetchPdgaHtml } = await import("@/lib/pdga-fetch.server");
  return fetchPdgaHtml(url);
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function parseDateLoose(s: string): string | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed) return null;

  // Date ranges like "22-Apr to 24-Jun-2026" or "27-Feb to 01-Mar-2026" —
  // take the START date and pull the trailing year forward. Common on
  // league / multi-round events; without this, the whole row is skipped.
  const range = trimmed.match(
    /^(\d{1,2})[\s\-.\/]+([A-Za-z]{3,9})\s+to\s+\d{1,2}[\s\-.\/]+[A-Za-z]{3,9}[\s\-.,\/]+(\d{4})$/i,
  );
  if (range) {
    const d = new Date(`${range[2]} ${range[1]}, ${range[3]}`);
    if (Number.isFinite(d.getTime())) {
      const iso = d.toISOString().slice(0, 10);
      const year = Number(iso.slice(0, 4));
      const nowYear = new Date().getUTCFullYear();
      if (year >= 2000 && year <= nowYear + 1) return iso;
    }
  }

  // Only accept full day+month+year shapes. Anything less (bare years like
  // "2001", month+year like "Jan 2001", stray numeric columns) is rejected,
  // because `new Date()` silently coerces those to January 1st and pollutes
  // rating history with impossible dates.
  let iso: string | null = null;

  // DD-Mon-YYYY  (PDGA's preferred format: "11-Jul-2026")
  const dmy = trimmed.match(/^(\d{1,2})[\s\-.\/]+([A-Za-z]{3,9})[\s\-.,\/]+(\d{4})$/);
  if (dmy) {
    const d = new Date(`${dmy[2]} ${dmy[1]}, ${dmy[3]}`);
    if (Number.isFinite(d.getTime())) iso = d.toISOString().slice(0, 10);
  }

  // Mon DD, YYYY  ("Jul 11, 2026", "July 11 2026")
  if (!iso) {
    const mdy = trimmed.match(/^([A-Za-z]{3,9})[\s.\-]+(\d{1,2})[\s,.\-]+(\d{4})$/);
    if (mdy) {
      const d = new Date(`${mdy[1]} ${mdy[2]}, ${mdy[3]}`);
      if (Number.isFinite(d.getTime())) iso = d.toISOString().slice(0, 10);
    }
  }

  // YYYY-MM-DD  (ISO)
  if (!iso) {
    const ymd = trimmed.match(/^(\d{4})[\-.\/](\d{1,2})[\-.\/](\d{1,2})$/);
    if (ymd) {
      const d = new Date(
        `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}T00:00:00Z`,
      );
      if (Number.isFinite(d.getTime())) iso = d.toISOString().slice(0, 10);
    }
  }

  // M/D/YYYY  (US)
  if (!iso) {
    const usa = trimmed.match(/^(\d{1,2})[\-.\/](\d{1,2})[\-.\/](\d{4})$/);
    if (usa) {
      const d = new Date(
        `${usa[3]}-${usa[1].padStart(2, "0")}-${usa[2].padStart(2, "0")}T00:00:00Z`,
      );
      if (Number.isFinite(d.getTime())) iso = d.toISOString().slice(0, 10);
    }
  }

  if (!iso) return null;
  const year = Number(iso.slice(0, 4));
  const nowYear = new Date().getUTCFullYear();
  // PDGA rating-detail pages sometimes include "effective date" baseline rows
  // dated years before a player actually competed. Reject anything older than
  // 15 years — well outside the 12/24-month PDGA rating window and never
  // useful for career analytics either.
  if (year < nowYear - 15 || year > nowYear + 1) return null;
  return iso;
}

type ProfileInfo = {
  name: string | null;
  location: string | null;
  classification: string | null;
  currentRating: number | null;
  ratingDelta: number | null;
  roundsUsed: number | null;
  stdDev: number | null;
  dropBelow: number | null;
  lastChanged: string | null;
  nextUpdate: string | null;
  avatarUrl: string | null;
  memberSince: number | null;
  membershipStatus: string | null;
  membershipExpires: string | null;
  officialStatus: string | null;
  officialExpires: string | null;
  careerEvents: number | null;
  careerWins: number | null;
};

/**
 * The PDGA player page renders membership facts as a semantic list:
 * `<ul class="player-info info-list"><li class="location">…`. Reading the
 * list items by class is far more reliable than matching label text in the
 * flattened page, which used to pick up unrelated words (e.g. tagging an
 * amateur as "Professional" from the season-totals heading).
 */
function parsePlayerInfoList(html: string): Record<string, string> {
  const listMatch = html.match(/<ul[^>]*class="[^"]*player-info[^"]*"[\s\S]*?<\/ul>/i);
  if (!listMatch) return {};
  const out: Record<string, string> = {};
  // <li class="x"> blocks are not always closed on this page, so split on the
  // opening tags rather than requiring a matching </li>.
  const parts = listMatch[0].split(/<li\b/i).slice(1);
  for (const part of parts) {
    const cls = part.match(/^[^>]*class="([^"]+)"/i)?.[1] ?? "";
    const key = cls.split(/\s+/)[0];
    if (!key) continue;
    const body = part.replace(/^[^>]*>/, "");
    // Drop nested lists (upcoming events) before flattening.
    const text = stripTags(body.replace(/<(ul|details)[\s\S]*$/i, ""));
    const value = text.replace(/^[^:]*:\s*/, "").trim();
    if (value && !out[key]) out[key] = value;
  }
  return out;
}

const firstDate = (value: string | undefined) => {
  const m = value?.match(/\(?\s*(?:through\s+)?(\d{1,2}-[A-Za-z]{3}-\d{4})/i);
  return m ? parseDateLoose(m[1]) : null;
};
const withoutParens = (value: string | undefined) =>
  value
    ? value
        .replace(/\s*\([^)]*\)/g, "")
        .replace(/\s+/g, " ")
        // Linked values render as "Verified , Current" once tags are stripped.
        .replace(/\s+,/g, ",")
        .replace(/[,\s]+$/, "")
        .trim() || null
    : null;

function parseProfileImage(html: string): string | null {
  // PDGA player photos live inside the player-info pane. Prefer an <img>
  // whose src contains the uploaded-photo path; fall back to the first
  // reasonably sized image inside the player-info block.
  const paneMatch =
    html.match(/pane-pdga-player-info[\s\S]*?<\/div>\s*<\/div>/i) ||
    html.match(/class="[^"]*player-info[^"]*"[\s\S]{0,4000}/i);
  const scope = paneMatch ? paneMatch[0] : html.slice(0, 8000);

  const patterns = [
    /<img[^>]+src="([^"]+\/player-photos\/[^"]+)"/i,
    /<img[^>]+src="([^"]+scaled_and_cropped[^"]+)"/i,
    /<img[^>]+typeof="foaf:Image"[^>]+src="([^"]+)"/i,
    /<img[^>]+src="([^"]+\/sites\/default\/files\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i,
  ];
  for (const re of patterns) {
    const m = scope.match(re) || html.match(re);
    if (m?.[1]) {
      const raw = m[1].replace(/&amp;/g, "&");
      if (/logo|icon|placeholder|avatar-default/i.test(raw)) continue;
      if (raw.startsWith("http")) return raw;
      if (raw.startsWith("//")) return `https:${raw}`;
      if (raw.startsWith("/")) return `https://www.pdga.com${raw}`;
    }
  }
  return null;
}

function parseProfile(html: string): ProfileInfo {
  // Strip footer/header chrome so "Appling, GA" (PDGA HQ address) can't leak
  // into the location match. Everything after the copyright block is org info.
  const cutoff = html.search(
    /Copyright\s*&copy;|Copyright\s*©|panel-pane-pdga-architecture-footer/i,
  );
  const scoped = cutoff > 0 ? html.slice(0, cutoff) : html;
  const plain = stripTags(scoped);
  const name = scoped.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const rating = plain.match(/Current Rating[:\s]+(\d{3,4})/i);
  const rounds = plain.match(/Rounds Used[:\s]+(\d+)/i);
  const sd = plain.match(/Std(?:\.|andard)? Dev(?:iation)?[:\s]+([\d.]+)/i);
  const drop = plain.match(/(?:Drop|Ratings? Drop)[^:]*?[:\s]+(\d{3,4})/i);
  const last =
    plain.match(/(?:Last (?:Rating )?Update|Last Change[d]?)[:\s]+([A-Za-z0-9,\-\/\s]{6,20})/i) ||
    plain.match(/as of\s+([0-9]{1,2}-[A-Za-z]{3}-[0-9]{4})/i);
  const next = plain.match(/Next (?:Rating )?Update[:\s]+([A-Za-z0-9,\-\/\s]{6,20})/i);
  const cls = plain.match(/\b(Amateur|Professional)\b/);
  const locLabel = plain.match(/Location[:\s]+([A-Z][A-Za-z .'\-]+(?:,\s*[A-Za-z .'\-]+){0,2})/);
  const locFallback = plain.match(/([A-Z][A-Za-z .'\-]+,\s?[A-Z]{2}(?:,\s?[A-Z][A-Za-z .'\-]+)?)/);
  const location = locLabel
    ? locLabel[1].replace(/\s+Classification.*$/i, "").trim()
    : locFallback
      ? locFallback[1]
      : null;

  const info = parsePlayerInfoList(scoped);
  const ratingLi = scoped.match(/<li[^>]*class="[^"]*current-rating[^"]*"[\s\S]*?<\/li>/i)?.[0] ?? "";
  const ratingDelta = ratingLi.match(/class="rating-difference[^"]*"[^>]*>\s*([+-]?\d+)/i);
  const ratingAsOf = ratingLi.match(/rating-date[^>]*>\s*\(?as of\s+([0-9]{1,2}-[A-Za-z]{3}-[0-9]{4})/i);
  const num = (value: string | undefined) => {
    const m = value?.match(/-?\d+/);
    return m ? Number(m[0]) : null;
  };
  const infoRating = num(info["current-rating"]);
  const infoClass = withoutParens(info["classification"]);

  return {
    // Page titles read "Michael Furst #236190" — keep just the player name.
    name: name ? stripTags(name[1]).replace(/\s*#\d+\s*$/, "").trim() || null : null,
    location: withoutParens(info["location"]) ?? location,
    classification: infoClass ?? (cls ? cls[1] : null),
    currentRating: infoRating ?? (rating ? +rating[1] : null),
    ratingDelta: ratingDelta ? Number(ratingDelta[1]) : null,
    roundsUsed: rounds ? +rounds[1] : null,
    stdDev: sd ? +sd[1] : null,
    dropBelow: drop ? +drop[1] : null,
    lastChanged:
      (ratingAsOf ? parseDateLoose(ratingAsOf[1]) : null) ??
      (last ? parseDateLoose(last[1]) : null),
    nextUpdate: next ? parseDateLoose(next[1]) : null,
    avatarUrl: parseProfileImage(scoped) || parseProfileImage(html),
    memberSince: num(info["join-date"]),
    membershipStatus: withoutParens(info["membership-status"]),
    membershipExpires: firstDate(info["membership-status"]),
    officialStatus: withoutParens(info["official"]),
    officialExpires: firstDate(info["official"]),
    careerEvents: num(info["career-events"]),
    careerWins: num(info["career-wins"]),
  };
}

type PdgaRoundParsed = {
  tournament: string;
  date: string;
  score: number | null;
  rating: number;
  round_label: string | null;
  division: string | null;
  included: boolean | null;
  evaluated_on: string | null;
  event_ref: string | null;
};

function parseRounds(html: string): PdgaRoundParsed[] {
  const out: PdgaRoundParsed[] = [];
  const trs = html.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
  for (const tr of trs) {
    const cells = tr.match(/<td[\s\S]*?<\/td>/gi);
    if (!cells || cells.length < 4) continue;
    const text = cells.map((c) => stripTags(c));
    const ratingIdx = text.findIndex((t) => /^\d{3,4}$/.test(t) && +t >= 500 && +t <= 1200);
    if (ratingIdx < 0) continue;
    const rating = +text[ratingIdx];
    const iso = text.map(parseDateLoose).find(Boolean) ?? null;
    if (!iso) continue;
    const tournament =
      text.find(
        (t) =>
          t.length > 2 &&
          t.length < 200 &&
          !/^\d+$/.test(t) &&
          !parseDateLoose(t) &&
          !/^(y|n|yes|no)$/i.test(t),
      ) ?? "PDGA Event";
    const scoreCandidate = text
      .map(Number)
      .find((n) => Number.isFinite(n) && n !== rating && n > 20 && n < 200);
    const label = text.find((t) => /^(rd|round|r)\s?\d+$/i.test(t)) ?? null;
    const division = text.find((t) => /^[A-Z]{2,3}[A-Z0-9]{0,3}$/.test(t)) ?? null;
    let included: boolean | null = null;
    for (const t of text) {
      if (/^y(es)?$/i.test(t)) {
        included = true;
        break;
      }
      if (/^no?$/i.test(t)) {
        included = false;
        break;
      }
    }
    const eventLink = tr.match(/href="[^"]*\/tour\/event\/(\d+)/i);
    const evaluated = text.map(parseDateLoose).filter(Boolean) as string[];
    out.push({
      tournament: tournament.slice(0, 200),
      date: iso,
      score: Number.isFinite(scoreCandidate as number) ? (scoreCandidate as number) : null,
      rating,
      round_label: label,
      division,
      included,
      evaluated_on: evaluated.length > 1 ? evaluated[evaluated.length - 1] : null,
      event_ref: eventLink ? eventLink[1] : null,
    });
  }
  return out;
}

type PdgaEventFinish = {
  event_ref: string | null;
  event_name: string;
  event_date: string | null;
  division: string | null;
  tier: string | null;
  place: number | null;
  points: number | null;
};

/**
 * Parse "Tournament Results" rows from a PDGA player profile page.
 * Each row exposes <td class="place">, <td class="points">, <td class="tournament"> etc.
 * Division comes from the URL fragment (e.g. `/tour/event/12345#MPO`).
 */
function parseEventFinishes(html: string): PdgaEventFinish[] {
  const out: PdgaEventFinish[] = [];
  const trs = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  for (const tr of trs) {
    if (!/class="place"/i.test(tr)) continue;
    const placeM = tr.match(/<td[^>]*class="place"[^>]*>\s*([^<]*)<\/td>/i);
    const pointsM = tr.match(/<td[^>]*class="points"[^>]*>\s*([^<]*)<\/td>/i);
    const tierM = tr.match(/<td[^>]*class="tier"[^>]*>\s*([^<]*)<\/td>/i);
    const linkM = tr.match(
      /<td[^>]*class="tournament"[^>]*>\s*<a[^>]*href="\/tour\/event\/(\d+)(?:#([A-Z0-9]+))?"[^>]*>([\s\S]*?)<\/a>/i,
    );
    const datesTsM = tr.match(/<td[^>]*class="dates"[^>]*data-text="(\d+)"/i);
    const datesTextM = tr.match(/<td[^>]*class="dates"[^>]*>\s*([^<]*)<\/td>/i);
    if (!linkM) continue;

    let eventDate: string | null = null;
    if (datesTsM) {
      const secs = Number(datesTsM[1]);
      if (Number.isFinite(secs) && secs > 0) {
        eventDate = new Date(secs * 1000).toISOString().slice(0, 10);
      }
    }
    if (!eventDate && datesTextM) {
      // "27-Feb to 01-Mar-2026" — take the first date and append the trailing year.
      const raw = datesTextM[1].trim();
      const yearM = raw.match(/(\d{4})\s*$/);
      const first = raw.match(/^(\d{1,2})[\s\-.\/]+([A-Za-z]{3,9})/);
      if (first && yearM) eventDate = parseDateLoose(`${first[1]}-${first[2]}-${yearM[1]}`);
    }

    const placeRaw = placeM ? placeM[1].replace(/[^\d]/g, "") : "";
    const place = placeRaw ? Number(placeRaw) : null;
    const pointsRaw = pointsM ? pointsM[1].replace(/[^\d.]/g, "") : "";
    const points = pointsRaw ? Number(pointsRaw) : null;

    out.push({
      event_ref: linkM[1] ?? null,
      event_name: stripTags(linkM[3]).slice(0, 200) || "PDGA Event",
      event_date: eventDate,
      division: linkM[2] ?? null,
      tier: tierM ? stripTags(tierM[1]) || null : null,
      place: place && Number.isFinite(place) ? place : null,
      points: points && Number.isFinite(points) ? points : null,
    });
  }
  return out;
}

/**
 * Parse the "Career Wins" page (`/player/<n>/wins`). Every row on this page is
 * a first-place finish, but the table has no <td class="place"> column — so the
 * main profile parser misses everything except the current-year Tournament
 * Results table. This fills in historical wins.
 */
function parseCareerWins(html: string): PdgaEventFinish[] {
  const tableM = html.match(/<table[^>]*id="player-wins"[\s\S]*?<\/table>/i);
  if (!tableM) return [];
  const out: PdgaEventFinish[] = [];
  const trs = tableM[0].match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  for (const tr of trs) {
    const linkM = tr.match(
      /<td[^>]*class="tournament"[^>]*>\s*<a[^>]*href="\/tour\/event\/(\d+)(?:#([A-Z0-9]+))?"[^>]*>([\s\S]*?)<\/a>/i,
    );
    if (!linkM) continue;
    const dateTsM =
      tr.match(/<td[^>]*data-text="(\d{4}-\d{2}-\d{2})"[^>]*class="dates"/i) ??
      tr.match(/<td[^>]*class="dates"[^>]*data-text="(\d{4}-\d{2}-\d{2})"/i);
    const dateTextM = tr.match(/<td[^>]*class="dates"[^>]*>\s*([^<]+)<\/td>/i);
    let eventDate: string | null = null;
    if (dateTsM) eventDate = dateTsM[1];
    else if (dateTextM) eventDate = parseDateLoose(dateTextM[1]);
    const tierM = tr.match(/<td[^>]*class="tier"[^>]*>\s*([^<]*)<\/td>/i);
    out.push({
      event_ref: linkM[1] ?? null,
      event_name: stripTags(linkM[3]).slice(0, 200) || "PDGA Event",
      event_date: eventDate,
      division: linkM[2] ?? null,
      tier: tierM ? stripTags(tierM[1]) || null : null,
      place: 1,
      points: null,
    });
  }
  return out;
}

type PdgaUpcomingEvent = {
  event_ref: string;
  event_name: string;
  event_date: string | null;
  location: string | null;
  tier: string | null;
  url: string;
};

/**
 * Parse the "Upcoming Events" block on a PDGA player profile page.
 * Each <li> looks like:
 *   <li>Thu, Jul 30, 2026:
 *     <a href="/tour/event/96414" title="DGPT+ Ledgestone Open in Peoria, IL on 30-Jul to 02-Aug-2026">
 *       DGPT+ Ledgestone Open
 *     </a>
 *   </li>
 */
function parseUpcomingEvents(html: string): PdgaUpcomingEvent[] {
  const blockMatch = html.match(/class="upcoming-events"[\s\S]*?<ul>([\s\S]*?)<\/ul>/i);
  if (!blockMatch) return [];
  const inner = blockMatch[1];
  const items = inner.match(/<li>[\s\S]*?<\/li>/gi) ?? [];
  const out: PdgaUpcomingEvent[] = [];
  for (const li of items) {
    // Match link + capture the *entire* attribute string so we can extract
    // `title` regardless of attribute order (the previous regex only caught
    // titles that appeared immediately after href).
    const linkM = li.match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i);
    if (!linkM) continue;
    const attrs = linkM[1];
    const refM = attrs.match(/href="\/tour\/event\/(\d+)"/i);
    if (!refM) continue;
    const ref = refM[1];
    const titleM = attrs.match(/title="([^"]*)"/i);
    const title = titleM
      ? titleM[1]
          .replace(/&#039;/g, "'")
          .replace(/&amp;/g, "&")
          .trim()
      : "";
    const name = stripTags(linkM[2]).trim() || title || "PDGA Event";

    // Prefix date: "Thu, Jul 30, 2026:"
    const dateM = li.match(/>\s*([A-Za-z]{3},\s*[A-Za-z]{3}\s+\d{1,2},\s*\d{4})\s*:/);
    let event_date: string | null = null;
    if (dateM) {
      const cleaned = dateM[1].replace(/^[A-Za-z]{3},\s*/, "");
      event_date = parseDateLoose(cleaned);
    }
    if (!event_date && title) {
      // Fallback: pull first "DD-Mon-YYYY" from title.
      const t = title.match(/(\d{1,2}-[A-Za-z]{3}-\d{4})/);
      if (t) event_date = parseDateLoose(t[1]);
    }

    // Location: title format "<Name> in <Location> on <date>"
    let location: string | null = null;
    if (title) {
      const locM = title.match(/\bin\s+(.+?)\s+on\s+\d/);
      if (locM) location = locM[1].trim();
    }

    // Tier: leading token in the name, e.g. "DGPT+", "DGPT -", "XM-Tier", "A-Tier"
    let tier: string | null = null;
    const tierM = name.match(
      /^(DGPT\+?|DGPT\s*-|XM-Tier|Major|ES-Tier|A-Tier|B-Tier|C-Tier|M-Tier|L-Tier)/i,
    );
    if (tierM) tier = tierM[1].replace(/\s+/g, " ").trim();

    out.push({
      event_ref: ref,
      event_name: name.slice(0, 200),
      event_date,
      location,
      tier,
      url: `https://www.pdga.com/tour/event/${ref}`,
    });
  }
  return out;
}

/**
 * Parse the "Now Playing" (current-events) block on a PDGA player profile.
 * These are ongoing permanent / league / multi-week events that never appear
 * in the "Upcoming Events" list, but still have tee sheets to sync.
 */
function parseCurrentEvents(html: string): PdgaUpcomingEvent[] {
  const block = html.match(/class="current-events"[\s\S]*?<\/li>/i);
  if (!block) return [];
  const out: PdgaUpcomingEvent[] = [];
  const linkRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let lm: RegExpExecArray | null;
  while ((lm = linkRe.exec(block[0])) !== null) {
    const attrs = lm[1];
    const refM = attrs.match(/href="\/tour\/event\/(\d+)"/i);
    if (!refM) continue;
    const titleM = attrs.match(/title="([^"]*)"/i);
    const title = titleM
      ? titleM[1]
          .replace(/&#039;/g, "'")
          .replace(/&amp;/g, "&")
          .trim()
      : "";
    const name = stripTags(lm[2]).trim() || title || "PDGA Event";
    let event_date: string | null = null;
    let location: string | null = null;
    if (title) {
      const locM = title.match(/\bin\s+(.+?)\s+on\s+/);
      if (locM) location = locM[1].trim();
      const dateM = title.match(/on\s+(\d{1,2}-[A-Za-z]{3}(?:-\d{4})?)/);
      if (dateM) event_date = parseDateLoose(dateM[1]);
    }
    let tier: string | null = null;
    const tierM = name.match(
      /^(DGPT\+?|DGPT\s*-|XM-Tier|Major|ES-Tier|A-Tier|B-Tier|C-Tier|M-Tier|L-Tier)/i,
    );
    if (tierM) tier = tierM[1].replace(/\s+/g, " ").trim();
    out.push({
      event_ref: refM[1],
      event_name: name.slice(0, 200),
      event_date,
      location,
      tier,
      url: `https://www.pdga.com/tour/event/${refM[1]}`,
    });
  }
  return out;
}

export const getPdgaUpcomingEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ pdgaNumber: z.string().regex(/^\d{1,9}$/) }).parse(raw))
  .handler(async ({ data }) => {
    const html = await fetchText(`https://www.pdga.com/player/${data.pdgaNumber}`);
    const upcoming = parseUpcomingEvents(html);
    const current = parseCurrentEvents(html);
    // Merge, de-duping by event_ref. Ongoing "Now Playing" events count too —
    // they hold tee times just like Upcoming events do.
    const map = new Map<string, PdgaUpcomingEvent>();
    for (const e of current) map.set(e.event_ref, e);
    for (const e of upcoming) map.set(e.event_ref, e);
    return Array.from(map.values());
  });

/* --------------------------- Event tee-times ---------------------------- */

export type PdgaEventTeeTime = {
  pdga_number: string;
  name: string | null;
  rating: number | null;
  division: string | null;
  tee_time: string | null;
  round_label?: string | null;
  round_number: number | null;
  pool: string | null;
  starting_hole: string | null;
};

export type PdgaEventScheduleRow = {
  round_number: number;
  division: string;
  course_name: string | null;
  course_layout: string | null;
};

/**
 * Parse `layout-details-{eventRef}-{DIV}-round-{n}` blocks that appear on
 * every event landing/results page. Authoritative "what does this division
 * play in round N" mapping — used for multi-course events like Ledgestone.
 */
export function parseEventSchedule(html: string, eventRef: string): PdgaEventScheduleRow[] {
  const out: PdgaEventScheduleRow[] = [];
  const re = new RegExp(
    `id="layout-details-${eventRef}-([A-Z]{2,6}\\d{0,3})-round-(\\d+)"[^>]*>([\\s\\S]*?)</div>\\s*</div>`,
    "gi",
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const division = m[1];
    const round = Number(m[2]);
    const inner = m[3];
    const linkM = inner.match(/<a[^>]*>([\s\S]*?)<\/a>\s*(?:-\s*([^<]+))?/i);
    const courseName = linkM ? stripTags(linkM[1]) : stripTags(inner).split(" - ")[0] || null;
    let layout: string | null = null;
    if (linkM && linkM[2]) {
      layout = stripTags(linkM[2]).split(";")[0]?.trim() || null;
    }
    out.push({
      round_number: round,
      division,
      course_name: courseName || null,
      course_layout: layout,
    });
  }
  return out;
}

export const getPdgaEventSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ eventRef: z.string().regex(/^\d{1,9}$/) }).parse(raw))
  .handler(async ({ data }) => {
    try {
      const html = await fetchText(`https://www.pdga.com/tour/event/${data.eventRef}`);
      return parseEventSchedule(html, data.eventRef);
    } catch {
      return [] as PdgaEventScheduleRow[];
    }
  });

/**
 * Parse /tour/event/{ref}/tee_times.
 *
 * Emits one row per (player, division, round). Round headers ("Round 2")
 * scope subsequent division tables. Pool letters ("· Pool A" in the header)
 * and starting-hole columns are captured when present. Pre-draw sheets
 * fall back to `round_number: null`, `tee_time: null`.
 */
export function parseEventTeeTimes(html: string): PdgaEventTeeTime[] {
  const out: PdgaEventTeeTime[] = [];
  const seen = new Set<string>();

  const markerRe = /<h[2-6][^>]*>([\s\S]*?)<\/h[2-6]>/gi;
  type Marker =
    | { kind: "round"; round: number; index: number }
    | { kind: "division"; division: string; pool: string | null; index: number };
  const markers: Marker[] = [];
  let mm: RegExpExecArray | null;
  while ((mm = markerRe.exec(html)) !== null) {
    const raw = mm[0];
    const text = stripTags(mm[1]);
    const idM = raw.match(/\bid="([A-Z]{2,6}\d{0,3})"/);
    const isDivisionHeader =
      /class="[^"]*\bdivision\b[^"]*"/i.test(raw) || (idM && /^[A-Z]{2,6}\d{0,3}\b/.test(text));
    const roundOnly = text.match(/^\s*Round\s+(\d+)\b/i);
    if (isDivisionHeader && idM) {
      const poolM = text.match(/Pool\s+([A-Z0-9]+)/i);
      markers.push({
        kind: "division",
        division: idM[1],
        pool: poolM ? poolM[1].toUpperCase() : null,
        index: mm.index + raw.length,
      });
    } else if (roundOnly) {
      markers.push({ kind: "round", round: Number(roundOnly[1]), index: mm.index + raw.length });
    }
  }

  let currentRound: number | null = null;
  for (let i = 0; i < markers.length; i++) {
    const mk = markers[i];
    if (mk.kind === "round") {
      currentRound = mk.round;
      continue;
    }
    const start = mk.index;
    const end = i + 1 < markers.length ? markers[i + 1].index : html.length;
    const chunk = html.slice(start, end);
    const tableM = chunk.match(/<table[^>]*class="[^"]*results[^"]*"[\s\S]*?<\/table>/i);
    if (!tableM) continue;
    const table = tableM[0];
    const hasTeeCol = /class="tee-time"/i.test(table);
    const hasStartHoleCol = /class="(?:starting-hole|start-hole|hole)"/i.test(table);
    const tbodyM = table.match(/<tbody>([\s\S]*?)<\/tbody>/i);
    if (!tbodyM) continue;
    const rows = tbodyM[1].match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
    for (const row of rows) {
      const pdgaM = row.match(/<td[^>]*class="pdga-number"[^>]*>([\s\S]*?)<\/td>/i);
      if (!pdgaM) continue;
      const pdga = stripTags(pdgaM[1]);
      if (!/^\d+$/.test(pdga)) continue;
      let tee: string | null = null;
      if (hasTeeCol) {
        const teeM = row.match(/<td[^>]*class="tee-time"[^>]*>([\s\S]*?)<\/td>/i);
        tee = teeM ? stripTags(teeM[1]) || null : null;
      }
      let startingHole: string | null = null;
      if (hasStartHoleCol) {
        const shM = row.match(
          /<td[^>]*class="(?:starting-hole|start-hole|hole)"[^>]*>([\s\S]*?)<\/td>/i,
        );
        startingHole = shM ? stripTags(shM[1]) || null : null;
      }
      // Registration / results tables carry the player's name and current
      // rating in the same row; keep them so the field list can render without
      // waiting on the pdga_players cache.
      const nameM = row.match(/<td[^>]*class="player"[^>]*>([\s\S]*?)<\/td>/i);
      const name = nameM ? stripTags(nameM[1]).replace(/\s+/g, " ").trim() || null : null;
      const ratingM = row.match(/<td[^>]*class="player-rating"[^>]*>([\s\S]*?)<\/td>/i);
      const ratingRaw = ratingM ? stripTags(ratingM[1]).replace(/[^0-9]/g, "") : "";
      const rating = ratingRaw ? Number(ratingRaw) : null;
      const key = `${pdga}:${mk.division}:${currentRound ?? 0}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        pdga_number: pdga,
        name,
        rating: Number.isFinite(rating as number) ? rating : null,
        division: mk.division,
        tee_time: tee,
        round_number: currentRound,
        pool: mk.pool,
        starting_hole: startingHole,
      });
    }
  }
  return out;
}

export const getPdgaEventTeeTimes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ eventRef: z.string().regex(/^\d{1,9}$/) }).parse(raw))
  .handler(async ({ data }) => {
    try {
      const html = await fetchText(`https://www.pdga.com/tour/event/${data.eventRef}/tee_times`);
      return parseEventTeeTimes(html);
    } catch {
      return [] as PdgaEventTeeTime[];
    }
  });

/* ------------------------------ Event info ------------------------------ */

export type PdgaEventInfo = {
  event_ref: string;
  name: string | null;
  tier: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  /** The event page's "About"/"Tournament details" copy, when it publishes one. */
  description: string | null;
  url: string;
};

export function parseEventPageInfo(html: string, eventRef: string): PdgaEventInfo {
  // Title
  let name: string | null = null;
  const t = html.match(/<h1[^>]*id="page-title"[^>]*>([\s\S]*?)<\/h1>/i);
  if (t) name = stripTags(t[1]);

  // Tier heading inside "Event Info" pane: <h4>Pro/Am A-Tier</h4>
  let tier: string | null = null;
  const paneM = html.match(
    /pane-tournament-event-info[\s\S]*?<div class="pane-content">([\s\S]*?)<\/div>/i,
  );
  const pane = paneM ? paneM[1] : "";
  const tierM = pane.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i);
  if (tierM) tier = stripTags(tierM[1]) || null;

  // Date: "15-Aug to 17-Aug-2025" or "22-Aug-2025"
  let startDate: string | null = null;
  let endDate: string | null = null;
  const dateLi = pane.match(/tournament-date[^<]*<strong>[^<]*<\/strong>\s*:\s*([^<]+)</i);
  if (dateLi) {
    const raw = dateLi[1].trim();
    const range = raw.match(/^(\d{1,2}-[A-Za-z]{3})\s+to\s+(\d{1,2}-[A-Za-z]{3}-\d{4})$/);
    if (range) {
      const yearM = range[2].match(/(\d{4})$/);
      const year = yearM ? yearM[1] : "";
      startDate = parseDateLoose(`${range[1]}-${year}`);
      endDate = parseDateLoose(range[2]);
    } else {
      const single = parseDateLoose(raw);
      startDate = single;
      endDate = single;
    }
  }

  // Location
  let location: string | null = null;
  const locLi = pane.match(/tournament-location[^<]*<strong>[^<]*<\/strong>\s*:\s*([^<]+)</i);
  if (locLi) location = stripTags(locLi[1]) || null;

  return {
    event_ref: eventRef,
    name,
    tier,
    start_date: startDate,
    end_date: endDate,
    location,
    description: extractAboutText(html),
    url: `https://www.pdga.com/tour/event/${eventRef}`,
  };
}

export const getPdgaEventInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        url: z.string().url().optional(),
        eventRef: z
          .string()
          .regex(/^\d{1,9}$/)
          .optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    let ref = data.eventRef ?? null;
    if (!ref && data.url) {
      const m = data.url.match(/pdga\.com\/(?:tour\/)?event\/(\d+)/i);
      if (m) ref = m[1];
    }
    if (!ref)
      throw new Error("Provide a PDGA event URL like https://www.pdga.com/tour/event/86677");
    const html = await fetchText(`https://www.pdga.com/tour/event/${ref}`);
    return parseEventPageInfo(html, ref);
  });

async function upsertPdgaFinishes(
  supabaseAdmin: {
    from: (t: string) => { upsert: (rows: unknown, opts?: unknown) => Promise<unknown> };
  },
  pdga: string,
  finishes: PdgaEventFinish[],
) {
  if (!finishes.length) return;
  // Dedupe by (event_name, event_date, division) — matches the unique key used
  // by the existing `pdga_events` onConflict target.
  const map = new Map<string, PdgaEventFinish & { pdga_number: string }>();
  for (const f of finishes) {
    const key = `${f.event_name}|${f.event_date ?? ""}|${f.division ?? ""}`;
    if (!map.has(key)) map.set(key, { pdga_number: pdga, ...f });
  }
  await supabaseAdmin.from("pdga_events").upsert(
    Array.from(map.values()) as never,
    {
      onConflict: "pdga_number,event_name,event_date,division",
    } as never,
  );
}

/**
 * PDGA publishes how many rounds carry a rating only inside the ratings-detail
 * table ("Included: Yes"), so derive the count and the spread of that window
 * ourselves instead of leaving the profile card blank.
 */
function ratingWindowStats(rounds: PdgaRoundParsed[]): {
  roundsUsed: number | null;
  stdDev: number | null;
} {
  const used = rounds.filter((r) => r.included === true).map((r) => r.rating);
  if (used.length < 2) return { roundsUsed: used.length || null, stdDev: null };
  const mean = used.reduce((a, b) => a + b, 0) / used.length;
  const variance = used.reduce((a, b) => a + (b - mean) ** 2, 0) / used.length;
  return { roundsUsed: used.length, stdDev: Math.round(Math.sqrt(variance) * 10) / 10 };
}

/** Next official PDGA ratings update from the maintained schedule table. */
async function nextScheduledRatingUpdate(supabaseAdmin: {
  from: (t: string) => {
    select: (cols: string) => {
      eq: (
        c: string,
        v: string,
      ) => {
        gte: (
          c: string,
          v: string,
        ) => {
          order: (
            c: string,
            o: { ascending: boolean },
          ) => { limit: (n: number) => Promise<{ data: { update_date: string }[] | null }> };
        };
      };
    };
  };
}): Promise<string | null> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabaseAdmin
      .from("rating_update_schedule")
      .select("update_date")
      .eq("authority", "pdga")
      .gte("update_date", today)
      .order("update_date", { ascending: true })
      .limit(1);
    return data?.[0]?.update_date ?? null;
  } catch {
    return null;
  }
}

/**
 * Every cached PDGA player record is written from this one shape so the lookup
 * tool and the "sync my PDGA" action never disagree about what a profile holds.
 */
function pdgaPlayerRow(
  pdgaNumber: string,
  info: ProfileInfo,
  rounds: PdgaRoundParsed[],
  nextUpdate: string | null,
  refreshedAt: string,
) {
  const window = ratingWindowStats(rounds);
  return {
    pdga_number: pdgaNumber,
    name: info.name,
    location: info.location,
    classification: info.classification,
    class: info.classification,
    current_rating: info.currentRating,
    rating_delta: info.ratingDelta,
    rounds_used: info.roundsUsed ?? window.roundsUsed,
    std_dev: info.stdDev ?? window.stdDev,
    drop_below: info.dropBelow,
    last_changed: info.lastChanged,
    next_update: info.nextUpdate ?? nextUpdate,
    member_since: info.memberSince,
    membership_status: info.membershipStatus,
    membership_expires: info.membershipExpires,
    official_status: info.officialStatus,
    official_expires: info.officialExpires,
    career_events: info.careerEvents,
    career_wins: info.careerWins,
    photo_url: info.avatarUrl,
    raw: { url: `https://www.pdga.com/player/${pdgaNumber}` },
    refreshed_at: refreshedAt,
  };
}

/* ------------------------------- Server fns ------------------------------ */

const CACHE_MS = 6 * 60 * 60 * 1000; // 6h

export const lookupPdgaPlayer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        pdgaNumber: z.number().int().min(1).max(999_999_999),
        force: z.boolean().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const key = String(data.pdgaNumber);

    if (!data.force) {
      const { data: cached } = await supabaseAdmin
        .from("pdga_players")
        .select("*")
        .eq("pdga_number", key)
        .maybeSingle();
      if (
        cached &&
        cached.refreshed_at &&
        Date.now() - new Date(cached.refreshed_at as string).getTime() < CACHE_MS
      ) {
        // Cache stores the profile only — round rows aren't persisted per-lookup.
        // Fetch details (round history) and profile (event finishes / place)
        // in parallel so Face-Off, Ratings Calculator, and Event Highlights all populate.
        let detailHtml = "";
        let profileHtml = "";
        let winsHtml = "";
        try {
          [detailHtml, profileHtml, winsHtml] = await Promise.all([
            fetchText(`https://www.pdga.com/player/${data.pdgaNumber}/details`),
            fetchText(`https://www.pdga.com/player/${data.pdgaNumber}`),
            fetchText(`https://www.pdga.com/player/${data.pdgaNumber}/wins`).catch(() => ""),
          ]);
        } catch {
          /* ignore */
        }
        const cachedRounds = detailHtml ? parseRounds(detailHtml) : [];
        const profileFinishes = profileHtml ? parseEventFinishes(profileHtml) : [];
        const winFinishes = winsHtml ? parseCareerWins(winsHtml) : [];
        // Merge — career wins take precedence for wins (place=1) since the
        // profile page only shows the current year's Tournament Results table.
        const mergeMap = new Map<string, PdgaEventFinish>();
        for (const f of [...profileFinishes, ...winFinishes]) {
          const k = `${f.event_name}|${f.event_date ?? ""}|${f.division ?? ""}`;
          const existing = mergeMap.get(k);
          if (!existing) mergeMap.set(k, f);
          else if (existing.place == null && f.place != null)
            mergeMap.set(k, { ...existing, ...f });
        }
        const cachedFinishes = Array.from(mergeMap.values());
        if (cachedFinishes.length) {
          try {
            await upsertPdgaFinishes(supabaseAdmin as never, key, cachedFinishes);
          } catch {
            /* best effort */
          }
        }
        return {
          profile: cached,
          cached: true,
          rounds: cachedRounds.map((r) => ({
            played_on: r.date,
            round_rating: r.rating,
            included: r.included,
            event_name: r.tournament,
            division: r.division,
            score: r.score,
            round_label: r.round_label,
            event_ref: r.event_ref,
          })),
          events: cachedFinishes.map((f) => ({
            pdga_number: key,
            event_ref: f.event_ref,
            event_name: f.event_name,
            event_date: f.event_date,
            division: f.division,
          })),
        };
      }
    }

    let profileHtml = "";
    let detailHtml = "";
    let winsHtml = "";
    try {
      [profileHtml, detailHtml, winsHtml] = await Promise.all([
        fetchText(`https://www.pdga.com/player/${data.pdgaNumber}`),
        fetchText(`https://www.pdga.com/player/${data.pdgaNumber}/details`),
        fetchText(`https://www.pdga.com/player/${data.pdgaNumber}/wins`).catch(() => ""),
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "PDGA lookup failed";
      throw new Error(msg);
    }

    const info = parseProfile(profileHtml);
    const rounds = parseRounds(detailHtml);

    const profileRow = pdgaPlayerRow(
      key,
      info,
      rounds,
      await nextScheduledRatingUpdate(supabaseAdmin as never),
      new Date().toISOString(),
    );
    await supabaseAdmin.from("pdga_players").upsert(profileRow as never);

    // Upsert distinct events (best-effort — one row per tournament+date).
    // Seed from round history, then enrich with `place`/`tier`/`points`
    // from the profile page's Tournament Results table so Event Highlights
    // (Wins / Podiums) can populate.
    type EventRow = {
      pdga_number: string;
      event_ref: string | null;
      event_name: string;
      event_date: string | null;
      division: string | null;
      tier?: string | null;
      place?: number | null;
      points?: number | null;
    };
    const eventMap = new Map<string, EventRow>();
    for (const r of rounds) {
      const k = `${r.tournament}|${r.date}|${r.division ?? ""}`;
      if (!eventMap.has(k)) {
        eventMap.set(k, {
          pdga_number: key,
          event_ref: r.event_ref,
          event_name: r.tournament,
          event_date: r.date,
          division: r.division,
        });
      }
    }
    const finishes = [
      ...parseEventFinishes(profileHtml),
      ...(winsHtml ? parseCareerWins(winsHtml) : []),
    ];
    for (const f of finishes) {
      const k = `${f.event_name}|${f.event_date ?? ""}|${f.division ?? ""}`;
      const existing = eventMap.get(k);
      if (existing) {
        existing.event_ref = existing.event_ref ?? f.event_ref;
        existing.tier = f.tier;
        existing.place = f.place;
        existing.points = f.points;
      } else {
        eventMap.set(k, {
          pdga_number: key,
          event_ref: f.event_ref,
          event_name: f.event_name,
          event_date: f.event_date,
          division: f.division,
          tier: f.tier,
          place: f.place,
          points: f.points,
        });
      }
    }
    if (eventMap.size) {
      await supabaseAdmin.from("pdga_events").upsert(Array.from(eventMap.values()) as never, {
        onConflict: "pdga_number,event_name,event_date,division",
      });
    }

    return {
      profile: profileRow,
      cached: false,
      rounds: rounds.map((r) => ({
        played_on: r.date,
        round_rating: r.rating,
        included: r.included,
        event_name: r.tournament,
        division: r.division,
        score: r.score,
        round_label: r.round_label,
        event_ref: r.event_ref,
      })),
      events: Array.from(eventMap.values()),
    };
  });

export const getPdgaRounds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ pdgaNumber: z.number().int() }).parse(raw))
  .handler(async ({ data }) => {
    // Rounds cached in the caller's external_rounds are user-specific.
    // For the public lab, re-derive from a fresh scrape (cheap because
    // lookupPdgaPlayer already ran and browser normally batches).
    const res = await fetchText(`https://www.pdga.com/player/${data.pdgaNumber}/details`);
    return parseRounds(res).map((r) => ({
      played_on: r.date,
      round_rating: r.rating,
      included: r.included,
      event_name: r.tournament,
      division: r.division,
      score: r.score,
      round_label: r.round_label,
      event_ref: r.event_ref,
    }));
  });

/* ------------------------------- Plan CRUD ------------------------------- */

export const listMyPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: plans } = await context.supabase
      .from("rating_plans")
      .select("*")
      .order("created_at");
    const ids = (plans ?? []).map((p) => p.id as string);
    if (!ids.length) return { plans: [], events: [] };
    const { data: events } = await context.supabase
      .from("rating_plan_events")
      .select("*")
      .in("plan_id", ids)
      .order("event_date");
    return { plans: plans ?? [], events: events ?? [] };
  });

export const savePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        id: z.string().uuid().optional(),
        pdgaNumber: z.string().optional(),
        name: z.string().min(1).max(80),
        strategy: z.enum(["offset", "goal", "manual"]),
        targetRating: z.number().int().optional(),
        offsetPoints: z.number().int().optional(),
        months: z.number().int().min(1).max(24),
        roundsPerMonth: z.number().int().min(1).max(30),
        color: z.string().max(20).optional(),
        events: z
          .array(
            z.object({
              event_name: z.string().optional().nullable(),
              event_date: z.string(),
              rounds: z.number().int(),
              expected_rating: z.number().int().nullable().optional(),
            }),
          )
          .optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const row = {
      user_id: userId,
      pdga_number: data.pdgaNumber ?? null,
      name: data.name,
      strategy: data.strategy,
      target_rating: data.targetRating ?? null,
      offset_points: data.offsetPoints ?? 0,
      months: data.months,
      rounds_per_month: data.roundsPerMonth,
      color: data.color ?? "#22d3ee",
    };
    let planId = data.id;
    if (planId) {
      const { error } = await supabase.from("rating_plans").update(row).eq("id", planId);
      if (error) throw new Error(error.message);
    } else {
      const { data: created, error } = await supabase
        .from("rating_plans")
        .insert(row)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      planId = created!.id as string;
    }
    if (data.events && planId) {
      await supabase.from("rating_plan_events").delete().eq("plan_id", planId);
      if (data.events.length) {
        await supabase
          .from("rating_plan_events")
          .insert(data.events.map((e, i) => ({ plan_id: planId!, ...e, sort_order: i })) as never);
      }
    }
    return { id: planId };
  });

export const deletePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("rating_plans").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* --------------- Authenticated: sync signed-in user's PDGA --------------- */

/**
 * Pull the signed-in user's PDGA profile + rounds, cache them, mirror rounds
 * into their `external_rounds`, and stamp `profiles.pdga_rating` /
 * `pdga_number` so every rating surface in the app reads live data.
 * If `pdgaNumber` isn't provided we use the number on the caller's profile.
 */
export const syncMyPdgaFromProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        pdgaNumber: z
          .string()
          .regex(/^\d{1,9}$/)
          .optional(),
        force: z.boolean().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prof } = await supabase
      .from("profiles")
      .select("pdga_number, pdga_rating")
      .eq("id", userId)
      .maybeSingle();
    const pdga = (data.pdgaNumber ?? prof?.pdga_number ?? "").replace(/\D/g, "");
    if (!pdga) return { ok: false, reason: "no_pdga" as const };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Cache-aware: skip network + round rewrite if we scraped this PDGA number
    // recently AND the caller's profile already has a rating stamped.
    if (!data.force) {
      const { data: cached } = await supabaseAdmin
        .from("pdga_players")
        .select("refreshed_at, current_rating")
        .eq("pdga_number", pdga)
        .maybeSingle();
      const fresh =
        cached?.refreshed_at &&
        Date.now() - new Date(cached.refreshed_at as string).getTime() < CACHE_MS;
      if (fresh && prof?.pdga_rating) {
        return {
          ok: true,
          cached: true,
          roundsSynced: 0,
          refreshedAt: cached.refreshed_at as string,
        };
      }
    }

    let profileHtml = "";
    let detailHtml = "";
    let winsHtml = "";
    try {
      [profileHtml, detailHtml, winsHtml] = await Promise.all([
        fetchText(`https://www.pdga.com/player/${pdga}`),
        fetchText(`https://www.pdga.com/player/${pdga}/details`),
        fetchText(`https://www.pdga.com/player/${pdga}/wins`).catch(() => ""),
      ]);
    } catch (err: unknown) {
      throw new Error(err instanceof Error ? err.message : "PDGA lookup failed");
    }
    const info = parseProfile(profileHtml);
    const rounds = parseRounds(detailHtml);

    // Build a lookup from (event_ref, division) → finish so each mirrored
    // round can carry the player's placement, field size, and PDGA points.
    // Career wins fill in prior years the current profile table doesn't show.
    const finishes = [
      ...(profileHtml ? parseEventFinishes(profileHtml) : []),
      ...(winsHtml ? parseCareerWins(winsHtml) : []),
    ];
    const placeByRef = new Map<string, { place: number | null; points: number | null }>();
    for (const f of finishes) {
      if (!f.event_ref) continue;
      const key = `${f.event_ref}|${(f.division ?? "").toUpperCase()}`;
      const prev = placeByRef.get(key);
      // Prefer non-null place if we already had one; career-wins parser stamps place=1.
      if (!prev || (prev.place == null && f.place != null)) {
        placeByRef.set(key, { place: f.place, points: f.points });
      }
    }
    const finishFor = (event_ref: string | null, division: string | null) => {
      if (!event_ref) return { place: null as number | null, points: null as number | null };
      return (
        placeByRef.get(`${event_ref}|${(division ?? "").toUpperCase()}`) ??
        placeByRef.get(`${event_ref}|`) ?? { place: null, points: null }
      );
    };
    try {
      if (finishes.length) await upsertPdgaFinishes(supabaseAdmin as never, pdga, finishes);
    } catch {
      /* best effort */
    }

    const refreshedAt = new Date().toISOString();
    const profileRow = pdgaPlayerRow(
      pdga,
      info,
      rounds,
      await nextScheduledRatingUpdate(supabaseAdmin as never),
      refreshedAt,
    );
    await supabaseAdmin.from("pdga_players").upsert(profileRow as never);

    let insertedCount = 0;
    let updatedCount = 0;
    if (rounds.length) {
      // Idempotent sync: match existing rows by (date + event + score) and
      // update volatile fields (rating, included, evaluated_on) in place.
      // Never blow away rows or manual edits (notes, layout_name, ssa) via
      // DELETE+INSERT — that was corrupting user-curated data on every sync.
      const { data: existingRows } = await supabase
        .from("external_rounds")
        .select(
          "id, played_on, event_name, score, round_rating, included, evaluated_on, pdga_event_ref, place, points",
        )
        .eq("user_id", userId)
        .eq("source", "pdga");
      const keyOf = (d: string, e: string | null, s: number | null) =>
        `${d}|${(e ?? "").toLowerCase()}|${s ?? ""}`;
      const priorByKey = new Map<
        string,
        {
          id: string;
          round_rating: number | null;
          included: boolean | null;
          evaluated_on: string | null;
          pdga_event_ref: string | null;
          place: number | null;
          points: number | null;
        }
      >();
      for (const e of existingRows ?? []) {
        priorByKey.set(
          keyOf(e.played_on as string, e.event_name as string | null, e.score as number | null),
          {
            id: e.id as string,
            round_rating: (e.round_rating as number | null) ?? null,
            included: (e.included as boolean | null) ?? null,
            evaluated_on: (e.evaluated_on as string | null) ?? null,
            pdga_event_ref: (e.pdga_event_ref as string | null) ?? null,
            place: (e.place as number | null) ?? null,
            points: (e.points as number | null) ?? null,
          },
        );
      }

      const inserts: Array<Record<string, unknown>> = [];
      for (const r of rounds) {
        const k = keyOf(r.date, r.tournament, r.score);
        const finish = finishFor(r.event_ref, r.division);
        const prior = priorByKey.get(k);
        if (prior) {
          const patch: Record<string, unknown> = {};
          if (r.rating != null && prior.round_rating !== r.rating) patch.round_rating = r.rating;
          if (r.included != null && prior.included !== r.included) patch.included = r.included;
          if (r.evaluated_on && prior.evaluated_on !== r.evaluated_on)
            patch.evaluated_on = r.evaluated_on;
          if (r.event_ref && prior.pdga_event_ref !== r.event_ref)
            patch.pdga_event_ref = r.event_ref;
          if (finish.place != null && prior.place !== finish.place) patch.place = finish.place;
          if (finish.points != null && prior.points !== finish.points) patch.points = finish.points;
          if (Object.keys(patch).length) {
            const { error: uerr } = await supabase
              .from("external_rounds")
              .update(patch as never)
              .eq("id", prior.id);
            if (!uerr) updatedCount++;
          }
          continue;
        }
        inserts.push({
          user_id: userId,
          source: "pdga",
          course_name: r.tournament,
          layout_name: null,
          event_name: r.tournament,
          played_on: r.date,
          score: r.score,
          to_par: null,
          round_rating: r.rating,
          ssa: null,
          notes: null,
          format: "singles",
          division: r.division,
          included: r.included,
          evaluated_on: r.evaluated_on,
          pdga_event_ref: r.event_ref,
          place: finish.place,
          points: finish.points,
        });
      }
      if (inserts.length) {
        // Dedupe within this batch by the DB's natural key so a single sync
        // never races with itself, then insert one-by-one and swallow the
        // 23505 (duplicate) errors that mean a prior row already covers it.
        const seen = new Set<string>();
        const unique = inserts.filter((row) => {
          const k = [
            row.user_id,
            row.source,
            row.course_name,
            row.layout_name ?? "",
            row.played_on,
            row.score ?? -9999,
            row.format,
          ].join("|");
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        for (const row of unique) {
          const { error: insErr } = await supabase.from("external_rounds").insert(row as never);
          if (insErr) {
            if ((insErr as { code?: string }).code === "23505") continue;
            throw new Error(insErr.message);
          }
          insertedCount++;
        }
      }
    }

    // Auto-adopt the PDGA profile photo as the DG Dashboard avatar, but never
    // overwrite an avatar the user uploaded themselves. Re-syncs are fine
    // when the existing avatar is empty or already a PDGA-hosted image.
    const { data: existing } = await supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", userId)
      .maybeSingle();
    const currentAvatar = existing?.avatar_url ?? "";
    const pdgaHosted = !currentAvatar || /(^|\.)pdga\.com\//i.test(currentAvatar);
    const nextAvatar = info.avatarUrl && pdgaHosted ? info.avatarUrl : currentAvatar || null;

    const patch = {
      pdga_number: pdga,
      ...(info.currentRating ? { pdga_rating: info.currentRating } : {}),
      ...(nextAvatar !== currentAvatar ? { avatar_url: nextAvatar } : {}),
    };
    await supabase
      .from("profiles")
      .update(patch as never)
      .eq("id", userId);

    return {
      ok: true,
      cached: false,
      profile: profileRow,
      roundsSynced: rounds.length,
      inserted: insertedCount,
      updated: updatedCount,
      refreshedAt,
    };
  });

/**
 * Read the signed-in user's stored PDGA lab data (no network). Uses the
 * cached `pdga_players` row + their mirrored `external_rounds`. Falls back
 * to `null` if the user hasn't set a PDGA number yet.
 */
export const getMyPdgaLab = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: prof } = await supabase
      .from("profiles")
      .select("pdga_number, pdga_rating, display_name, location")
      .eq("id", userId)
      .maybeSingle();
    const pdga = (prof?.pdga_number ?? "").replace(/\D/g, "");
    if (!pdga) return { pdgaNumber: null, profile: null, rounds: [] };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cached } = await supabaseAdmin
      .from("pdga_players")
      .select("*")
      .eq("pdga_number", pdga)
      .maybeSingle();

    const { data: rows } = await supabase
      .from("external_rounds")
      .select(
        "played_on, round_rating, included, event_name, division, score, pdga_event_ref, evaluated_on",
      )
      .eq("user_id", userId)
      .eq("source", "pdga")
      .not("round_rating", "is", null)
      .order("played_on", { ascending: false });

    // Broader external-round counts so the "Rounds by source" widget can attribute
    // PDGA-sanctioned rounds to Tournaments and UDisc imports to Casual, instead of
    // stranding every scraped round under a single "PDGA" bucket.
    const { data: extAll } = await supabase
      .from("external_rounds")
      .select("source, format, pdga_event_ref, event_name")
      .eq("user_id", userId);
    type ExtBucketRow = {
      source: string | null;
      format: string | null;
      pdga_event_ref: string | null;
      event_name: string | null;
    };
    const extBuckets = ((extAll ?? []) as ExtBucketRow[]).reduce(
      (acc, r) => {
        const isTournament = !!r.pdga_event_ref || r.source === "pdga";
        const isLeague = !isTournament && /league|weekly|series/i.test(r.event_name ?? "");
        if (isTournament) acc.tournament += 1;
        else if (isLeague) acc.league += 1;
        else acc.casual += 1;
        if (r.source === "udisc") acc.udisc += 1;
        else if (r.source === "disc_golf_scene" || r.source === "dgs") acc.dgs += 1;
        return acc;
      },
      { tournament: 0, league: 0, casual: 0, udisc: 0, dgs: 0 },
    );

    // Merge in-app rated rounds (tournaments, leagues, casual) so The Ratings Hub
    // reflects every round the player has scored inside DG Dashboard, not just PDGA.
    const { data: inAppRows } = await supabase
      .from("round_ratings")
      .select(
        `
        round_rating, created_at,
        round:rounds!inner(
          id, started_at, ended_at, created_at, tournament_id, league_event_id,
          course:courses(name),
          tournament:tournaments(name, pdga_event_number),
          league_event:league_events(name, event_date, league:leagues(name))
        )
      `,
      )
      .eq("user_id", userId)
      .not("round_rating", "is", null)
      .order("created_at", { ascending: false });

    type InAppRow = {
      round_rating: number;
      created_at: string;
      round: {
        started_at: string | null;
        ended_at: string | null;
        created_at: string;
        tournament_id: string | null;
        league_event_id: string | null;
        course: { name: string | null } | null;
        tournament: { name: string | null; pdga_event_number: string | null } | null;
        league_event: {
          name: string | null;
          event_date: string | null;
          league: { name: string | null } | null;
        } | null;
      } | null;
    };

    const inAppRounds = ((inAppRows ?? []) as unknown as InAppRow[]).map((r) => {
      const rd = r.round;
      const playedOn = (rd?.ended_at ?? rd?.started_at ?? rd?.created_at ?? r.created_at) as string;
      const source: "tournament" | "league" | "casual" = rd?.tournament_id
        ? "tournament"
        : rd?.league_event_id
          ? "league"
          : "casual";
      let eventName = "Casual round";
      if (source === "tournament" && rd?.tournament?.name) {
        eventName = rd.tournament.pdga_event_number
          ? `${rd.tournament.name} (PDGA #${rd.tournament.pdga_event_number})`
          : rd.tournament.name;
      } else if (source === "league" && rd?.league_event) {
        const leagueName = rd.league_event.league?.name ?? "League";
        const week = rd.league_event.name ? ` — ${rd.league_event.name}` : "";
        eventName = `${leagueName}${week}`;
      } else if (rd?.course?.name) {
        eventName = `Casual @ ${rd.course.name}`;
      }
      return {
        played_on: playedOn.slice(0, 10),
        round_rating: r.round_rating,
        included: true,
        event_name: eventName,
        division: null as string | null,
        score: null as number | null,
        event_ref: null as string | null,
        evaluated_on: null as string | null,
        source,
      };
    });

    const pdgaRounds = (rows ?? []).map((r) => ({
      played_on: r.played_on,
      round_rating: r.round_rating,
      included: r.included,
      event_name: r.event_name ?? "Event",
      division: r.division,
      score: r.score,
      event_ref: r.pdga_event_ref,
      evaluated_on: r.evaluated_on,
      source: "pdga" as const,
    }));

    return {
      pdgaNumber: pdga,
      profile: cached ?? {
        pdga_number: pdga,
        name: prof?.display_name ?? null,
        location: prof?.location ?? null,
        classification: null,
        current_rating: prof?.pdga_rating ?? null,
        rounds_used: null,
        std_dev: null,
        drop_below: null,
        last_changed: null,
        next_update: null,
        refreshed_at: null,
      },
      rounds: [...pdgaRounds, ...inAppRounds].sort((a, b) =>
        b.played_on.localeCompare(a.played_on),
      ),
      sourceCounts: {
        pdga: pdgaRounds.length,
        tournament:
          inAppRounds.filter((r) => r.source === "tournament").length + extBuckets.tournament,
        league: inAppRounds.filter((r) => r.source === "league").length + extBuckets.league,
        casual: inAppRounds.filter((r) => r.source === "casual").length + extBuckets.casual,
        udisc: extBuckets.udisc,
        dgs: extBuckets.dgs,
      },
      refreshedAt: (cached?.refreshed_at as string | null | undefined) ?? null,
      isStale:
        !cached?.refreshed_at ||
        Date.now() - new Date(cached.refreshed_at as string).getTime() > 24 * 60 * 60 * 1000,
    };
  });
