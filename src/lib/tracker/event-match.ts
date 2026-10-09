/**
 * How strongly a search result matches what the player typed. PDGA event
 * number/link is authoritative; names, dates and places are only evidence.
 */
export type EventMatch = "EXACT" | "HIGH_CONFIDENCE" | "POSSIBLE" | "AMBIGUOUS";

export type MatchCandidate = {
  pdgaEventId: string | null;
  name: string;
  startDate?: string | null;
  location?: string | null;
};

/** PDGA event number from a pasted id, tour link, or live-scoring link. */
export function pdgaRefFromQuery(q: string): string | null {
  const t = q.trim();
  const m =
    t.match(/pdga\.com\/(?:tour\/)?event\/(\d+)/i) ??
    t.match(/[?&]TournID=(\d+)/i) ??
    t.match(/^#?(\d{4,7})$/);
  return m ? m[1]! : null;
}

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const STOP = new Set(["the", "at", "of", "and", "disc", "golf", "dgc", "open"]);

function score(q: string, c: MatchCandidate): number {
  const nq = norm(q);
  const nn = norm(c.name);
  if (!nq) return 0;
  if (nn === nq) return 3;
  const hay = `${nn} ${norm(c.location ?? "")} ${c.startDate ?? ""}`;
  const tokens = nq.split(" ").filter((t) => t.length > 1 && !STOP.has(t));
  if (tokens.length === 0) return nn.includes(nq) ? 1 : 0;
  const hit = tokens.filter((t) => hay.includes(t)).length;
  if (hit === tokens.length) return tokens.length >= 2 ? 2 : 1;
  return hit > 0 ? 1 : 0;
}

/** Classify every candidate. Two or more equally strong top hits are AMBIGUOUS. */
export function classifyEventMatches(q: string, rows: MatchCandidate[]): EventMatch[] {
  const ref = pdgaRefFromQuery(q);
  if (ref) return rows.map((r) => (r.pdgaEventId === ref ? "EXACT" : "POSSIBLE"));
  const scores = rows.map((r) => score(q, r));
  const top = Math.max(0, ...scores);
  const topCount = scores.filter((s) => s === top).length;
  return scores.map((s) => {
    if (s >= 2 && s === top && topCount > 1) return "AMBIGUOUS";
    if (s >= 2) return "HIGH_CONFIDENCE";
    return "POSSIBLE";
  });
}

export const MATCH_LABEL: Record<EventMatch, string> = {
  EXACT: "Exact match",
  HIGH_CONFIDENCE: "Strong match",
  POSSIBLE: "Possible match",
  AMBIGUOUS: "Several similar events",
};
