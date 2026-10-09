/**
 * Parser for the public PDGA player "details" page
 * (https://www.pdga.com/player/{N}/details). Pure and browser-safe so it can
 * be unit tested. It reads the page's labelled cells (td.score, td.round-rating,
 * …) instead of guessing columns, which is what caused the shifted-column rows
 * seen in the older importer.
 */
import { normalizePdgaNumber } from "@/lib/pdga-number";

export type PdgaLayoutPool = { node_id: string; name: string; holes: number | null; par: number | null; distance_ft: number | null };

export type PdgaDetailRound = {
  pdga_event_id: string | null;
  event_name: string;
  tier: string | null;
  division: string | null;
  round_number: number | null;
  played_on: string; // YYYY-MM-DD (event start date; PDGA lists one date per event)
  score: number | null;
  round_rating: number | null;
  evaluated: boolean | null;
  included: boolean | null;
  pools: PdgaLayoutPool[];
  dedupe_key: string;
};

export type PdgaDetailPage = {
  pdga_number: string;
  name: string | null;
  current_rating: number | null;
  rounds: PdgaDetailRound[];
};

const strip = (h: string) =>
  h
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

const cell = (tr: string, cls: string) => {
  const m = tr.match(new RegExp(`<td[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)</td>`, "i"));
  return m ? m[1] : null;
};
const yesNo = (s: string | null) => {
  const t = s == null ? "" : strip(s).toLowerCase();
  return t === "yes" ? true : t === "no" ? false : null;
};
const int = (s: string | null, lo: number, hi: number) => {
  const t = s == null ? "" : strip(s);
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= lo && n <= hi ? n : null;
};

/** "26-Aug to 30-Aug-2026" or "05-Apr-2025" → start date ISO. */
export function parsePdgaDate(text: string, unix?: string | null): string | null {
  if (unix && /^\d{9,11}$/.test(unix)) return new Date(Number(unix) * 1000).toISOString().slice(0, 10);
  const months: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
  const m = text.match(/(\d{1,2})-([A-Za-z]{3})(?:-(\d{4}))?(?:\s+to\s+\d{1,2}-[A-Za-z]{3}-(\d{4}))?/);
  if (!m) return null;
  const year = m[3] ?? m[4];
  const mo = months[m[2].toLowerCase()];
  if (!year || !mo) return null;
  return `${year}-${mo}-${m[1].padStart(2, "0")}`;
}

/** Layout tooltip: "Pool A: <a href="/node/123">Course</a> - Layout; 18 holes; Par 65; 10,859 ft." */
export function parseLayoutPools(html: string): PdgaLayoutPool[] {
  const out: PdgaLayoutPool[] = [];
  const divs = html.match(/<div>[\s\S]*?<\/div>/gi) ?? [html];
  for (const d of divs) {
    const node = d.match(/href="\/node\/(\d+)"/);
    if (!node) continue;
    const t = strip(d).replace(/^Pool [A-Z]:\s*/i, "");
    const holes = t.match(/(\d+)\s+holes/i);
    const par = t.match(/Par\s+(\d+)/i);
    const ft = t.match(/([\d,]+)\s*ft/i);
    out.push({
      node_id: node[1],
      name: t.split(";")[0].trim().slice(0, 200),
      holes: holes ? Number(holes[1]) : null,
      par: par ? Number(par[1]) : null,
      distance_ft: ft ? Number(ft[1].replace(/,/g, "")) : null,
    });
  }
  return out;
}

export function parsePdgaDetailPage(html: string, pdgaNumber: string | number): PdgaDetailPage {
  const num = normalizePdgaNumber(pdgaNumber) ?? String(pdgaNumber);
  const title = html.match(/<title>([^<|#]+?)\s*#\d+/i);
  const plain = strip(html.slice(0, 200_000));
  const cur = plain.match(/Current Rating[:\s]+(\d{3,4})/i);
  const rating = cur ? Number(cur[1]) : null;

  const tooltips = new Map<string, PdgaLayoutPool[]>();
  for (const m of html.matchAll(/<div id="(layout-details-[^"]+)">([\s\S]*?)<\/div>\s*<\/div>/gi)) {
    tooltips.set(m[1], parseLayoutPools(m[2]));
  }

  const tableStart = html.search(/<table[^>]*id="player-results-details"/i);
  const body = tableStart >= 0 ? html.slice(tableStart, html.indexOf("</table>", tableStart) + 8) : "";
  const rounds: PdgaDetailRound[] = [];
  const seen = new Set<string>();
  for (const tr of body.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const t = cell(tr, "tournament");
    const d = tr.match(/<td[^>]*class="[^"]*\bdate\b[^"]*"([^>]*)>([\s\S]*?)<\/td>/i);
    if (!t || !d) continue;
    const unix = d[1].match(/data-text="(\d+)"/)?.[1] ?? null;
    const played = parsePdgaDate(strip(d[2]), unix);
    if (!played) continue;
    const ev = t.match(/\/tour\/event\/(\d+)/)?.[1] ?? null;
    const roundCell = tr.match(/<td[^>]*class="[^"]*\bround\b[^"]*"([^>]*)>([\s\S]*?)<\/td>/i);
    const tip = roundCell?.[1].match(/data-tooltip-content="#([^"]+)"/)?.[1] ?? null;
    const division = cell(tr, "division");
    const r: Omit<PdgaDetailRound, "dedupe_key"> = {
      pdga_event_id: ev,
      event_name: strip(t).slice(0, 200),
      tier: cell(tr, "tier") ? strip(cell(tr, "tier")!) || null : null,
      division: division ? strip(division) || null : null,
      round_number: roundCell ? int(roundCell[2], 1, 30) : null,
      played_on: played,
      score: int(cell(tr, "score"), 1, 400),
      round_rating: int(cell(tr, "round-rating"), 1, 1300),
      evaluated: yesNo(cell(tr, "evaluated")),
      included: yesNo(cell(tr, "included")),
      pools: tip ? (tooltips.get(tip) ?? []) : [],
    };
    // Physical-round identity. Rating is excluded: PDGA revises it later.
    const key = `${ev ?? r.event_name.toLowerCase()}|${played}|${r.division ?? ""}|${r.round_number ?? ""}|${r.score ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rounds.push({ ...r, dedupe_key: key });
  }
  return { pdga_number: num, name: title ? title[1].trim() : null, current_rating: rating && rating >= 300 && rating <= 1200 ? rating : null, rounds };
}

export type PdgaRoundIssue = "SCORE_MISSING" | "SCORE_LOOKS_LIKE_RATING" | "RATING_LOOKS_LIKE_SCORE" | "TO_PAR_IMPLAUSIBLE" | "SCORE_BELOW_HOLES" | "DATE_IMPLAUSIBLE";

/**
 * Field-relationship checks run before a row is stored or canonicalized.
 * Score, par, to-par and rating are each checked on their own and against
 * each other, so a shifted value can't pass as a real round.
 */
export function pdgaRoundIssues(r: Pick<PdgaDetailRound, "score" | "round_rating" | "played_on" | "pools">, today = new Date().toISOString().slice(0, 10)): PdgaRoundIssue[] {
  const out: PdgaRoundIssue[] = [];
  const holes = [...new Set(r.pools.map((p) => p.holes))];
  const pars = [...new Set(r.pools.map((p) => p.par))];
  const par = pars.length === 1 ? pars[0] : null;
  const hc = holes.length === 1 ? holes[0] : null;
  if (r.score == null) out.push("SCORE_MISSING");
  else {
    if (r.score >= 300) out.push("SCORE_LOOKS_LIKE_RATING");
    if (hc != null && r.score < hc) out.push("SCORE_BELOW_HOLES");
    if (par != null && (r.score - par < -30 || r.score - par > 60)) out.push("TO_PAR_IMPLAUSIBLE");
  }
  if (r.round_rating != null && r.round_rating < 300) out.push("RATING_LOOKS_LIKE_SCORE");
  if (r.played_on < "1980-01-01" || r.played_on > today.slice(0, 4) + "-12-31") out.push("DATE_IMPLAUSIBLE");
  return out;
}

/** Par/hole count only when every listed pool agrees; never defaulted. */
export function agreedPar(r: Pick<PdgaDetailRound, "pools">) {
  const pars = [...new Set(r.pools.map((p) => p.par))];
  const holes = [...new Set(r.pools.map((p) => p.holes))];
  return { par: pars.length === 1 ? pars[0] : null, holes: holes.length === 1 ? holes[0] : null };
}
