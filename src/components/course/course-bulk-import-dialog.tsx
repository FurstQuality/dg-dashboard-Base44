import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Download, Loader2 } from "lucide-react";
import { importOsmCoursesForState, US_STATES } from "@/lib/course-import.functions";

type Row = { state: string; created: number; updated: number; scanned: number; failed?: boolean };

/**
 * Admin tool: pulls the open OpenStreetMap course dataset into the library,
 * state by state, so the directory covers the whole country.
 */
export function CourseBulkImportDialog({ onImported }: { onImported?: () => void }) {
  const runImport = useServerFn(importOsmCoursesForState);
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [current, setCurrent] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  async function runAll() {
    setRunning(true);
    setRows([]);
    setDone(0);
    let created = 0;
    for (const state of US_STATES) {
      setCurrent(state.name);
      try {
        const res = await runImport({ data: { state: state.code } });
        created += res.created;
        setRows((prev) => [
          { state: state.code, created: res.created, updated: res.updated, scanned: res.scanned },
          ...prev,
        ]);
      } catch {
        setRows((prev) => [
          { state: state.code, created: 0, updated: 0, scanned: 0, failed: true },
          ...prev,
        ]);
      }
      setDone((d) => d + 1);
    }
    setCurrent(null);
    setRunning(false);
    toast.success(`Import finished — ${created} new courses added`);
    onImported?.();
  }

  const pct = Math.round((done / US_STATES.length) * 100);

  return (
    <Dialog open={open} onOpenChange={(v) => (running ? null : setOpen(v))}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Download className="mr-1 h-4 w-4" /> Bulk import courses
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import the national course library</DialogTitle>
          <DialogDescription>
            Pulls every mapped disc golf course in the United States from OpenStreetMap — name,
            location, hole count. Existing courses are matched and enriched instead of duplicated.
            Ratings, reviews and layouts are added afterwards by the course review importer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Button onClick={runAll} disabled={running} className="w-full">
            {running ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing {current ?? "…"}
              </>
            ) : (
              <>Start import — all 51 states</>
            )}
          </Button>

          {done > 0 ? (
            <div className="space-y-2">
              <Progress value={pct} />
              <div className="text-xs text-muted-foreground">
                {done} of {US_STATES.length} states processed
              </div>
            </div>
          ) : null}

          {rows.length > 0 ? (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left">State</th>
                    <th className="px-2 py-1.5 text-right">Found</th>
                    <th className="px-2 py-1.5 text-right">Added</th>
                    <th className="px-2 py-1.5 text-right">Enriched</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.state} className="border-t border-border">
                      <td className="px-2 py-1.5 font-medium">{r.state}</td>
                      <td className="px-2 py-1.5 text-right">{r.failed ? "—" : r.scanned}</td>
                      <td className="px-2 py-1.5 text-right">{r.failed ? "retry" : r.created}</td>
                      <td className="px-2 py-1.5 text-right">{r.failed ? "—" : r.updated}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
