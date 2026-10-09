/**
 * "How have I shot here before?" — one course, the caller's own past rounds.
 * Used on the Event Tracker (courses hosting the events being followed) and on
 * Course Analytics (courses on the schedule).
 */

import { formatToPar as toParLabel } from "@/lib/score-display";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { History, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getCourseHistory,
  listPlayedCourseOptions,
  type CourseHistory,
  type PastCourseRound,
} from "@/lib/course-history.functions";
import {
  listTrackedCourses,
  trackCourse,
  untrackCourse,
} from "@/lib/tracked-courses.functions";

const SOURCE_LABEL: Record<PastCourseRound["source"], string> = {
  app: "DG Dashboard",
  pdga: "PDGA",
  disc_golf_scene: "Disc Golf Scene",
  udisc: "UDisc",
};


function dateLabel(iso: string): string {
  if (!iso) return "Date unknown";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-muted/30 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function TrendBadge({ trend }: { trend: number | null }) {
  if (trend == null) return null;
  if (trend >= 5) {
    return (
      <Badge variant="secondary" className="gap-1">
        <TrendingUp className="h-3 w-3" /> {trend} above your average here
      </Badge>
    );
  }
  if (trend <= -5) {
    return (
      <Badge variant="outline" className="gap-1">
        <TrendingDown className="h-3 w-3" /> {Math.abs(trend)} below your average here
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <Minus className="h-3 w-3" /> Right at your average here
    </Badge>
  );
}

export function PastScoresCard({
  /** Courses from the page context (tracked events, scheduled events). */
  courseNames = [],
  /** Show a save control so the picked course joins the saved-course quick picks. */
  allowSave = false,
  className,
}: {
  courseNames?: string[];
  allowSave?: boolean;
  className?: string;
}) {
  const loadOptions = useServerFn(listPlayedCourseOptions);
  const loadHistory = useServerFn(getCourseHistory);

  const optionsQuery = useQuery({
    queryKey: ["played-course-options"],
    queryFn: () => loadOptions(),
    staleTime: 5 * 60_000,
  });

  const options = useMemo(() => {
    const played = optionsQuery.data ?? [];
    const seen = new Set(played.map((o) => o.courseName.trim().toLowerCase()));
    const extras = courseNames
      .map((n) => n.trim())
      .filter((n) => n.length > 1 && !seen.has(n.toLowerCase()))
      .filter((n, i, all) => all.findIndex((x) => x.toLowerCase() === n.toLowerCase()) === i)
      .map((n) => ({ courseId: null, courseName: n, rounds: 0, lastPlayed: null }));
    // Courses on this page first — that's what the director or player is looking at.
    const onPage = courseNames.map((n) => n.trim().toLowerCase());
    const ranked = [...played].sort((a, b) => {
      const ai = onPage.indexOf(a.courseName.trim().toLowerCase());
      const bi = onPage.indexOf(b.courseName.trim().toLowerCase());
      if (ai !== bi) return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
      return 0;
    });
    return [...ranked, ...extras];
  }, [optionsQuery.data, courseNames]);

  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    if (selected || options.length === 0) return;
    setSelected(options[0]!.courseName);
  }, [options, selected]);

  const activeOption = options.find((o) => o.courseName === selected) ?? null;

  const historyQuery = useQuery<CourseHistory>({
    queryKey: ["course-history", selected, activeOption?.courseId ?? null],
    enabled: !!selected,
    staleTime: 60_000,
    queryFn: () =>
      loadHistory({
        data: { courseName: selected!, courseId: activeOption?.courseId ?? null },
      }),
  });

  const history = historyQuery.data ?? null;

  const qc = useQueryClient();
  const loadTracked = useServerFn(listTrackedCourses);
  const save = useServerFn(trackCourse);
  const unsave = useServerFn(untrackCourse);
  const trackedQuery = useQuery({
    queryKey: ["tracked-courses", "past-scores"],
    queryFn: () => loadTracked(),
    enabled: allowSave,
    staleTime: 5 * 60_000,
  });
  const savedRow =
    trackedQuery.data?.courses.find(
      (c) => c.course_name.trim().toLowerCase() === (selected ?? "").trim().toLowerCase(),
    ) ?? null;
  function refreshSaved() {
    qc.invalidateQueries({ queryKey: ["tracked-courses"] });
  }
  const saveMut = useMutation({
    mutationFn: () =>
      save({
        data: { course_name: selected!, course_id: activeOption?.courseId ?? null },
      }),
    onSuccess: () => {
      toast.success(`${selected} saved to your courses.`);
      refreshSaved();
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't save that course."),
  });
  const unsaveMut = useMutation({
    mutationFn: () => unsave({ data: { id: savedRow!.id } }),
    onSuccess: () => {
      toast.success(`${selected} removed from your courses.`);
      refreshSaved();
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't remove that course."),
  });

  // Long histories stay readable — show the newest rounds first, reveal the rest on request.
  const [showAllRounds, setShowAllRounds] = useState(false);
  useEffect(() => setShowAllRounds(false), [selected]);
  const allRounds = history?.rounds ?? [];
  const visibleRounds = showAllRounds ? allRounds : allRounds.slice(0, 10);

  return (
    <Card className={className}>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" /> How have I shot here before?
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Every round you have on file for a course — score, over or under par, and the rating it
            earned.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        {allowSave && selected ? (
          <Button
            variant={savedRow ? "secondary" : "outline"}
            size="sm"
            disabled={saveMut.isPending || unsaveMut.isPending}
            onClick={() => (savedRow ? unsaveMut.mutate() : saveMut.mutate())}
          >
            <Star className={`mr-1.5 h-4 w-4 ${savedRow ? "fill-current" : ""}`} />
            {savedRow ? "Saved" : "Save course"}
          </Button>
        ) : null}
        <Select value={selected ?? undefined} onValueChange={setSelected}>
          <SelectTrigger className="w-full sm:w-72">
            <SelectValue placeholder="Pick a course" />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.courseName} value={o.courseName}>
                {o.courseName}
                {o.rounds > 0 ? ` · ${o.rounds} round${o.rounds === 1 ? "" : "s"}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {optionsQuery.isLoading || historyQuery.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : optionsQuery.isError || historyQuery.isError ? (
          <p className="text-sm text-muted-foreground">
            Your round history didn't load. Refresh the page and it will try again.
          </p>
        ) : options.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No rounds on file yet. Play a round or import your PDGA history and your course-by-course
            scores show up here.
          </p>
        ) : !history || history.roundCount === 0 ? (
          <p className="text-sm text-muted-foreground">
            First time here — nothing on file for {selected}. Play it once and this fills in with your
            score, par, and round rating.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat
                label="Rounds played"
                value={String(history.roundCount)}
                hint={history.lastPlayed ? `Last ${dateLabel(history.lastPlayed)}` : undefined}
              />
              <Stat
                label="Best score"
                value={history.bestStrokes != null ? String(history.bestStrokes) : "—"}
                hint={history.bestToPar != null ? toParLabel(history.bestToPar) : undefined}
              />
              <Stat
                label="Average"
                value={history.avgStrokes != null ? history.avgStrokes.toFixed(1) : "—"}
                hint={history.avgToPar != null ? toParLabel(history.avgToPar) : undefined}
              />
              <Stat
                label="Best rating"
                value={history.bestRating != null ? String(history.bestRating) : "—"}
                hint={history.avgRating != null ? `Avg ${history.avgRating}` : undefined}
              />
            </div>

            {history.lastRating != null ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">
                  Most recent round rated {history.lastRating}
                </span>
                <TrendBadge trend={history.ratingTrend} />
              </div>
            ) : null}

            <RatingTrendChart rounds={history.rounds} />

            <LayoutBreakdown rounds={history.rounds} />

            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Played</th>
                    <th className="py-2 pr-3 font-medium">Layout or event</th>
                    <th className="py-2 pr-3 text-right font-medium">Score</th>
                    <th className="py-2 pr-3 text-right font-medium">To par</th>
                    <th className="py-2 pr-3 text-right font-medium">Rating</th>
                    <th className="py-2 font-medium">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRounds.map((r) => (
                    <tr key={`${r.source}-${r.id}`} className="border-b last:border-0">
                      <td className="py-2 pr-3 whitespace-nowrap">{dateLabel(r.playedOn)}</td>
                      <td className="py-2 pr-3">
                        {r.eventName || r.layoutName || "Casual round"}
                        {r.holes ? (
                          <span className="text-muted-foreground"> · {r.holes} holes</span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.strokes ?? "—"}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{toParLabel(r.toPar)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.rating ?? "—"}</td>
                      <td className="py-2">
                        <Badge variant="outline" className="text-xs">
                          {SOURCE_LABEL[r.source]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {allRounds.length > visibleRounds.length ? (
              <Button variant="outline" size="sm" onClick={() => setShowAllRounds(true)}>
                Show all {allRounds.length} rounds
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Per-layout averages, so a short-tee round doesn't hide a long-tee best. */
function LayoutBreakdown({ rounds }: { rounds: PastCourseRound[] }) {
  const groups = useMemo(() => {
    const map = new Map<
      string,
      { label: string; rounds: number; best: number | null; totalToPar: number; scored: number }
    >();
    for (const r of rounds) {
      const label = (r.layoutName ?? "").trim() || "Layout not recorded";
      const g =
        map.get(label) ?? { label, rounds: 0, best: null, totalToPar: 0, scored: 0 };
      g.rounds += 1;
      if (r.strokes != null) g.best = g.best == null ? r.strokes : Math.min(g.best, r.strokes);
      if (r.toPar != null) {
        g.totalToPar += r.toPar;
        g.scored += 1;
      }
      map.set(label, g);
    }
    return [...map.values()].sort((a, b) => b.rounds - a.rounds).slice(0, 6);
  }, [rounds]);

  if (groups.length < 2) return null;

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        By layout
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {groups.map((g) => (
          <div
            key={g.label}
            className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{g.label}</div>
              <div className="text-xs text-muted-foreground">
                {g.rounds} round{g.rounds === 1 ? "" : "s"}
              </div>
            </div>
            <div className="text-right text-sm tabular-nums">
              <div>Best {g.best ?? "—"}</div>
              <div className="text-xs text-muted-foreground">
                Avg{" "}
                {g.scored > 0 ? toParLabel(Math.round((g.totalToPar / g.scored) * 10) / 10) : "—"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Round ratings over time — the quickest read on whether this course is trending your way. */
function RatingTrendChart({ rounds }: { rounds: PastCourseRound[] }) {
  const points = useMemo(
    () =>
      rounds
        .filter((r) => r.rating != null && r.playedOn)
        .map((r) => ({ date: dateLabel(r.playedOn), rating: r.rating as number, iso: r.playedOn }))
        .sort((a, b) => a.iso.localeCompare(b.iso)),
    [rounds],
  );

  if (points.length < 3) return null;

  const ratings = points.map((p) => p.rating);
  const low = Math.min(...ratings) - 10;
  const high = Math.max(...ratings) + 10;

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Rating trend here
      </div>
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis
              domain={[low, high]}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <Tooltip
              formatter={(v: number | string) => [`${v}`, "Round rating"]}
              labelFormatter={(l: string) => l}
            />
            <Line
              type="monotone"
              dataKey="rating"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
