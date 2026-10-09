import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteCourseReport, updateCourseReport, type CourseReportRow } from "@/lib/course-reports.functions";
import { REPORT_KINDS } from "@/lib/rewards";

/** Edit / Remove controls for a report the signed-in player made. */
export function MyReportActions({ report, onChanged }: { report: CourseReportRow; onChanged: () => void }) {
  const update = useServerFn(updateCourseReport);
  const remove = useServerFn(deleteCourseReport);
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [kind, setKind] = useState<string>(report.kind);
  const [hole, setHole] = useState(report.hole_number ? String(report.hole_number) : "");
  const [note, setNote] = useState(report.description ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await update({ data: { report_id: report.id, kind, hole_number: hole ? Number(hole) : null, description: note || null } });
      toast.success("Report updated");
      setEditing(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "We couldn't update that report.");
    } finally { setBusy(false); }
  }
  async function doRemove() {
    setBusy(true);
    try {
      await remove({ data: { report_id: report.id } });
      toast.success("Report removed");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "We couldn't remove that report.");
    } finally { setBusy(false); setConfirmRemove(false); }
  }

  if (editing) {
    return (
      <div className="mt-2 space-y-2 rounded-lg border border-border p-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger aria-label="What's going on"><SelectValue /></SelectTrigger>
            <SelectContent>
              {REPORT_KINDS.map((r) => <SelectItem key={r.kind} value={r.kind}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input aria-label="Hole number" inputMode="numeric" placeholder="Hole" value={hole}
            onChange={(e) => setHole(e.target.value.replace(/\D/g, "").slice(0, 2))} />
        </div>
        <Textarea rows={2} aria-label="Details" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil className="mr-1.5 h-4 w-4" />Edit</Button>
      {confirmRemove ? (
        <>
          <span className="text-sm">Remove this report?</span>
          <Button size="sm" variant="destructive" onClick={doRemove} disabled={busy}>Remove</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>Keep</Button>
        </>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(true)}><Trash2 className="mr-1.5 h-4 w-4" />Remove</Button>
      )}
    </div>
  );
}
