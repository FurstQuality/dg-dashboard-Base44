import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle, Loader2, PlayCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export type VolunteerTask = {
  id: string;
  tournament_id: string;
  title: string;
  notes: string | null;
  hole_number: number | null;
  assigned_to: string | null;
  due_at: string | null;
  status: "todo" | "doing" | "done";
};

type Person = { id: string; name: string };

export function useVolunteerTasks(tournamentId: string, onlyMine?: string | null) {
  const [tasks, setTasks] = useState<VolunteerTask[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    let q = supabase.from("event_volunteer_tasks").select("*").eq("tournament_id", tournamentId);
    if (onlyMine) q = q.eq("assigned_to", onlyMine);
    const { data } = await q.order("status").order("created_at");
    setTasks((data as VolunteerTask[]) ?? []);
    setLoading(false);
  }, [tournamentId, onlyMine]);
  useEffect(() => {
    void reload();
    const ch = supabase
      .channel(`vol-tasks-${tournamentId}-${onlyMine ?? "all"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "event_volunteer_tasks", filter: `tournament_id=eq.${tournamentId}` },
        () => void reload(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [tournamentId, onlyMine, reload]);
  return { tasks, loading, reload };
}

export async function setTaskStatus(id: string, status: VolunteerTask["status"]) {
  const { error } = await supabase.from("event_volunteer_tasks").update({ status }).eq("id", id);
  if (error) toast.error("Couldn't update that task.");
}

const NEXT: Record<VolunteerTask["status"], VolunteerTask["status"]> = { todo: "doing", doing: "done", done: "todo" };

export function TaskStatusButton({ t, onDone }: { t: VolunteerTask; onDone?: () => void }) {
  const Icon = t.status === "done" ? CheckCircle2 : t.status === "doing" ? PlayCircle : Circle;
  const label = t.status === "todo" ? "Start" : t.status === "doing" ? "Mark done" : "Reopen";
  return (
    <Button
      size="sm"
      variant={t.status === "done" ? "ghost" : "default"}
      className="h-10 shrink-0"
      onClick={async () => {
        await setTaskStatus(t.id, NEXT[t.status]);
        onDone?.();
      }}
    >
      <Icon className="mr-1 h-4 w-4" /> {label}
    </Button>
  );
}

/** Director tool: assign volunteer jobs to the event team. */
export function VolunteerTasksManager({ tournamentId }: { tournamentId: string }) {
  const { tasks, reload } = useVolunteerTasks(tournamentId);
  const [people, setPeople] = useState<Person[]>([]);
  const [title, setTitle] = useState("");
  const [hole, setHole] = useState("");
  const [assignee, setAssignee] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: staff } = await supabase.from("tournament_staff").select("user_id").eq("tournament_id", tournamentId);
      const ids = [...new Set((staff ?? []).map((s) => s.user_id))];
      if (!ids.length) return setPeople([]);
      const { data: profs } = await supabase.from("profiles").select("id, username, display_name").in("id", ids);
      setPeople((profs ?? []).map((p: any) => ({ id: p.id, name: p.display_name || p.username || "Team member" })));
    })();
  }, [tournamentId]);

  const nameOf = (id: string | null) => (id ? (people.find((p) => p.id === id)?.name ?? "Team member") : "Unassigned");

  async function add() {
    if (!title.trim()) return toast.error("Name the job first.");
    const holeN = hole ? Number(hole) : null;
    if (holeN !== null && (holeN < 1 || holeN > 99)) return toast.error("Hole must be 1–99.");
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("event_volunteer_tasks").insert({
      tournament_id: tournamentId,
      title: title.trim().slice(0, 120),
      hole_number: holeN,
      assigned_to: assignee || null,
      created_by: auth.user?.id ?? "",
    });
    setSaving(false);
    if (error) return toast.error("Couldn't add that job.");
    setTitle("");
    setHole("");
    void reload();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("event_volunteer_tasks").delete().eq("id", id);
    if (error) toast.error("Couldn't remove that job.");
    else void reload();
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_90px_180px_auto]">
        <Input placeholder="Spot hole 7 OB line" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} aria-label="Job" />
        <Input placeholder="Hole" inputMode="numeric" value={hole} onChange={(e) => setHole(e.target.value.replace(/\D/g, ""))} aria-label="Hole" />
        <select
          className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          aria-label="Assign to"
        >
          <option value="">Unassigned</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <Button onClick={add} disabled={saving}>
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />} Add job
        </Button>
      </div>
      {people.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add volunteers under People → Event team to assign jobs to them.</p>
      ) : null}
      {tasks.length ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {tasks.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-medium ${t.status === "done" ? "line-through text-muted-foreground" : ""}`}>{t.title}</div>
                <div className="text-xs text-muted-foreground">
                  {nameOf(t.assigned_to)}
                  {t.hole_number ? ` · Hole ${t.hole_number}` : ""}
                </div>
              </div>
              <Badge variant="outline">{t.status === "todo" ? "To do" : t.status === "doing" ? "In progress" : "Done"}</Badge>
              <TaskStatusButton t={t} onDone={reload} />
              <Button size="icon" variant="ghost" aria-label="Remove job" onClick={() => remove(t.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
