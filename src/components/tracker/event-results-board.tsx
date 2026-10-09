import { formatToPar as fmtToPar } from "@/lib/score-display";
import { Link } from "@tanstack/react-router";
import { Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { crewSwatchStyle } from "@/lib/tracker-colors";
import type { TrackerLiveScoreRow } from "@/lib/tracker.functions";

type Member = {
  id: string;
  pdga_number: string;
  display_name: string | null;
  default_division: string | null;
  color: string | null;
  is_you?: boolean;
};

export interface EventResultsBoardProps {
  groupId: string;
  eventName?: string;
  members: Member[];
  scores: TrackerLiveScoreRow[];
  ratings?: Record<string, number | null>;
  title?: string;
  href?: { to: string; params?: Record<string, string> };
  emptyLabel?: string;
  compact?: boolean;
}

type Row = {
  member: Member;
  division: string;
  total: number | null;
  toPar: number | null;
  place: number | null;
  perRound: Map<number, { toPar: number | null; total: number | null; place: number | null }>;
  rating: number | null;
};


function toParTone(n: number | null): string {
  if (n == null || n === 0) return "text-muted-foreground";
  return n < 0 ? "text-emerald-500" : "text-rose-500";
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Full results board for a tracker event. Mirrors the format shown on PDGA
 * live standings — grouped by division, with columns for overall rank/par,
 * per-round rank/par, and each player's current rating.
 */
export function EventResultsBoard({
  groupId,
  eventName,
  members,
  scores,
  ratings,
  title = "Results",
  href,
  emptyLabel = "No results yet. Sync from PDGA or post scores below.",
  compact = false,
}: EventResultsBoardProps) {
  const memberByNum = new Map(members.map((m) => [m.pdga_number, m] as const));
  const memberById = new Map(members.map((m) => [m.id, m] as const));

  // Collect the set of round numbers that actually have posted scores.
  const roundSet = new Set<number>();
  for (const s of scores) if (s.round_number != null) roundSet.add(s.round_number);
  const roundNums = Array.from(roundSet).sort((a, b) => a - b);

  // Build a row per member with per-round breakdown + running totals.
  const rowByMember = new Map<string, Row>();
  for (const s of scores) {
    const m =
      (s.member_id ? memberById.get(s.member_id) : undefined) ?? memberByNum.get(s.pdga_number);
    if (!m) continue;
    const cur =
      rowByMember.get(m.id) ??
      ({
        member: m,
        division: (s.division ?? m.default_division ?? "—") as string,
        total: null,
        toPar: null,
        place: null,
        perRound: new Map(),
        rating: ratings?.[m.pdga_number] ?? null,
      } satisfies Row);
    cur.division = cur.division === "—" ? (s.division ?? m.default_division ?? "—") : cur.division;
    // Cumulative running total prefers `total`/`to_par` when present.
    if (s.total != null) cur.total = s.total;
    if (s.to_par != null) cur.toPar = s.to_par;
    if (s.running_place != null) cur.place = s.running_place;
    else if (s.place != null && cur.place == null) cur.place = s.place;
    if (s.round_number != null) {
      cur.perRound.set(s.round_number, {
        toPar: s.round_to_par ?? s.to_par ?? null,
        total: s.round_score ?? s.total ?? null,
        place: null, // computed below across division
      });
    }
    rowByMember.set(m.id, cur);
  }

  // Group by division.
  const byDivision = new Map<string, Row[]>();
  for (const row of rowByMember.values()) {
    const arr = byDivision.get(row.division) ?? [];
    arr.push(row);
    byDivision.set(row.division, arr);
  }

  // Sort within division by overall to-par (or total), then compute per-round
  // ranks so the "Rank Rd1" column reflects that round's standing.
  for (const [, rows] of byDivision) {
    rows.sort((a, b) => {
      const at = a.toPar ?? a.total ?? Number.POSITIVE_INFINITY;
      const bt = b.toPar ?? b.total ?? Number.POSITIVE_INFINITY;
      return at - bt;
    });
    for (const rn of roundNums) {
      const rankable = rows
        .map((r) => ({
          id: r.member.id,
          toPar: r.perRound.get(rn)?.toPar ?? r.perRound.get(rn)?.total ?? null,
        }))
        .filter((r) => r.toPar != null) as { id: string; toPar: number }[];
      rankable.sort((a, b) => a.toPar - b.toPar);
      let place = 0;
      let lastVal: number | null = null;
      let tieStart = 0;
      rankable.forEach((r, i) => {
        if (lastVal === null || r.toPar !== lastVal) {
          place = i + 1;
          tieStart = place;
          lastVal = r.toPar;
        } else {
          place = tieStart;
        }
        const row = rows.find((x) => x.member.id === r.id)!;
        const pr = row.perRound.get(rn);
        if (pr) pr.place = place;
      });
    }
    // Assign overall place with tie handling if not already provided.
    let place = 0;
    let last: number | null = null;
    let tieStart = 0;
    rows.forEach((r, i) => {
      const key = r.toPar ?? r.total ?? null;
      if (key == null) return;
      if (last === null || key !== last) {
        place = i + 1;
        tieStart = place;
        last = key;
      } else {
        place = tieStart;
      }
      if (r.place == null) r.place = place;
    });
  }

  const divisions = Array.from(byDivision.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const totalPlayers = rowByMember.size;

  const showPerRound = roundNums.length > 0;
  const gridCols = `36px minmax(0,1fr) 60px 60px ${roundNums.map(() => "72px 60px").join(" ")} 64px`;

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-4 w-4 text-primary" />
            {title}
            {eventName && (
              <span className="ml-1 truncate text-sm font-normal text-muted-foreground">
                · {eventName}
              </span>
            )}
          </CardTitle>
          {href && (
            <Link
              to={href.to as never}
              params={(href.params ?? {}) as never}
              className="text-xs font-medium text-primary hover:underline"
            >
              Open →
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {totalPlayers === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          divisions.map(([div, rows]) => (
            <div key={div} className="overflow-hidden rounded-lg border border-border/70 bg-card">
              <div className="flex items-center justify-between gap-2 bg-muted/40 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-foreground/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-background">
                    {div}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {rows.length} {rows.length === 1 ? "player" : "players"}
                  </span>
                </div>
              </div>
              {/* Mobile: stacked rows — the wide rank/par/round grid is unreadable under 640px. */}
              <ul className="divide-y divide-border/50 sm:hidden">
                {rows.map((r, i) => {
                  const name = r.member.display_name || `#${r.member.pdga_number}`;
                  return (
                    <li key={`m-${r.member.id}`} className="px-3 py-2.5">
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className={`w-6 shrink-0 text-center text-xs font-bold tabular-nums ${i === 0 ? "text-amber-500" : "text-muted-foreground"}`}
                          >
                            {r.place ?? i + 1}
                          </span>
                          <span
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold text-black"
                            style={crewSwatchStyle(r.member.color)}
                          >
                            {initialsOf(name)}
                          </span>
                          <div className="min-w-0">
                            <Link
                              to="/tracker/$groupId/player/$memberId"
                              params={{ groupId, memberId: r.member.id }}
                              className="block truncate text-sm font-medium hover:underline"
                            >
                              {name}
                            </Link>
                            <div className="truncate text-[11px] text-muted-foreground">
                              #{r.member.pdga_number}
                              {r.rating != null && ` · ${r.rating} rated`}
                            </div>
                          </div>
                        </div>
                        <div
                          className={`shrink-0 text-right text-base font-bold tabular-nums ${toParTone(r.toPar)}`}
                        >
                          {fmtToPar(r.toPar)}
                        </div>
                      </div>
                      {showPerRound && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5 pl-8">
                          {roundNums.map((n) => {
                            const pr = r.perRound.get(n);
                            if (!pr || (pr.toPar == null && pr.total == null)) return null;
                            return (
                              <span
                                key={`mr-${r.member.id}-${n}`}
                                className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5 text-[11px]"
                              >
                                <span className="text-muted-foreground">Rd{n}</span>
                                <span
                                  className={`font-semibold tabular-nums ${toParTone(pr.toPar)}`}
                                >
                                  {fmtToPar(pr.toPar)}
                                </span>
                                {pr.place != null && (
                                  <span className="text-muted-foreground tabular-nums">
                                    #{pr.place}
                                  </span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="hidden overflow-x-auto sm:block">
                <div className="min-w-max">
                  <div
                    className="grid items-center gap-x-2 border-b border-border/70 bg-muted/20 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                    style={{ gridTemplateColumns: gridCols }}
                  >
                    <span>#</span>
                    <span>Player</span>
                    <span className="text-right">Rank</span>
                    <span className="text-right">Par</span>
                    {roundNums.map((n) => (
                      <span key={`h-${n}`} className="contents">
                        <span className="text-right">Rank Rd{n}</span>
                        <span className="text-right">Par</span>
                      </span>
                    ))}
                    <span className="text-right">Rating</span>
                  </div>
                  {rows.map((r, i) => {
                    const name = r.member.display_name || `#${r.member.pdga_number}`;
                    const initials = initialsOf(name);
                    const isLeader = i === 0;
                    return (
                      <div
                        key={r.member.id}
                        className={`grid items-center gap-x-2 border-b border-border/40 px-3 ${compact ? "py-1.5" : "py-2"} text-sm`}
                        style={{ gridTemplateColumns: gridCols }}
                      >
                        <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                          {r.place ?? i + 1}
                        </span>
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold text-black"
                            style={crewSwatchStyle(r.member.color)}
                          >
                            {initials}
                          </span>
                          <div className="min-w-0">
                            <Link
                              to="/tracker/$groupId/player/$memberId"
                              params={{ groupId, memberId: r.member.id }}
                              className="block truncate font-medium hover:underline"
                            >
                              {name}
                            </Link>
                            <div className="text-[10px] text-muted-foreground">
                              #{r.member.pdga_number}
                              {r.rating != null && ` · ${r.rating}`}
                              {r.member.is_you && " · you"}
                            </div>
                          </div>
                        </div>
                        <span className="text-right tabular-nums">
                          {r.place != null ? (
                            <span
                              className={`inline-flex min-w-[28px] justify-center rounded px-1.5 py-0.5 text-xs font-bold ${
                                isLeader ? "bg-amber-400 text-black" : "text-foreground"
                              }`}
                            >
                              {r.place}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </span>
                        <span
                          className={`text-right tabular-nums font-semibold ${toParTone(r.toPar)}`}
                        >
                          {fmtToPar(r.toPar)}
                        </span>
                        {showPerRound &&
                          roundNums.map((n) => {
                            const pr = r.perRound.get(n);
                            const placeStr =
                              pr?.place == null
                                ? "—"
                                : `${pr.place > 1 && rows.filter((rr) => rr.perRound.get(n)?.place === pr.place).length > 1 ? "T" : ""}${pr.place}`;
                            return (
                              <span key={`c-${r.member.id}-${n}`} className="contents">
                                <span className="text-right text-xs tabular-nums text-muted-foreground">
                                  {placeStr}
                                </span>
                                <span
                                  className={`text-right text-xs tabular-nums ${toParTone(pr?.toPar ?? null)}`}
                                >
                                  {fmtToPar(pr?.toPar ?? null)}
                                </span>
                              </span>
                            );
                          })}
                        <span className="text-right text-xs tabular-nums text-muted-foreground">
                          {r.rating ?? "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
