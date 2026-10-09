import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Database, RefreshCw, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getEventDataReadiness,
  type EventReadiness,
  type GamePlanEvent,
  type ReadinessLevel,
} from "@/lib/game-plan.functions";
import { PastEventResultsDialog } from "@/components/past-event-results-dialog";

export function DataReadinessPanel({ event }: { event: GamePlanEvent }) {
  const check = useServerFn(getEventDataReadiness);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["game-plan", "readiness", event.id],
    queryFn: () => check({ data: { eventId: event.id } }),
  });

  const r: EventReadiness | undefined = data;

  return (
    <Card
      className="p-4 space-y-3 border-l-4"
      style={{ borderLeftColor: r ? levelColor(r.overall) : "hsl(var(--muted))" }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2">
          <Database className="h-4 w-4 mt-0.5 text-muted-foreground" />
          <div>
            <div className="font-medium text-sm flex items-center gap-2">
              Data readiness
              {r ? <ReadinessBadge level={r.overall} /> : null}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
              Odds, course targets, and prep pull from your PDGA-rated rounds, prior results at this
              event, and the field roster. Fill any gaps below to sharpen every projection.
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} />
          Recheck
        </Button>
      </div>

      {isLoading || !r ? (
        <div className="text-xs text-muted-foreground">Checking imported data…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <CheckTile
              label="PDGA profile"
              value={r.hasPdgaProfile ? "Synced" : "Not synced"}
              level={r.hasPdgaProfile ? "good" : "missing"}
            />
            <CheckTile
              label="Rated rounds"
              value={`${r.totalRatedRounds} on file`}
              level={
                r.totalRatedRounds >= 8 ? "good" : r.totalRatedRounds >= 1 ? "partial" : "missing"
              }
            />
            <CheckTile
              label="Prior results here"
              value={`${r.priorEventResults} round${r.priorEventResults === 1 ? "" : "s"}`}
              level={
                r.priorEventResults >= 2 ? "good" : r.priorEventResults >= 1 ? "partial" : "missing"
              }
            />
            <CheckTile
              label={event.tournament_id ? "Field ratings" : "Course data"}
              value={
                event.tournament_id
                  ? r.rosterCount
                    ? `${r.rosterWithRatings}/${r.rosterCount} rated`
                    : "No roster"
                  : r.courses.length === 0
                    ? "No schedule yet"
                    : `${r.courses.filter((c) => c.level === "good").length}/${r.courses.length} good`
              }
              level={
                event.tournament_id
                  ? r.rosterCount === 0
                    ? "missing"
                    : r.rosterWithRatings / r.rosterCount >= 0.6
                      ? "good"
                      : "partial"
                  : r.courses.length === 0
                    ? "missing"
                    : r.courses.every((c) => c.level === "good")
                      ? "good"
                      : r.courses.some((c) => c.level !== "missing")
                        ? "partial"
                        : "missing"
              }
            />
          </div>

          {r.courses.length ? (
            <div className="border-t pt-2">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                Per-round data source
              </div>
              <div className="space-y-1">
                {r.courses.map((c, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0 truncate">
                      <span className="font-medium">R{c.round_number ?? i + 1}</span>{" "}
                      <span>{c.course_name}</span>
                      {c.layout_name ? (
                        <span className="text-muted-foreground"> · {c.layout_name}</span>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
                      <span>{c.history_at_course} past</span>
                      <span className="uppercase tracking-wide text-[10px]">{c.model_source}</span>
                      <ReadinessDot level={c.level} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {r.suggestions.length ? (
            <div className="border-t pt-2 space-y-2">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Recommended next steps
              </div>
              {r.suggestions.map((s) => (
                <div key={s.key} className="flex items-start gap-2 text-xs">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium">{s.label}</div>
                    <p className="text-muted-foreground">{s.reason}</p>
                  </div>
                  <ReadinessAction action={s.key} event={event} />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-emerald-600 flex items-center gap-1.5 border-t pt-2">
              <CheckCircle2 className="h-3.5 w-3.5" />
              You're wired up — odds, targets, and prep are pulling from full data.
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function ReadinessAction({
  action,
  event,
}: {
  action: EventReadiness["suggestions"][number]["key"];
  event: GamePlanEvent;
}) {
  if (action === "sync_pdga") {
    // PDGA data refreshes in the background — nothing for the player to run.
    return (
      <span className="text-xs text-muted-foreground">
        Refreshing automatically in the background
      </span>
    );
  }
  if (action === "import_rounds") {
    return (
      <Button asChild size="sm" variant="outline">
        <Link to="/settings/imports" search={{ tab: "rounds" }}>
          Open import
        </Link>
      </Button>
    );
  }
  if (action === "pull_event_page") {
    return <PastEventResultsDialog event={event} />;
  }
  if (action === "add_course_data") {
    return (
      <Button asChild size="sm" variant="outline">
        <Link to="/courses">Courses</Link>
      </Button>
    );
  }
  if (action === "sync_roster") {
    return (
      <Button asChild size="sm" variant="outline">
        <Link to="/events">Tournament</Link>
      </Button>
    );
  }
  return null;
}

function ReadinessBadge({ level }: { level: ReadinessLevel }) {
  const style = {
    good: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
    partial: "bg-amber-500/15 text-amber-600 border-amber-500/30",
    missing: "bg-rose-500/15 text-rose-600 border-rose-500/30",
  }[level];
  const label = { good: "Ready", partial: "Partial", missing: "Needs data" }[level];
  return <span className={`text-[10px] px-2 py-0.5 rounded-full border ${style}`}>{label}</span>;
}

function ReadinessDot({ level }: { level: ReadinessLevel }) {
  const Icon = level === "good" ? CheckCircle2 : level === "partial" ? AlertTriangle : XCircle;
  const color =
    level === "good"
      ? "text-emerald-500"
      : level === "partial"
        ? "text-amber-500"
        : "text-rose-500";
  return <Icon className={`h-3.5 w-3.5 ${color}`} />;
}

function CheckTile({
  label,
  value,
  level,
}: {
  label: string;
  value: string;
  level: ReadinessLevel;
}) {
  const bg = {
    good: "bg-emerald-500/5 border-emerald-500/20",
    partial: "bg-amber-500/5 border-amber-500/20",
    missing: "bg-rose-500/5 border-rose-500/20",
  }[level];
  return (
    <div className={`rounded-md border p-2 ${bg}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <ReadinessDot level={level} />
      </div>
      <div className="text-sm font-medium mt-0.5 truncate">{value}</div>
    </div>
  );
}

function levelColor(level: ReadinessLevel): string {
  return level === "good"
    ? "rgb(16 185 129)"
    : level === "partial"
      ? "rgb(245 158 11)"
      : "rgb(244 63 94)";
}

/* ------------ Compact course-rating check for the Game Plan tab ------------ */

export function CourseRatingCheck({ event }: { event: GamePlanEvent }) {
  const check = useServerFn(getEventDataReadiness);
  const { data, isLoading } = useQuery({
    queryKey: ["game-plan", "readiness", event.id],
    queryFn: () => check({ data: { eventId: event.id } }),
  });
  const r: EventReadiness | undefined = data;

  const settingsSearch = { event: event.id } as const;

  if (isLoading || !r) {
    return <Card className="p-3 text-xs text-muted-foreground">Checking course rating data…</Card>;
  }

  const totalCourses = r.courses.length;
  const ratedCourses = r.courses.filter((c) => c.has_layout_model).length;
  const allRated = totalCourses > 0 && ratedCourses === totalCourses;
  const noneRated = totalCourses > 0 && ratedCourses === 0;
  const level: ReadinessLevel =
    totalCourses === 0 ? "missing" : allRated ? "good" : noneRated ? "missing" : "partial";

  return (
    <Card className="p-3 border-l-4" style={{ borderLeftColor: levelColor(level) }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2 min-w-0">
          <ReadinessDot level={level} />
          <div className="min-w-0">
            <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
              Course rating check
              <ReadinessBadge level={level} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {totalCourses === 0
                ? "No course schedule on file yet — Game Plan can't verify course ratings."
                : allRated
                  ? `All ${totalCourses} course${totalCourses === 1 ? " has" : "s have"} an approved rating profile.`
                  : `${ratedCourses}/${totalCourses} scheduled course${totalCourses === 1 ? "" : "s"} have an approved rating profile.`}
            </p>
            {totalCourses > 0 ? (
              <ul className="mt-1.5 space-y-0.5 text-xs">
                {r.courses.map((c, i) => (
                  <li key={i} className="flex min-w-0 items-center gap-2">
                    <ReadinessDot level={c.has_layout_model ? "good" : "missing"} />
                    <span className="min-w-0 truncate">
                      <span className="font-medium">R{c.round_number ?? i + 1}</span>{" "}
                      <span>{c.course_name}</span>
                      {c.layout_name ? (
                        <span className="text-muted-foreground"> · {c.layout_name}</span>
                      ) : null}
                    </span>
                    <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {c.has_layout_model ? "rated" : "no rating"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        {level !== "good" ? (
          <Button asChild size="sm" variant="outline">
            <Link to="/settings/imports" search={{ tab: "overview" as const, ...settingsSearch }}>
              Open Data Readiness
            </Link>
          </Button>
        ) : (
          <Button asChild size="sm" variant="ghost">
            <Link to="/settings/imports" search={{ tab: "overview" as const, ...settingsSearch }}>
              Details
            </Link>
          </Button>
        )}
      </div>
    </Card>
  );
}
