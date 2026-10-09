import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Target, Trash2, Trophy, Pencil, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { WidgetNote } from "@/components/shell";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShareToFeedButton } from "@/components/feed/share-to-feed-button";
import { statsKeys } from "@/lib/stats-queries";
import {
  listGoals,
  saveGoal,
  deleteGoal,
  markGoalShared,
  type GoalWithProgress,
} from "@/lib/goals.functions";
import {
  GOAL_METRICS,
  GOAL_STATUS_LABEL,
  formatGoalValue,
  goalMetricDef,
  type GoalStatus,
} from "@/lib/stats/goals";
import { useTargetRating, writeTargetRating } from "@/lib/use-target-rating";

const STATUS_TONE: Record<GoalStatus, string> = {
  achieved: "border-primary/50 bg-primary/15 text-primary",
  "on-pace": "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
  behind: "border-amber-500/40 bg-amber-500/10 text-amber-500",
  "no-data": "border-border bg-muted text-muted-foreground",
};

type EditorState = {
  id: string | null;
  title: string;
  metric: string;
  target: string;
  deadline: string;
  courseName: string;
};

function emptyEditor(): EditorState {
  return { id: null, title: "", metric: "rating", target: "", deadline: "", courseName: "" };
}

/**
 * StatLink Goals — the player sets what they're chasing and sees exactly how
 * far off they are. Progress is computed server-side from their own rounds so
 * the numbers always match the rest of StatLink.
 */
export function GoalsPanel({
  userId,
  compact = false,
}: {
  userId: string | undefined;
  /** Tighter padding and smaller type — used at the bottom of the goals page. */
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(listGoals);
  const save = useServerFn(saveGoal);
  const remove = useServerFn(deleteGoal);
  const share = useServerFn(markGoalShared);
  const [targetRating, setTargetRating] = useTargetRating();

  const [editor, setEditor] = useState<EditorState | null>(null);

  const goalsQ = useQuery({
    queryKey: statsKeys.goals(userId),
    queryFn: () => load({ data: {} as never }),
    enabled: !!userId,
    staleTime: 60_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: statsKeys.goals(userId) });

  const saveMut = useMutation({
    mutationFn: (state: EditorState) =>
      save({
        data: {
          id: state.id,
          title: state.title.trim(),
          metric: state.metric,
          target: Number(state.target),
          deadline: state.deadline || null,
          course_name: state.courseName || null,
        },
      }),
    onSuccess: (_res, state) => {
      // The rating goal doubles as the shared target rating used by Game Plan
      // and the Target tab, so keep the two in step.
      // Only a non-course rating goal is the player's overall rating goal.
      // Course-specific rating goals never overwrite it.
      if (state.metric === "rating" && !state.courseName && Number.isFinite(Number(state.target))) {
        writeTargetRating(Number(state.target));
        setTargetRating(Number(state.target));
      }
      setEditor(null);
      toast.success(state.id ? "Goal updated." : "Goal set. Go get it.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't save that goal."),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Goal removed.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't remove that goal."),
  });

  const goals = goalsQ.data?.goals ?? [];
  const meta = goalsQ.data?.meta ?? null;
  const stats = goalsQ.data?.stats ?? null;

  const achieved = useMemo(() => goals.filter((g) => g.progress.status === "achieved"), [goals]);
  const active = useMemo(() => goals.filter((g) => g.progress.status !== "achieved"), [goals]);

  const selectedDef = editor ? goalMetricDef(editor.metric) : null;

  function openNew() {
    const next = emptyEditor();
    // Prefill the rating goal from the target rating the player already set.
    if (targetRating) next.target = String(targetRating);
    next.title = "Reach my target rating";
    setEditor(next);
  }

  function openEdit(goal: GoalWithProgress) {
    setEditor({
      id: goal.id,
      title: goal.title,
      metric: goal.metric,
      target: String(goal.target),
      deadline: goal.deadline ?? "",
      courseName: goal.course_name ?? "",
    });
  }

  return (
    <div className="space-y-4">
      <Card className={compact ? "text-sm" : undefined}>
        <CardHeader
          className={`flex flex-row items-start justify-between gap-3 space-y-0 ${compact ? "p-3" : ""}`}
        >
          <div>
            <CardTitle className={`flex items-center gap-2 ${compact ? "text-sm" : "text-base"}`}>
              <Target className="h-4 w-4 text-primary" /> Goals
            </CardTitle>
            <CardDescription>
              Set what you're chasing. Progress updates from your rated rounds and scored holes —
              nothing to track by hand.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openNew}>
            <Plus className="mr-1.5 h-4 w-4" /> New goal
          </Button>
        </CardHeader>
        <CardContent className={compact ? "space-y-3 p-3 pt-0" : "space-y-4"}>
          {meta && (
            <p className="text-xs text-muted-foreground">
              Measured from {meta.ratedRounds} rated round{meta.ratedRounds === 1 ? "" : "s"}
              {meta.holesGraded > 0 ? ` and ${meta.holesGraded} graded holes` : ""} since{" "}
              {meta.windowStart}.{" "}
              {meta.usesOfficialRating
                ? "Rating goals use your official PDGA rating."
                : "Rating goals use your rated-round estimate until a PDGA rating is linked."}
            </p>
          )}

          {goalsQ.isLoading && <p className="text-sm text-muted-foreground">Loading your goals…</p>}
          {goalsQ.isError && (
            <p className="text-sm text-destructive">
              We couldn't load your goals. Refresh the page and we'll try again.
            </p>
          )}

          {!goalsQ.isLoading && goals.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <Trophy className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-sm font-semibold">No goals yet</p>
              <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                Pick a rating to chase, a scoring average to trim, or a course record to break.
                We'll track it against your rounds and tell you when you're on pace.
              </p>
              <Button size="sm" className="mt-3" onClick={openNew}>
                <Plus className="mr-1.5 h-4 w-4" /> Set your first goal
              </Button>
            </div>
          )}

          {active.length > 0 && (
            <div className={compact ? "space-y-2" : "space-y-3"}>
              {active.map((g) => (
                <GoalRowCard
                  key={g.id}
                  goal={g}
                  onEdit={() => openEdit(g)}
                  onDelete={() => deleteMut.mutate(g.id)}
                  onShared={() => share({ data: { id: g.id } }).then(invalidate)}
                />
              ))}
            </div>
          )}

          {achieved.length > 0 && (
            <div className={compact ? "space-y-2" : "space-y-3"}>
              <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Achieved
              </div>
              {achieved.map((g) => (
                <GoalRowCard
                  key={g.id}
                  goal={g}
                  onEdit={() => openEdit(g)}
                  onDelete={() => deleteMut.mutate(g.id)}
                  onShared={() => share({ data: { id: g.id } }).then(invalidate)}
                />
              ))}
            </div>
          )}

          {stats && goals.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SnapshotStat label="Rating" value={formatGoalValue("rating", stats.rating)} />
              <SnapshotStat
                label="Best round"
                value={formatGoalValue("round_rating", stats.round_rating)}
              />
              <SnapshotStat
                label="Avg vs. par"
                value={formatGoalValue("scoring_average", stats.scoring_average)}
              />
              <SnapshotStat
                label="Birdie rate"
                value={formatGoalValue("birdie_rate", stats.birdie_rate)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editor != null} onOpenChange={(o) => !o && setEditor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editor?.id ? "Edit goal" : "New goal"}</DialogTitle>
            <DialogDescription>
              Name it, pick what it measures, and set the number you're after.
            </DialogDescription>
          </DialogHeader>
          {editor && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="goal-title">Goal name</Label>
                <Input
                  id="goal-title"
                  value={editor.title}
                  maxLength={120}
                  placeholder="Break 950"
                  onChange={(e) => setEditor({ ...editor, title: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="goal-metric">What it measures</Label>
                <Select
                  value={editor.metric}
                  onValueChange={(v) => setEditor({ ...editor, metric: v })}
                >
                  <SelectTrigger id="goal-metric">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GOAL_METRICS.map((m) => (
                      <SelectItem key={m.metric} value={m.metric}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedDef && (
                  <p className="text-xs text-muted-foreground">{selectedDef.blurb}</p>
                )}
              </div>
              {selectedDef?.needsCourse && (
                <div className="space-y-1.5">
                  <Label htmlFor="goal-course">Course</Label>
                  <Input
                    id="goal-course"
                    value={editor.courseName}
                    maxLength={200}
                    placeholder="Northwood Black"
                    onChange={(e) => setEditor({ ...editor, courseName: e.target.value })}
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="goal-target">Target</Label>
                  <Input
                    id="goal-target"
                    type="number"
                    inputMode="numeric"
                    value={editor.target}
                    min={selectedDef?.min}
                    max={selectedDef?.max}
                    onChange={(e) => setEditor({ ...editor, target: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="goal-deadline">Deadline (optional)</Label>
                  <Input
                    id="goal-deadline"
                    type="date"
                    value={editor.deadline}
                    onChange={(e) => setEditor({ ...editor, deadline: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditor(null)}>
              Cancel
            </Button>
            <Button
              disabled={
                !editor ||
                saveMut.isPending ||
                editor.title.trim().length === 0 ||
                !Number.isFinite(Number(editor.target)) ||
                editor.target.trim() === ""
              }
              onClick={() => editor && saveMut.mutate(editor)}
            >
              {saveMut.isPending ? "Saving…" : editor?.id ? "Save changes" : "Set goal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SnapshotStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-bold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function GoalRowCard({
  goal,
  onEdit,
  onDelete,
  onShared,
}: {
  goal: GoalWithProgress;
  onEdit: () => void;
  onDelete: () => void;
  onShared: () => void;
}) {
  const def = goalMetricDef(goal.metric);
  const p = goal.progress;
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{goal.title}</span>
            <Badge variant="outline" className={`shrink-0 text-[10px] ${STATUS_TONE[p.status]}`}>
              {GOAL_STATUS_LABEL[p.status]}
            </Badge>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {def?.label ?? goal.metric}
            {goal.course_name ? ` · ${goal.course_name}` : ""} · now{" "}
            <b className="tabular-nums text-foreground">
              {formatGoalValue(goal.metric, p.current)}
            </b>{" "}
            · target{" "}
            <b className="tabular-nums text-foreground">
              {formatGoalValue(goal.metric, goal.target)}
            </b>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {p.status === "achieved" && (
            <ShareToFeedButton
              draft={() => ({
                type: "text",
                body: `Goal achieved: ${goal.title} — ${def?.label ?? goal.metric} at ${formatGoalValue(
                  goal.metric,
                  p.current,
                )} (target ${formatGoalValue(goal.metric, goal.target)}).`,
                visibility: "friends",
              })}
              onShared={onShared}
              size="sm"
              variant="outline"
              label="Share"
            />
          )}
          <Button size="icon" variant="ghost" aria-label="Edit goal" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" aria-label="Remove goal" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <Progress value={p.pct} className="mt-3 h-2" />
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">{p.pct}% there</span>
        {p.status === "no-data" ? (
          <span>Log a rated round and this starts tracking.</span>
        ) : p.remaining && p.remaining > 0 ? (
          <span className="tabular-nums">
            {formatGoalValue(goal.metric, p.remaining).replace("+", "")} to go
          </span>
        ) : null}
        {goal.deadline && (
          <span className="inline-flex items-center gap-1 tabular-nums">
            <CalendarClock className="h-3.5 w-3.5" />
            {p.daysLeft != null && p.daysLeft >= 0
              ? `${p.daysLeft} days left`
              : `Deadline passed ${goal.deadline}`}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Compact goal status for the StatLink Overview tab — top three active goals
 * with where they stand, plus a jump into the full Goals tab.
 */
export function GoalsOverviewStrip({
  userId,
  onOpenGoals,
}: {
  userId: string | undefined;
  onOpenGoals: () => void;
}) {
  const load = useServerFn(listGoals);
  const goalsQ = useQuery({
    queryKey: statsKeys.goals(userId),
    queryFn: () => load({ data: {} as never }),
    enabled: !!userId,
    staleTime: 60_000,
  });
  const goals = (goalsQ.data?.goals ?? []).slice(0, 3);
  if (goalsQ.isLoading || goals.length === 0) return null;
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-3 pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-4 w-4 text-primary" /> Goal progress
          </CardTitle>
          <WidgetNote>
            Your three active goals, tracked automatically from your rounds and ratings as they come
            in.
          </WidgetNote>
        </div>
        <Button size="sm" variant="ghost" onClick={onOpenGoals}>
          View goals
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        {goals.map((g) => (
          <div key={g.id} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold">{g.title}</span>
              <Badge
                variant="outline"
                className={`shrink-0 text-[10px] ${STATUS_TONE[g.progress.status]}`}
              >
                {GOAL_STATUS_LABEL[g.progress.status]}
              </Badge>
            </div>
            <Progress value={g.progress.pct} className="mt-2 h-1.5" />
            <div className="mt-1 text-xs text-muted-foreground tabular-nums">
              {formatGoalValue(g.metric, g.progress.current)} →{" "}
              {formatGoalValue(g.metric, g.target)}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
