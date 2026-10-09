/**
 * Admin: Revert Request Queue.
 *
 * Owner-initiated reverts land here for admin review.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageShell } from "@/components/shell/page-shell";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  listRevertRequests,
  reviewRevertRequest,
  ENTITY_LABELS,
} from "@/lib/entity-editor.functions";
import { useSession } from "@/lib/current-user";
import { useAdminAccess } from "@/lib/admin-access";
import { ShieldAlert, Check, X, ExternalLink } from "lucide-react";
import {
  AdminErrorState,
  AdminPanelSkeleton,
  AdminEmptyState,
} from "@/components/admin/admin-states";

export const Route = createFileRoute("/_authenticated/admin/revert-queue")({
  component: RevertQueuePage,
  head: () => ({
    meta: [
      { title: "Revert queue · Admin · DG Dashboard" },
      {
        name: "description",
        content: "Approve or reject owner-initiated revert requests across the platform.",
      },
      { property: "og:title", content: "Revert queue · Admin · DG Dashboard" },
      {
        property: "og:description",
        content: "Approve or reject owner-initiated revert requests across the platform.",
      },
    ],
  }),
});

function RevertQueuePage() {
  const { user, loading } = useSession();
  const { isAdmin } = useAdminAccess();
  const qc = useQueryClient();
  const $list = useServerFn(listRevertRequests);
  const $review = useServerFn(reviewRevertRequest);

  const listQ = useQuery({
    queryKey: ["revert-queue"],
    queryFn: () => $list(),
    enabled: !!user && isAdmin,
  });

  const mut = useMutation({
    mutationFn: (vars: { request_id: string; decision: "approved" | "rejected" }) =>
      $review({ data: vars }),
    onSuccess: () => {
      toast.success("Request reviewed.");
      qc.invalidateQueries({ queryKey: ["revert-queue"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Review failed."),
  });

  if (loading) return null;
  if (!user || !isAdmin) {
    return (
      <PageShell>
        <PageHeader title="Admin only" description="Super admin access required." />
        <div className="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4" />
          Access denied.
        </div>
      </PageShell>
    );
  }

  const rows = (listQ.data as any[]) ?? [];
  const pending = rows.filter((r) => r.status === "pending");
  const reviewed = rows.filter((r) => r.status !== "pending");

  return (
    <PageShell>
      <PageHeader
        title="Revert queue"
        description="Owner-initiated revert requests waiting on admin review. Approving applies the revert immediately."
        eyebrow="Super admin"
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Pending ({pending.length})
        </h2>
        {listQ.isError ? (
          <AdminErrorState
            title="We couldn't load the revert queue"
            message="The requests didn't come back. Try again in a moment."
            onRetry={() => void listQ.refetch()}
            retrying={listQ.isFetching}
          />
        ) : listQ.isPending ? (
          <AdminPanelSkeleton rows={2} />
        ) : pending.length === 0 ? (
          <AdminEmptyState
            title="Nothing waiting on review"
            message="When an event owner asks to roll back a change, the request shows up here for approval."
          />
        ) : (
          <div className="grid gap-3">
            {pending.map((r) => (
              <RequestCard
                key={r.id}
                row={r}
                onApprove={() => mut.mutate({ request_id: r.id, decision: "approved" })}
                onReject={() => mut.mutate({ request_id: r.id, decision: "rejected" })}
                busy={mut.isPending}
              />
            ))}
          </div>
        )}
      </section>

      {reviewed.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Recently reviewed
          </h2>
          <div className="grid gap-2">
            {reviewed.slice(0, 20).map((r) => (
              <RequestCard key={r.id} row={r} readOnly />
            ))}
          </div>
        </section>
      ) : null}
    </PageShell>
  );
}

function RequestCard({
  row,
  onApprove,
  onReject,
  busy,
  readOnly,
}: {
  row: any;
  onApprove?: () => void;
  onReject?: () => void;
  busy?: boolean;
  readOnly?: boolean;
}) {
  const statusColor =
    row.status === "approved"
      ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/40"
      : row.status === "rejected"
        ? "bg-destructive/10 text-destructive border-destructive/40"
        : "bg-amber-500/15 text-amber-600 border-amber-500/40";
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="outline">
              {ENTITY_LABELS[row.entity_type as keyof typeof ENTITY_LABELS]}
            </Badge>
            <Badge className={statusColor} variant="outline">
              {row.status}
            </Badge>
            <Link
              to="/edit"
              search={{ type: row.entity_type, id: row.entity_id }}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Open record <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Requested by {row.requester?.display_name ?? "unknown"} ·{" "}
            {new Date(row.created_at).toLocaleString()}
          </div>
          {row.review_note ? (
            <div className="mt-1 text-sm text-muted-foreground">"{row.review_note}"</div>
          ) : null}
          {row.reviewer ? (
            <div className="mt-1 text-xs text-muted-foreground">
              Reviewed by {row.reviewer.display_name} on{" "}
              {row.reviewed_at ? new Date(row.reviewed_at).toLocaleString() : ""}
            </div>
          ) : null}
        </div>
        {!readOnly ? (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onReject} disabled={busy}>
              <X className="mr-1 h-4 w-4" /> Reject
            </Button>
            <Button size="sm" onClick={onApprove} disabled={busy}>
              <Check className="mr-1 h-4 w-4" /> Approve & revert
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
