import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BadgeCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/shell/page-shell";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminAccess } from "@/lib/admin-access";
import { AdminErrorState, AdminPanelSkeleton } from "@/components/admin/admin-states";

export const Route = createFileRoute("/_authenticated/admin/event-claims")({
  component: EventClaims,
  head: () => ({
    meta: [
      { title: "Organizer claims · Admin · DG Dashboard" },
      { name: "description", content: "Review players claiming to organize imported events." },
      { property: "og:title", content: "Organizer claims · DG Dashboard" },
      { property: "og:description", content: "Review players claiming to organize imported events." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Status = "pending" | "approved" | "rejected";

function EventClaims() {
  const { isAdmin, checking } = useAdminAccess();
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const q = useQuery({
    queryKey: ["event-claims", status],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_claim_requests")
        .select("id, tournament_id, user_id, evidence, status, review_note, created_at, reviewed_at")
        .eq("status", status)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const rows = data ?? [];
      const uids = [...new Set(rows.map((r) => r.user_id))];
      const tids = [...new Set(rows.map((r) => r.tournament_id))];
      const [people, events] = await Promise.all([
        uids.length ? supabase.from("profiles").select("id, display_name, username").in("id", uids) : Promise.resolve({ data: [] as { id: string; display_name: string | null; username: string }[] }),
        tids.length ? supabase.from("tournaments").select("id, name, slug, imported_source, start_date").in("id", tids) : Promise.resolve({ data: [] as { id: string; name: string; slug: string; imported_source: string | null; start_date: string }[] }),
      ]);
      const names = new Map((people.data ?? []).map((p) => [p.id, p.display_name || p.username || "Player"]));
      const ev = new Map((events.data ?? []).map((e) => [e.id, e]));
      return rows.map((r) => ({ ...r, who: names.get(r.user_id) ?? "Player", event: ev.get(r.tournament_id) }));
    },
  });

  const review = useMutation({
    mutationFn: async (v: { id: string; approve: boolean }) => {
      const { error } = await supabase.rpc("review_event_claim", { _claim: v.id, _approve: v.approve, _note: notes[v.id] ?? "" });
      if (error) throw new Error("That claim didn't update. Refresh and try again.");
    },
    onSuccess: (_d, v) => {
      toast.success(v.approve ? "Approved — they now run this event." : "Claim declined.");
      void qc.invalidateQueries({ queryKey: ["event-claims"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (checking) return <AdminPanelSkeleton />;
  if (!isAdmin)
    return (
      <PageShell>
        <AdminErrorState message="Organizer claims are limited to admins." />
      </PageShell>
    );

  return (
    <PageShell>
      <PageHeader
        title="Organizer claims"
        description="Players asking to run events imported from other sites. Approve only with real evidence — approving makes them the owner."
        leading={<BadgeCheck className="h-5 w-5 text-primary" />}
      />
      <div role="tablist" className="flex w-fit gap-1 rounded-lg bg-muted p-0.5">
        {(["pending", "approved", "rejected"] as const).map((s) => (
          <button key={s} role="tab" aria-selected={status === s} onClick={() => setStatus(s)}
            className={"rounded-md px-3 py-1 text-sm font-medium " + (status === s ? "bg-background shadow-sm" : "text-muted-foreground")}>
            {s === "pending" ? "Waiting" : s === "approved" ? "Approved" : "Declined"}
          </button>
        ))}
      </div>
      {q.isLoading ? (
        <AdminPanelSkeleton />
      ) : q.isError ? (
        <AdminErrorState message="We couldn't load claims. Try again in a moment." />
      ) : !q.data?.length ? (
        <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {status === "pending" ? "No claims waiting." : "Nothing here yet."}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {q.data.map((r) => (
            <li key={r.id} className="space-y-2 p-3">
              <p className="text-sm">
                <span className="font-semibold">{r.who}</span>
                <span className="text-muted-foreground"> claims </span>
                {r.event ? (
                  <Link to="/tournaments/$slug" params={{ slug: r.event.slug }} className="font-semibold underline-offset-2 hover:underline">{r.event.name}</Link>
                ) : <span className="font-semibold">an event</span>}
                <span className="text-muted-foreground"> · {new Date(r.created_at).toLocaleDateString()}</span>
              </p>
              <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-2 text-sm">{r.evidence}</p>
              {status === "pending" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input className="min-w-48 flex-1" placeholder="Note to the player (why approved or declined)" maxLength={1000}
                    value={notes[r.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} />
                  <Button size="sm" onClick={() => review.mutate({ id: r.id, approve: true })} disabled={review.isPending}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => review.mutate({ id: r.id, approve: false })} disabled={review.isPending}>Decline</Button>
                </div>
              ) : r.review_note ? (
                <p className="text-sm text-muted-foreground">Note: {r.review_note}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
