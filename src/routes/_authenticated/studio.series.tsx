import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { listSeries, saveSeries, deleteSeries } from "@/lib/creator-studio.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { BookmarkPlus, Trash2, Pencil, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/studio/series")({
  component: SeriesPage,
  head: () => ({
    meta: [
      { title: "Series · Creator Studio · DG Dashboard" },
      {
        name: "description",
        content: "Group related posts into a series your followers can follow.",
      },
      { property: "og:title", content: "Series · Creator Studio · DG Dashboard" },
      {
        property: "og:description",
        content: "Group related posts into a series your followers can follow.",
      },
    ],
  }),
});

function SeriesPage() {
  const qc = useQueryClient();
  const fetch = useServerFn(listSeries);
  const save = useServerFn(saveSeries);
  const del = useServerFn(deleteSeries);
  const q = useQuery({ queryKey: ["series"], queryFn: () => fetch() });

  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", description: "", cadence: "", color: "" });

  function startNew() {
    setEditing({});
    setForm({ name: "", description: "", cadence: "", color: "" });
  }
  function startEdit(s: any) {
    setEditing(s);
    setForm({
      name: s.name ?? "",
      description: s.description ?? "",
      cadence: s.cadence ?? "",
      color: s.color ?? "",
    });
  }

  const saveMut = useMutation({
    mutationFn: () => save({ data: { id: editing?.id, ...form } }),
    onSuccess: () => {
      toast.success("Series saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["series"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["series"] });
    },
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Series & collections</h2>
            <p className="text-sm text-muted-foreground">
              Group ongoing content: "Course of the Week", "Weekend Recap", "Ace Reel"…
            </p>
          </div>
          <Button onClick={startNew}>
            <Plus className="h-4 w-4 mr-1" /> New series
          </Button>
        </div>

        {(q.data?.rows ?? []).length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No series yet. Create your first recurring content theme.
            </CardContent>
          </Card>
        ) : (
          (q.data?.rows ?? []).map((s) => (
            <Card key={s.id}>
              <CardContent className="pt-4 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <BookmarkPlus className="h-4 w-4 text-primary" />
                    <div className="font-medium">{s.name}</div>
                    {s.cadence ? <Badge variant="outline">{s.cadence}</Badge> : null}
                    {!s.is_active ? <Badge variant="secondary">Inactive</Badge> : null}
                  </div>
                  {s.description ? (
                    <p className="text-sm text-muted-foreground mt-1">{s.description}</p>
                  ) : null}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(s)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => confirm("Delete this series?") && deleteMut.mutate(s.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {editing ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{editing.id ? "Edit series" : "New series"}</CardTitle>
            <CardDescription>
              Give it a repeatable structure your audience will recognize.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                maxLength={120}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                maxLength={500}
              />
            </div>
            <div>
              <Label>Cadence (e.g. Weekly, Every Friday)</Label>
              <Input
                value={form.cadence}
                onChange={(e) => setForm({ ...form, cadence: e.target.value })}
                maxLength={60}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => saveMut.mutate()} disabled={!form.name || saveMut.isPending}>
                Save
              </Button>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
