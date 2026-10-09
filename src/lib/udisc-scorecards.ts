import { validUdiscRating } from "./udisc-eligibility";
/**
 * Block-structured UDisc scorecard parser shared by the upload preview.
 * A "Par" row starts one scorecard; every row until the next "Par" row is a
 * participant (player or team) on that card.
 */
import Papa from "papaparse";
import { normalizeAlias } from "@/lib/player-aliases";
import { isTeamPlayerName } from "@/lib/udisc-team-name";

export type ScorecardClass =
  | "SINGLES_MULTI_PLAYER"
  | "SINGLES_SOLO"
  | "TEAM_OR_DOUBLES"
  | "UNKNOWN_FORMAT";

export type ScorecardParticipant = {
  name: string;
  total: number | null;
  plusMinus: string;
  rating: number | null;
  isTeam: boolean;
  isMe: boolean;
};

export type UdiscScorecard = {
  index: number;
  course: string;
  layout: string;
  date: string;
  par: number | null;
  participants: ScorecardParticipant[];
  classification: ScorecardClass;
  me: ScorecardParticipant | null;
};

const num = (v: string | undefined): number | null => {
  const t = (v ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export function parseUdiscScorecards(csvText: string, myNames: string[]): UdiscScorecard[] {
  const mine = new Set(myNames.map(normalizeAlias).filter(Boolean));
  const rows = Papa.parse<Record<string, string>>(csvText.replace(/^\uFEFF/, ""), {
    header: true,
    skipEmptyLines: true,
  }).data;
  const cards: UdiscScorecard[] = [];
  let cur: UdiscScorecard | null = null;
  for (const r of rows) {
    const name = (r.PlayerName ?? "").trim();
    if (name.toLowerCase() === "par") {
      cur = {
        index: cards.length,
        course: (r.CourseName ?? "").trim(),
        layout: (r.LayoutName ?? "").trim(),
        date: (r.StartDate ?? "").slice(0, 10),
        par: num(r.Total),
        participants: [],
        classification: "UNKNOWN_FORMAT",
        me: null,
      };
      cards.push(cur);
      continue;
    }
    if (!cur || !name) continue;
    const isTeam = isTeamPlayerName(name);
    cur.participants.push({
      name,
      total: num(r.Total),
      plusMinus: (r["+/-"] ?? "").trim(),
      rating: validUdiscRating(num(r.RoundRating)),
      isTeam,
      isMe: !isTeam && mine.has(normalizeAlias(name)),
    });
  }
  for (const c of cards) {
    c.me = c.participants.find((p) => p.isMe) ?? null;
    if (c.participants.some((p) => p.name.includes("+"))) c.classification = "TEAM_OR_DOUBLES";
    // "A and B" / "A & B" look like teams but can't be parsed safely — hold for review.
    else if (c.participants.some((p) => p.isTeam)) c.classification = "UNKNOWN_FORMAT";
    else if (c.me && c.participants.length >= 2) c.classification = "SINGLES_MULTI_PLAYER";
    else if (c.me) c.classification = "SINGLES_SOLO";
    else c.classification = "UNKNOWN_FORMAT";
  }
  return cards;
}

export function summarizeScorecards(cards: UdiscScorecard[]) {
  const by = (k: ScorecardClass) => cards.filter((c) => c.classification === k);
  const multi = by("SINGLES_MULTI_PLAYER");
  return {
    total: cards.length,
    multi: multi.length,
    solo: by("SINGLES_SOLO").length,
    team: by("TEAM_OR_DOUBLES").length,
    unknown: by("UNKNOWN_FORMAT").length,
    rated: multi.filter((c) => c.me?.rating != null).length,
    unrated: multi.filter((c) => c.me?.rating == null).length,
    unfinished: multi.filter((c) => !c.me?.total).length,
  };
}

/** Individual (non-team) player names in the file, most frequent first. */
export function individualNames(csvText: string): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const c of parseUdiscScorecards(csvText, []))
    for (const p of c.participants)
      if (!p.isTeam) counts.set(p.name, (counts.get(p.name) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}
