import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Check, ShieldCheck, X } from "lucide-react";
import {
  listDirectorApplications,
  reviewDirectorApplication,
  type DirectorStatus,
} from "@/lib/director-application.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PageShell } from "@/components/shell/page-shell";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminPanelSkeleton,
} from "@/components/admin/admin-states";

export const Route = createFileRoute("/_authenticated/admin/directors")({
  component: AdminDirectorsPage,
  head: () => ({
    meta: [
      { title: "Event Director review · Admin · DG Dashboard" },
      {
        name: "description",
        content: "Approve, reject, or revoke Event Director access for tournament and league hosts.",
      },
      { property: "og:title", content: "Event Director review · Admin · DG Dashboard" },
      {
        property: "og:description",
        content: "Approve, reject, or revoke Event Director access for tournament and league hosts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const TABS: { value: DirectorStatus; label: string }[] = [
  { value: "pending", label: "Waiting on review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Not approved" },
  { value: "revoked", label: "Access removed" },
];

function AdminDirectorsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<DirectorStatus>("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const fetchApplications = useServerFn(listDirectorApplications);
  const review = useServerFn(reviewDirectorApplication);

  const q = useQuery({
    queryKey: ["admin-directors", tab],
    queryFn: () => fetchApplications({ data: { status: tab } }),
  });

  const mut = useMutation({
    mutationFn: (v: { user_id: string; status: DirectorStatus; notes?: string }) =>
      review({ data: v }),
    onSuccess: () => {
      toast.success("Director access updated");
      void qc.invalidateQueries({ queryKey: ["admin-directors"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <PageShell>
      <div className="mb-4 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
        <div>
          <h1 className="text-lg font-semibold">Event Director review</h1>
          <p className="text-sm text-muted-foreground">
            Only approved directors can create and manage tournaments and leagues.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as DirectorStatus)}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.value} value={t.value} className="mt-4 space-y-3">
            {q.isPending ? (
              <AdminPanelSkeleton />
            ) : q.isError ? (
              <AdminErrorState
                message={(q.error as Error).message}
                onRetry={() => void q.refetch()}
              />
            ) : (q.data?.rows.length ?? 0) === 0 ? (
              <AdminEmptyState
                title="Nothing here right now"
                message="New Event Director applications will show up in this list."
              />
            ) : (
              q.data!.rows.map((row) => {
                const profile = q.data!.profiles[row.user_id];
                const name = profile?.display_name ?? profile?.username ?? "Player";
                return (
                  <Card key={row.user_id}>
                    <CardHeader className="flex flex-row items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={profile?.avatar_url ?? undefined} alt="" />
                          <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <CardTitle className="truncate text-base">{name}</CardTitle>
                          <CardDescription className="truncate">
                            {row.org_name || "No organization given"}
                            {row.region ? ` · ${row.region}` : ""}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge variant="secondary">{row.status}</Badge>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {row.experience ? (
                        <p className="text-sm">
                          <span className="text-muted-foreground">Events run before: </span>
                          {row.experience}
                        </p>
                      ) : null}
                      {row.pitch ? (
                        <p className="text-sm">
                          <span className="text-muted-foreground">What they want to host: </span>
                          {row.pitch}
                        </p>
                      ) : null}
                      <Textarea
                        placeholder="Note back to the applicant (optional)"
                        value={notes[row.user_id] ?? ""}
                        onChange={(e) =>
                          setNotes((prev) => ({ ...prev, [row.user_id]: e.target.value }))
                        }
                        rows={2}
                      />
                      <div className="flex flex-wrap gap-2">
                        {row.status !== "approved" ? (
                          <Button
                            size="sm"
                            disabled={mut.isPending}
                            onClick={() =>
                              mut.mutate({
                                user_id: row.user_id,
                                status: "approved",
                                notes: notes[row.user_id] || undefined,
                              })
                            }
                          >
                            <Check className="mr-1 h-4 w-4" aria-hidden /> Approve
                          </Button>
                        ) : null}
                        {row.status !== "rejected" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={mut.isPending}
                            onClick={() =>
                              mut.mutate({
                                user_id: row.user_id,
                                status: "rejected",
                                notes: notes[row.user_id] || undefined,
                              })
                            }
                          >
                            <X className="mr-1 h-4 w-4" aria-hidden /> Not approved
                          </Button>
                        ) : null}
                        {row.status === "approved" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={mut.isPending}
                            onClick={() =>
                              mut.mutate({
                                user_id: row.user_id,
                                status: "revoked",
                                notes: notes[row.user_id] || undefined,
                              })
                            }
                          >
                            Remove access
                          </Button>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>
        ))}
      </Tabs>
    </PageShell>
  );
}
