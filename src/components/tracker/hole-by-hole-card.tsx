import { useMemo, useState } from "react";
import { Grid3x3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { crewSwatchStyle } from "@/lib/tracker-colors";
import type { TrackerLiveScoreRow } from "@/lib/tracker.functions";

type Member = {
  id: string;
  pdga_number: string;
  display_name: string | null;
  color: string | null;
};

export interface HoleByHoleCardProps {
  members: Member[];
  scores: TrackerLiveScoreRow[];
  /** Optional heading override. */
  title?: string;
  /** Render nothing (instead of an empty-state card) when no hole data exists. */
  hideWhenEmpty?: boolean;
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

function sum(list: number[]): number {
  return list.reduce((a, b) => a + b, 0);
}

/**
 * Hole-by-hole scorecard for a tracked event. PDGA live scoring returns a
 * `hole_scores` array per player-round; this renders it as a crew scorecard
 * with F9/B9/total splits and the best score on each hole highlighted.
 * Scrolls horizontally on phones instead of squeezing 18 columns into 375px.
 */
export function HoleByHoleCard({
  members,
  scores,
  title = "Hole-by-hole",
  hideWhenEmpty = false,
}: HoleByHoleCardProps) {
  const memberByNum = useMemo(
    () => new Map(members.map((m) => [m.pdga_number, m] as const)),
    [members],
  );
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m] as const)), [members]);

  const withHoles = useMemo(
    () => scores.filter((s) => Array.isArray(s.hole_scores) && s.hole_scores.some((n) => n > 0)),
    [scores],
  );

  const roundNums = useMemo(() => {
    const set = new Set<number>();
    for (const s of withHoles) set.add(s.round_number ?? 1);
    return Array.from(set).sort((a, b) => a - b);
  }, [withHoles]);

  const [round, setRound] = useState<number | null>(null);
  const activeRound = round ?? roundNums[roundNums.length - 1] ?? null;

  const rows = useMemo(() => {
    if (activeRound == null) return [];
    return withHoles
      .filter((s) => (s.round_number ?? 1) === activeRound)
      .map((s) => {
        const m =
          (s.member_id ? memberById.get(s.member_id) : undefined) ?? memberByNum.get(s.pdga_number);
        return m ? { member: m, holes: (s.hole_scores ?? []).map((n) => n || 0), row: s } : null;
      })
      .filter((r): r is { member: Member; holes: number[]; row: TrackerLiveScoreRow } => !!r)
      .sort(
        (a, b) =>
          (a.row.round_to_par ?? a.row.to_par ?? 99) - (b.row.round_to_par ?? b.row.to_par ?? 99),
      );
  }, [withHoles, activeRound, memberById, memberByNum]);

  const rawHoleCount = rows.reduce((n, r) => Math.max(n, r.holes.length), 0);
  // Only render holes that actually have a posted score for someone on the card.
  const holes = Array.from({ length: rawHoleCount }, (_, i) => i + 1).filter((_, i) =>
    rows.some((r) => (r.holes[i] ?? 0) > 0),
  );
  const holeCount = holes.length;
  const frontHoles = holes.filter((h) => h <= 9);
  const backHoles = holes.filter((h) => h > 9);
  const frontCount = frontHoles.length;

  // Par / distance come from PDGA's published layout for the round. Every
  // player on a card plays the same layout, so the first row that carries the
  // detail wins; when nothing is published we simply skip those rows.
  const parRow =
    rows.find((r) => (r.row.hole_pars ?? []).some((n) => (n ?? 0) > 0))?.row.hole_pars ?? null;
  const lenSource = rows.find((r) => (r.row.hole_lengths ?? []).some((n) => (n ?? 0) > 0))?.row;
  const lenRow = lenSource?.hole_lengths ?? null;
  const lenUnits = (lenSource?.hole_length_units ?? "Feet").toLowerCase().startsWith("m")
    ? "m"
    : "ft";
  const parFor = (hole: number): number | null => {
    const p = parRow?.[hole - 1] ?? 0;
    return p > 0 ? p : null;
  };
  const parTotal = (list: number[]) => sum(list.map((h) => parFor(h) ?? 0));
  /** Birdie-or-better greens, bogey-or-worse reds, par left plain. */
  const scoreClass = (value: number, hole: number): string => {
    if (value <= 0) return "text-muted-foreground/50";
    const par = parFor(hole);
    if (par == null) return "";
    const diff = value - par;
    if (diff <= -2) return "bg-emerald-500/25 font-bold text-emerald-700 dark:text-emerald-300";
    if (diff === -1)
      return "bg-emerald-500/15 font-semibold text-emerald-600 dark:text-emerald-400";
    if (diff === 1) return "bg-rose-500/15 font-semibold text-rose-600 dark:text-rose-400";
    if (diff >= 2) return "bg-rose-500/25 font-bold text-rose-700 dark:text-rose-300";
    return "";
  };

  if (rows.length === 0 || holeCount === 0) {
    if (hideWhenEmpty) return null;
    return (
      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Grid3x3 className="h-4 w-4 text-primary" /> {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Hole-by-hole scores appear here once PDGA live scoring posts them for this round.
          </p>
        </CardContent>
      </Card>
    );
  }

  const gridCols = `150px repeat(${holeCount}, 34px) 46px${backHoles.length ? " 46px" : ""} 52px`;

  return (
    <Card className="border-border/70">
      <CardHeader className="gap-2 pb-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <CardTitle className="flex min-w-0 items-center gap-2 text-base">
            <Grid3x3 className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">{title}</span>
          </CardTitle>
          {roundNums.length > 1 && (
            <div className="flex shrink-0 gap-1">
              {roundNums.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRound(n)}
                  className={`min-h-8 rounded-md px-2.5 text-xs font-semibold transition ${
                    n === activeRound
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  R{n}
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Swipe sideways to see every hole. Birdies or better show green, bogeys or worse show red.
        </p>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="overflow-x-auto pb-3">
          <div className="min-w-max">
            <div
              className="grid items-center gap-x-1 border-y border-border/70 bg-muted/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
              style={{ gridTemplateColumns: gridCols }}
            >
              <span>Hole</span>
              {holes.map((h) => (
                <span key={`h-${h}`} className="text-center">
                  {h}
                </span>
              ))}
              <span className="text-center">F{frontCount}</span>
              {backHoles.length > 0 && <span className="text-center">B{backHoles.length}</span>}
              <span className="text-center">Tot</span>
            </div>
            {parRow && (
              <div
                className="grid items-center gap-x-1 border-b border-border/40 bg-muted/10 px-3 py-1 text-[11px] font-medium text-muted-foreground"
                style={{ gridTemplateColumns: gridCols }}
              >
                <span className="uppercase tracking-wide">Par</span>
                {holes.map((h) => (
                  <span key={`par-${h}`} className="text-center tabular-nums">
                    {parFor(h) ?? "–"}
                  </span>
                ))}
                <span className="text-center tabular-nums">{parTotal(frontHoles) || "–"}</span>
                {backHoles.length > 0 && (
                  <span className="text-center tabular-nums">{parTotal(backHoles) || "–"}</span>
                )}
                <span className="text-center font-semibold tabular-nums">
                  {parTotal(holes) || "–"}
                </span>
              </div>
            )}
            {lenRow && (
              <div
                className="grid items-center gap-x-1 border-b border-border/40 px-3 py-1 text-[10px] text-muted-foreground"
                style={{ gridTemplateColumns: gridCols }}
              >
                <span className="uppercase tracking-wide">Distance ({lenUnits})</span>
                {holes.map((h) => {
                  const d = lenRow[h - 1] ?? 0;
                  return (
                    <span key={`len-${h}`} className="text-center tabular-nums">
                      {d > 0 ? d : "–"}
                    </span>
                  );
                })}
                <span className="text-center tabular-nums">
                  {sum(frontHoles.map((h) => lenRow[h - 1] ?? 0)) || "–"}
                </span>
                {backHoles.length > 0 && (
                  <span className="text-center tabular-nums">
                    {sum(backHoles.map((h) => lenRow[h - 1] ?? 0)) || "–"}
                  </span>
                )}
                <span className="text-center tabular-nums">
                  {sum(holes.map((h) => lenRow[h - 1] ?? 0)) || "–"}
                </span>
              </div>
            )}
            {rows.map(({ member, holes: hs, row }) => {
              const name = member.display_name || `#${member.pdga_number}`;
              const front = sum(frontHoles.map((h) => hs[h - 1] ?? 0).filter((n) => n > 0));
              const back = sum(backHoles.map((h) => hs[h - 1] ?? 0).filter((n) => n > 0));
              const total = row.round_score ?? front + back;
              return (
                <div
                  key={member.id}
                  className="grid items-center gap-x-1 border-b border-border/40 px-3 py-1.5 text-sm"
                  style={{ gridTemplateColumns: gridCols }}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-black"
                      style={crewSwatchStyle(member.color)}
                    >
                      {initialsOf(name)}
                    </span>
                    <span className="truncate text-[13px] font-medium">{name}</span>
                  </div>
                  {holes.map((h) => {
                    const v = hs[h - 1] ?? 0;
                    return (
                      <span
                        key={`c-${member.id}-${h}`}
                        className={`rounded text-center text-[13px] tabular-nums ${scoreClass(v, h)}`}
                      >
                        {v || "–"}
                      </span>
                    );
                  })}

                  <span className="text-center text-[13px] font-semibold tabular-nums">
                    {front || "–"}
                  </span>
                  {backHoles.length > 0 && (
                    <span className="text-center text-[13px] font-semibold tabular-nums">
                      {back || "–"}
                    </span>
                  )}

                  <span className="text-center text-[13px] font-bold tabular-nums">
                    {total || "–"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
