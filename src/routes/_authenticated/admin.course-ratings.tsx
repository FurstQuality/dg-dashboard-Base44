import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, XCircle, ExternalLink, ShieldAlert } from "lucide-react";
import {
  listPendingCourseRatingProfiles,
  reviewCourseRatingProfile,
} from "@/lib/course-rating-profiles.functions";
import { PageShell } from "@/components/shell/page-shell";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/lib/current-user";
import { useAdminAccess } from "@/lib/admin-access";
import {
  AdminErrorState,
  AdminPanelSkeleton,
  AdminEmptyState,
} from "@/components/admin/admin-states";

export const Route = createFileRoute("/_authenticated/admin/course-ratings")({
  component: AdminCourseRatingsPage,
  head: () => ({
    meta: [
      { title: "Course rating profiles · Admin · DG Dashboard" },
      {
        name: "description",
        content: "Review and approve PDGA course rating profile submissions.",
      },
      { property: "og:title", content: "Course rating profiles · Admin · DG Dashboard" },
      {
        property: "og:description",
        content: "Review and approve PDGA course rating profile submissions.",
      },
    ],
  }),
});

function AdminCourseRatingsPage() {
  const { user, loading } = useSession();
  const { isAdmin } = useAdminAccess();

  if (loading) return null;
  if (!user || !isAdmin) {
    return (
      <PageShell>
        <PageHeader
          title="Admin only"
          description="You need super admin access to review course rating profiles."
        />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4" />
          Access denied.
        </div>
      </PageShell>
    );
  }
  return <ReviewList />;
}

function ReviewList() {
  const listFn = useServerFn(listPendingCourseRatingProfiles);
  const query = useQuery({
    queryKey: ["admin", "course-rating-profiles", "pending"],
    queryFn: () => listFn(),
  });
  const rows = query.data ?? [];

  return (
    <PageShell>
      <PageHeader
        title="Course rating profiles"
        description="Approve submissions to lock in the official PDGA rating profile for each course."
      />
      {query.isError ? (
        <AdminErrorState
          title="We couldn't load the rating submissions"
          message="The review queue didn't come back. Try again in a moment."
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.isPending ? (
        <AdminPanelSkeleton rows={3} />
      ) : !rows.length ? (
        <AdminEmptyState
          title="Nothing waiting for review"
          message="When someone submits SSA and stroke values for a course, the submission lands here for you to approve or send back."
        />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <ProfileCard key={r.id} row={r as unknown as Row} />
          ))}
        </div>
      )}
    </PageShell>
  );
}

type Row = {
  id: string;
  course_id: string | null;
  course_name: string;
  pdga_course_name: string | null;
  pdga_course_url: string | null;
  ssa: number;
  stroke_value: number;
  par_total: number | null;
  sample_size: number;
  event_refs: string[];
  round_summaries: Array<{
    round: number;
    ssa: number | null;
    stroke_value: number | null;
    winning_score: number | null;
    winning_rating: number | null;
    n: number;
  }>;
  notes: string | null;
  submitted_by: string;
  created_at: string;
};

function ProfileCard({ row }: { row: Row }) {
  const reviewFn = useServerFn(reviewCourseRatingProfile);
  const qc = useQueryClient();
  const [reason, setReason] = useState("");

  const approve = useMutation({
    mutationFn: () => reviewFn({ data: { id: row.id, action: "approve" } } as never),
    onSuccess: () => {
      toast.success("Approved & locked as the official rating profile.");
      qc.invalidateQueries({ queryKey: ["admin", "course-rating-profiles"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Failed."),
  });
  const reject = useMutation({
    mutationFn: () =>
      reviewFn({
        data: { id: row.id, action: "reject", rejection_reason: reason.trim() || undefined },
      } as never),
    onSuccess: () => {
      toast.success("Rejected.");
      qc.invalidateQueries({ queryKey: ["admin", "course-rating-profiles"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Failed."),
  });

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{row.course_name}</div>
          {row.pdga_course_name ? (
            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              PDGA:{" "}
              {row.pdga_course_url ? (
                <a
                  href={row.pdga_course_url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline inline-flex items-center gap-1"
                >
                  {row.pdga_course_name} <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                row.pdga_course_name
              )}
            </div>
          ) : null}
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Submitted {new Date(row.created_at).toLocaleString()}
            {!row.course_id ? " · not linked to internal course" : ""}
          </div>
        </div>
        <Badge variant="outline">pending</Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm rounded-md border bg-muted/30 p-3">
        <Stat label="SSA" value={Number(row.ssa).toFixed(1)} />
        <Stat label="Stroke value" value={Number(row.stroke_value).toFixed(1)} />
        <Stat label="Par" value={row.par_total?.toString() ?? "—"} />
        <Stat label="Rounds" value={String(row.sample_size)} />
        <Stat label="Events" value={String(row.event_refs?.length ?? 0)} />
      </div>

      {row.round_summaries?.length ? (
        <div className="rounded-md border p-2 text-xs">
          <div className="font-medium mb-1">Per-round summaries</div>
          <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr] gap-x-3 gap-y-0.5">
            <div className="text-[10px] uppercase text-muted-foreground">Round</div>
            <div className="text-[10px] uppercase text-muted-foreground">SSA</div>
            <div className="text-[10px] uppercase text-muted-foreground">Stroke value</div>
            <div className="text-[10px] uppercase text-muted-foreground">Winning score</div>
            <div className="text-[10px] uppercase text-muted-foreground">Players</div>
            {row.round_summaries.map((s, i) => (
              <div key={i} className="contents">
                <div className="tabular-nums">R{s.round}</div>
                <div className="tabular-nums">{s.ssa ?? "—"}</div>
                <div className="tabular-nums">{s.stroke_value ?? "—"}</div>
                <div className="tabular-nums">
                  {s.winning_score ?? "—"}
                  {s.winning_rating != null ? (
                    <span className="text-muted-foreground"> ({s.winning_rating})</span>
                  ) : null}
                </div>
                <div className="tabular-nums">{s.n}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {row.event_refs?.length ? (
        <div className="text-xs">
          <div className="font-medium mb-1">Source PDGA events</div>
          <div className="flex flex-wrap gap-1.5">
            {row.event_refs.map((ref) => (
              <a
                key={ref}
                href={`https://www.pdga.com/tour/event/${ref}`}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] rounded border px-1.5 py-0.5 hover:bg-muted inline-flex items-center gap-1"
              >
                {ref} <ExternalLink className="h-3 w-3" />
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {row.notes ? (
        <div className="text-xs">
          <div className="font-medium">Submitter notes</div>
          <div className="text-muted-foreground">{row.notes}</div>
        </div>
      ) : null}

      <div className="border-t pt-3 space-y-2">
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Rejection reason (optional)"
          rows={2}
          className="text-xs"
        />
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => reject.mutate()}
            disabled={reject.isPending}
          >
            <XCircle className="h-3.5 w-3.5 mr-1" />
            Reject
          </Button>
          <Button size="sm" onClick={() => approve.mutate()} disabled={approve.isPending}>
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            Approve & lock
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}
