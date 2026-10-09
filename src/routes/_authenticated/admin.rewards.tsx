import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Gift, ShieldCheck } from "lucide-react";
import { PageShell } from "@/components/shell/page-shell";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminPanelSkeleton,
} from "@/components/admin/admin-states";
import { decideContribution, decideRedemption, getRewardAdminQueue } from "@/lib/rewards.functions";
import { VERIFICATIONS_REQUIRED, contributionLabel } from "@/lib/rewards";

export const Route = createFileRoute("/_authenticated/admin/rewards")({
  component: AdminRewardsPage,
  head: () => ({
    meta: [
      { title: "Contributor rewards · Admin · DG Dashboard" },
      {
        name: "description",
        content: "Approve contributor work and grant free months earned through course building.",
      },
      { property: "og:title", content: "Contributor rewards · Admin · DG Dashboard" },
      {
        property: "og:description",
        content: "Approve contributor work and grant earned free months.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function AdminRewardsPage() {
  const queryClient = useQueryClient();
  const fetchQueue = useServerFn(getRewardAdminQueue);
  const decideReward = useServerFn(decideRedemption);
  const decideWork = useServerFn(decideContribution);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: ["admin-reward-queue"],
    queryFn: () => fetchQueue(),
    staleTime: 15_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-reward-queue"] });

  const rewardMutation = useMutation({
    mutationFn: (input: { id: string; decision: "grant" | "reject" }) =>
      decideReward({ data: { ...input, review_note: notes[input.id] || null } }),
    onSuccess: () => {
      toast.success("Decision saved.");
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const workMutation = useMutation({
    mutationFn: (input: { id: string; status: "verified" | "rejected" }) =>
      decideWork({ data: { ...input, review_note: notes[input.id] || null } }),
    onSuccess: () => {
      toast.success("Decision saved.");
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (query.isLoading) {
    return (
      <PageShell>
        <AdminPanelSkeleton />
      </PageShell>
    );
  }

  if (query.error) {
    return (
      <PageShell>
        <AdminErrorState
          message="This page is limited to admins. If that's you, reload and try again."
          onRetry={() => void query.refetch()}
        />
      </PageShell>
    );
  }

  const redemptions = query.data?.redemptions ?? [];
  const contributions = query.data?.contributions ?? [];

  return (
    <PageShell>
      <PageHeader
        title="Contributor rewards"
        description="Grant free months for verified course work and settle any contributions the community could not agree on."
        shareable={false}
      />

      <Tabs defaultValue="redemptions">
        <TabsList>
          <TabsTrigger value="redemptions">Reward requests ({redemptions.length})</TabsTrigger>
          <TabsTrigger value="contributions">Open contributions ({contributions.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="redemptions" className="mt-4 space-y-3">
          {redemptions.length === 0 ? (
            <AdminEmptyState title="Nothing to approve" message="No reward requests are waiting right now." />
          ) : (
            redemptions.map((row) => (
              <Card key={row.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    <Gift className="h-4 w-4" />
                    {row.player_name ?? "Player"} · {row.months_requested} month
                    {row.months_requested === 1 ? "" : "s"} of{" "}
                    {row.tier_key === "elite" ? "Elite" : "Pro"}
                    <Badge variant="secondary">{row.points_spent} pts</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {row.note ? <p className="text-sm text-muted-foreground">{row.note}</p> : null}
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                    <Input
                      placeholder="Note back to the player (optional)"
                      value={notes[row.id] ?? ""}
                      onChange={(e) => setNotes((p) => ({ ...p, [row.id]: e.target.value }))}
                    />
                    <Button
                      size="sm"
                      disabled={rewardMutation.isPending}
                      onClick={() => rewardMutation.mutate({ id: row.id, decision: "grant" })}
                    >
                      Grant months
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={rewardMutation.isPending}
                      onClick={() => rewardMutation.mutate({ id: row.id, decision: "reject" })}
                    >
                      Turn down
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="contributions" className="mt-4 space-y-3">
          {contributions.length === 0 ? (
            <AdminEmptyState title="All caught up" message="No contributions are stuck in community review." />
          ) : (
            contributions.map((row) => (
              <Card key={row.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    <ShieldCheck className="h-4 w-4" />
                    {contributionLabel(row.kind)}
                    <Badge variant="secondary">{row.points} pts</Badge>
                    <Badge variant="outline">
                      {row.approve_count} of {VERIFICATIONS_REQUIRED} approvals
                      {row.reject_count ? ` · ${row.reject_count} declined` : ""}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm">{row.summary}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.player_name ?? "Player"} ·{" "}
                    {new Date(row.created_at).toLocaleDateString()}
                    {row.course_name ? ` · ${row.course_name}` : ""}
                    {row.evidence_url ? ` · ${row.evidence_url}` : ""}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                    <Input
                      placeholder="Note for the contributor (optional)"
                      value={notes[row.id] ?? ""}
                      onChange={(e) => setNotes((p) => ({ ...p, [row.id]: e.target.value }))}
                    />
                    <Button
                      size="sm"
                      disabled={workMutation.isPending}
                      onClick={() => workMutation.mutate({ id: row.id, status: "verified" })}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={workMutation.isPending}
                      onClick={() => workMutation.mutate({ id: row.id, status: "rejected" })}
                    >
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
