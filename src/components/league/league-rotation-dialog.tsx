import { useEffect, useState } from "react";
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
import { X } from "lucide-react";

export function rotationPlan(startIso: string, count: number, courseIds: string[], everyDays = 7) {
  const out: { date: string; course_id: string }[] = [];
  const d = new Date(`${startIso}T12:00:00`);
  for (let i = 0; i < count; i++) {
    out.push({ date: d.toISOString().slice(0, 10), course_id: courseIds[i % courseIds.length] });
    d.setDate(d.getDate() + everyDays);
  }
  return out;
}

/** Adds new nights that cycle through courses. Existing nights are never moved or changed. */
export function LeagueRotationDialog({
  open,
  onOpenChange,
  leagueId,
  nextWeek,
  nextDate,
  courses,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leagueId: string;
  nextWeek: number;
  nextDate: string;
  courses: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const [order, setOrder] = useState<string[]>([]);
  const [count, setCount] = useState(4);
  const [start, setStart] = useState(nextDate);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setOrder([]);
      setStart(nextDate);
    }
  }, [open, nextDate]);

  const plan = order.length && start ? rotationPlan(start, count, order) : [];
  const nameOf = (id: string) => courses.find((c) => c.id === id)?.name ?? "Course";

  async function create() {
    if (!plan.length) return toast.error("Pick at least one course.");
    setBusy(true);
    const { error } = await supabase.from("league_events").insert(
      plan.map((p, i) => ({
        league_id: leagueId,
        week_number: nextWeek + i,
        event_date: p.date,
        course_id: p.course_id,
        status: "scheduled",
        rounds: 1,
      })),
    );
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Added ${plan.length} nights. Pick a layout for each.`);
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a course rotation</DialogTitle>
          <DialogDescription>
            Adds new weekly nights that cycle through courses in order. Nights already on the schedule stay as they are.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Courses, in order</Label>
            <div className="flex flex-wrap gap-1.5">
              {order.map((id, i) => (
                <span key={`${id}-${i}`} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[13px]">
                  {i + 1}. {nameOf(id)}
                  <button type="button" aria-label="Remove" onClick={() => setOrder((o) => o.filter((_, j) => j !== i))}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <select
              value=""
              onChange={(e) => e.target.value && setOrder((o) => [...o, e.target.value])}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Add a course…</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">First new night</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">How many nights</Label>
              <Input type="number" min={1} max={30} value={count} onChange={(e) => setCount(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} />
            </div>
          </div>
          {plan.length > 0 && (
            <ul className="max-h-48 overflow-y-auto rounded-control border border-border/60 p-2 text-[13px]">
              {plan.map((p, i) => (
                <li key={p.date}>
                  Week {nextWeek + i} · {p.date} · {nameOf(p.course_id)}
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void create()} disabled={busy || !plan.length}>
            {busy ? "Adding…" : `Add ${plan.length || ""} nights`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
