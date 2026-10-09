import { formatToPar as fmtToPar } from "@/lib/score-display";
import { DgdBadge } from "@/components/dgd/dgd-badge";
import { useDgdByPdga } from "@/lib/dgd-identity";
import { useMemo, useState } from "react";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FieldSnapshot } from "@/lib/event-field-analysis";

export interface FieldLeaderboardProps {
  snapshot: FieldSnapshot;
  /** Division opened first — normally the player's own. */
  defaultDivision?: string | null;
  title?: string;
}

const PAGE = 25;


function toneFor(n: number | null): string {
  if (n == null || n === 0) return "text-muted-foreground";
  return n < 0 ? "text-emerald-500" : "text-rose-500";
}

/**
 * Full-field leaderboard for a tracked event, one division at a time. Crew
 * members and the signed-in player are highlighted inside the whole field.
 */
export function FieldLeaderboard({
  snapshot,
  defaultDivision,
  title = "Full field",
}: FieldLeaderboardProps) {
  const first = defaultDivision ?? snapshot.divisions[0]?.division ?? "";
  const [division, setDivision] = useState(first);
  const [expanded, setExpanded] = useState(false);
  const [crewOnly, setCrewOnly] = useState(false);

  const active = useMemo(
    () => snapshot.divisions.find((d) => d.division === division) ?? snapshot.divisions[0] ?? null,
    [snapshot, division],
  );

  const dgd = useDgdByPdga((active?.players ?? []).map((x) => x.pdgaNumber));
  if (!active) return null;
  const pool = crewOnly ? active.players.filter((p) => p.isCrew || p.isYou) : active.players;
  const shown = expanded ? pool : pool.slice(0, PAGE);
  const placeCounts = new Map<number, number>();
  for (const p of active.players)
    if (p.place != null) placeCounts.set(p.place, (placeCounts.get(p.place) ?? 0) + 1);
  const placeLabel = (n: number | null) =>
    n == null ? "—" : (placeCounts.get(n) ?? 0) > 1 ? `T${n}` : String(n);
  const hasCrew = active.players.some((p) => p.isCrew || p.isYou);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" />
            {title}
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {snapshot.totalPlayers} players · {snapshot.divisions.length} division
            {snapshot.divisions.length === 1 ? "" : "s"}
          </span>
        </div>
        {snapshot.divisions.length > 1 && (
          <Tabs value={active.division} onValueChange={setDivision} className="mt-2">
            <TabsList className="flex-wrap">
              {snapshot.divisions.map((d) => (
                <TabsTrigger key={d.division} value={d.division}>
                  {d.division}
                  <span className="ml-1 text-[10px] text-muted-foreground">{d.size}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {active.division} field of {active.size}
          {active.ratingAvg != null ? ` · average rating ${active.ratingAvg}` : ""}
          {active.ratingMax != null ? ` · top rated ${active.ratingMax}` : ""}
        </p>
        {hasCrew ? (
          <Button
            variant={crewOnly ? "default" : "outline"}
            size="sm"
            aria-pressed={crewOnly}
            onClick={() => setCrewOnly((v) => !v)}
          >
            {crewOnly ? "Show whole field" : "You and your crew"}
          </Button>
        ) : null}
        </div>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="bg-muted/30 text-xs text-muted-foreground">
                <th className="px-3 py-1.5 text-left font-medium">Place</th>
                <th className="px-3 py-1.5 text-left font-medium">Player</th>
                <th className="px-3 py-1.5 text-right font-medium">Rating</th>
                <th className="px-3 py-1.5 text-right font-medium">To par</th>
                <th className="px-3 py-1.5 text-right font-medium">Score</th>
                <th className="px-3 py-1.5 text-right font-medium">Thru</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr
                  key={p.pdgaNumber}
                  className={`border-t ${p.isYou ? "bg-primary/10" : p.isCrew ? "bg-muted/40" : ""}`}
                >
                  <td className="px-3 py-2 text-muted-foreground">{placeLabel(p.place)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{p.name}</span>
                      {dgd.data?.get(String(p.pdgaNumber)) ? (
                        <DgdBadge size="sm" tier={dgd.data.get(String(p.pdgaNumber))!.tier} rating={dgd.data.get(String(p.pdgaNumber))!.dgd_rating} />
                      ) : null}
                      {p.isYou ? (
                        <Badge variant="outline" className="h-4 px-1 text-xs">
                          you
                        </Badge>
                      ) : p.isCrew ? (
                        <Badge variant="secondary" className="h-4 px-1 text-xs">
                          crew
                        </Badge>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground">#{p.pdgaNumber}</div>
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{p.rating ?? "—"}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${toneFor(p.toPar)}`}>
                    {fmtToPar(p.toPar)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {p.total ?? "—"}
                    {p.total != null ? (
                      <span className="block text-xs text-muted-foreground">
                        {p.toPar != null ? `Par ${p.total - p.toPar}` : "Par unknown"}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {p.thru == null
                      ? "—"
                      : p.thru >= 18 && p.currentRound
                        ? `R${p.currentRound} done`
                        : p.currentRound
                          ? `R${p.currentRound} · ${p.thru}`
                          : p.thru}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pool.length > PAGE && (
          <Button variant="outline" size="sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Show top 25" : `Show all ${pool.length} players`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
