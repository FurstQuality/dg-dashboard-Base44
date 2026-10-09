import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { listCreatorApplications, reviewCreatorApplication } from "@/lib/creator-studio.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, X, ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PageShell } from "@/components/shell/page-shell";
import {
  AdminErrorState,
  AdminPanelSkeleton,
  AdminEmptyState,
} from "@/components/admin/admin-states";

export const Route = createFileRoute("/_authenticated/admin/creators")({
  component: AdminCreatorsPage,
  head: () => ({
    meta: [
      { title: "Creator review · Admin · DG Dashboard" },
      {
        name: "description",
        content: "Review creator applications, tiers, and ambassador status.",
      },
      { property: "og:title", content: "Creator review · Admin · DG Dashboard" },
      {
        property: "og:description",
        content: "Review creator applications, tiers, and ambassador status.",
      },
    ],
  }),
});

function AdminCreatorsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");
  const fetch = useServerFn(listCreatorApplications);
  const review = useServerFn(reviewCreatorApplication);
  const q = useQuery({
    queryKey: ["admin-creators", tab],
    queryFn: () => fetch({ data: { status: tab } }),
  });

  const mut = useMutation({
    mutationFn: (v: { user_id: string; status: any; tier?: any; notes?: string }) =>
      review({ data: v }),
    onSuccess: () => {
      toast.success("Application updated");
      qc.invalidateQueries({ queryKey: ["admin-creators"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const rows = q.data?.rows ?? [];
  const profiles = q.data?.profiles ?? {};

  return (
    <PageShell>
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">Creator applications</h1>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="pt-4 space-y-3">
          {q.isError ? (
            <AdminErrorState
              title="We couldn't load creator applications"
              message="The list didn't come back. Try again in a moment."
              onRetry={() => void q.refetch()}
              retrying={q.isFetching}
            />
          ) : q.isPending ? (
            <AdminPanelSkeleton rows={3} />
          ) : rows.length === 0 ? (
            <AdminEmptyState
              title={`No ${tab} applications`}
              message={
                tab === "pending"
                  ? "Nothing to review right now. New creator applications show up here as soon as they're submitted."
                  : `No applications have been ${tab} yet.`
              }
            />
          ) : (
            rows.map((r) => (
              <ApplicationCard
                key={r.user_id}
                row={r}
                profile={profiles[r.user_id]}
                onDecide={mut.mutate}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function ApplicationCard({ row, profile, onDecide }: any) {
  const [notes, setNotes] = useState<string>(row.reviewer_notes ?? "");
  const [tier, setTier] = useState<string>("creator");
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <Avatar>
            <AvatarImage src={profile?.avatar_url ?? undefined} />
            <AvatarFallback>{(profile?.display_name ?? "?").slice(0, 1)}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <CardTitle className="text-base">{profile?.display_name ?? "Unknown"}</CardTitle>
            <CardDescription>
              @{profile?.username ?? "—"} · applied{" "}
              {row.applied_at ? new Date(row.applied_at).toLocaleDateString() : "—"}
            </CardDescription>
            <div className="mt-1 flex flex-wrap gap-1">
              <Badge variant="outline">{row.tier}</Badge>
              <Badge
                variant={
                  row.status === "approved"
                    ? "default"
                    : row.status === "rejected"
                      ? "destructive"
                      : "secondary"
                }
              >
                {row.status}
              </Badge>
              {row.is_verified ? (
                <Badge className="bg-primary/15 text-primary border-primary/30" variant="outline">
                  Verified
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {row.headline ? (
          <div>
            <span className="text-xs text-muted-foreground">Headline: </span>
            {row.headline}
          </div>
        ) : null}
        {row.bio ? (
          <p className="text-sm">
            <span className="text-xs text-muted-foreground block">Bio</span>
            {row.bio}
          </p>
        ) : null}
        {row.pitch ? (
          <p className="text-sm">
            <span className="text-xs text-muted-foreground block">Pitch</span>
            {row.pitch}
          </p>
        ) : null}
        {row.monthly_reach ? (
          <p className="text-sm text-muted-foreground">
            Monthly reach: {row.monthly_reach.toLocaleString()}
          </p>
        ) : null}
        {row.content_pillars?.length ? (
          <div className="flex flex-wrap gap-1">
            {row.content_pillars.map((p: string) => (
              <Badge key={p} variant="secondary">
                {p}
              </Badge>
            ))}
          </div>
        ) : null}
        {row.external_links?.length ? (
          <ul className="text-sm space-y-0.5">
            {row.external_links.map((l: any, i: number) => (
              <li key={i}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="pt-3 border-t space-y-2">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Reviewer notes (optional)"
          />
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={tier} onValueChange={setTier}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="creator">Creator</SelectItem>
                <SelectItem value="ambassador">Ambassador</SelectItem>
                <SelectItem value="partner">Partner</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={() => onDecide({ user_id: row.user_id, status: "approved", tier, notes })}
            >
              <Check className="h-4 w-4 mr-1" /> Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onDecide({ user_id: row.user_id, status: "rejected", notes })}
            >
              <X className="h-4 w-4 mr-1" /> Reject
            </Button>
            {row.status === "approved" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onDecide({ user_id: row.user_id, status: "revoked", notes })}
              >
                Revoke
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
