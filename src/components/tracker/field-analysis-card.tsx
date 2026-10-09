import { useMemo } from "react";
import { Target, TrendingUp, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  analyzeStanding,
  divisionFits,
  myDivision,
  type DivisionFitVerdict,
  type FieldSnapshot,
} from "@/lib/event-field-analysis";

export interface FieldAnalysisCardProps {
  snapshot: FieldSnapshot;
  /** The player being analysed — normally the signed-in player. */
  pdgaNumber: string | null;
  rating: number | null;
  playerName?: string | null;
  /** Round count for the event; defaults to the highest round with scores. */
  plannedRounds?: number;
}

const VERDICT_LABEL: Record<DivisionFitVerdict, string> = {
  recommended: "Best fit",
  eligible: "Eligible",
  stretch: "Stretch",
  not_allowed: "Not allowed",
};

const VERDICT_TONE: Record<DivisionFitVerdict, string> = {
  recommended: "border-emerald-500/40 text-emerald-500",
  eligible: "border-border text-muted-foreground",
  stretch: "border-amber-500/40 text-amber-500",
  not_allowed: "border-rose-500/40 text-rose-500",
};


/**
 * How one player stacks up against the whole field: position, strokes back,
 * projected chance of winning, and which division their rating really fits.
 */
export function FieldAnalysisCard({
  snapshot,
  pdgaNumber,
  rating,
  playerName,
  plannedRounds,
}: FieldAnalysisCardProps) {
  const rounds = plannedRounds ?? (snapshot.rounds.length ? Math.max(...snapshot.rounds) : 1);
  const division = myDivision(snapshot, pdgaNumber);

  const standing = useMemo(() => {
    if (!pdgaNumber || !division) return null;
    const field = snapshot.divisions.find((d) => d.division === division);
    return field ? analyzeStanding(field, pdgaNumber, rounds) : null;
  }, [snapshot, division, pdgaNumber, rounds]);

  const fits = useMemo(() => divisionFits(rating, snapshot).slice(0, 5), [rating, snapshot]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4 text-primary" />
          You vs the field
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {playerName ? `${playerName} — ` : ""}
          {rating != null ? `rating ${rating}` : "no rating on file yet"}
          {division ? ` · playing ${division}` : ""}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {standing ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                label="Position"
                value={standing.position ? `${standing.tied ? "T" : ""}${standing.position} of ${standing.scoredCount}` : "—"}
              />
              <Stat
                label="Back of lead"
                value={
                  standing.strokesBackOfLead == null
                    ? "—"
                    : standing.strokesBackOfLead === 0
                      ? "Tied"
                      : `${standing.strokesBackOfLead} strokes`
                }
              />
              <Stat label="Rounds played" value={String(standing.roundsPlayed)} />
              <Stat
                label="Rating rank"
                value={standing.ratingRank != null ? `#${standing.ratingRank}` : "—"}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {standing.final
                ? `Final in ${standing.division}: every round is posted.`
                : `${standing.roundsRemaining} round${standing.roundsRemaining === 1 ? "" : "s"} left.`}
              {standing.ratingRank != null && standing.ratingAvg != null
                ? ` You're the #${standing.ratingRank} rated player in a division averaging ${standing.ratingAvg}.`
                : ""}
              {standing.strokesToPodium != null
                ? ` Podium is ${standing.strokesToPodium} strokes away.`
                : ""}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {pdgaNumber
              ? "You're not in this event's field, so there's no head-to-head yet. The division read below still applies."
              : "Add your PDGA number to your profile and we'll place you in this field automatically."}
          </p>
        )}

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Trophy className="h-3.5 w-3.5" />
            Where your rating fits
          </div>
          {fits.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              We need a current rating to recommend a division.
            </p>
          ) : (
            <ul className="space-y-2">
              {fits.map((f) => (
                <li key={f.code} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{f.code}</span>
                    <span className="text-xs text-muted-foreground">{f.name}</span>
                    <Badge variant="outline" className={`text-[10px] ${VERDICT_TONE[f.verdict]}`}>
                      {VERDICT_LABEL[f.verdict]}
                    </Badge>
                    {f.fieldCount > 0 && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <TrendingUp className="h-3 w-3" />
                        {f.fieldCount} here
                        {f.ratingAvg != null ? ` · avg ${f.ratingAvg}` : ""}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {f.requirement} — {f.note}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}
