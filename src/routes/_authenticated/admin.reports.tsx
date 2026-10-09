import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";
import { useAdminAccess } from "@/lib/admin-access";
import { PageShell } from "@/components/shell/page-shell";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle2, EyeOff, Flag, ShieldAlert, ExternalLink } from "lucide-react";
import { REPORT_REASONS } from "@/components/feed/post-moderation-menu";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  component: AdminReportsPage,
  head: () => ({
    meta: [
      { title: "Post reports · Admin · DG Dashboard" },
      {
        name: "description",
        content: "Review reported feed posts, hide content, and close reports.",
      },
      { property: "og:title", content: "Post reports · Admin · DG Dashboard" },
      { property: "og:description", content: "Review reported feed posts and resolve reports." },
    ],
  }),
});

type ReportRow = {
  id: string;
  post_id: string;
  reporter_id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  resolution: string | null;
  reviewer_note: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  reviewer_name?: string | null;
  post?: { body: string | null; author_id: string; hidden_at: string | null } | null;
};

function reasonLabel(value: string) {
  return REPORT_REASONS.find((r) => r.value === value)?.label ?? value;
}

function AdminReportsPage() {
  const { user } = useSession();
  const { isAdmin } = useAdminAccess();
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [status, setStatus] = useState<"open" | "resolved">("open");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    const { data } = await supabase
      .from("post_reports")
      .select(
        "id, post_id, reporter_id, reason, details, status, created_at, resolution, reviewer_note, resolved_at, resolved_by",
      )
      .eq("status", status)
      .order("created_at", { ascending: false })
      .limit(200);
    const reports = (data ?? []) as ReportRow[];
    if (reports.length) {
      const { data: posts } = await supabase
        .from("posts")
        .select("id, body, author_id, hidden_at")
        .in("id", [...new Set(reports.map((r) => r.post_id))]);
      const map = new Map((posts ?? []).map((p) => [p.id, p]));
      for (const r of reports) r.post = (map.get(r.post_id) ?? null) as ReportRow["post"];

      const reviewerIds = [...new Set(reports.map((r) => r.resolved_by).filter(Boolean))];
      if (reviewerIds.length) {
        const { data: reviewers } = await supabase
          .from("profiles")
          .select("id, display_name, username")
          .in("id", reviewerIds as string[]);
        const rmap = new Map(
          (reviewers ?? []).map((p) => [p.id, p.display_name || p.username || "Reviewer"]),
        );
        for (const r of reports)
          r.reviewer_name = r.resolved_by ? (rmap.get(r.resolved_by) ?? null) : null;
      }
    }
    setRows(reports);
  }, [status]);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  async function resolve(id: string, hidePost: boolean) {
    setBusy(id);
    const { error } = await supabase.rpc("resolve_post_report", {
      _report_id: id,
      _hide: hidePost,
      _note: notes[id]?.trim() || undefined,
    });
    setBusy(null);
    if (error) return toast.error("We couldn't close that report.");
    toast.success(hidePost ? "Post hidden and report closed." : "Report closed.");
    void load();
  }

  if (!isAdmin) {
    return (
      <PageShell>
        <PageHeader eyebrow="Admin" title="Post reports" description="Admin access required." />
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4" /> You need admin access to review reported posts.
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Admin"
        title="Post reports"
        description="Review reported feed posts, hide anything that breaks the rules, and close the report."
        primaryAction={
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant={status === "open" ? "default" : "outline"}
              onClick={() => setStatus("open")}
            >
              Open
            </Button>
            <Button
              size="sm"
              variant={status === "resolved" ? "default" : "outline"}
              onClick={() => setStatus("resolved")}
            >
              Resolved
            </Button>
          </div>
        }
      />

      {rows === null ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {status === "open"
            ? "Nothing needs review right now."
            : "No reports have been closed yet."}
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 font-medium text-foreground">
                  <Flag className="h-3.5 w-3.5 text-destructive" /> {reasonLabel(r.reason)}
                </span>
                <span>·</span>
                <span>{new Date(r.created_at).toLocaleString()}</span>
                {r.post?.hidden_at ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                    <EyeOff className="h-3 w-3" /> Hidden
                  </span>
                ) : null}
              </div>
              {r.details ? <p className="mt-2 text-sm">{r.details}</p> : null}
              <p className="mt-2 line-clamp-3 rounded-lg bg-muted/40 p-2 text-sm">
                {r.post?.body ?? "This post has no text content."}
              </p>
              {r.status === "open" ? (
                <Textarea
                  value={notes[r.id] ?? ""}
                  onChange={(e) => setNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
                  placeholder="Optional note for the record — what you decided and why."
                  rows={2}
                  className="mt-3 text-sm"
                />
              ) : (
                <div className="mt-3 rounded-lg border border-border/70 bg-muted/30 p-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {r.resolution === "hidden" ? "Post hidden" : "Post kept"}
                  </span>{" "}
                  by {r.reviewer_name ?? "an admin"}
                  {r.resolved_at ? ` on ${new Date(r.resolved_at).toLocaleString()}` : ""}
                  {r.reviewer_note ? (
                    <span className="mt-1 block text-foreground">“{r.reviewer_note}”</span>
                  ) : null}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/p/$postId" params={{ postId: r.post_id }}>
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> View post
                  </Link>
                </Button>
                {r.status === "open" ? (
                  <>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy === r.id}
                      onClick={() => void resolve(r.id, true)}
                    >
                      <EyeOff className="mr-1.5 h-3.5 w-3.5" /> Hide post and close
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy === r.id}
                      onClick={() => void resolve(r.id, false)}
                    >
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Keep post and close
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
