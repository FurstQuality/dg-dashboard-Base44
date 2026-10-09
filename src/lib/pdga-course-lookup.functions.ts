/**
 * Look up past PDGA events at a course and extract per-round score↔rating
 * pairs from the public event pages. Used by the "How this course rates"
 * tool to fit an SSA + stroke value directly from real tournament data
 * played at the same venue.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; DGDashboard/1.0)",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`PDGA fetch failed (${res.status})`);
  return await res.text();
}

function cellText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export type PdgaLookupRow = {
  event_ref: string;
  event_name: string | null;
  event_date: string | null;
  round: number;
  division: string | null;
  score: number;
  round_rating: number;
};

export type PdgaRoundSummary = {
  event_ref: string;
  event_name: string | null;
  event_date: string | null;
  round: number;
  ssa: number | null;
  stroke_value: number | null;
  n: number;
  winning_score: number | null;
  winning_rating: number | null;
  median_score: number | null;
  median_rating: number | null;
};

export type PdgaEventLookup = {
  event_ref: string;
  event_name: string | null;
  event_date: string | null;
  rows_count: number;
  summaries: PdgaRoundSummary[];
  error?: string;
};

export function parseEvent(
  html: string,
  ref: string,
): {
  rows: PdgaLookupRow[];
  summaries: PdgaRoundSummary[];
  eventName: string | null;
  eventDate: string | null;
} {
  const eventName = cellText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "") || null;
  const eventDate =
    html.match(/\b(\d{1,2}-[A-Za-z]{3}-\d{4})\b/)?.[1] ??
    html.match(/>([A-Za-z]+ \d{1,2},\s*\d{4})</)?.[1] ??
    null;

  const rows: PdgaLookupRow[] = [];
  type Bucket = { scores: number[]; ratings: number[] };
  const buckets = new Map<number, Bucket>();

  const tableRe =
    /<table class="results sticky-enabled"[^>]*id="tournament-stats-\d+">([\s\S]*?)<\/table>/g;
  let m: RegExpExecArray | null;
  let cursor = 0;
  while ((m = tableRe.exec(html))) {
    const before = html.slice(cursor, m.index);
    cursor = m.index + m[0].length;
    const regMatches = [...before.matchAll(/<h3[^>]*class="division"[^>]*id="([A-Z0-9]+)"/g)];
    const liveMatches = [...before.matchAll(/\/live\/event\/[^/]+\/([A-Z0-9]+)"/g)];
    const division =
      (regMatches.length ? regMatches[regMatches.length - 1][1] : null) ??
      (liveMatches.length ? liveMatches[liveMatches.length - 1][1] : null);

    const body = m[1];
    const headMatch = body.match(/<tr[^>]*>([\s\S]*?)<\/tr>/);
    if (!headMatch) continue;
    const headers = [...headMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((h) =>
      cellText(h[1]),
    );
    const lower = headers.map((h) => h.toLowerCase());

    type Pair = { round: number; scoreIdx: number; ratingIdx: number | null };
    const pairs: Pair[] = [];
    for (let i = 0; i < headers.length; i++) {
      const h = lower[i];
      const rd = h.match(/^rd\s*(\d+)$|^round\s*(\d+)$/);
      if (!rd) continue;
      const round = Number(rd[1] ?? rd[2]);
      let ratingIdx: number | null = null;
      for (let j = i + 1; j < Math.min(i + 3, headers.length); j++) {
        const lj = lower[j];
        if (/^rtg\s*\d+$/.test(lj) || lj === `rtg${round}` || lj.includes("round rating")) {
          ratingIdx = j;
          break;
        }
      }
      pairs.push({ round, scoreIdx: i, ratingIdx });
    }
    if (!pairs.length) continue;

    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let r: RegExpExecArray | null;
    let first = true;
    while ((r = rowRe.exec(body))) {
      if (first) {
        first = false;
        continue;
      }
      const cells = [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) =>
        cellText(c[1]),
      );
      if (!cells.length) continue;

      for (const p of pairs) {
        const scoreRaw = (cells[p.scoreIdx] ?? "").replace(/[^0-9.\-]/g, "");
        const ratingRaw =
          p.ratingIdx != null ? (cells[p.ratingIdx] ?? "").replace(/[^0-9.\-]/g, "") : "";
        const score = Number(scoreRaw);
        const rating = Number(ratingRaw);
        if (!Number.isFinite(score) || score <= 0 || score > 200) continue;
        if (!Number.isFinite(rating) || rating < 400 || rating > 1200) continue;

        rows.push({
          event_ref: ref,
          event_name: eventName,
          event_date: eventDate,
          round: p.round,
          division,
          score,
          round_rating: rating,
        });
        const b = buckets.get(p.round) ?? { scores: [], ratings: [] };
        b.scores.push(score);
        b.ratings.push(rating);
        buckets.set(p.round, b);
      }
    }
  }

  const summaries: PdgaRoundSummary[] = [];
  const median = (a: number[]) => {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y);
    return s[Math.floor(s.length / 2)];
  };
  for (const [round, b] of buckets) {
    const n = b.scores.length;
    if (!n) continue;
    const meanX = b.scores.reduce((s, x) => s + x, 0) / n;
    const meanY = b.ratings.reduce((s, x) => s + x, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      const dx = b.scores[i] - meanX;
      num += dx * (b.ratings[i] - meanY);
      den += dx * dx;
    }
    let sv: number | null = null;
    let ssa: number | null = null;
    if (den > 0) {
      const slope = num / den;
      const svRaw = -slope;
      if (svRaw > 3 && svRaw < 20) {
        sv = Math.round(svRaw * 100) / 100;
        const intercept = meanY - slope * meanX;
        const ssaRaw = (intercept - 1000) / svRaw;
        if (ssaRaw > 20 && ssaRaw < 130) ssa = Math.round(ssaRaw * 10) / 10;
      }
    }
    const winIdx = b.scores.indexOf(Math.min(...b.scores));
    summaries.push({
      event_ref: ref,
      event_name: eventName,
      event_date: eventDate,
      round,
      ssa,
      stroke_value: sv,
      n,
      winning_score: b.scores[winIdx] ?? null,
      winning_rating: b.ratings[winIdx] ?? null,
      median_score: median(b.scores),
      median_rating: median(b.ratings),
    });
  }
  summaries.sort((a, b) => a.round - b.round);
  return { rows, summaries, eventName, eventDate };
}

function extractRef(input: string): string {
  const trimmed = input.trim();
  // Accepts /tour/event/<ref>, /live/event/<ref>/..., or a bare ref.
  const fromUrl = trimmed.match(/pdga\.com\/(?:tour|live)\/event\/([A-Za-z0-9-]+)/i);
  if (fromUrl) return fromUrl[1];
  return trimmed.replace(/[^A-Za-z0-9-]/g, "");
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DGDashboard/1.0)",
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

type LiveRound = { roundId: number; division: string; round: number };
type LiveRoundResult = {
  roundId: number;
  score: number;
  ratingOfficial: number | null;
  ratingUnofficial: number | null;
};
type LiveDivisionResults = {
  tournament?: { tournamentName?: string | null };
  results?: Array<{
    liveResult?: { division?: string | null; liveRoundResults?: LiveRoundResult[] };
  }>;
};

/**
 * Pull score↔rating pairs from the PDGA Live JSON API. This is the same data
 * the /live/event/<ref>/leaders?round=N page uses, so it works for events
 * whose /tour/event/<ref> page has not been finalized yet.
 */
async function fetchLiveApi(ref: string): Promise<{
  rows: PdgaLookupRow[];
  summaries: PdgaRoundSummary[];
  eventName: string | null;
} | null> {
  const rounds = await fetchJson<LiveRound[]>(
    `https://www.pdga.com/api/v1/live-tournaments/${ref}/live-rounds?include=LiveRoundCut`,
  );
  if (!rounds || !Array.isArray(rounds) || !rounds.length) return null;

  const divisions = [...new Set(rounds.map((r) => r.division).filter(Boolean))];
  const roundByRoundId = new Map<number, { division: string; round: number }>();
  for (const r of rounds) roundByRoundId.set(r.roundId, { division: r.division, round: r.round });

  const rows: PdgaLookupRow[] = [];
  type Bucket = { scores: number[]; ratings: number[] };
  const buckets = new Map<number, Bucket>();
  let eventName: string | null = null;

  for (const div of divisions) {
    const payload = await fetchJson<LiveDivisionResults>(
      `https://www.pdga.com/api/v1/feat/live-tournaments/${ref}/event-division-results/${encodeURIComponent(div)}`,
    );
    if (!payload) continue;
    if (!eventName && payload.tournament?.tournamentName)
      eventName = payload.tournament.tournamentName;

    for (const result of payload.results ?? []) {
      const rr = result.liveResult?.liveRoundResults ?? [];
      for (const lr of rr) {
        const meta = roundByRoundId.get(lr.roundId);
        if (!meta) continue;
        const rating = lr.ratingOfficial ?? lr.ratingUnofficial;
        if (rating == null || !Number.isFinite(rating) || rating < 400 || rating > 1200) continue;
        if (!Number.isFinite(lr.score) || lr.score <= 0 || lr.score > 200) continue;
        rows.push({
          event_ref: ref,
          event_name: eventName,
          event_date: null,
          round: meta.round,
          division: meta.division,
          score: lr.score,
          round_rating: rating,
        });
        const b = buckets.get(meta.round) ?? { scores: [], ratings: [] };
        b.scores.push(lr.score);
        b.ratings.push(rating);
        buckets.set(meta.round, b);
      }
    }
  }

  if (!rows.length) return null;

  const median = (a: number[]) => {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y);
    return s[Math.floor(s.length / 2)];
  };
  const summaries: PdgaRoundSummary[] = [];
  for (const [round, b] of buckets) {
    const n = b.scores.length;
    if (!n) continue;
    const meanX = b.scores.reduce((s, x) => s + x, 0) / n;
    const meanY = b.ratings.reduce((s, x) => s + x, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      const dx = b.scores[i] - meanX;
      num += dx * (b.ratings[i] - meanY);
      den += dx * dx;
    }
    let sv: number | null = null;
    let ssa: number | null = null;
    if (den > 0) {
      const slope = num / den;
      const svRaw = -slope;
      if (svRaw > 3 && svRaw < 20) {
        sv = Math.round(svRaw * 100) / 100;
        const intercept = meanY - slope * meanX;
        const ssaRaw = (intercept - 1000) / svRaw;
        if (ssaRaw > 20 && ssaRaw < 130) ssa = Math.round(ssaRaw * 10) / 10;
      }
    }
    const winIdx = b.scores.indexOf(Math.min(...b.scores));
    summaries.push({
      event_ref: ref,
      event_name: eventName,
      event_date: null,
      round,
      ssa,
      stroke_value: sv,
      n,
      winning_score: b.scores[winIdx] ?? null,
      winning_rating: b.ratings[winIdx] ?? null,
      median_score: median(b.scores),
      median_rating: median(b.ratings),
    });
  }
  summaries.sort((a, b) => a.round - b.round);
  return { rows, summaries, eventName };
}

const Input = z.object({
  eventRefs: z.array(z.string().min(1)).min(1).max(15),
});

export const lookupPastPdgaEventRounds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => Input.parse(raw))
  .handler(async ({ data }) => {
    const events: PdgaEventLookup[] = [];
    const rows: PdgaLookupRow[] = [];

    for (const raw of data.eventRefs) {
      const ref = extractRef(raw);
      if (!ref) continue;
      try {
        const live = await fetchLiveApi(ref);
        if (live && live.rows.length) {
          rows.push(...live.rows);
          events.push({
            event_ref: ref,
            event_name: live.eventName,
            event_date: null,
            rows_count: live.rows.length,
            summaries: live.summaries,
          });
          continue;
        }
        const html = await fetchHtml(`https://www.pdga.com/tour/event/${ref}`);
        const parsed = parseEvent(html, ref);
        rows.push(...parsed.rows);
        events.push({
          event_ref: ref,
          event_name: parsed.eventName,
          event_date: parsed.eventDate,
          rows_count: parsed.rows.length,
          summaries: parsed.summaries,
        });
      } catch (e) {
        events.push({
          event_ref: ref,
          event_name: null,
          event_date: null,
          rows_count: 0,
          summaries: [],
          error: e instanceof Error ? e.message : "PDGA fetch failed",
        });
      }
    }

    return { events, rows };
  });

/**
 * Search the PDGA course directory for the target course, then analyze every
 * event PDGA officially lists as played at that exact course. Each candidate
 * event is verified by re-fetching its event page and confirming the same
 * course slug/title is referenced before any rounds are ingested. Events that
 * do not verify are returned in `rejected` so the UI can explain why nothing
 * was pulled from them.
 */
export type PdgaSearchHit = {
  event_ref: string;
  event_name: string | null;
  event_date: string | null;
};

export type PdgaMatchedCourse = {
  slug: string;
  name: string;
  url: string;
};

export type PdgaRejectedEvent = {
  event_ref: string;
  event_name: string | null;
  reason: string;
};

const SearchInput = z.object({
  courseName: z.string().min(2),
  limit: z.number().int().min(1).max(15).default(8),
});

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function findCourse(courseName: string): Promise<PdgaMatchedCourse | null> {
  const q = encodeURIComponent(courseName);
  const html = await fetchHtml(`https://www.pdga.com/course-directory/course?title=${q}`);
  const linkRe = /href="\/course-directory\/course\/([^"#?]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const norm = normalize(courseName);
  let best: PdgaMatchedCourse | null = null;
  let bestScore = -1;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html))) {
    const slug = m[1];
    const name = cellText(m[2]) || slug.replace(/-/g, " ");
    const nn = normalize(name);
    let score = 0;
    if (nn === norm) score = 100;
    else if (nn.includes(norm)) score = 60;
    else if (norm.includes(nn)) score = 40;
    else {
      const nameToks = new Set(
        name
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter(Boolean),
      );
      const qToks = courseName
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
      const hit = qToks.filter((t) => nameToks.has(t)).length;
      score = hit * 10;
    }
    if (score > bestScore) {
      bestScore = score;
      best = { slug, name, url: `https://www.pdga.com/course-directory/course/${slug}` };
    }
  }
  return bestScore > 0 ? best : null;
}

export function extractEventsFromCoursePage(html: string): PdgaSearchHit[] {
  const seen = new Set<string>();
  const hits: PdgaSearchHit[] = [];
  const linkRe = /<a href="\/tour\/event\/(\d+)"[^>]*>([^<]+)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html))) {
    const ref = m[1];
    if (seen.has(ref)) continue;
    seen.add(ref);
    const name = cellText(m[2]) || null;
    const after = html.slice(m.index, m.index + 800);
    const date = after.match(/\b(\d{1,2}-[A-Za-z]{3}-\d{4})\b/)?.[1] ?? null;
    hits.push({ event_ref: ref, event_name: name, event_date: date });
  }
  return hits;
}

function eventMentionsCourse(html: string, course: PdgaMatchedCourse): boolean {
  if (html.includes(`/course-directory/course/${course.slug}`)) return true;
  const bodyNorm = normalize(html.replace(/<[^>]+>/g, " "));
  return bodyNorm.includes(normalize(course.name));
}

export const searchPastPdgaEventsByCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => SearchInput.parse(raw))
  .handler(async ({ data }) => {
    let course: PdgaMatchedCourse | null = null;
    try {
      course = await findCourse(data.courseName);
    } catch (e) {
      return {
        hits: [] as PdgaSearchHit[],
        events: [] as PdgaEventLookup[],
        rows: [] as PdgaLookupRow[],
        rejected: [] as PdgaRejectedEvent[],
        matchedCourse: null as PdgaMatchedCourse | null,
        error: e instanceof Error ? e.message : "PDGA course search failed",
      };
    }
    if (!course) {
      return {
        hits: [] as PdgaSearchHit[],
        events: [] as PdgaEventLookup[],
        rows: [] as PdgaLookupRow[],
        rejected: [] as PdgaRejectedEvent[],
        matchedCourse: null,
        error: `No PDGA course directory match for "${data.courseName}".`,
      };
    }

    let hits: PdgaSearchHit[] = [];
    try {
      const html = await fetchHtml(course.url);
      hits = extractEventsFromCoursePage(html).slice(0, data.limit);
    } catch (e) {
      return {
        hits: [],
        events: [] as PdgaEventLookup[],
        rows: [] as PdgaLookupRow[],
        rejected: [] as PdgaRejectedEvent[],
        matchedCourse: course,
        error: e instanceof Error ? e.message : "PDGA course page fetch failed",
      };
    }

    if (!hits.length) {
      return {
        hits,
        events: [] as PdgaEventLookup[],
        rows: [] as PdgaLookupRow[],
        rejected: [] as PdgaRejectedEvent[],
        matchedCourse: course,
      };
    }

    const events: PdgaEventLookup[] = [];
    const rows: PdgaLookupRow[] = [];
    const rejected: PdgaRejectedEvent[] = [];

    for (const hit of hits) {
      try {
        const html = await fetchHtml(`https://www.pdga.com/tour/event/${hit.event_ref}`);
        if (!eventMentionsCourse(html, course)) {
          rejected.push({
            event_ref: hit.event_ref,
            event_name: hit.event_name,
            reason: `Event page does not reference "${course.name}".`,
          });
          continue;
        }
        const parsed = parseEvent(html, hit.event_ref);
        if (parsed.rows.length) {
          rows.push(...parsed.rows);
          events.push({
            event_ref: hit.event_ref,
            event_name: parsed.eventName ?? hit.event_name,
            event_date: parsed.eventDate ?? hit.event_date,
            rows_count: parsed.rows.length,
            summaries: parsed.summaries,
          });
          continue;
        }
        const live = await fetchLiveApi(hit.event_ref);
        if (live && live.rows.length) {
          rows.push(...live.rows);
          events.push({
            event_ref: hit.event_ref,
            event_name: live.eventName ?? hit.event_name,
            event_date: hit.event_date,
            rows_count: live.rows.length,
            summaries: live.summaries,
          });
        } else {
          rejected.push({
            event_ref: hit.event_ref,
            event_name: hit.event_name,
            reason: "No rated rounds available yet on PDGA.",
          });
        }
      } catch (e) {
        rejected.push({
          event_ref: hit.event_ref,
          event_name: hit.event_name,
          reason: e instanceof Error ? e.message : "PDGA fetch failed",
        });
      }
    }
    return { hits, events, rows, rejected, matchedCourse: course };
  });
