import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Database, Info, RefreshCw, Target } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { HolePlanTable } from "@/components/game-plan/hole-plan-table";
import { fmtToPar } from "@/lib/stats/course-fit";
import { getCourseFit, rebuildCourseModels, type CourseFitRow } from "@/lib/course-fit.functions";
import type { GamePlanEvent } from "@/lib/game-plan.functions";
import { useSession, useIsSuperAdmin } from "@/lib/current-user";

const VERDICT_STYLE: Record<string, string> = {
  ready: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  stretch: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  reach: "border-rose-500/40 bg-rose-500/10 text-rose-400",
  unknown: "border-border bg-muted text-muted-foreground",
};

const VERDICT_LABEL: Record<string, string> = {
  ready: "On track",
  stretch: "Within reach",
  reach: "Needs work",
  unknown: "Not enough data",
};

export function CourseFitPanel({
  event,
  targetRating,
}: {
  event: GamePlanEvent;
  targetRating: number;
}) {
  const fetchFit = useServerFn(getCourseFit);
  const rebuild = useServerFn(rebuildCourseModels);
  const qc = useQueryClient();
  const { user } = useSession();
  const isSuperAdmin = useIsSuperAdmin(user);

  const courses = event.courses.map((c) => ({
    roundNumber: c.round_number,
    courseId: c.course_id,
    courseName: c.course_name,
    layoutId: c.layout_id,
    layoutName: c.layout_name,
  }));

  const { data, isLoading, isError } = useQuery({
    queryKey: ["course-fit", event.id, targetRating],
    queryFn: () => fetchFit({ data: { targetRating, courses } }),
    enabled: courses.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const rebuildMutation = useMutation({
    mutationFn: () => rebuild(),
    onSuccess: (r) => {
      const res = (r ?? {}) as { coursesRefreshed?: number; layoutsRefreshed?: number };
      toast.success(
        `Rebuilt scoring history for ${res.coursesRefreshed ?? 0} courses and ${res.layoutsRefreshed ?? 0} layouts.`,
      );
      qc.invalidateQueries({ queryKey: ["course-fit"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Course rebuild failed"),
  });

  if (courses.length === 0) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        No courses attached to this event yet. Once the course schedule is in, this is where you'll
        see how you project to play each one.
      </Card>
    );
  }

  if (isLoading) {
    return <Card className="p-6 text-sm text-muted-foreground">Reading the course and your scoring history…</Card>;
  }

  if (isError || !data) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        We couldn't build your course fit just now. Try again in a moment.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <Database className="h-3.5 w-3.5" />
          Built from {data.historyHoles.toLocaleString()} scored holes in your history and this
          course's own scoring data.
        </span>
        {isSuperAdmin && <Button
          size="sm"
          variant="outline"
          onClick={() => rebuildMutation.mutate()}
          disabled={rebuildMutation.isPending}
        >
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${rebuildMutation.isPending ? "animate-spin" : ""}`} />
          {rebuildMutation.isPending ? "Rebuilding…" : "Rebuild course data"}
        </Button>}
      </Card>

      {data.rows.map((row) => (
        <CourseFitCard key={`${row.courseId ?? row.courseName}-${row.roundNumber ?? 0}`} row={row} />
      ))}
    </div>
  );
}

function CourseFitCard({ row }: { row: CourseFitRow }) {
  const fit = row.fit;
  return (
    <Card className="min-w-0 space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {row.roundNumber != null ? (
              <Badge variant="secondary">Round {row.roundNumber}</Badge>
            ) : null}
            <h3 className="truncate text-lg font-semibold">{row.courseName}</h3>
            {row.layoutName ? <Badge variant="outline">{row.layoutName}</Badge> : null}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {[
              row.location,
              fit.holeCount ? `${fit.holeCount} holes` : null,
              fit.parTotal ? `par ${fit.parTotal}` : null,
              fit.distanceTotal ? `${fit.distanceTotal.toLocaleString()} ft` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Course details still coming in"}
          </div>
        </div>
        <Badge variant="outline" className={VERDICT_STYLE[fit.verdict]}>
          {VERDICT_LABEL[fit.verdict]}
        </Badge>
      </div>

      <p className="text-sm">{fit.headline}</p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="You project"
          value={fit.projectedScore != null ? `${fit.projectedScore}` : "—"}
          sub={
            fit.projectedToPar != null
              ? `${fmtToPar(fit.projectedToPar)} · likely ${fit.projectedRange?.low}–${fit.projectedRange?.high}`
              : fit.projectedRange
                ? `likely ${fit.projectedRange.low}–${fit.projectedRange.high}`
                : "not enough data"
          }
        />
        <Stat
          label="That's worth"
          value={fit.projectedRating != null ? `${fit.projectedRating}` : "—"}
          sub={fit.ssa != null ? `scratch avg ${fit.ssa}, ${fit.strokeValue} pts/stroke` : "no scratch average yet"}
        />
        <Stat
          label="Target score"
          value={fit.requiredScore != null ? `${fit.requiredScore}` : "—"}
          sub={fit.requiredToPar != null ? fmtToPar(fit.requiredToPar) : "needs a scratch average"}
        />
        <Stat
          label="Gap to close"
          value={fit.gap != null ? (fit.gap <= 0 ? "Clear" : `${fit.gap}`) : "—"}
          sub={fit.gap != null && fit.gap > 0 ? "strokes to find before tee time" : "you're projecting past your target"}
        />
      </div>

      {fit.factors.length > 0 ? (
        <div className="space-y-2">
          <SectionLabel icon={<Target className="h-3.5 w-3.5" />} text="Course vs your game" />
          <div className="grid gap-2 sm:grid-cols-2">
            {fit.factors.map((f) => (
              <div
                key={f.id}
                className={
                  "rounded-control border p-2.5 text-xs " +
                  (f.lean === "good"
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : f.lean === "tough"
                      ? "border-amber-500/30 bg-amber-500/5"
                      : "border-border bg-muted/40")
                }
              >
                <div className="font-semibold text-foreground">{f.label}</div>
                <div className="text-muted-foreground">{f.detail}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {fit.focus.length > 0 ? (
        <div className="space-y-2">
          <SectionLabel icon={<CheckCircle2 className="h-3.5 w-3.5" />} text="Work on this first" />
          <ol className="space-y-1.5 text-sm">
            {fit.focus.map((f, i) => (
              <li key={f.id} className="flex gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                  {i + 1}
                </span>
                <span>
                  <span className="font-medium">{f.title}</span>{" "}
                  <span className="text-muted-foreground">{f.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="space-y-2">
        <SectionLabel icon={<Info className="h-3.5 w-3.5" />} text="Hole-by-hole plan" />
        <HolePlanTable holes={fit.holePlan} />
      </div>

      <div className="space-y-2 rounded-control border border-border bg-muted/30 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Course data on file
          </span>
          <span className="text-xs text-muted-foreground">
            {row.holesOnFile} holes · {row.holesWithDistance} measured · {row.dataCompleteness}%
            complete
          </span>
        </div>
        <Progress value={row.dataCompleteness} className="h-1.5" />
        {row.dataGaps.length > 0 ? (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {row.dataGaps.map((g) => (
              <li key={g.id} className="flex items-start gap-1.5">
                <AlertTriangle
                  className={`mt-0.5 h-3 w-3 shrink-0 ${g.severity === "blocking" ? "text-amber-500" : "text-muted-foreground"}`}
                />
                {g.label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            Everything this plan needs is on file for this course.
          </p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {row.courseId ? (
            <Button asChild size="sm" variant="outline">
              <Link to="/courses/$courseId" params={{ courseId: row.courseId }}>
                Open course
              </Link>
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline">
              <Link to="/courses">Find or add this course</Link>
            </Button>
          )}
          {row.courseId ? (
            <Button asChild size="sm" variant="outline">
              <Link to="/courses/$courseId/edit" params={{ courseId: row.courseId }}>
                Add hole detail
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {fit.sources.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Numbers from {fit.sources.join("; ")}.
        </p>
      ) : null}
    </Card>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-control border border-border bg-muted/30 p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function SectionLabel({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {icon}
      {text}
    </div>
  );
}
