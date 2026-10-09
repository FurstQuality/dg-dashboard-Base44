import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/event-setup/controls";
import { createSeries, listMySeries } from "@/lib/series.functions";
import { summarizeSeries, defaultSeriesSettings } from "@/lib/competition-model";
import { Trophy } from "lucide-react";

type Props = {
  value: string | null;
  onChange: (seriesId: string | null) => void;
  /** "tournament" | "league" — only used for copy. */
  kind?: "tournament" | "league";
};

/**
 * Attaching an event to a series is how "drop your worst stop" works: the drop
 * lives on the series, not on the individual event.
 */
export function SeriesPicker({ value, onChange, kind = "tournament" }: Props) {
  const fetchSeries = useServerFn(listMySeries);
  const create = useServerFn(createSeries);
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [dropWorst, setDropWorst] = useState(1);

  const { data: series = [] } = useQuery({
    queryKey: ["my-series"],
    queryFn: () => fetchSeries({ data: undefined as never }),
  });

  const selected = useMemo(() => series.find((s) => s.id === value) ?? null, [series, value]);

  async function addSeries() {
    if (newName.trim().length < 2) {
      toast.error("Give the series a name first");
      return;
    }
    setCreating(true);
    try {
      const created = await create({
        data: {
          name: newName.trim(),
          drop_worst: dropWorst,
          points_system: "standard",
          sanction_level: "unsanctioned",
          visibility: "public",
        },
      });
      await qc.invalidateQueries({ queryKey: ["my-series"] });
      onChange(created.id);
      setNewName("");
      toast.success("Series created — this event is now a stop in it");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the series");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Field
      label="Part of a series?"
      hint={`Series run across multiple ${kind === "league" ? "leagues" : "tournaments"} and can drop each player's worst stop. Leave this off for a standalone event.`}
    >
      <div className="space-y-3">
        <select
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">Standalone — not part of a series</option>
          {series.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.season ? ` (${s.season})` : ""} · {s.stop_count} stops
            </option>
          ))}
        </select>

        {selected && (
          <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-[13px] text-muted-foreground">
            <Trophy className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              {summarizeSeries({
                ...defaultSeriesSettings(),
                counting_events: selected.counting_events,
                drop_worst: selected.drop_worst,
              })}
            </span>
          </p>
        )}

        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <label className="space-y-1.5">
            <span className="block text-[13px] font-medium">Start a new series</span>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Summer Points Series 2026"
            />
          </label>
          <label className="space-y-1.5">
            <span className="block text-[13px] font-medium">Drop worst</span>
            <Input
              type="number"
              min="0"
              max="10"
              className="sm:w-24"
              value={dropWorst}
              onChange={(e) => setDropWorst(Math.max(0, parseInt(e.target.value) || 0))}
            />
          </label>
          <Button type="button" variant="secondary" onClick={addSeries} disabled={creating}>
            {creating ? "Creating…" : "Create series"}
          </Button>
        </div>
      </div>
    </Field>
  );
}
