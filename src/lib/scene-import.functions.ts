/**
 * Disc Golf Scene importers — clubs and player profiles.
 *
 * discgolfscene.com has no public API. Pages are server-rendered HTML we fetch
 * and parse. This module extracts what we can with layout-tolerant regex and
 * always returns partial data instead of failing when a field is missing.
 *
 * Player profiles are split across seven tabs on DGS: About, Scores, Aces,
 * Achievements, Series, Friends, Comments. Users paste each tab's URL
 * separately and this importer ingests all of them into their DGD account.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { extractAboutText } from "@/lib/event-about";

/* ---------------- fetch (Firecrawl if wired, plain fetch otherwise) ---- */

async function fetchHtml(url: string): Promise<string> {
  const lovable = process.env.LOVABLE_API_KEY;
  const conn = process.env.FIRECRAWL_API_KEY;
  if (lovable && conn && conn.startsWith("lovc_")) {
    try {
      const res = await fetch("https://connector-gateway.lovable.dev/firecrawl/v2/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lovable}`,
          "X-Connection-Api-Key": conn,
        },
        body: JSON.stringify({ url, formats: ["rawHtml", "html"], onlyMainContent: false }),
      });
      if (res.ok) {
        const body = (await res.json()) as {
          data?: { rawHtml?: string; html?: string };
          rawHtml?: string;
          html?: string;
        };
        const html = body.rawHtml ?? body.html ?? body.data?.rawHtml ?? body.data?.html ?? null;
        if (html) return html;
      }
    } catch {
      /* fall through */
    }
  } else if (conn && conn.startsWith("fc-")) {
    try {
      const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${conn}` },
        body: JSON.stringify({ url, formats: ["rawHtml", "html"], onlyMainContent: false }),
      });
      if (res.ok) {
        const body = (await res.json()) as {
          data?: { rawHtml?: string; html?: string };
          rawHtml?: string;
          html?: string;
        };
        const html = body.rawHtml ?? body.html ?? body.data?.rawHtml ?? body.data?.html ?? null;
        if (html) return html;
      }
    } catch {
      /* fall through */
    }
  }
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; DGDashboard/1.0; +https://dgdashboard.app)",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
  return await res.text();
}

/* --------------------------- helpers --------------------------- */

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

function meta(html: string, prop: string): string | null {
  const rx = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*content=["']([^"']+)["']`,
    "i",
  );
  const m = html.match(rx);
  return m ? m[1].trim() : null;
}

function extractCityState(text: string): {
  city: string | null;
  state: string | null;
  location: string | null;
} {
  const m = text.match(/([A-Z][A-Za-z .'-]{2,}),\s*([A-Z]{2})\b/);
  if (!m) return { city: null, state: null, location: null };
  return { city: m[1].trim(), state: m[2].trim(), location: `${m[1].trim()}, ${m[2].trim()}` };
}

function absoluteUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function findLink(html: string, rx: RegExp, base: string): string | null {
  const m = html.match(rx);
  return m ? absoluteUrl(m[1], base) : null;
}

const SCENE_HOSTS = new Set(["discgolfscene.com", "www.discgolfscene.com"]);

function isSceneUrl(url: string, kind: "clubs" | "players"): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  if (!SCENE_HOSTS.has(parsed.hostname.toLowerCase())) return false;
  if (kind === "players") {
    return /^\/(?:players|player|profile)\/[^/?#]+/i.test(parsed.pathname);
  }
  return new RegExp(`^/${kind}/[^/?#]+`, "i").test(parsed.pathname);
}


function externalIdFrom(url: string, kind: "clubs" | "players"): string | null {
  if (kind === "players") {
    const m = url.match(/discgolfscene\.com\/(?:players|player|profile)\/([^/?#]+)/i);
    return m ? m[1] : null;
  }
  const m = url.match(new RegExp(`discgolfscene\\.com/${kind}/([^/?#]+)`, "i"));
  return m ? m[1] : null;
}

/* --------------------------- club parser --------------------------- */

export type SceneClub = {
  name: string;
  description: string | null;
  location: string | null;
  city: string | null;
  state: string | null;
  cover_url: string | null;
  facebook_url: string | null;
  website_url: string | null;
  instagram_url: string | null;
  external_id: string | null;
  scene_url: string;
};

function parseClub(html: string, url: string): SceneClub | null {
  const cleanText = stripTags(html);
  const ogTitle = meta(html, "og:title");
  const titleTag = html.match(/<title>([\s\S]*?)<\/title>/i);
  const rawTitle = (ogTitle ?? (titleTag ? stripTags(titleTag[1]) : "")).trim();
  const name = rawTitle
    .replace(/\s*[·|-]\s*Disc Golf Scene\s*$/i, "")
    .replace(/\s*\|\s*Disc Golf Scene\s*$/i, "")
    .trim();
  if (!name) return null;

  // Prefer the club/league page's About section; the meta tag is a share blurb.
  const description =
    extractAboutText(html) ?? meta(html, "og:description") ?? meta(html, "description");
  const cover = meta(html, "og:image") ?? meta(html, "twitter:image");
  const loc = extractCityState(cleanText);

  const facebook = findLink(html, /href="((?:https?:)?\/\/(?:www\.)?facebook\.com\/[^"]+)"/i, url);
  const instagram = findLink(
    html,
    /href="((?:https?:)?\/\/(?:www\.)?instagram\.com\/[^"]+)"/i,
    url,
  );
  const website = findLink(
    html,
    /href="(https?:\/\/(?!(?:www\.)?(?:discgolfscene|facebook|instagram|twitter|x)\.com)[^"]+)"[^>]*>(?:Website|Home Page|Visit)/i,
    url,
  );

  return {
    name: name.slice(0, 200),
    description: description ? description.slice(0, 2000) : null,
    location: loc.location,
    city: loc.city,
    state: loc.state,
    cover_url: cover,
    facebook_url: facebook,
    instagram_url: instagram,
    website_url: website,
    external_id: externalIdFrom(url, "clubs"),
    scene_url: url,
  };
}

/* --------------------------- player parsers --------------------------- */

export type SceneProfile = {
  display_name: string;
  city: string | null;
  state: string | null;
  location: string | null;
  pdga_number: string | null;
  avatar_url: string | null;
  bio: string | null;
  external_id: string | null;
  scene_url: string;
};

function parseAbout(html: string, url: string): SceneProfile | null {
  const cleanText = stripTags(html);
  const ogTitle = meta(html, "og:title");
  const titleTag = html.match(/<title>([\s\S]*?)<\/title>/i);
  const rawTitle = (ogTitle ?? (titleTag ? stripTags(titleTag[1]) : "")).trim();
  const display_name = rawTitle
    .replace(/\s*[·|-]\s*Disc Golf Scene\s*$/i, "")
    .replace(/\s*\|\s*Disc Golf Scene\s*$/i, "")
    .replace(/^Player\s*[:\-]\s*/i, "")
    .trim();
  if (!display_name) return null;

  const loc = extractCityState(cleanText);
  const pdgaMatch = cleanText.match(/PDGA\s*#?\s*(\d{3,7})/i);
  const avatar = meta(html, "og:image") ?? meta(html, "twitter:image");
  const bio = meta(html, "og:description") ?? meta(html, "description");

  return {
    display_name: display_name.slice(0, 100),
    city: loc.city,
    state: loc.state,
    location: loc.location,
    pdga_number: pdgaMatch ? pdgaMatch[1] : null,
    avatar_url: avatar,
    bio: bio ? bio.slice(0, 280) : null,
    external_id: externalIdFrom(url, "players"),
    scene_url: url,
  };
}

/* ---- scores tab: pull rows of (event, course, date, division, score, rating) */

export type SceneScoreRow = {
  played_on: string | null; // YYYY-MM-DD
  event_name: string | null;
  course_name: string | null;
  layout_name: string | null;
  division: string | null;
  round_label: string | null;
  score: number | null;
  to_par: number | null;
  round_rating: number | null;
  place: number | null;
  event_url: string | null;
};

function parseISODate(raw: string): string | null {
  const s = raw.trim();
  // Matches "Jan 4, 2024", "January 4, 2024", "2024-01-04", "1/4/24".
  const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;
  const m2 = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m2) {
    const d = new Date(`${m2[1]} ${m2[2]}, ${m2[3]} UTC`);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const m3 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m3) {
    const yyyy = m3[3].length === 2 ? `20${m3[3]}` : m3[3];
    return `${yyyy}-${m3[2].padStart(2, "0")}-${m3[1].padStart(2, "0")}`;
  }
  return null;
}

function parseScoresTab(html: string, url: string): SceneScoreRow[] {
  const rows: SceneScoreRow[] = [];
  // Grab every table row; DGS renders scores as <tr> with cells for date, event/course, division, round, total, rating.
  const trRx = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRx = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  const linkRx = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i;

  let m: RegExpExecArray | null;
  while ((m = trRx.exec(html)) !== null) {
    const inner = m[1];
    const cells: string[] = [];
    const cellHtml: string[] = [];
    let c: RegExpExecArray | null;
    cellRx.lastIndex = 0;
    while ((c = cellRx.exec(inner)) !== null) {
      cellHtml.push(c[1]);
      cells.push(stripTags(c[1]));
    }
    if (cells.length < 3) continue;

    // Date is typically first cell.
    const played_on = cells.map((v) => parseISODate(v)).find((v): v is string => !!v) ?? null;
    if (!played_on) continue;

    // Rating: any 3-digit standalone number in the row.
    const ratingMatch = cells.join(" | ").match(/\b(\d{3})\b(?![^|]*\d)/);
    const round_rating = ratingMatch ? Number(ratingMatch[1]) : null;

    // Score: look for "63 (-9)" style or a bare small number that's not the rating.
    let score: number | null = null;
    let to_par: number | null = null;
    for (const cell of cells) {
      const sm = cell.match(/(\d{2,3})\s*\(\s*([+\-]?\d+)\s*\)/);
      if (sm) {
        const s = Number(sm[1]);
        if (s >= 30 && s <= 200) {
          score = s;
          to_par = Number(sm[2]);
          break;
        }
      }
    }
    if (score === null) {
      for (const cell of cells) {
        const sm = cell.match(/^\s*(\d{2,3})\s*$/);
        if (sm) {
          const s = Number(sm[1]);
          if (s >= 30 && s <= 200 && (!round_rating || s !== round_rating)) {
            score = s;
            break;
          }
        }
      }
    }

    // Event / course: find an anchor to an event page and pull its text; otherwise use the widest text cell.
    let event_name: string | null = null;
    let event_url: string | null = null;
    let course_name: string | null = null;
    for (const raw of cellHtml) {
      const lm = raw.match(linkRx);
      if (lm && /\/(events|tournaments|leagues)\//i.test(lm[1])) {
        event_url = absoluteUrl(lm[1], url);
        event_name = stripTags(lm[2]).slice(0, 200) || null;
        break;
      }
    }
    // Course inference: use the largest non-numeric text cell that isn't the event.
    const textCells = cells
      .filter((v) => v && !/^\d+$/.test(v) && !parseISODate(v))
      .filter((v) => !event_name || v !== event_name);
    if (textCells.length) {
      textCells.sort((a, b) => b.length - a.length);
      course_name = textCells[0].slice(0, 200);
    }

    // Division: look for MPO/MA1/FA2/etc.
    const divisionMatch = cells
      .join(" ")
      .match(/\b(MPO|FPO|MP\d{2}|FP\d{2}|MA\d|FA\d|MJ\d{2}|FJ\d{2}|MPG|Mixed)\b/);
    const division = divisionMatch ? divisionMatch[1] : null;

    // Place: "T5", "1st", "12"
    const placeMatch = cells.join(" ").match(/\b(?:T)?(\d{1,3})(?:st|nd|rd|th)?\b(?=[^0-9]|$)/);
    const place = placeMatch && Number(placeMatch[1]) <= 500 ? Number(placeMatch[1]) : null;

    // Round label: "Rd 1", "Round 2"
    const roundMatch = cells.join(" ").match(/\b(?:R(?:ou)?nd\.?\s*)(\d{1,2})\b/i);
    const round_label = roundMatch ? `R${roundMatch[1]}` : null;

    if (!score && !round_rating) continue;

    rows.push({
      played_on,
      event_name,
      course_name,
      layout_name: null,
      division,
      round_label,
      score,
      to_par,
      round_rating,
      place,
      event_url,
    });
  }
  return rows;
}

/* ---- aces / achievements / friends / series / comments — lightweight summaries */

export type SceneAce = {
  played_on: string | null;
  course_name: string | null;
  hole: number | null;
  event_name: string | null;
};

function parseAcesTab(html: string): SceneAce[] {
  const aces: SceneAce[] = [];
  const trRx = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRx = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let m: RegExpExecArray | null;
  while ((m = trRx.exec(html)) !== null) {
    const cells: string[] = [];
    let c: RegExpExecArray | null;
    cellRx.lastIndex = 0;
    while ((c = cellRx.exec(m[1])) !== null) cells.push(stripTags(c[1]));
    if (cells.length < 2) continue;
    const played_on = cells.map((v) => parseISODate(v)).find((v): v is string => !!v) ?? null;
    if (!played_on) continue;
    const holeMatch = cells.join(" ").match(/\bhole\s*#?\s*(\d{1,2})\b/i);
    const hole = holeMatch ? Number(holeMatch[1]) : null;
    const textCells = cells.filter((v) => v && !/^\d+$/.test(v) && !parseISODate(v));
    textCells.sort((a, b) => b.length - a.length);
    aces.push({
      played_on,
      course_name: textCells[0]?.slice(0, 200) ?? null,
      hole,
      event_name: textCells[1]?.slice(0, 200) ?? null,
    });
  }
  return aces;
}

export type SceneAchievement = { title: string; date: string | null; description: string | null };

function parseAchievementsTab(html: string): SceneAchievement[] {
  const out: SceneAchievement[] = [];
  // Achievements are usually rendered as list items or cards with an <h3>/<strong> title and a date.
  const itemRx =
    /<(?:li|div)[^>]*class="[^"]*(?:achievement|award|badge)[^"]*"[^>]*>([\s\S]*?)<\/(?:li|div)>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRx.exec(html)) !== null) {
    const text = stripTags(m[1]);
    if (!text) continue;
    const dateMatch = text.match(/([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})/);
    out.push({
      title: text.slice(0, 120),
      date: dateMatch ? parseISODate(dateMatch[1]) : null,
      description: text.length > 120 ? text.slice(120, 400) : null,
    });
  }
  if (out.length === 0) {
    // Fallback: capture headline strings.
    const headings = html.match(/<h\d[^>]*>([^<]{4,120})<\/h\d>/gi) ?? [];
    for (const h of headings.slice(0, 40)) {
      const txt = stripTags(h);
      if (/^(About|Scores|Aces|Achievements|Series|Friends|Comments)$/i.test(txt)) continue;
      out.push({ title: txt.slice(0, 120), date: null, description: null });
    }
  }
  return out;
}

export type SceneSeries = { name: string; url: string | null; season: string | null };

function parseSeriesTab(html: string, url: string): SceneSeries[] {
  const out: SceneSeries[] = [];
  const anchorRx = /<a[^>]+href="([^"]+\/(?:series|leagues|tours)\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = anchorRx.exec(html)) !== null) {
    const link = absoluteUrl(m[1], url);
    if (seen.has(link)) continue;
    seen.add(link);
    const name = stripTags(m[2]).slice(0, 160);
    if (!name) continue;
    const seasonMatch = name.match(/\b(20\d{2})\b/);
    out.push({ name, url: link, season: seasonMatch ? seasonMatch[1] : null });
  }
  return out;
}

export type SceneFriend = { name: string; profile_url: string | null; scene_id: string | null };

function parseFriendsTab(html: string, url: string): SceneFriend[] {
  const out: SceneFriend[] = [];
  const anchorRx =
    /<a[^>]+href="([^"]+\/(?:players|player|profile)\/[^"?#]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = anchorRx.exec(html)) !== null) {
    const link = absoluteUrl(m[1], url);
    if (seen.has(link)) continue;
    seen.add(link);
    const name = stripTags(m[2]).replace(/\s+/g, " ").trim().slice(0, 100);
    if (!name || name.length < 2) continue;
    const id = externalIdFrom(link, "players");
    out.push({ name, profile_url: link, scene_id: id });
  }
  return out;
}

export type SceneComment = { posted_at: string | null; author: string | null; body: string };

function parseCommentsTab(html: string): SceneComment[] {
  const out: SceneComment[] = [];
  const commentRx =
    /<(?:li|div|article)[^>]*class="[^"]*comment[^"]*"[^>]*>([\s\S]*?)<\/(?:li|div|article)>/gi;
  let m: RegExpExecArray | null;
  while ((m = commentRx.exec(html)) !== null) {
    const chunk = m[1];
    const text = stripTags(chunk);
    if (!text) continue;
    const authorMatch = chunk.match(
      /<a[^>]+href="[^"]*\/(?:players|player|profile)\/[^"]+"[^>]*>([\s\S]*?)<\/a>/i,
    );
    const dateMatch = text.match(/([A-Za-z]+\s+\d{1,2},?\s+\d{4})/);
    out.push({
      author: authorMatch ? stripTags(authorMatch[1]).slice(0, 80) : null,
      posted_at: dateMatch ? parseISODate(dateMatch[1]) : null,
      body: text.slice(0, 800),
    });
  }
  return out;
}

/* --------------------------- club server fn --------------------------- */

export const importSceneClub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ url: z.string().url().max(500) }).parse(input))
  .handler(async ({ data, context }) => {
    if (!isSceneUrl(data.url, "clubs")) {
      throw new Error("Not a Disc Golf Scene club URL (expected discgolfscene.com/clubs/…)");
    }
    const html = await fetchHtml(data.url);
    const parsed = parseClub(html, data.url);
    if (!parsed) throw new Error("Could not read that club page.");

    const patch: {
      description?: string;
      location?: string;
      cover_url?: string;
      facebook_url?: string;
      instagram_url?: string;
      website_url?: string;
      external_source?: string;
      external_id?: string;
      last_synced_at: string;
    } = { last_synced_at: new Date().toISOString() };
    if (parsed.description) patch.description = parsed.description;
    if (parsed.location) patch.location = parsed.location;
    if (parsed.cover_url) patch.cover_url = parsed.cover_url;
    if (parsed.facebook_url) patch.facebook_url = parsed.facebook_url;
    if (parsed.instagram_url) patch.instagram_url = parsed.instagram_url;
    if (parsed.website_url) patch.website_url = parsed.website_url;

    let existing: { id: string; slug: string } | null = null;
    if (parsed.external_id) {
      const { data: hit } = await context.supabase
        .from("clubs")
        .select("id, slug")
        .eq("external_source", "disc_golf_scene")
        .eq("external_id", parsed.external_id)
        .maybeSingle();
      if (hit) existing = hit;
    }
    if (!existing) {
      const { data: hit } = await context.supabase
        .from("clubs")
        .select("id, slug")
        .ilike("name", parsed.name)
        .maybeSingle();
      if (hit) existing = hit;
    }

    if (existing) {
      if (parsed.external_id) {
        patch.external_source = "disc_golf_scene";
        patch.external_id = parsed.external_id;
      }
      const { error } = await context.supabase.from("clubs").update(patch).eq("id", existing.id);
      if (error) throw new Error(error.message);

      await context.supabase.from("data_ingest_jobs").insert({
        user_id: context.userId,
        kind: "club_scrape:disc_golf_scene",
        source_url: data.url,
        status: "completed",
        result: {
          name: parsed.name,
          external_id: parsed.external_id,
          merged_into: existing.id,
          fields_updated: Object.keys(patch).filter((k) => k !== "last_synced_at"),
        },
      });

      return { id: existing.id, slug: existing.slug, existed: true, updated: true, club: parsed };
    }

    const slug =
      parsed.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 60) +
      "-" +
      Math.random().toString(36).slice(2, 6);

    const { data: created, error } = await context.supabase
      .from("clubs")
      .insert({
        name: parsed.name,
        slug,
        description: parsed.description,
        location: parsed.location,
        cover_url: parsed.cover_url,
        facebook_url: parsed.facebook_url,
        instagram_url: parsed.instagram_url,
        website_url: parsed.website_url ?? parsed.scene_url,
        external_source: "disc_golf_scene",
        external_id: parsed.external_id,
        last_synced_at: new Date().toISOString(),
        owner_id: context.userId,
      })
      .select("id, slug")
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("data_ingest_jobs").insert({
      user_id: context.userId,
      kind: "club_scrape:disc_golf_scene",
      source_url: data.url,
      status: "completed",
      result: { name: parsed.name, external_id: parsed.external_id },
    });

    return { id: created.id, slug: created.slug, existed: false, club: parsed };
  });

/* --------------------------- player multi-tab server fn --------------------------- */

export const SCENE_TABS = [
  "about",
  "scores",
  "aces",
  "achievements",
  "series",
  "friends",
  "comments",
] as const;
export type SceneTab = (typeof SCENE_TABS)[number];

export type SceneImportSummary = {
  profile: SceneProfile | null;
  applied: boolean;
  perTab: Partial<
    Record<
      SceneTab,
      {
        url: string;
        parsed: number;
        stored: number;
        error?: string;
      }
    >
  >;
};

export const importSceneProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        // Back-compat: `url` alone still works and is treated as the About tab.
        url: z.string().url().max(500).optional(),
        urls: z
          .object({
            about: z.string().url().max(500).optional(),
            scores: z.string().url().max(500).optional(),
            aces: z.string().url().max(500).optional(),
            achievements: z.string().url().max(500).optional(),
            series: z.string().url().max(500).optional(),
            friends: z.string().url().max(500).optional(),
            comments: z.string().url().max(500).optional(),
          })
          .partial()
          .optional(),
        applyToMe: z.boolean().optional().default(false),
      })
      .refine((v) => v.url || (v.urls && Object.values(v.urls).some(Boolean)), {
        message: "Provide at least one Disc Golf Scene URL",
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<SceneImportSummary> => {
    // Normalize the URL map. If the legacy `url` was passed, treat it as About.
    const urls: Partial<Record<SceneTab, string>> = { ...(data.urls ?? {}) };
    if (data.url && !urls.about) urls.about = data.url;

    // Validate every URL is a DGS player URL.
    for (const [tab, u] of Object.entries(urls) as [SceneTab, string][]) {
      if (!isSceneUrl(u, "players")) {
        throw new Error(
          `Not a Disc Golf Scene player URL for "${tab}" (expected discgolfscene.com/players/… or /profile/…)`,
        );
      }
    }

    const summary: SceneImportSummary = { profile: null, applied: false, perTab: {} };

    /* -- ABOUT: patch the caller's profile + persist the URL map -- */
    if (urls.about) {
      try {
        const html = await fetchHtml(urls.about);
        const parsed = parseAbout(html, urls.about);
        summary.profile = parsed;

        if (parsed && data.applyToMe) {
          const { data: me } = await context.supabase
            .from("profiles")
            .select("display_name, location, home_state, pdga_number, bio, avatar_url")
            .eq("id", context.userId)
            .maybeSingle();
          const patch: Partial<{
            display_name: string;
            location: string;
            home_state: string;
            pdga_number: string;
            bio: string;
            avatar_url: string;
          }> = {};
          if (parsed.display_name && !me?.display_name) patch.display_name = parsed.display_name;
          if (parsed.city && !me?.location) patch.location = parsed.city;
          if (parsed.state && !me?.home_state) patch.home_state = parsed.state;
          if (parsed.pdga_number && !me?.pdga_number) patch.pdga_number = parsed.pdga_number;
          if (parsed.bio && !me?.bio) patch.bio = parsed.bio;
          if (parsed.avatar_url && !me?.avatar_url) patch.avatar_url = parsed.avatar_url;
          if (Object.keys(patch).length > 0) {
            const { error } = await context.supabase
              .from("profiles")
              .update(patch)
              .eq("id", context.userId);
            if (error) throw new Error(error.message);
            summary.applied = true;
          }
        }
        summary.perTab.about = {
          url: urls.about,
          parsed: parsed ? 1 : 0,
          stored: summary.applied ? 1 : 0,
        };
      } catch (e) {
        summary.perTab.about = {
          url: urls.about,
          parsed: 0,
          stored: 0,
          error: e instanceof Error ? e.message : "unknown",
        };
      }
    }

    /* -- SCORES: upsert into external_rounds where we can extract score+course+date -- */
    if (urls.scores) {
      try {
        const html = await fetchHtml(urls.scores);
        const rows = parseScoresTab(html, urls.scores);
        let stored = 0;
        for (const row of rows) {
          if (!row.played_on || !row.course_name || row.score === null) continue;
          // Dedup: (user, source, played_on, course_name, score)
          const { data: existing } = await context.supabase
            .from("external_rounds")
            .select("id")
            .eq("user_id", context.userId)
            .eq("source", "disc_golf_scene")
            .eq("played_on", row.played_on)
            .eq("course_name", row.course_name)
            .eq("score", row.score)
            .maybeSingle();
          if (existing) continue;
          const { error } = await context.supabase.from("external_rounds").insert({
            user_id: context.userId,
            source: "disc_golf_scene",
            trust_level: "self_reported",
            played_on: row.played_on,
            course_name: row.course_name,
            layout_name: row.layout_name,
            event_name: row.event_name,
            division: row.division,
            score: row.score,
            to_par: row.to_par,
            round_rating: row.round_rating,
            place: row.place,
            format: "singles",
            included: true,
            notes: row.round_label ? `DGS ${row.round_label}` : null,
          });
          if (!error) stored++;
        }
        summary.perTab.scores = { url: urls.scores, parsed: rows.length, stored };
      } catch (e) {
        summary.perTab.scores = {
          url: urls.scores,
          parsed: 0,
          stored: 0,
          error: e instanceof Error ? e.message : "unknown",
        };
      }
    }

    /* -- ACES / ACHIEVEMENTS / SERIES / FRIENDS / COMMENTS: capture summaries -- */
    const structuredTabs: Array<{
      tab: SceneTab;
      parse: (html: string, url: string) => unknown[];
    }> = [
      { tab: "aces", parse: (h) => parseAcesTab(h) },
      { tab: "achievements", parse: (h) => parseAchievementsTab(h) },
      { tab: "series", parse: (h, u) => parseSeriesTab(h, u) },
      { tab: "friends", parse: (h, u) => parseFriendsTab(h, u) },
      { tab: "comments", parse: (h) => parseCommentsTab(h) },
    ];

    for (const { tab, parse } of structuredTabs) {
      const u = urls[tab];
      if (!u) continue;
      try {
        const html = await fetchHtml(u);
        const items = parse(html, u);
        await context.supabase.from("data_ingest_jobs").insert({
          user_id: context.userId,
          kind: `profile_scrape:disc_golf_scene:${tab}`,
          source_url: u,
          status: "completed",
          result: { items } as never,
        });
        summary.perTab[tab] = { url: u, parsed: items.length, stored: items.length };
      } catch (e) {
        summary.perTab[tab] = {
          url: u,
          parsed: 0,
          stored: 0,
          error: e instanceof Error ? e.message : "unknown",
        };
      }
    }

    /* -- Persist the URL map on profiles so users don't have to re-enter -- */
    const nextMap: Record<string, string> = {};
    for (const [tab, u] of Object.entries(urls)) if (u) nextMap[tab] = u;
    if (Object.keys(nextMap).length > 0) {
      await context.supabase
        .from("profiles")
        .update({
          scene_profile_urls: nextMap,
          // Keep the singular column pointing at About for anything that still reads it.
          scene_profile_url: nextMap.about ?? nextMap.scores ?? Object.values(nextMap)[0],
        } as never)
        .eq("id", context.userId);
    }

    /* -- Roll-up job for the profile page widget -- */
    await context.supabase.from("data_ingest_jobs").insert({
      user_id: context.userId,
      kind: "profile_scrape:disc_golf_scene",
      source_url: urls.about ?? Object.values(urls)[0] ?? null,
      status: "completed",
      result: {
        applied: summary.applied,
        perTab: summary.perTab,
        display_name: summary.profile?.display_name ?? null,
      },
    });

    return summary;
  });
