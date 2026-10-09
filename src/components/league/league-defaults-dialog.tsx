import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { LEAGUE_FORMAT_LABEL, previewDefaultChange, type NightRow } from "@/lib/league-effective";

type Night = NightRow & { id: string };

/**
 * Edits league-wide defaults. Nights that inherit pick up the change; nights set
 * individually keep their value unless the director explicitly overwrites them.
 * Completed and cancelled nights are frozen at their old value first.
 */
export function LeagueDefaultsDialog({
  open,
  onOpenChange,
  league,
  nights,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  league: {
    id: string;
    name: string;
    description?: string | null;
    entry_fee_cents: number | null;
    start_time: string | null;
    format?: string | null;
    payout_notes?: string | null;
  };
  nights: Night[];
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fee, setFee] = useState("");
  const [time, setTime] = useState("");
  const [format, setFormat] = useState("");
  const [payout, setPayout] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(league.name);
    setDescription(league.description ?? "");
    setFee(league.entry_fee_cents != null ? String(league.entry_fee_cents / 100) : "");
    setTime(league.start_time?.slice(0, 5) ?? "");
    setFormat(league.format ?? "");
    setPayout(league.payout_notes ?? "");
    setOverwrite(false);
  }, [open, league]);

  // Each night-overridable field: old league value, new value, whether it changed.
  type Field = "entry_fee_cents" | "start_time" | "format" | "payout_notes";
  const next: Record<Field, string | number | null> = {
    entry_fee_cents: fee === "" ? null : Math.round(Number(fee) * 100),
    start_time: time || null,
    format: format.trim() || null,
    payout_notes: payout.trim() || null,
  };
  const prev: Record<Field, string | number | null> = {
    entry_fee_cents: league.entry_fee_cents,
    start_time: league.start_time?.slice(0, 5) ?? null,
    format: league.format ?? null,
    payout_notes: league.payout_notes ?? null,
  };
  const FIELDS: { key: Field; label: string }[] = [
    { key: "entry_fee_cents", label: "Entry fee" },
    { key: "start_time", label: "Start time" },
    { key: "format", label: "Format" },
    { key: "payout_notes", label: "Payout" },
  ];
  const changed = FIELDS.filter((f) => next[f.key] !== prev[f.key]);

  const preview = useMemo(
    () =>
      Object.fromEntries(FIELDS.map((f) => [f.key, previewDefaultChange(nights, f.key)])) as Record<
        Field,
        ReturnType<typeof previewDefaultChange>
      >,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nights],
  );

  async function save() {
    if (!name.trim()) return toast.error("Give the league a name.");
    if (fee !== "" && !(Number(fee) >= 0)) return toast.error("Entry fee must be a number.");
    if (overwrite && !window.confirm("Replace settings you set on individual nights with the new league setting?"))
      return;
    setSaving(true);
    try {
      // Freeze finished nights at the value they were played with.
      const oldRaw: Record<Field, string | number | null> = {
        ...prev,
        start_time: league.start_time ?? null,
      };
      const frozen = nights.filter((n) => n.status === "completed" || n.status === "cancelled");
      for (const n of frozen) {
        const patch: Partial<Record<Field, string | number | null>> = {};
        for (const f of changed) if (n[f.key] == null) patch[f.key] = oldRaw[f.key];
        if (Object.keys(patch).length) {
          const { error } = await supabase.from("league_events").update(patch as never).eq("id", n.id);
          if (error) throw error;
        }
      }
      const { error } = await supabase
        .from("leagues")
        .update({
          name: name.trim(),
          description: description.trim() || null,
          entry_fee_cents: (next.entry_fee_cents as number | null) ?? 0,
          start_time: next.start_time as string | null,
          format: (next.format as string | null) ?? league.format ?? "singles",
          payout_notes: next.payout_notes as string | null,
        })
        .eq("id", league.id);
      if (error) throw error;
      if (overwrite) {
        for (const f of changed) {
          const ids = preview[f.key].keepOverride;
          if (!ids.length) continue;
          const { error: e2 } = await supabase
            .from("league_events")
            .update({ [f.key]: null } as never)
            .in("id", ids);
          if (e2) throw e2;
        }
      }
      toast.success("League settings saved.");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save league settings.");
    } finally {
      setSaving(false);
    }
  }

  const summary = (p: { future: number; willUpdate: number; keepOverride: string[] }) =>
    `${p.future} upcoming ${p.future === 1 ? "night" : "nights"}: ${p.willUpdate} will update` +
    (p.keepOverride.length && !overwrite ? `, ${p.keepOverride.length} set individually stay the same` : "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit league settings</DialogTitle>
          <DialogDescription>
            Changes here apply to every night that hasn't been set on its own. Course and layout are set on each night, so none is needed here.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">League name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Default entry fee ($)</Label>
              <Input type="number" min={0} step="1" value={fee} onChange={(e) => setFee(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Default start time</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Default format</Label>
            <select
              value={format || "singles"}
              onChange={(e) => setFormat(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {Object.entries(LEAGUE_FORMAT_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Default payout</Label>
            <Input
              value={payout}
              onChange={(e) => setPayout(e.target.value)}
              placeholder="e.g. Top 30% paid, $1 per player to ace pot"
            />
          </div>
          {changed.length > 0 && (
            <div className="rounded-control border border-border/60 p-3 text-[13px]">
              <p className="font-medium">What changes</p>
              {changed.map((f) => (
                <p key={f.key} className="text-muted-foreground">
                  {f.label} — {summary(preview[f.key])}.
                </p>
              ))}
              <p className="text-muted-foreground">Finished nights keep what they were played with.</p>
              <label className="mt-2 flex items-center gap-2">
                <Checkbox checked={overwrite} onCheckedChange={(v) => setOverwrite(v === true)} />
                Also replace settings set on individual nights
              </label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save league settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
