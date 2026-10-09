import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { History, MessageSquarePlus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const ROLE_LABEL: Record<string, string> = {
  COURSE_ADMIN: "Course admin",
  STEWARD: "Steward",
  TRUSTED_CONTRIBUTOR: "Trusted contributor",
  CONTRIBUTOR: "Contributor",
};
const ACTION_LABEL: Record<string, string> = {
  INSERT: "added",
  UPDATE: "updated",
  DELETE: "removed",
  insert: "added",
  update: "updated",
  delete: "removed",
};

type Person = { id: string; username: string | null; display_name: string | null };

/** Who looks after this course, what changed recently, and a way to suggest a fix. */
export function CourseCommunityCard({ courseId, createdBy }: { courseId: string; createdBy: string }) {
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  const q = useQuery({
    queryKey: ["course-community", courseId],
    queryFn: async () => {
      const [stewards, history] = await Promise.all([
        (supabase as any).rpc("get_course_stewards", { _course: courseId }) as Promise<{ data: { user_id: string; role: string }[] | null; error: unknown }>,
        supabase
          .from("course_feature_history")
          .select("id, action, after_data, before_data, changed_by, created_at")
          .eq("course_id", courseId)
          .order("created_at", { ascending: false })
          .limit(8),
      ]);
      const ids = new Set<string>([createdBy]);
      for (const s of stewards.data ?? []) ids.add(s.user_id);
      for (const h of history.data ?? []) if (h.changed_by) ids.add(h.changed_by);
      const { data: people } = await supabase
        .from("profiles")
        .select("id, username, display_name")
        .in("id", [...ids]);
      return {
        stewards: stewards.data ?? [],
        history: history.data ?? [],
        people: new Map(((people ?? []) as Person[]).map((p) => [p.id, p])),
      };
    },
  });

  const suggest = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("signin");
      const { error } = await supabase.from("course_change_proposals").insert({
        course_id: courseId,
        kind: "edit",
        proposed_value: { note: note.trim() },
        reason: note.trim(),
        proposed_by: user.id,
        status: "pending",
        risk: "MEDIUM",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Thanks — a course steward will review your suggestion.");
      setOpen(false);
      setNote("");
    },
    onError: () => toast.error("Couldn't send your suggestion. Try again in a moment."),
  });

  const name = (id: string | null) => {
    if (!id) return "Someone";
    const p = q.data?.people.get(id);
    return p?.display_name || p?.username || "A player";
  };
  const featureName = (d: unknown) => {
    const x = (d ?? {}) as { type?: string; label?: string };
    return x.label || (x.type ? x.type.replace(/_/g, " ") : "map object");
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Who keeps this course up to date</h3>
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => setOpen(true)}>
          <MessageSquarePlus className="mr-1.5 h-4 w-4" /> Suggest a fix
        </Button>
      </div>
      <ul className="mt-2 flex flex-wrap gap-2 text-sm">
        <li className="flex items-center gap-1.5 rounded-lg bg-muted/50 px-2.5 py-1">
          <ShieldCheck className="h-4 w-4 text-primary" /> {name(createdBy)} · Course creator
        </li>
        {(q.data?.stewards ?? [])
          .filter((s) => s.user_id !== createdBy)
          .map((s) => (
            <li key={s.user_id} className="flex items-center gap-1.5 rounded-lg bg-muted/50 px-2.5 py-1">
              <ShieldCheck className="h-4 w-4 text-primary" /> {name(s.user_id)} · {ROLE_LABEL[s.role] ?? s.role}
            </li>
          ))}
      </ul>
      <div className="mt-4 flex items-center gap-1.5 text-sm font-semibold">
        <History className="h-4 w-4" /> Recent map changes
      </div>
      {q.data?.history.length ? (
        <ul className="mt-1.5 space-y-1 text-sm">
          {q.data.history.map((h) => (
            <li key={h.id} className="flex gap-2">
              <span className="text-muted-foreground tabular-nums">{new Date(h.created_at).toLocaleDateString()}</span>
              <span>
                {name(h.changed_by)} {ACTION_LABEL[h.action] ?? "changed"} {featureName(h.after_data ?? h.before_data)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-sm text-muted-foreground">No map changes recorded yet.</p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Suggest a fix</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tell the stewards what's wrong with the map — a moved basket, a missing tee, wrong par. Nothing changes until they review it.
          </p>
          <Textarea
            value={note}
            maxLength={1000}
            rows={4}
            placeholder="Hole 7's basket moved about 40 ft left of what the map shows."
            onChange={(e) => setNote(e.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={note.trim().length < 10 || suggest.isPending} onClick={() => suggest.mutate()}>
              Send to stewards
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
