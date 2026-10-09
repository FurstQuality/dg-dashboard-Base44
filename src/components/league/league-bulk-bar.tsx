import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Night = { id: string; status: string; week_number: number };

/**
 * Bulk edits selected nights only — never the league itself. Finished and
 * cancelled nights are skipped so played history stays as it was.
 */
export function LeagueBulkBar({
  selected,
  nights,
  courses,
  onDone,
  onClear,
}: {
  selected: string[];
  nights: Night[];
  courses: { id: string; name: string }[];
  onDone: () => void;
  onClear: () => void;
}) {
  const [courseId, setCourseId] = useState("");
  const [time, setTime] = useState("");
  const [fee, setFee] = useState("");
  const [busy, setBusy] = useState(false);
  const picked = nights.filter((n) => selected.includes(n.id));
  const editable = picked.filter((n) => n.status !== "completed" && n.status !== "cancelled");
  const skipped = picked.length - editable.length;

  async function apply() {
    const patch: { course_id?: string; layout_id?: null; start_time?: string; entry_fee_cents?: number } = {};
    if (courseId) {
      patch.course_id = courseId;
      patch.layout_id = null;
    }
    if (time) patch.start_time = time;
    if (fee !== "") {
      if (!(Number(fee) >= 0)) return toast.error("Entry fee must be a number.");
      patch.entry_fee_cents = Math.round(Number(fee) * 100);
    }
    if (!Object.keys(patch).length) return toast.error("Choose something to change.");
    if (!editable.length) return toast.error("Those nights are finished — nothing to change.");
    if (
      !window.confirm(
        `Update ${editable.length} ${editable.length === 1 ? "night" : "nights"}${skipped ? ` (${skipped} finished night${skipped === 1 ? "" : "s"} left alone)` : ""}?`,
      )
    )
      return;
    setBusy(true);
    const { error } = await supabase
      .from("league_events")
      .update(patch)
      .in(
        "id",
        editable.map((n) => n.id),
      );
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(courseId ? "Nights updated — pick a layout for each." : "Nights updated.");
    setCourseId("");
    setTime("");
    setFee("");
    onClear();
    onDone();
  }

  if (!selected.length) return null;
  return (
    <div className="sticky top-2 z-10 flex flex-wrap items-end gap-2 rounded-control border border-border bg-card p-3 shadow-sm">
      <p className="w-full text-sm font-medium">
        {picked.length} {picked.length === 1 ? "night" : "nights"} selected
        {skipped ? ` · ${skipped} finished will be skipped` : ""}
      </p>
      <label className="space-y-1 text-[13px]">
        <span className="text-muted-foreground">Course</span>
        <select
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          className="block h-9 w-[200px] rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">Keep as is</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-[13px]">
        <span className="text-muted-foreground">Start time</span>
        <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-9 w-[130px]" />
      </label>
      <label className="space-y-1 text-[13px]">
        <span className="text-muted-foreground">Entry fee ($)</span>
        <Input type="number" min={0} value={fee} onChange={(e) => setFee(e.target.value)} className="h-9 w-[110px]" placeholder="Keep" />
      </label>
      <Button size="sm" onClick={() => void apply()} disabled={busy}>
        {busy ? "Updating…" : "Update selected nights"}
      </Button>
      <Button size="sm" variant="ghost" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}
