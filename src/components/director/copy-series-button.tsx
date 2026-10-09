import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Copy } from "lucide-react";
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
} from "@/components/ui/dialog";
import { copySeries } from "@/lib/series.functions";

/** Start next season from this series: same scoring, host and awards, no events yet. */
export function CopySeriesButton({ id, name, season }: { id: string; name: string; season: string | null }) {
  const nextYear = (() => {
    const y = Number((season ?? name).match(/\d{4}/)?.[0]);
    return y ? String(y + 1) : String(new Date().getFullYear() + 1);
  })();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState(name.replace(/\d{4}/, nextYear));
  const [newSeason, setNewSeason] = useState(nextYear);
  const [busy, setBusy] = useState(false);
  const run = useServerFn(copySeries);
  const navigate = useNavigate();

  async function submit() {
    setBusy(true);
    try {
      const created = await run({ data: { id, name: newName, season: newSeason || null } });
      toast.success("New season created. Add its events next.");
      setOpen(false);
      void navigate({ to: "/director/series/$id", params: { id: created.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't copy the series.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Copy className="mr-1.5 h-4 w-4" />
        Copy for next season
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy for next season</DialogTitle>
            <DialogDescription>
              Keeps the scoring rules, bonuses, awards and host. Events and results start empty.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Series name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Season</Label>
              <Input value={newSeason} onChange={(e) => setNewSeason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => void submit()} disabled={busy || newName.trim().length < 2}>
              {busy ? "Copying…" : "Create new season"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
