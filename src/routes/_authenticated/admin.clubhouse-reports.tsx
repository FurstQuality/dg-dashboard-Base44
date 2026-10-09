import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/shell/page-shell";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { useAdminAccess } from "@/lib/admin-access";
import { AdminErrorState, AdminPanelSkeleton } from "@/components/admin/admin-states";

export const Route = createFileRoute("/_authenticated/admin/clubhouse-reports")({
  component: ClubhouseReports,
  head: () => ({
    meta: [
      { title: "Clubhouse reports · Admin · DG Dashboard" },
      { name: "description", content: "Review players reported in the Clubhouse and event rooms." },
      { property: "og:title", content: "Clubhouse reports · DG Dashboard" },
      { property: "og:description", content: "Review players reported in the Clubhouse and event rooms." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const REASONS: Record<string, string> = {
  harassment: "Harassment",
  spam: "Spam",
  inappropriate: "Inappropriate",
  other: "Something else",
};

function roomName(key: string) {
  if (key.includes("event")) return "Event clubhouse";
  if (key.includes("course")) return "Course lobby";
  return "Clubhouse";
}

function ClubhouseReports() {
  const { isAdmin, checking } = useAdminAccess();
  const qc = useQueryClient();
  const [status, setStatus] = useState<"open" | "reviewed" | "dismissed">("open");

  const q = useQuery({
    queryKey: ["clubhouse-reports", status],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubhouse_reports")
        .select("id, reporter_id, reported_user_id, room_key, reason, note, status, created_at")
        .eq("status", status)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const ids = [...new Set((data ?? []).flatMap((r) => [r.reporter_id, r.reported_user_id]))];
      const { data: people } = ids.length
        ? await supabase.from("profiles").select("id, display_name, username").in("id", ids)
        : { data: [] };
      const names = new Map((people ?? []).map((p) => [p.id, p.display_name || p.username || "Player"]));
      const counts = new Map<string, number>();
      for (const r of data ?? []) counts.set(r.reported_user_id, (counts.get(r.reported_user_id) ?? 0) + 1);
      return (data ?? []).map((r) => ({
        ...r,
        reporter: names.get(r.reporter_id) ?? "Player",
        reported: names.get(r.reported_user_id) ?? "Player",
        times: counts.get(r.reported_user_id) ?? 1,
      }));
    },
  });

  const set = useMutation({
    mutationFn: async (v: { id: string; status: "reviewed" | "dismissed" | "open" }) => {
      const { error } = await supabase.from("clubhouse_reports").update({ status: v.status }).eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["clubhouse-reports"] }),
    onError: () => toast.error("That report didn't update."),
  });

  if (checking) return <AdminPanelSkeleton />;
  if (!isAdmin)
    return (
      <PageShell>
        <AdminErrorState message="Clubhouse reports are limited to admins." />
      </PageShell>
    );

  return (
    <PageShell>
      <PageHeader
        title="Clubhouse reports"
        description="Players reported in the Clubhouse, course lobbies and event rooms. Chat isn't saved, so act on the pattern and the reporter's reason."
        leading={<Flag className="h-5 w-5 text-primary" />}
      />
      <div role="tablist" className="flex w-fit gap-1 rounded-lg bg-muted p-0.5">
        {(["open", "reviewed", "dismissed"] as const).map((s) => (
          <button key={s} role="tab" aria-selected={status === s} onClick={() => setStatus(s)}
            className={"rounded-md px-3 py-1 text-sm font-medium capitalize " + (status === s ? "bg-background shadow-sm" : "text-muted-foreground")}>
            {s === "open" ? "Waiting" : s}
          </button>
        ))}
      </div>
      {q.isLoading ? (
        <AdminPanelSkeleton />
      ) : q.isError ? (
        <AdminErrorState message="We couldn't load reports. Try again in a moment." />
      ) : !q.data?.length ? (
        <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {status === "open" ? "Nothing waiting. The Clubhouse is behaving." : "No reports here yet."}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {q.data.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-semibold">{r.reported}</span>
                  <span className="text-muted-foreground"> · {REASONS[r.reason] ?? r.reason} · {roomName(r.room_key)}</span>
                  {r.times > 1 ? <span className="ml-2 rounded bg-destructive/15 px-1.5 py-0.5 text-xs font-medium text-destructive">{r.times} reports</span> : null}
                </p>
                <p className="text-sm text-muted-foreground">
                  Reported by {r.reporter} · {new Date(r.created_at).toLocaleString()}
                </p>
                {r.note ? <p className="mt-1 text-sm">{r.note}</p> : null}
              </div>
              {status === "open" ? (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => set.mutate({ id: r.id, status: "reviewed" })}>Mark reviewed</Button>
                  <Button size="sm" variant="outline" onClick={() => set.mutate({ id: r.id, status: "dismissed" })}>Dismiss</Button>
                </div>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => set.mutate({ id: r.id, status: "open" })}>Reopen</Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
