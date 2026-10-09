import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ContentCard } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSeriesScoring } from "@/lib/series.functions";
import { fieldSizePoints, type SeriesSettings } from "@/lib/competition-model";
import { directorKeys } from "@/lib/director-queries";

const SYSTEMS: { value: SeriesSettings["points_system"]; label: string }[] = [
  { value: "field_size", label: "Field-size placement" },
  { value: "standard", label: "Fixed points table" },
  { value: "pdga_points", label: "PDGA-style points" },
];

/** Director controls for how a series is scored and which event is the finale. */
export function SeriesScoringCard({
  seriesId,
  settings,
  finaleEventId,
  stops,
}: {
  seriesId: string;
  settings: SeriesSettings;
  finaleEventId: string | null;
  stops: { id: string; name: string }[];
}) {
  const save = useServerFn(updateSeriesScoring);
  const qc = useQueryClient();
  const [system, setSystem] = useState(settings.points_system);
  const [bonus, setBonus] = useState(settings.field_size_bonus ?? 5);
  const [floor, setFloor] = useState(settings.min_event_points ?? 5);
  const [divChange, setDivChange] = useState<"separate" | "carry">(settings.division_change ?? "separate");
  const [drop, setDrop] = useState(settings.drop_worst);
  const [best, setBest] = useState<string>(settings.counting_events ? String(settings.counting_events) : "");
  const [finale, setFinale] = useState(finaleEventId ?? "");
  const [mult, setMult] = useState(String(settings.finale_multiplier ?? 1));
  const [part, setPart] = useState(settings.participation_bonus ?? 0);
  const [qual, setQual] = useState(settings.qualify_min_events ?? 0);
  const [awards, setAwards] = useState(settings.award_places ?? 0);
  const [busy, setBusy] = useState(false);

  useEffect(() => setFinale(finaleEventId ?? ""), [finaleEventId]);

  async function submit() {
    setBusy(true);
    try {
      await save({
        data: {
          id: seriesId,
          points_system: system,
          field_size_bonus: bonus,
          min_event_points: floor,
          division_change: divChange,
          drop_worst: drop,
          counting_events: best ? Number(best) : null,
          finale_event_id: finale || null,
          finale_multiplier: Number(mult) || 1,
          participation_bonus: part,
          qualify_min_events: qual,
          award_places: awards,
        },
      });
      toast.success("Scoring rules saved. Standings are recalculated.");
      await qc.invalidateQueries({ queryKey: directorKeys.seriesReport(seriesId) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the scoring rules.");
    } finally {
      setBusy(false);
    }
  }

  const sel = "h-10 w-full rounded-md border border-input bg-background px-2 text-sm";
  return (
    <ContentCard title="Scoring" subtitle="How each event awards points and how the season total adds up.">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">Points system</Label>
          <select className={sel} value={system} onChange={(e) => setSystem(e.target.value as never)}>
            {SYSTEMS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        {system === "field_size" && (
          <>
            <div className="space-y-1">
              <Label className="text-xs">Bonus added to field size</Label>
              <Input type="number" min={0} value={bonus} onChange={(e) => setBonus(Number(e.target.value) || 0)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Minimum points per event</Label>
              <Input type="number" min={0} value={floor} onChange={(e) => setFloor(Number(e.target.value) || 0)} />
            </div>
          </>
        )}
        <div className="space-y-1">
          <Label className="text-xs">Drop worst results</Label>
          <Input type="number" min={0} value={drop} onChange={(e) => setDrop(Number(e.target.value) || 0)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Best N events count</Label>
          <Input
            inputMode="numeric"
            placeholder="Every event"
            value={best}
            onChange={(e) => setBest(e.target.value.replace(/[^0-9]/g, ""))}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">If a player changes division</Label>
          <select className={sel} value={divChange} onChange={(e) => setDivChange(e.target.value as "separate" | "carry")}>
            <option value="separate">Points stay in each division</option>
            <option value="carry">Points move to their new division</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Season finale</Label>
          <select className={sel} value={finale} onChange={(e) => setFinale(e.target.value)}>
            <option value="">No finale</option>
            {stops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Finale points</Label>
          <select className={sel} value={mult} onChange={(e) => setMult(e.target.value)} disabled={!finale}>
            <option value="1">Normal points</option>
            <option value="1.25">1.25× points</option>
            <option value="1.5">1.5× points</option>
            <option value="2">Double points</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Bonus for each event played</Label>
          <Input type="number" min={0} value={part} onChange={(e) => setPart(Number(e.target.value) || 0)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Events needed to qualify for awards</Label>
          <Input type="number" min={0} placeholder="0 = everyone" value={qual} onChange={(e) => setQual(Number(e.target.value) || 0)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Award places per division</Label>
          <Input type="number" min={0} placeholder="0 = no cut line" value={awards} onChange={(e) => setAwards(Number(e.target.value) || 0)} />
        </div>
      </div>
      {system === "field_size" && (
        <p className="mt-3 text-[13px] text-muted-foreground">
          Example: in a 17-player division, 1st earns {fieldSizePoints(17, 1, bonus, floor)} and last earns{" "}
          {fieldSizePoints(17, 17, bonus, floor)}. Tied players share the tied place&apos;s points.
        </p>
      )}
      <div className="mt-3 flex justify-end">
        <Button onClick={() => void submit()} disabled={busy}>
          {busy ? "Saving…" : "Save scoring"}
        </Button>
      </div>
    </ContentCard>
  );
}
