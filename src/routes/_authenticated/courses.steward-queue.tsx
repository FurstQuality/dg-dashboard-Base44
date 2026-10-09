import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, PageHeader } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { REPORT_KIND_LABEL, SEVERITY_LABEL } from "@/lib/rewards";

export const Route = createFileRoute("/_authenticated/courses/steward-queue")({
  head: () => ({
    meta: [
      { title: "Course work queue · DG Dashboard" },
      { name: "description", content: "Open condition reports on the courses you look after — confirm, schedule, fix or dismiss them." },
      { property: "og:title", content: "Course work queue · DG Dashboard" },
      { property: "og:description", content: "Open condition reports on the courses you look after." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StewardQueuePage,
});

type QueueRow = {
  id: string;
  course_id: string;
  hole_number: number | null;
  kind: string;
  severity: string;
  description: string | null;
  lifecycle: string;
  confirm_count: number;
  created_at: string;
  courses: { name: string; city: string | null; state: string | null } | null;
};

const LIFECYCLE_LABEL: Record<string, string> = {
  REPORTED: "New",
  NEEDS_CONFIRMATION: "Needs a look",
  CONFIRMED: "Confirmed",
  PLANNED: "Planned",
  IN_PROGRESS: "Being fixed",
  POSSIBLY_RESOLVED: "Maybe fixed",
};

const ACTIONS: { state: string; label: string }[] = [
  { state: "CONFIRMED", label: "Confirm" },
  { state: "PLANNED", label: "Plan fix" },
  { state: "IN_PROGRESS", label: "Fixing now" },
  { state: "RESOLVED", label: "Fixed" },
  { state: "DISMISSED", label: "Dismiss" },
];

function StewardQueuePage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "blocking">("all");
  const { data, isLoading } = useQuery({
    queryKey: ["steward-queue"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return { rows: [] as QueueRow[], courseCount: 0 };
      const [{ data: mine }, { data: a }, { data: sa }] = await Promise.all([
        supabase.from("course_stewards").select("course_id").eq("user_id", uid),
        supabase.rpc("has_role", { _user_id: uid, _role: "admin" }),
        supabase.rpc("has_role", { _user_id: uid, _role: "super_admin" }),
      ]);
      const admin = Boolean(a || sa);
      const ids = [...new Set((mine ?? []).map((m) => m.course_id))];
      if (!ids.length && !admin) return { rows: [] as QueueRow[], courseCount: 0 };
      let q = supabase
        .from("course_reports")
        .select("id, course_id, hole_number, kind, severity, description, lifecycle, confirm_count, created_at, courses(name, city, state)");
      // Admins look after every course, so they see the whole country's queue.
      if (!admin) q = q.in("course_id", ids.slice(0, 300));
      const { data: rows } = await q
        .is("archived_at", null)
        .not("lifecycle", "in", "(RESOLVED,DISMISSED,EXPIRED)")
        .order("created_at", { ascending: true })
        .limit(300);
      const list = (rows ?? []) as unknown as QueueRow[];
      return { rows: list, courseCount: admin ? new Set(list.map((r) => r.course_id)).size || 1 : ids.length, admin };
    },
  });

  const act = useMutation({
    mutationFn: async (v: { id: string; state: string }) => {
      const { error } = await supabase.rpc("set_course_report_state", { _report: v.id, _state: v.state } as never);
      if (error) throw new Error("Couldn't update that report. Try again.");
    },
    onSuccess: () => {
      toast.success("Report updated.");
      void qc.invalidateQueries({ queryKey: ["steward-queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (data?.rows ?? [])
    .filter((r) => filter === "all" || r.severity === "blocking")
    .sort((a, b) => Number(b.severity === "blocking") - Number(a.severity === "blocking"));

  return (
    <PageShell section="courses">
      <PageHeader
        title="Course work queue"
        description="Open condition reports on the courses you look after. Blocking issues come first."
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>All open</Button>
        <Button size="sm" variant={filter === "blocking" ? "default" : "outline"} onClick={() => setFilter("blocking")}>Blocks play</Button>
        {data ? (
          <span className="text-sm text-muted-foreground">
            {rows.length} open · {"admin" in data && data.admin ? "all courses (admin)" : `${data.courseCount} ${data.courseCount === 1 ? "course" : "courses"} you look after`}
          </span>
        ) : null}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading your queue…</p>
      ) : !data?.courseCount ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          You're not a steward for any course yet. Stewards keep a course's map and conditions up to date.
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nothing waiting. Your courses are clear as far as players have told us.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl border border-border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <TriangleAlert className={r.severity === "blocking" ? "h-4 w-4 text-destructive" : "h-4 w-4 text-warning"} aria-hidden />
                <span className="font-semibold">{REPORT_KIND_LABEL[r.kind] ?? "Course note"}</span>
                {r.hole_number ? <Badge variant="outline">Hole {r.hole_number}</Badge> : null}
                <Badge variant="secondary">{SEVERITY_LABEL[r.severity] ?? r.severity}</Badge>
                <Badge variant="outline">{LIFECYCLE_LABEL[r.lifecycle] ?? r.lifecycle}</Badge>
                <span className="text-muted-foreground">{r.confirm_count} confirmations</span>
              </div>
              <p className="mt-1 text-sm">
                <Link to="/courses/$courseId" params={{ courseId: r.course_id }} className="text-primary hover:underline">
                  {r.courses?.name ?? "Course"}
                </Link>
                <span className="text-muted-foreground">
                  {r.courses?.city ? ` · ${[r.courses.city, r.courses.state].filter(Boolean).join(", ")}` : ""} · reported{" "}
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </p>
              {r.description ? <p className="mt-1 text-sm text-muted-foreground">{r.description}</p> : null}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ACTIONS.filter((a) => a.state !== r.lifecycle).map((a) => (
                  <Button
                    key={a.state}
                    size="sm"
                    variant={a.state === "RESOLVED" ? "default" : a.state === "DISMISSED" ? "ghost" : "outline"}
                    disabled={act.isPending}
                    onClick={() => act.mutate({ id: r.id, state: a.state })}
                  >
                    {a.label}
                  </Button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
