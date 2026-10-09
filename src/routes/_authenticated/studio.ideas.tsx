import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { listIdeas, saveIdea, markIdeaUsed, deleteIdea } from "@/lib/creator-studio.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, Check, Undo2, Trash2, PenSquare, Sparkles } from "lucide-react";

const SEED_IDEAS = [
  "5 shots I would have played different on this hole",
  "Ranking every basket at [course]",
  "Every disc in my bag — why I actually throw each one",
  "How local weather changes my club selection this week",
  "Behind-the-scenes prep for [event]",
  "Course review with 3 things to know before you play it",
  "My worst round of the week — and what I learned",
  "One tip that shaved 3 strokes off my next round",
  "Local league recap with the shot that decided it",
  "Ambassador Q&A: what's improving at our home course this year",
];

export const Route = createFileRoute("/_authenticated/studio/ideas")({
  component: IdeasPage,
  head: () => ({
    meta: [
      { title: "Ideas · Creator Studio · DG Dashboard" },
      { name: "description", content: "Capture and organize content ideas before you write them." },
      { property: "og:title", content: "Ideas · Creator Studio · DG Dashboard" },
      {
        property: "og:description",
        content: "Capture and organize content ideas before you write them.",
      },
    ],
  }),
});

function IdeasPage() {
  const qc = useQueryClient();
  const fetch = useServerFn(listIdeas);
  const save = useServerFn(saveIdea);
  const mark = useServerFn(markIdeaUsed);
  const del = useServerFn(deleteIdea);
  const q = useQuery({ queryKey: ["ideas"], queryFn: () => fetch() });

  const [prompt, setPrompt] = useState("");
  const [notes, setNotes] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["ideas"] });
  const saveMut = useMutation({
    mutationFn: (p: { prompt: string; notes?: string }) => save({ data: p }),
    onSuccess: () => {
      toast.success("Idea saved");
      setPrompt("");
      setNotes("");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const markMut = useMutation({
    mutationFn: ({ id, used }: { id: string; used: boolean }) => mark({ data: { id, used } }),
    onSuccess: () => invalidate(),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      invalidate();
    },
  });

  const rows = q.data?.rows ?? [];
  const open = rows.filter((r) => !r.is_used);
  const used = rows.filter((r) => r.is_used);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4" /> Idea board
            </CardTitle>
            <CardDescription>
              Park content ideas the moment they hit. Ship them one at a time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input
              placeholder="The idea, in one sentence"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={280}
            />
            <Textarea
              placeholder="Notes, angles, references (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={1000}
            />
            <div className="flex justify-between items-center">
              <p className="text-xs text-muted-foreground">
                Tip: idea → outline → draft → schedule.
              </p>
              <Button
                onClick={() => saveMut.mutate({ prompt, notes })}
                disabled={!prompt.trim() || saveMut.isPending}
              >
                Save idea
              </Button>
            </div>
          </CardContent>
        </Card>

        <div>
          <h3 className="font-semibold text-sm mb-2">Open ideas ({open.length})</h3>
          {open.length === 0 ? (
            <p className="text-sm text-muted-foreground py-3">
              All caught up — jot down your next one above.
            </p>
          ) : (
            <div className="space-y-2">
              {open.map((idea) => (
                <Card key={idea.id}>
                  <CardContent className="pt-4 flex gap-3 items-start">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{idea.prompt}</div>
                      {idea.notes ? (
                        <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                          {idea.notes}
                        </p>
                      ) : null}
                      {idea.suggested_kind ? (
                        <Badge variant="outline" className="mt-2 text-[10px]">
                          {idea.suggested_kind.replace("_", " ")}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button asChild size="sm" variant="ghost" title="Start writing">
                        <Link to="/studio/composer">
                          <PenSquare className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Mark used"
                        onClick={() => markMut.mutate({ id: idea.id, used: true })}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Delete"
                        onClick={() => confirm("Delete this idea?") && delMut.mutate(idea.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {used.length > 0 && (
          <div>
            <h3 className="font-semibold text-sm mb-2 mt-4">Used ({used.length})</h3>
            <div className="space-y-1.5">
              {used.map((i) => (
                <div
                  key={i.id}
                  className="flex items-center justify-between text-sm border rounded p-2 text-muted-foreground"
                >
                  <span className="line-through">{i.prompt}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => markMut.mutate({ id: i.id, used: false })}
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" /> Suggested prompts
          </CardTitle>
          <CardDescription>Ready-made prompts for disc golf creators.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {SEED_IDEAS.map((s) => (
              <button
                key={s}
                type="button"
                className="w-full text-left text-sm border rounded p-2 hover:bg-muted/40 transition"
                onClick={() => saveMut.mutate({ prompt: s, notes: undefined })}
              >
                + {s}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
