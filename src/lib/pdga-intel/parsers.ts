/**
 * PDGA Source Intelligence — semantic parsers (Phase 5C).
 *
 * Pure, browser-safe, versioned. Every table is located by its semantic
 * header classes/labels, never fixed column positions. A table whose header
 * and row cells disagree is reported as malformed instead of being shifted.
 */
import { parseLayoutPools, parsePdgaDate, type PdgaLayoutPool } from "@/lib/dgd-v1/pdga-details";

export const PARSER_VERSIONS = {
  player: "pdga-player-parser-v2",
  history: "pdga-history-parser-v2",
  details: "pdga-details-parser-v2",
  event: "pdga-event-parser-v2",
} as const;

export type ParserIssue = { where: string; problem: string };

const decode = (s: string) =>
  s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&middot;/g, "·")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

const intOrNull = (s: string | null | undefined, lo = -100000, hi = 100000): number | null => {
  const t = (s ?? "").replace(/[,$\s]/g, "");
  if (!/^-?\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= lo && n <= hi ? n : null;
};

/* ------------------------------ Player summary ----------------------------- */

export type PlayerSummary = {
  pdga_number: string;
  name: string | null;
  classification: string | null;
  location: string | null;
  member_since: string | null;
  membership_status: string | null;
  official_status: string | null;
  current_rating: number | null;
  rating_effective_date: string | null;
  career_events: number | null;
  career_wins: number | null;
  career_earnings: number | null;
  /** Raw source text per field, kept beside the parsed values. */
  source_values: Record<string, string>;
};

export function parsePlayerSummary(html: string, pdgaNumber: string): PlayerSummary {
  const src: Record<string, string> = {};
  // PDGA leaves some <li> unclosed, so each item ends at the next <li> or </li>.
  for (const m of html.matchAll(
    /<li class="([a-z-]+)(?:\s[^"]*)?"[^>]*>([\s\S]*?)(?=<\/li>|<li[\s>])/gi,
  )) {
    const key = m[1];
    if (src[key]) continue;
    const text = decode(m[2]).replace(/^[^:]{1,40}:\s*/, "");
    src[key] = text;
  }
  const title = html.match(/<title>([^<|#]+?)\s*#\d+/i)?.[1]?.trim() ?? null;
  const cur = src["current-rating"] ?? "";
  const asOf = cur.match(/as of ([\d]{1,2}-[A-Za-z]{3}-\d{4})/i)?.[1];
  const earn = src["career-earnings"]?.match(/\$([\d,]+(?:\.\d+)?)/)?.[1];
  return {
    pdga_number: pdgaNumber,
    name: title,
    classification: src["classification"] ?? null,
    location: src["location"] ?? null,
    member_since: src["join-date"] ?? null,
    membership_status: src["membership-status"] ?? null,
    official_status: src["official"] ?? null,
    current_rating: intOrNull(cur.match(/^(\d{3,4})/)?.[1], 300, 1200),
    rating_effective_date: asOf ? parsePdgaDate(asOf) : null,
    career_events: intOrNull(src["career-events"]?.match(/^(\d+)/)?.[1], 0),
    career_wins: intOrNull(src["career-wins"]?.match(/^(\d+)/)?.[1], 0),
    career_earnings: earn ? Number(earn.replace(/,/g, "")) : null,
    source_values: src,
  };
}

/* ------------------------------ Rating history ----------------------------- */

export type RatingHistoryEntry = {
  effective_date: string;
  rating: number;
  rounds_used: number | null;
};

export function parseRatingHistory(html: string): {
  entries: RatingHistoryEntry[];
  issues: ParserIssue[];
} {
  const issues: ParserIssue[] = [];
  for (const t of html.match(/<table[\s\S]*?<\/table>/gi) ?? []) {
    const heads = [...t.matchAll(/<th(?:\s[^>]*)?>([\s\S]*?)<\/th>/gi)].map((m) =>
      decode(m[1]).toLowerCase(),
    );
    const iDate = heads.indexOf("effective date");
    const iRating = heads.indexOf("rating");
    const iRounds = heads.indexOf("rounds used");
    if (iDate < 0 || iRating < 0) continue;
    const entries: RatingHistoryEntry[] = [];
    const body = t.slice(t.search(/<tbody/i));
    for (const tr of body.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
      const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => decode(m[1]));
      if (tds.length !== heads.length) {
        issues.push({
          where: "rating-history",
          problem: `row has ${tds.length} cells, header has ${heads.length}`,
        });
        continue;
      }
      const date = parsePdgaDate(tds[iDate]);
      const rating = intOrNull(tds[iRating], 300, 1200);
      if (!date || rating == null) {
        issues.push({ where: "rating-history", problem: `unreadable row: ${tds.join(" | ")}` });
        continue;
      }
      entries.push({
        effective_date: date,
        rating,
        rounds_used: iRounds >= 0 ? intOrNull(tds[iRounds], 0) : null,
      });
    }
    entries.sort((a, b) => a.effective_date.localeCompare(b.effective_date));
    return { entries, issues };
  }
  issues.push({
    where: "rating-history",
    problem: "no table with Effective Date / Rating headers",
  });
  return { entries: [], issues };
}

/* -------------------------------- Event page ------------------------------- */

export type EventRoundLayout = {
  division: string;
  round_number: number;
  pools: PdgaLayoutPool[];
};

export type EventFieldRow = {
  division: string;
  pdga_number: string | null;
  name: string;
  player_rating: number | null;
  place: number | null;
  total: number | null;
  rounds: { round_number: number; score: number | null; round_rating: number | null }[];
};

export type EventPage = {
  event_id: string;
  name: string | null;
  date_text: string | null;
  start_date: string | null;
  location: string | null;
  status: string | null;
  results_official: boolean;
  layouts: EventRoundLayout[];
  field: EventFieldRow[];
  issues: ParserIssue[];
};

export function parseEventPage(html: string, eventId: string): EventPage {
  const issues: ParserIssue[] = [];
  const li = (cls: string) => {
    const m = html.match(new RegExp(`<li class="${cls}"[^>]*>([\\s\\S]*?)</li>`, "i"));
    return m ? decode(m[1]).replace(/^[^:]{1,40}:\s*/, "") : null;
  };
  const title = html.match(/<title>([^<|]+?)\s*\|/i)?.[1]?.trim() ?? null;
  const dateText = li("tournament-date");
  const status =
    html
      .match(/class="status">([^<]{1,80})</gi)
      ?.map((s) => decode(s.replace(/^class="status">/, "")))
      .find((s) => s.toLowerCase() !== "status") ?? null;
  const unofficial = /<h2>\s*Unofficial Results\s*<\/h2>/i.test(html);

  const layouts: EventRoundLayout[] = [];
  const field: EventFieldRow[] = [];
  const divRe = /<h3 class="division" id="([^"]+)"/gi;
  const starts = [...html.matchAll(divRe)].map((m) => ({ id: m[1], at: m.index ?? 0 }));
  starts.forEach((d, i) => {
    const seg = html.slice(d.at, starts[i + 1]?.at ?? html.length);
    // Layout tooltip per round for this division.
    // Each tooltip holds consecutive <div>pool</div> children, one per pool.
    for (const m of seg.matchAll(
      /<div id="layout-details-[^"]*-round-(\d+)">((?:\s*<div>[\s\S]*?<\/div>)+)/gi,
    )) {
      layouts.push({ division: d.id, round_number: Number(m[1]), pools: parseLayoutPools(m[2]) });
    }
    const table = seg.match(/<table class="results[\s\S]*?<\/table>/i)?.[0];
    if (!table) return;
    const heads = [
      ...(table.match(/<thead[\s\S]*?<\/thead>/i)?.[0] ?? "").matchAll(
        /<th(\s[^>]*)?>([\s\S]*?)<\/th>/gi,
      ),
    ].map((m) => ({
      cls: ((m[1] ?? "").match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/)[0],
      label: decode(m[2]),
    }));
    // Some divisions (unmembered players, juniors) publish no PDGA# column;
    // those rows are kept with pdga_number null.
    if (!heads.some((h) => h.cls === "name") || !heads.some((h) => h.cls === "round")) {
      issues.push({
        where: `event ${eventId} ${d.id}`,
        problem: "results header missing Name or round columns",
      });
      return;
    }
    // Round number for each "round" column comes from its RdN label.
    const roundNoAt = new Map<number, number>();
    heads.forEach((h, idx) => {
      if (h.cls === "round") {
        const n = Number(h.label.match(/(\d+)/)?.[1]);
        if (n) roundNoAt.set(idx, n);
      }
    });
    const body = table.slice(table.search(/<tbody/i));
    for (const tr of body.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
      const tds = [...tr.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)].map((m) => ({
        cls: ((m[1] ?? "").match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/)[0],
        text: decode(m[2]),
      }));
      if (tds.length !== heads.length) {
        issues.push({
          where: `event ${eventId} ${d.id}`,
          problem: `row has ${tds.length} cells, header has ${heads.length}`,
        });
        continue;
      }
      const row: EventFieldRow = {
        division: d.id,
        pdga_number: null,
        name: "",
        player_rating: null,
        place: null,
        total: null,
        rounds: [],
      };
      tds.forEach((c, idx) => {
        const h = heads[idx].cls;
        if (h === "place") row.place = intOrNull(c.text, 1, 10000);
        else if (h === "name") row.name = c.text;
        else if (h === "points") return;
        else if (h === "pdga-number") row.pdga_number = /^\d+$/.test(c.text) ? c.text : null;
        else if (h === "player-rating") row.player_rating = intOrNull(c.text, 300, 1200);
        else if (h === "total") row.total = intOrNull(c.text, 1, 5000);
        else if (h === "round") {
          const rn = roundNoAt.get(idx);
          if (!rn) return;
          const next = heads[idx + 1]?.cls === "round-rating" ? tds[idx + 1].text : "";
          row.rounds.push({
            round_number: rn,
            score: intOrNull(c.text, 1, 400),
            round_rating: intOrNull(next, 1, 1300),
          });
        }
      });
      if (row.name) field.push(row);
    }
  });
  if (starts.length === 0)
    issues.push({ where: `event ${eventId}`, problem: "no division results found" });
  return {
    event_id: eventId,
    name: title,
    date_text: dateText,
    start_date: dateText ? parsePdgaDate(dateText) : null,
    location: li("tournament-location"),
    status,
    results_official: !unofficial,
    layouts,
    field,
    issues,
  };
}
