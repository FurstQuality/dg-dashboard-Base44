import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { RefreshCw, Users, Trophy, Swords, Target, Info } from "lucide-react";
import { toast } from "sonner";
import { analyzeEventOdds, type GamePlanEvent, type OddsResult } from "@/lib/game-plan.functions";
import { syncPdgaEventField } from "@/lib/pdga-field.functions";
import { PdgaEventLinks } from "@/components/shared/pdga-links";
import { useTargetRating } from "@/lib/use-target-rating";

/**
 * Compact event analysis card — Monte-Carlo win/podium/cash odds against the
 * whole division, target-rating math ("what do I need to shoot"), and a
 * clickable field list where every player opens a head-to-head Face Off in a
 * new tab so this panel and the Compare page work side-by-side.
 */
export function EventAnalysisPanel({
  event,
  myPdga,
  myDisplayName,
}: {
  event: GamePlanEvent;
  myPdga: string | null;
  myDisplayName?: string | null;
}) {
  const analyze = useServerFn(analyzeEventOdds);
  const syncField = useServerFn(syncPdgaEventField);
  const qc = useQueryClient();
  const [division, setDivision] = useState<string | undefined>(event.division ?? undefined);
  // Event-specific target rating. Seeded from the saved overall rating goal;
  // changes here stay local to this event.
  const [savedGoal] = useTargetRating();
  const [targetRating, setTargetRating] = useState<number>(savedGoal ?? 950);
  useEffect(() => {
    if (savedGoal != null) setTargetRating(savedGoal);
  }, [savedGoal]);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["event-analysis", "odds", event.id, division ?? "auto"],
    queryFn: () => analyze({ data: { eventId: event.id, division } }),
  });

  const sync = useMutation({
    mutationFn: () => {
      if (!event.pdga_event_ref) throw new Error("Not a PDGA event");
      return syncField({ data: { eventRef: event.pdga_event_ref } });
    },
    onSuccess: (res) => {
      toast.success(res.message ?? "Field synced");
      qc.invalidateQueries({ queryKey: ["event-analysis", "odds", event.id] });
      qc.invalidateQueries({ queryKey: ["game-plan", "odds", event.id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Sync failed"),
  });

  const odds: OddsResult | undefined = data;

  const targetsSummary = useMemo(() => {
    if (!odds) return null;
    const mine = odds.meRating ?? 0;
    const avg = odds.competition.avgRating;
    const top = odds.competition.topRating;
    return {
      beatAvg: avg != null ? Math.max(avg + 1, mine + 5) : null,
      beatTop: top != null ? Math.max(top + 1, mine + 5) : null,
      target: targetRating,
      // Rounds needed = simple lift: need round(target-current) points above
      // current for one round; more meaningful is what the round has to hit,
      // which is exactly the target itself. Keep it as-is.
    };
  }, [odds, targetRating]);

  if (isLoading) {
    return <Card className="p-4 text-sm text-muted-foreground">Analyzing the field…</Card>;
  }
  if (!odds) {
    return <Card className="p-4 text-sm text-muted-foreground">No analysis available yet.</Card>;
  }

  const canSyncPdga = !!event.pdga_event_ref;
  const meLabel =
    odds.meRating != null
      ? `${myDisplayName ?? "You"} (${odds.meRating})`
      : `${myDisplayName ?? "You"} (unrated)`;
  const lastSyncedLabel = odds.competition.lastSyncedAt
    ? new Date(odds.competition.lastSyncedAt).toLocaleString()
    : null;

  return (
    <div className="space-y-3">
      {/* Header + controls */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Users className="h-4 w-4 text-primary" />
            Field of {odds.competition.fieldSize}
            {odds.divisionCode ? (
              <Badge variant="outline" className="ml-1">
                {odds.divisionCode}
              </Badge>
            ) : null}
            {odds.fieldSource === "pdga_cache" ? (
              <Badge variant="secondary">PDGA cache</Badge>
            ) : null}
            {odds.fieldSource === "internal" ? (
              <Badge variant="secondary">In-app roster</Badge>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {odds.divisionsAvailable.length > 1 ? (
              <Select
                value={division ?? odds.divisionCode ?? undefined}
                onValueChange={(v) => setDivision(v)}
              >
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue placeholder="Division" />
                </SelectTrigger>
                <SelectContent>
                  {odds.divisionsAvailable.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {canSyncPdga ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => sync.mutate()}
                disabled={sync.isPending}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${sync.isPending ? "animate-spin" : ""}`} />
                {sync.isPending ? "Syncing…" : "Sync field"}
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
        {lastSyncedLabel ? (
          <p className="text-[11px] text-muted-foreground">Field last synced {lastSyncedLabel}</p>
        ) : null}
        {event.pdga_event_ref ? (
          <PdgaEventLinks eventRef={event.pdga_event_ref} live label="Verify on PDGA" />
        ) : null}
      </Card>

      {!odds.players.length ? (
        <Card className="p-4 space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4" />
            {canSyncPdga
              ? "Field not synced yet. Tap “Sync field” to pull the registered players from PDGA."
              : "No roster yet. Register players in-app and their ratings will populate here."}
          </div>
        </Card>
      ) : (
        <>
          {/* Odds tiles */}
          <Card className="p-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <Tile
                icon={<Trophy className="h-4 w-4" />}
                label="Win"
                value={`${odds.odds.winPct}%`}
              />
              <Tile
                icon={<Trophy className="h-4 w-4" />}
                label="Top 3"
                value={`${odds.odds.top3Pct}%`}
              />
              <Tile
                icon={<Trophy className="h-4 w-4" />}
                label={`Cash (top ${odds.cashLine})`}
                value={`${odds.odds.cashPct}%`}
              />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Monte-Carlo simulation, {odds.players.length} rated opponents in{" "}
              {odds.divisionCode ?? "your division"}, ±45 rating variance per round.
            </p>
          </Card>

          {/* What do I need to shoot */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Target className="h-4 w-4 text-primary" />
                What do I need to shoot?
              </div>
              <div className="flex items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor={`tr-${event.id}`} className="text-[10px] uppercase tracking-wide">
                    Target rating
                  </Label>
                  <Input
                    id={`tr-${event.id}`}
                    type="number"
                    min={500}
                    max={1100}
                    value={targetRating}
                    onChange={(e) => setTargetRating(Number(e.target.value) || 0)}
                    className="h-8 w-24 text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <MiniStat label="Current rating" value={String(odds.meRating ?? "—")} />
              <MiniStat label="Field avg" value={String(odds.competition.avgRating ?? "—")} />
              <MiniStat label="To beat avg" value={String(targetsSummary?.beatAvg ?? "—")} />
              <MiniStat label="To beat top" value={String(targetsSummary?.beatTop ?? "—")} />
            </div>
            <p className="text-xs text-muted-foreground">
              You: {meLabel}. To hit a{" "}
              <span className="font-medium text-foreground">{targetRating}</span> round, expect to
              score roughly SSA +{" "}
              <span className="tabular-nums">{((1000 - targetRating) / 10).toFixed(1)}</span> per
              round (assumes stroke value 10 — Course Targets tab uses each course's real stroke
              value).
            </p>
            <div className="pt-1">
              <Button asChild size="sm" variant="outline">
                <Link to="/game-plan" search={{ eventId: event.id } as never}>
                  Full course-by-course targets
                </Link>
              </Button>
            </div>
          </Card>

          {/* Field list — clickable to Compare */}
          <Card className="p-2">
            <div className="flex items-center justify-between px-2 py-1">
              <div className="text-sm font-medium">Full field ({odds.players.length})</div>
              {myPdga ? (
                <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                  <Swords className="h-3 w-3" /> Click a player to face off
                </div>
              ) : (
                <div className="text-[11px] text-muted-foreground">
                  Add your PDGA # in Settings to enable face-offs.
                </div>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto divide-y">
              {odds.players.map((p) => {
                const canFaceOff = !!(myPdga && p.pdga_number && p.pdga_number !== myPdga);
                const row = (
                  <div className="flex items-center justify-between px-2 py-1.5 text-sm">
                    <div className="truncate">
                      <span className={canFaceOff ? "group-hover:text-primary" : ""}>
                        {p.display_name}
                      </span>
                      {p.pdga_number ? (
                        <span className="text-muted-foreground text-xs ml-2">#{p.pdga_number}</span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <div className="font-medium tabular-nums">{p.rating ?? "—"}</div>
                        {!p.synced ? (
                          <div className="text-[10px] text-muted-foreground">unsynced</div>
                        ) : null}
                      </div>
                      {canFaceOff ? (
                        <Swords className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
                      ) : null}
                    </div>
                  </div>
                );
                return canFaceOff ? (
                  <a
                    key={p.key}
                    href={`/compare?a=${encodeURIComponent(myPdga!)}&b=${encodeURIComponent(p.pdga_number!)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="group block hover:bg-muted/40"
                    title={`Face off ${myDisplayName ?? "you"} vs ${p.display_name}`}
                  >
                    {row}
                  </a>
                ) : (
                  <div key={p.key}>{row}</div>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Tile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/40 p-2">
      <div className="text-base font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
