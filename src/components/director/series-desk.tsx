import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { DIRECTOR_STALE, directorKeys } from "@/lib/director-queries";
import { useState } from "react";
import { toast } from "sonner";
import { ContentCard, LoadingSkeleton } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSeries, listMySeries } from "@/lib/series.functions";
import { SeriesStopLinker } from "@/components/director/series-stop-linker";
import {
  sanctionLevelLabel,
  summarizeSeries,
  defaultSeriesSettings,
} from "@/lib/competition-model";

/**
 * Series management, rendered inside the Tournaments desk. A series is simply a
 * set of tournaments played over a season, so organizers manage both here.
 */
export function SeriesDesk() {
  const fetchSeries = useServerFn(listMySeries);
  const create = useServerFn(createSeries);
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [season, setSeason] = useState(`${new Date().getFullYear()}`);
  const [dropWorst, setDropWorst] = useState(1);
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: directorKeys.series(),
    staleTime: DIRECTOR_STALE.medium,
    queryFn: () => fetchSeries({ data: undefined as never }),
  });

  async function add() {
    if (name.trim().length < 2) {
      toast.error("Give the series a name first");
      return;
    }
    setBusy(true);
    try {
      await create({
        data: {
          name: name.trim(),
          season: season.trim() || null,
          drop_worst: dropWorst,
          points_system: "standard",
          sanction_level: "unsanctioned",
          visibility: "public",
        },
      });
      await qc.invalidateQueries({ queryKey: directorKeys.series() });
      setName("");
      toast.success("Series created — use Manage stops to link existing events");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the series");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <ContentCard
        title="Series"
        subtitle="Link several tournaments into one season race, with each player's worst stops dropped."
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem_8rem_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label>Series name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Summer Points Series"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Season</Label>
            <Input value={season} onChange={(e) => setSeason(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Drop worst</Label>
            <Input
              type="number"
              min="0"
              max="10"
              value={dropWorst}
              onChange={(e) => setDropWorst(Math.max(0, parseInt(e.target.value) || 0))}
            />
          </div>
          <Button onClick={add} disabled={busy}>
            {busy ? "Creating…" : "Create series"}
          </Button>
        </div>
      </ContentCard>

      {isLoading ? (
        <LoadingSkeleton />
      ) : !data || data.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">
          No series yet. Create one above, then link the tournaments and leagues you already run as stops.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((s) => (
            <ContentCard key={s.id} title={s.name}>
              <div className="space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {s.season && <Badge variant="secondary">{s.season}</Badge>}
                  <Badge variant="outline">{sanctionLevelLabel(s.sanction_level as never)}</Badge>
                  <Badge variant="outline">
                    {s.stop_count} {s.stop_count === 1 ? "stop" : "stops"}
                  </Badge>
                </div>
                <p className="text-muted-foreground">
                  {summarizeSeries({
                    ...defaultSeriesSettings(),
                    counting_events: s.counting_events,
                    drop_worst: s.drop_worst,
                  })}
                </p>
                <div className="flex flex-wrap gap-2">
                  <SeriesStopLinker seriesId={s.id} seriesName={s.name} />
                  <Button asChild variant="secondary" size="sm">
                    <Link to="/director/series/$id" params={{ id: s.id }}>
                      Series report
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/series/$slug" params={{ slug: s.slug }}>
                      Public standings
                    </Link>
                  </Button>
                </div>
              </div>
            </ContentCard>
          ))}
        </div>
      )}
    </div>
  );
}
