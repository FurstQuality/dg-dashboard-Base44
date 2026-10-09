import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listDrafts,
  publishDraftNow,
  archiveDraft,
  deleteDraft,
} from "@/lib/creator-studio.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Send, Archive, Trash2, PenSquare, ExternalLink, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/studio/calendar")({
  component: CalendarPage,
  head: () => ({
    meta: [
      { title: "Content calendar · Creator Studio · DG Dashboard" },
      { name: "description", content: "Plan and schedule your content across the month." },
      { property: "og:title", content: "Content calendar · Creator Studio · DG Dashboard" },
      { property: "og:description", content: "Plan and schedule your content across the month." },
    ],
  }),
});

function CalendarPage() {
  const qc = useQueryClient();
  const fetch = useServerFn(listDrafts);
  const publish = useServerFn(publishDraftNow);
  const archive = useServerFn(archiveDraft);
  const del = useServerFn(deleteDraft);
  const [tab, setTab] = useState("scheduled");

  const q = useQuery({
    queryKey: ["drafts-cal"],
    queryFn: () => fetch({ data: { status: "all" } }),
  });
  const rows = q.data?.rows ?? [];

  const drafts = rows.filter((r) => r.status === "draft");
  const scheduled = rows
    .filter((r) => r.status === "scheduled")
    .sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""));
  const published = rows
    .filter((r) => r.status === "published")
    .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
  const failed = rows.filter((r) => r.status === "failed");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["drafts-cal"] });

  const publishMut = useMutation({
    mutationFn: (id: string) => publish({ data: { id } }),
    onSuccess: () => {
      toast.success("Published");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const archiveMut = useMutation({
    mutationFn: (id: string) => archive({ data: { id } }),
    onSuccess: () => {
      toast.success("Archived");
      invalidate();
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      invalidate();
    },
  });

  const renderRows = (list: typeof rows) =>
    list.length === 0 ? (
      <p className="text-sm text-muted-foreground py-6 text-center">Nothing here yet.</p>
    ) : (
      <div className="space-y-2">
        {list.map((d) => (
          <Card key={d.id}>
            <CardContent className="pt-4 flex gap-3 items-start">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline">{d.kind.replace("_", " ")}</Badge>
                  {d.scheduled_at && d.status === "scheduled" ? (
                    <Badge variant="secondary" className="gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(d.scheduled_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </Badge>
                  ) : null}
                  {d.status === "failed" && d.publish_error ? (
                    <Badge variant="destructive">Failed</Badge>
                  ) : null}
                </div>
                <div className="font-medium mt-1 truncate">
                  {d.title || d.body?.slice(0, 100) || "(untitled)"}
                </div>
                {d.body && d.title ? (
                  <div className="text-sm text-muted-foreground truncate mt-0.5">
                    {d.body.slice(0, 140)}
                  </div>
                ) : null}
                {d.publish_error ? (
                  <div className="text-xs text-destructive mt-1">Error: {d.publish_error}</div>
                ) : null}
              </div>
              <div className="flex gap-1 shrink-0">
                {d.published_post_id ? (
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/p/$postId" params={{ postId: d.published_post_id }}>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                ) : (
                  <>
                    <Button asChild size="sm" variant="ghost" title="Edit">
                      <Link to="/studio/composer" search={{ draft: d.id }}>
                        <PenSquare className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Publish now"
                      onClick={() => publishMut.mutate(d.id)}
                      disabled={publishMut.isPending}
                    >
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  title="Archive"
                  onClick={() => archiveMut.mutate(d.id)}
                >
                  <Archive className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  title="Delete"
                  onClick={() => confirm("Delete this draft?") && deleteMut.mutate(d.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Content calendar</CardTitle>
        <Button asChild size="sm">
          <Link to="/studio/composer">
            <PenSquare className="h-4 w-4 mr-1" /> New post
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 sm:grid sm:grid-cols-4">
            <TabsTrigger value="scheduled" className="shrink-0 whitespace-nowrap">
              Scheduled ({scheduled.length})
            </TabsTrigger>
            <TabsTrigger value="drafts" className="shrink-0 whitespace-nowrap">
              Drafts ({drafts.length})
            </TabsTrigger>
            <TabsTrigger value="published" className="shrink-0 whitespace-nowrap">
              Published ({published.length})
            </TabsTrigger>
            <TabsTrigger value="failed" className="shrink-0 whitespace-nowrap">
              Failed ({failed.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="scheduled" className="pt-4">
            {renderRows(scheduled)}
          </TabsContent>
          <TabsContent value="drafts" className="pt-4">
            {renderRows(drafts)}
          </TabsContent>
          <TabsContent value="published" className="pt-4">
            {renderRows(published)}
          </TabsContent>
          <TabsContent value="failed" className="pt-4">
            {renderRows(failed)}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
