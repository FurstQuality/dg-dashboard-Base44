import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { MapPin, Shield, Target, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getCourseReadiness,
  type ReadinessOptionGroup,
  type ReadinessLayoutRow,
} from "@/lib/course-readiness.functions";
import { VERDICT_LABEL, type PlanHole, type ReadinessVerdict } from "@/lib/stats/course-readiness";

const VERDICT_TONE: Record<ReadinessVerdict, string> = {
  ready: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
  stretch: "border-amber-500/40 bg-amber-500/10 text-amber-500",
  reach: "border-destructive/40 bg-destructive/10 text-destructive",
  unknown: "border-border bg-muted text-muted-foreground",
};

const GROUP_LABEL: Record<ReadinessOptionGroup, string> = {
  registered: "You're registered",
  schedule: "On your schedule",
  local: "Tournaments near you",
  course: "Courses you've played",
};

const GROUP_ORDER: ReadinessOptionGroup[] = ["registered", "schedule", "local", "course"];

function signed(n: number | null): string {
  if (n == null) return "—";
  return `${n > 0 ? "+" : ""}${n}`;
}

/**
 * Course Readiness — "what do I need to shoot here, and how do I have to play it?"
 *
 * Pulls the tournaments the player is registered for, everything on their
 * schedule, and upcoming events in their state; resolves the real venue and its
 * layouts; then turns the target round rating into a score and a hole plan.
 */
export function CourseReadinessCard({ targetRoundRating }: { targetRoundRating: number }) {
  const load = useServerFn(getCourseReadiness);
  const [selection, setSelection] = useState<string | null>(null);
  const [courseId, setCourseId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["stats", "readiness", selection, courseId, targetRoundRating],
    queryFn: () => load({ data: { selection, courseId, targetRoundRating } }),
    staleTime: 60_000,
  });

  const data = q.data ?? null;
  const options = data?.options ?? [];
  const selected = data?.selected ?? null;
  const candidates = data?.courseCandidates ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4 text-primary" /> Course readiness
        </CardTitle>
        <CardDescription>
          Pick a tournament you're registered for, an event on your schedule, or one near you, and
          see the score that earns a{" "}
          <b className="tabular-nums text-foreground">{targetRoundRating}</b> round rating — plus the
          holes that have to deliver it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {q.isLoading && <p className="text-sm text-muted-foreground">Working out your numbers…</p>}
        {q.isError && (
          <p className="text-sm text-destructive">
            We couldn't build your readiness numbers. Try again in a moment.
          </p>
        )}

        {!q.isLoading && options.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <MapPin className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-semibold">Nothing to plan against yet</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
              Register for a tournament, add an event to your schedule, or import a round, and we'll
              show the score you need on every layout.
            </p>
            <Button asChild size="sm" variant="outline" className="mt-3">
              <Link to="/schedule">Open your schedule</Link>
            </Button>
          </div>
        )}

        {options.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={selected?.value ?? undefined}
              onValueChange={(v) => {
                setSelection(v);
                setCourseId(null);
              }}
            >
              <SelectTrigger className="w-full sm:w-96" aria-label="Event or course to plan for">
                <SelectValue placeholder="Choose an event or course" />
              </SelectTrigger>
              <SelectContent>
                {GROUP_ORDER.filter((g) => options.some((o) => o.group === g)).map((g) => (
                  <SelectGroup key={g}>
                    <SelectLabel>{GROUP_LABEL[g]}</SelectLabel>
                    {options
                      .filter((o) => o.group === g)
                      .map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                          {o.location ? ` · ${o.location}` : ""}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>

            {candidates.length > 1 && (
              <Select
                value={data?.course?.id ?? undefined}
                onValueChange={(v) => setCourseId(v)}
              >
                <SelectTrigger className="w-full sm:w-72" aria-label="Course played at this event">
                  <SelectValue placeholder="Which course?" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.city ? ` · ${c.city}` : ""}
                      {c.match === "event-link" ? " (event venue)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {selected?.detail && (
          <p className="text-xs text-muted-foreground">
            {GROUP_LABEL[selected.group]} · {selected.detail}
          </p>
        )}

        {data?.course && (
          <div className="rounded-lg border border-border bg-background/40 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{data.course.name}</div>
                <div className="text-xs text-muted-foreground">
                  {[data.course.city, data.course.state].filter(Boolean).join(", ") ||
                    "Location not on file"}
                  {data.course.layoutCount > 0
                    ? ` · ${data.course.layoutCount} layout${data.course.layoutCount === 1 ? "" : "s"}`
                    : ""}
                </div>
              </div>
              {data.course.id && (
                <Button asChild size="sm" variant="outline">
                  <Link to="/courses/$courseId" params={{ courseId: data.course.id }}>
                    Course details
                  </Link>
                </Button>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat
                label="Holes"
                value={data.course.holeCount != null ? String(data.course.holeCount) : "—"}
              />
              <Stat
                label="Par"
                value={data.course.parTotal != null ? String(data.course.parTotal) : "—"}
              />
              <Stat
                label="Distance"
                value={
                  data.course.distanceTotal != null
                    ? `${data.course.distanceTotal.toLocaleString()} ft`
                    : "—"
                }
              />
              <Stat
                label="Difficulty"
                value={
                  data.course.difficulty ??
                  (data.course.pdgaRating != null
                    ? `PDGA ${data.course.pdgaRating.toFixed(1)}`
                    : "—")
                }
              />
            </div>
          </div>
        )}

        {data && data.history.rounds > 0 && (
          <p className="text-xs text-muted-foreground">
            Your history here: {data.history.rounds} round{data.history.rounds === 1 ? "" : "s"} ·
            best <b className="tabular-nums text-foreground">{data.history.bestScore ?? "—"}</b> ·
            average <b className="tabular-nums text-foreground">{data.history.avgScore ?? "—"}</b>
            {data.history.bestRating != null
              ? ` · best round rating ${data.history.bestRating}`
              : ""}
            {data.history.lastPlayedOn ? ` · last played ${data.history.lastPlayedOn}` : ""}
          </p>
        )}

        {data && data.noLayouts && options.length > 0 && (
          <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
            {data.course
              ? `${data.course.name} doesn't have a scratch scoring average yet, so we can't turn your rating target into a score. Build the layout in the course builder or play a rated round there and this fills in.`
              : `We couldn't tie ${selected?.label ?? "this event"} to a course we know. Add the venue in the course builder — or pick a course you've played — and the plan fills in.`}
          </p>
        )}

        {data && data.layouts.length > 0 && (
          <div className="space-y-2">
            {data.layouts.map((l) => (
              <LayoutRow key={`${l.layoutId ?? l.layoutName}`} layout={l} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LayoutRow({ layout }: { layout: ReadinessLayoutRow }) {
  // Older cached responses may predate the hazard fields.
  const l = {
    ...layout,
    hazards: layout.hazards ?? {
      waterHoles: null,
      obLineFeet: null,
      mandos: null,
      dropzones: null,
      islandGreens: null,
      longestHoleFt: null,
    },
  };
  const hazardBits = [
    l.hazards.waterHoles ? `${l.hazards.waterHoles} water hole${l.hazards.waterHoles === 1 ? "" : "s"}` : null,
    l.hazards.obLineFeet ? `${l.hazards.obLineFeet.toLocaleString()} ft of OB` : null,
    l.hazards.mandos ? `${l.hazards.mandos} mando${l.hazards.mandos === 1 ? "" : "s"}` : null,
    l.hazards.islandGreens ? `${l.hazards.islandGreens} island green` : null,
    l.hazards.longestHoleFt ? `longest ${l.hazards.longestHoleFt.toLocaleString()} ft` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{l.layoutName}</div>
          <div className="text-xs text-muted-foreground tabular-nums">
            {l.holeCount ? `${l.holeCount} holes · ` : ""}
            {l.parTotal != null ? `par ${l.parTotal} · ` : ""}
            SSA {l.ssa ?? "—"}
            {l.ssaSource === "rating-profile"
              ? " (course profile)"
              : l.ssaSource === "layout-scratch"
                ? " (layout)"
                : ""}
          </div>
        </div>
        <Badge variant="outline" className={`shrink-0 text-[10px] ${VERDICT_TONE[l.verdict]}`}>
          {VERDICT_LABEL[l.verdict]}
        </Badge>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="Shoot"
          value={l.requiredScore != null ? String(l.requiredScore) : "—"}
          accent
        />
        <Stat label="Vs. par" value={signed(l.requiredToPar)} />
        <Stat label="From your average" value={signed(l.gapFromAverage)} />
        <Stat label="From your best" value={signed(l.gapFromBest)} />
      </div>

      <p className="mt-2 text-xs text-muted-foreground">{l.note}</p>

      {l.plan && (
        <div className="mt-3 space-y-3 rounded-md border border-border bg-background/40 p-3">
          <p className="text-sm">{l.plan.summary}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {l.requiredScore != null && (
              <>
                <Stat label="Birdies needed" value={String(l.plan.birdiesNeeded)} accent />
                <Stat label="Bogeys to spare" value={String(l.plan.bogeyBudget)} />
              </>
            )}
            <Stat label="Gettable holes" value={String(l.plan.attackCount)} />
            {l.requiredScore == null && (
              <Stat label="Play safe holes" value={String(l.plan.protectCount)} />
            )}
          </div>
          <p className="text-xs text-muted-foreground">{l.plan.paceNote}</p>

          {l.plan.attack.length > 0 && (
            <HoleGroup
              icon={<TrendingUp className="h-3.5 w-3.5 text-emerald-500" />}
              title="Go get these"
              holes={l.plan.attack}
            />
          )}
          {l.plan.protect.length > 0 && (
            <HoleGroup
              icon={<Shield className="h-3.5 w-3.5 text-amber-500" />}
              title="Play these safe"
              holes={l.plan.protect}
            />
          )}
          {hazardBits.length > 0 && (
            <p className="text-xs text-muted-foreground">Layout notes: {hazardBits.join(" · ")}</p>
          )}
        </div>
      )}
    </div>
  );
}

function HoleGroup({
  icon,
  title,
  holes,
}: {
  icon: React.ReactNode;
  title: string;
  holes: PlanHole[];
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon} {title}
      </div>
      <ul className="mt-1.5 space-y-1">
        {holes.map((h) => (
          <li key={h.number} className="text-xs">
            <span className="font-semibold tabular-nums">Hole {h.number}</span>
            <span className="text-muted-foreground">
              {h.par != null ? ` · par ${h.par}` : ""}
              {h.distanceFt ? ` · ${h.distanceFt.toLocaleString()} ft` : ""}
              {h.shotShape ? ` · ${h.shotShape}` : ""} — {h.note}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-2">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-0.5 text-lg font-bold tabular-nums ${accent ? "text-primary" : "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}
