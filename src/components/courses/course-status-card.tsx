import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CircleCheck, CircleHelp, CircleX, TriangleAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const COURSE_STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  OPEN_WITH_CONDITIONS: "Open with conditions",
  PARTIALLY_CLOSED: "Some holes closed",
  CLOSED: "Closed",
  UNKNOWN: "Not checked yet",
};
const HOLE_STATUS_LABEL: Record<string, string> = {
  CAUTION: "Caution",
  TEMPORARILY_CLOSED: "Closed for now",
  UNDER_CONSTRUCTION: "Under construction",
};

function StatusIcon({ status }: { status: string }) {
  if (status === "OPEN") return <CircleCheck className="h-5 w-5 text-success" aria-hidden />;
  if (status === "CLOSED") return <CircleX className="h-5 w-5 text-destructive" aria-hidden />;
  if (status === "UNKNOWN") return <CircleHelp className="h-5 w-5 text-muted-foreground" aria-hidden />;
  return <TriangleAlert className="h-5 w-5 text-warning" aria-hidden />;
}

function ago(iso: string) {
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 864e5);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
}

/** Current course status, closed holes, live issue count; stewards can update it. */
export function CourseStatusCard({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const key = ["course-status", courseId];
  const { data } = useQuery({
    queryKey: key,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const [status, holes, reports, steward] = await Promise.all([
        supabase.from("course_status").select("status, note, authority, updated_at, valid_until").eq("course_id", courseId).maybeSingle(),
        supabase.from("course_hole_status").select("hole_number, status, note").eq("course_id", courseId).neq("status", "OPEN").order("hole_number"),
        supabase.from("course_reports").select("id", { count: "exact", head: true }).eq("course_id", courseId).in("status", ["open", "confirmed"]),
        auth.user
          ? supabase.rpc("can_steward_course", { _course: courseId, _user: auth.user.id } as never)
          : Promise.resolve({ data: false }),
      ]);
      return {
        status: status.data,
        holes: holes.data ?? [],
        openReports: reports.count ?? 0,
        canSteward: Boolean(steward.data),
      };
    },
  });

  const [editing, setEditing] = useState(false);
  const [next, setNext] = useState("OPEN");
  const [note, setNote] = useState("");
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("set_course_status", {
        _course: courseId, _status: next, _note: note.trim() || null,
        _playable_days: next === "OPEN" ? 14 : null,
      } as never);
      if (error) throw new Error("Couldn't update the course status. Try again.");
    },
    onSuccess: () => {
      toast.success("Course status updated.");
      setEditing(false);
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!data) return null;
  const status = data.status?.status ?? "UNKNOWN";
  const expired = data.status?.valid_until && new Date(data.status.valid_until) < new Date();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <StatusIcon status={status} />
          {COURSE_STATUS_LABEL[status] ?? status}
        </CardTitle>
        {data.canSteward && !editing && (
          <Button size="sm" variant="outline" onClick={() => { setNext(status === "UNKNOWN" ? "OPEN" : status); setNote(data.status?.note ?? ""); setEditing(true); }}>
            Update status
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {data.status ? (
          <p className="text-muted-foreground">
            {data.status.authority === "OFFICIAL" ? "Set by the course" : "Set by a course steward"} {ago(data.status.updated_at)}
            {expired ? " · may be out of date" : ""}
          </p>
        ) : (
          <p className="text-muted-foreground">No one has checked in on this course yet.</p>
        )}
        {data.status?.note && <p>{data.status.note}</p>}
        {data.holes.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {data.holes.map((h) => (
              <li key={h.hole_number}>
                <Badge variant="outline">Hole {h.hole_number}: {HOLE_STATUS_LABEL[h.status] ?? h.status}</Badge>
              </li>
            ))}
          </ul>
        )}
        {data.openReports > 0 && (
          <p className="font-medium text-warning">
            {data.openReports} live {data.openReports === 1 ? "issue" : "issues"} reported by players — see below.
          </p>
        )}
        {editing && (
          <div className="space-y-2 border-t border-border pt-3">
            <Select value={next} onValueChange={setNext}>
              <SelectTrigger aria-label="Course status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(COURSE_STATUS_LABEL).filter(([k]) => k !== "UNKNOWN").map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} placeholder="What should players know? (optional)" />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>Save status</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
