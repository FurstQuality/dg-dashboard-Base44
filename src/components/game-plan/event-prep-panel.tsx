/**
 * Event prep panel — training and readiness for a single event.
 *
 * Shows how ready the player is, which holes on the event's actual layouts cost
 * them strokes, which skills leak the most, and a dated practice plan that links
 * straight into the app's training tools.
 */
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Dumbbell,
  Flag,
  MapPin,
  Sparkles,
  Target,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { getEventTrainingPlan } from "@/lib/game-plan-prep.functions";
import type { HoleFocus } from "@/lib/game-plan/prep-model";

export function EventPrepPanel({ eventId }: { eventId: string }) {
  const fn = useServerFn(getEventTrainingPlan);
  const { data, isLoading } = useQuery({
    queryKey: ["game-plan", "training-plan", eventId],
    queryFn: () => fn({ data: { eventId } }),
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!data) {
    return (
      <Card className="p-5 text-sm text-muted-foreground">
        Add this event to your schedule to build a prep plan.
      </Card>
    );
  }

  const countdown =
    data.daysUntil == null
      ? "No start date on file"
      : data.daysUntil > 0
        ? `${data.daysUntil} day${data.daysUntil === 1 ? "" : "s"} until round one`
        : data.daysUntil === 0
          ? "First round is today"
          : "Event has started";

  return (
    <div className="space-y-4">
      {/* readiness */}
      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <Activity className="h-4 w-4 text-primary" />
              Prep readiness
            </div>
            <p className="text-xs text-muted-foreground">{countdown}</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-semibold tabular-nums">{data.readiness.score}%</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">ready</div>
          </div>
        </div>
        <Progress value={data.readiness.score} />
        <div className="grid gap-2 sm:grid-cols-2">
          {data.readiness.items.map((item) => (
            <div key={item.id} className="flex items-start gap-2 rounded-md bg-muted/40 p-2.5">
              {item.status === "good" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              ) : item.status === "partial" ? (
                <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              )}
              <div className="min-w-0">
                <div className="text-sm font-medium">{item.label}</div>
                <p className="text-xs text-muted-foreground">{item.detail}</p>
                {item.href ? (
                  <Button asChild size="sm" variant="link" className="h-auto p-0 text-xs">
                    <Link to={item.href}>Fix this</Link>
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* course familiarity */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2 font-semibold">
          <MapPin className="h-4 w-4 text-primary" />
          Courses in this event
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {data.courses.map((c, i) => (
            <div key={`${c.course_name}-${i}`} className="rounded-md border p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{c.course_name}</span>
                {c.round_number != null ? (
                  <Badge variant="outline">R{c.round_number}</Badge>
                ) : null}
              </div>
              {c.layout_name ? (
                <div className="text-xs text-muted-foreground">{c.layout_name}</div>
              ) : null}
              <div className="text-xs text-muted-foreground">
                {c.holesAnalyzed
                  ? `${c.holesAnalyzed} holes with your data · avg ${c.avgVsPar != null && c.avgVsPar > 0 ? "+" : ""}${c.avgVsPar ?? 0} vs par`
                  : "No rounds logged here yet"}
                {c.bestRoundRating != null ? ` · best round ${c.bestRoundRating}` : ""}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Familiarity: {data.familiarity === "solid" ? "solid" : data.familiarity === "light" ? "light" : "none"} ·{" "}
          {data.dataPoints.holeScores} scored holes · {data.dataPoints.ratedRounds12mo} rated rounds
          in the last 12 months
        </p>
      </Card>

      {/* holes to practice */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2 font-semibold">
          <Flag className="h-4 w-4 text-primary" />
          Holes to practice
        </div>
        {data.holeFocus.length ? (
          <div className="space-y-2">
            {data.holeFocus.map((h) => (
              <HoleRow key={`${h.courseKey}-${h.holeNumber}`} hole={h} tone="cost" />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Score a round hole-by-hole on these layouts to unlock per-hole targets.
          </p>
        )}
        {data.holeStrengths.length ? (
          <>
            <div className="flex items-center gap-2 pt-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              Your scoring holes — protect these
            </div>
            <div className="space-y-2">
              {data.holeStrengths.map((h) => (
                <HoleRow key={`s-${h.courseKey}-${h.holeNumber}`} hole={h} tone="gain" />
              ))}
            </div>
          </>
        ) : null}
      </Card>

      {/* skill leaks */}
      <Card className="p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-semibold">
            <Target className="h-4 w-4 text-primary" />
            Weak points to fix
          </div>
          <div className="text-xs text-muted-foreground">
            {data.totalStrokesLostPerRound} strokes/round · up to {data.ratingUpside} rating points
          </div>
        </div>
        {data.leaks.length ? (
          data.leaks.map((leak) => (
            <div key={leak.id} className="rounded-md bg-muted/40 p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{leak.category}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  +{leak.strokesPerRound}/round · {leak.ratingImpact} rating
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{leak.suggestion}</p>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            Not enough hole-by-hole data yet to isolate weak points.
          </p>
        )}
        {data.strengths.length ? (
          <p className="text-xs text-muted-foreground">
            Strengths: {data.strengths.map((s) => s.category).join(", ")}
          </p>
        ) : null}
      </Card>

      {/* practice plan */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2 font-semibold">
          <Dumbbell className="h-4 w-4 text-primary" />
          Your practice plan
        </div>
        {data.practicePlan.map((item, i) => (
          <div key={item.id} className="flex items-start gap-3 rounded-md border p-3">
            <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
              {i + 1}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{item.title}</span>
                <Badge
                  variant="outline"
                  className={
                    item.priority === "high"
                      ? "border-destructive/40 text-destructive"
                      : item.priority === "medium"
                        ? "border-amber-500/40 text-amber-600"
                        : ""
                  }
                >
                  {item.priority}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{item.why}</p>
              <p className="text-xs">{item.drill}</p>
              <Button asChild size="sm" variant="outline" className="mt-1">
                <Link to={item.href}>{item.cta}</Link>
              </Button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function HoleRow({ hole, tone }: { hole: HoleFocus; tone: "cost" | "gain" }) {
  return (
    <div className="flex items-start gap-3 rounded-md border p-3">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sm font-semibold ${
          tone === "cost" ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-600"
        }`}
      >
        {hole.holeNumber}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="text-sm font-medium text-foreground">
            {hole.avgVsPar > 0 ? "+" : ""}
            {hole.avgVsPar} vs par
          </span>
          <span>avg {hole.avgStrokes}</span>
          {hole.par != null ? <span>par {hole.par}</span> : null}
          {hole.distanceFt != null ? <span>{hole.distanceFt} ft</span> : null}
          <span>bogey+ {hole.bogeyPlusPct}%</span>
          <span>birdie {hole.birdiePct}%</span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{hole.note}</p>
        <div className="text-[11px] text-muted-foreground">
          {hole.courseName}
          {hole.layoutName ? ` · ${hole.layoutName}` : ""}
        </div>
      </div>
    </div>
  );
}
