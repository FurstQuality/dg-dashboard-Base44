/**
 * Log Flex Round dialog.
 *
 * Captures a one-off round (flex, side game, or unsanctioned event) played on
 * a tracker trip. The event shows up in the crew's tracker; when the caller
 * fills in their score/rating, it is written to external_rounds as a verified
 * PDGA round so DG Statboard rating projections update immediately.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Sparkles } from "lucide-react";
import { logFlexRound } from "@/lib/tracker.functions";

type Props = { groupId: string; onLogged?: () => void };

export function LogFlexRoundDialog({ groupId, onLogged }: Props) {
  const log = useServerFn(logFlexRound);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({
    name: "",
    event_date: today,
    course_name: "",
    layout_name: "",
    url: "",
    division: "MPO",
    score: "",
    to_par: "",
    round_rating: "",
  });

  function update<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit() {
    if (!form.name.trim() || !form.course_name.trim()) {
      toast.error("Give the event a name and course.");
      return;
    }
    setSaving(true);
    try {
      await log({
        data: {
          group_id: groupId,
          name: form.name.trim(),
          event_date: form.event_date,
          course_name: form.course_name.trim(),
          layout_name: form.layout_name.trim() || null,
          location: form.course_name.trim(),
          url: form.url.trim() || null,
          division: form.division.trim() || null,
          score: form.score.trim() ? Number(form.score) : null,
          to_par: form.to_par.trim() ? Number(form.to_par) : null,
          round_rating: form.round_rating.trim() ? Number(form.round_rating) : null,
        },
      });
      toast.success("Flex round logged — it'll flow into your rating projections.");
      setOpen(false);
      onLogged?.();
      // Reset the score fields so the next log starts clean.
      setForm((f) => ({ ...f, score: "", to_par: "", round_rating: "" }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't log the round.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Sparkles className="h-4 w-4" /> Log flex round
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Log a flex round</DialogTitle>
          <DialogDescription>
            Adds the event to the crew tracker. If you fill in your rating it counts toward your DG
            Statboard projection as a verified round.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="flex-name">Event name</Label>
            <Input
              id="flex-name"
              placeholder="Eureka Temp Flex"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="flex-date">Date played</Label>
              <Input
                id="flex-date"
                type="date"
                value={form.event_date}
                onChange={(e) => update("event_date", e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="flex-div">Division</Label>
              <Input
                id="flex-div"
                placeholder="MPO"
                value={form.division}
                onChange={(e) => update("division", e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="flex-course">Course</Label>
            <Input
              id="flex-course"
              placeholder="Eureka Temp"
              value={form.course_name}
              onChange={(e) => update("course_name", e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="flex-layout">Layout (optional)</Label>
            <Input
              id="flex-layout"
              placeholder="Blue tees"
              value={form.layout_name}
              onChange={(e) => update("layout_name", e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="flex-url">PDGA / results URL (optional)</Label>
            <Input
              id="flex-url"
              placeholder="https://www.pdga.com/tour/event/…"
              value={form.url}
              onChange={(e) => update("url", e.target.value)}
            />
          </div>

          <div className="rounded-md border bg-muted/30 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Your result (optional)</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="flex-score" className="text-xs">
                  Strokes
                </Label>
                <Input
                  id="flex-score"
                  inputMode="numeric"
                  value={form.score}
                  onChange={(e) => update("score", e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="flex-topar" className="text-xs">
                  To par
                </Label>
                <Input
                  id="flex-topar"
                  inputMode="numeric"
                  placeholder="+16"
                  value={form.to_par}
                  onChange={(e) => update("to_par", e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="flex-rating" className="text-xs">
                  Rating
                </Label>
                <Input
                  id="flex-rating"
                  inputMode="numeric"
                  placeholder="927"
                  value={form.round_rating}
                  onChange={(e) => update("round_rating", e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={saving}>
            {saving ? "Logging…" : "Log round"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
