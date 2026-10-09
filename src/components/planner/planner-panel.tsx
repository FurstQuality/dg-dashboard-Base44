/**
 * Planner panel — the map, week, and month views of the local schedule, with
 * distance / weekday / event-type filters shared across all three.
 */
import { Suspense, lazy, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, Loader2, LocateFixed, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MonthGrid, type CalendarEvent } from "@/components/calendar/month-grid";
import { WeekGrid } from "@/components/planner/week-grid";
import { PlannerLink } from "@/components/planner/planner-link";
import { AddToScheduleButton } from "@/components/planner/add-to-schedule-button";
import { listPlannerEvents } from "@/lib/planner.functions";
import {
  DOW_LABELS,
  KIND_LABEL,
  RADIUS_OPTIONS,
  addDays,
  formatOccurrenceDate,
  occurrenceSubtitle,
  startOfWeek,
  toISODate,
  uniqueEvents,
  type PlannerKind,
  type PlannerOccurrence,
} from "@/lib/planner";

const PlannerMap = lazy(() =>
  import("@/components/planner/planner-map").then((m) => ({ default: m.PlannerMap })),
);

export type PlannerView = "map" | "week" | "month";

const KIND_OPTIONS: PlannerKind[] = ["league", "tournament", "casual"];

function monthBounds(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  return { from: toISODate(first), to: toISODate(last) };
}

export function PlannerPanel({
  view,
  q,
  state,
}: {
  view: PlannerView;
  q?: string;
  state?: string;
}) {
  const today = toISODate(new Date());
  const fetchPlanner = useServerFn(listPlannerEvents);

  const [kinds, setKinds] = useState<PlannerKind[]>([]);
  const [dows, setDows] = useState<number[]>([]);
  const [radius, setRadius] = useState<number | null>(null);
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today));
  const [month, setMonth] = useState(() => new Date());

  const window = useMemo(() => {
    if (view === "week") return { from: weekStart, to: addDays(weekStart, 6) };
    if (view === "month") return monthBounds(month);
    return { from: today, to: addDays(today, 90) };
  }, [view, weekStart, month, today]);

  const query = useQuery({
    queryKey: [
      "planner",
      window.from,
      window.to,
      kinds.join(","),
      dows.join(","),
      radius,
      origin?.lat ?? null,
      origin?.lng ?? null,
      q ?? "",
      state ?? "",
    ],
    queryFn: () =>
      fetchPlanner({
        data: {
          from: window.from,
          to: window.to,
          kinds: kinds.length ? kinds : undefined,
          dows: dows.length ? dows : undefined,
          q: q?.trim() ? q.trim() : undefined,
          state: state?.trim() ? state.trim() : undefined,
          lat: origin?.lat ?? null,
          lng: origin?.lng ?? null,
          radiusMiles: origin ? radius : null,
        },
      }),
    staleTime: 60_000,
  });

  const occurrences: PlannerOccurrence[] = query.data?.occurrences ?? [];
  const unmapped = query.data?.unmapped ?? 0;

  function locateMe() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setRadius((r) => r ?? 50);
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  const calendarEvents: CalendarEvent[] = useMemo(
    () =>
      occurrences.map((occ) => ({
        id: occ.id,
        title: occ.title,
        starts_on: occ.date,
        ends_on: occ.endDate,
        status: "interested",
        source: occ.source === "scene" ? "disc_golf_scene" : occ.source,
        kind: occ.kind,
        tier: occ.tier,
        recurrence_dow: null,
      })),
    [occurrences],
  );

  const filterKey = `${window.from}:${window.to}:${kinds.join(",")}:${dows.join(",")}:${radius ?? "any"}:${q ?? ""}:${state ?? ""}`;

  const nextUp = useMemo(() => uniqueEvents(occurrences).slice(0, 8), [occurrences]);

  return (
    <div className="space-y-4">
      {/* Planner filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/60 p-2">
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
          {KIND_OPTIONS.map((k) => {
            const active = kinds.includes(k);
            return (
              <button
                key={k}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  setKinds((prev) => (active ? prev.filter((x) => x !== k) : [...prev, k]))
                }
                className={`rounded px-2 py-1 text-xs font-semibold transition ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {KIND_LABEL[k]}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
          {DOW_LABELS.map((label, dow) => {
            const active = dows.includes(dow);
            return (
              <button
                key={label}
                type="button"
                aria-pressed={active}
                title={`Show ${label} events`}
                onClick={() =>
                  setDows((prev) => (active ? prev.filter((x) => x !== dow) : [...prev, dow]))
                }
                className={`rounded px-1.5 py-1 text-xs font-semibold transition ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <Button size="sm" variant="outline" className="h-8" onClick={locateMe} disabled={locating}>
          {locating ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <LocateFixed className="mr-1 h-3.5 w-3.5" />
          )}
          {origin ? "Update my area" : "Use my location"}
        </Button>

        <Select
          value={radius ? String(radius) : "any"}
          onValueChange={(v) => setRadius(v === "any" ? null : Number(v))}
          disabled={!origin}
        >
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SelectValue placeholder="Any distance" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any distance</SelectItem>
            {RADIUS_OPTIONS.map((r) => (
              <SelectItem key={r} value={String(r)}>
                Within {r} miles
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="ml-auto text-xs text-muted-foreground">
          {query.isPending
            ? "Building your local schedule…"
            : `${occurrences.length.toLocaleString()} play date${occurrences.length === 1 ? "" : "s"} · ${uniqueEvents(occurrences).length.toLocaleString()} event${uniqueEvents(occurrences).length === 1 ? "" : "s"}`}
        </span>
      </div>

      {query.isError ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          We couldn&apos;t load the planner just now. Try again in a moment.
        </div>
      ) : null}

      {view === "map" ? (
        <div className="space-y-3">
          <Suspense
            fallback={<Skeleton className="h-[460px] w-full rounded-xl sm:h-[600px] lg:h-[680px]" />}
          >
            <PlannerMap
              occurrences={occurrences}
              loading={query.isPending}
              filterKey={filterKey}
              focus={origin}
              unmapped={unmapped}
              onLocate={(coords) => {
                setOrigin(coords);
                setRadius((r) => r ?? 50);
              }}
            />
          </Suspense>

          {nextUp.length ? (
            <div className="rounded-xl border border-border bg-card/60 p-3">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <CalendarDays className="h-4 w-4" /> Coming up near you
              </h3>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {nextUp.map((occ) => (
                  <li
                    key={occ.id}
                    className="rounded-lg border border-border/60 bg-background/60 p-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <PlannerLink
                        occurrence={occ}
                        className="truncate text-sm font-medium hover:underline"
                      >
                        {occ.title}
                      </PlannerLink>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {KIND_LABEL[occ.kind]}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {occ.recurring
                        ? occurrenceSubtitle(occ)
                        : `${formatOccurrenceDate(occ.date)} · ${occ.courseName ?? occ.location ?? "Location unlisted"}`}
                    </p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      {occ.distanceMiles != null ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {occ.distanceMiles.toFixed(0)} mi
                        </span>
                      ) : (
                        <span />
                      )}
                      <AddToScheduleButton
                        occurrence={occ}
                        variant="ghost"
                        className="h-7 px-1.5 text-xs"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : view === "week" ? (
        <WeekGrid
          weekStart={weekStart}
          occurrences={occurrences}
          onWeekChange={(iso) => setWeekStart(startOfWeek(iso))}
          today={today}
        />
      ) : (
        <div className="rounded-xl border border-border bg-card/60 p-2">
          <MonthGrid
            month={month}
            events={calendarEvents}
            onMonthChange={setMonth}
            onSelectDate={(iso) => setWeekStart(startOfWeek(iso))}
          />
          <p className="px-2 pb-1 pt-2 text-xs text-muted-foreground">
            Click a day to jump the week view to it.
          </p>
        </div>
      )}
    </div>
  );
}
