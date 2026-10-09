/**
 * PDGA event detail — canonical view that overlays the tracker crew onto the
 * live PDGA field. Reads through getPdgaEventBundle so pdga_tour_events is
 * the single source of truth. Renders:
 *   - Header (info + refresh + linked in-app tournament)
 *   - Registration & links panel
 *   - You / crew overlays
 *   - Multi-round schedule per division (course + layout)
 *   - Per-round tee times for your crew
 *   - Crew results (place / points) when the event has finished
 *   - Full field with search / division filter / crew-only toggle
 */
import { PageShell } from "@/components/shell/page-shell";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getPdgaEventBundle } from "@/lib/events.functions";
import { resolvePdgaDgsLink } from "@/lib/pdga-dgs-link.functions";
import {
  getPdgaEventRecurrenceDow,
  setPdgaEventRecurrenceDow,
} from "@/lib/scheduled-events.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { EventOddsInsight } from "@/components/statboard/event-odds-insight";
import { EventWeather } from "@/components/event-weather";
import { LiveScoreboardCard } from "@/components/events/live-scoreboard-card";
import { TrackEventButton } from "@/components/tracker/track-event-button";
import { toast } from "sonner";
import {
  ExternalLink,
  MapPin,
  RefreshCcw,
  Users,
  Trophy,
  Search,
  Calendar,
  Ticket,
  Medal,
  Clock,
  CalendarClock,
} from "lucide-react";

/**
 * A PDGA event is treated as a *league* (not a tournament) when the tier is
 * "L" or the title reads like a recurring weekly night (singles/doubles league,
 * "sanctioned singles", "monday night", etc.). Those events run weekly and
 * benefit from a chosen day-of-week rather than a single date range.
 */
function looksLikeLeague(
  title: string | null | undefined,
  tier: string | null | undefined,
): boolean {
  if ((tier ?? "").toUpperCase() === "L") return true;
  const s = (title ?? "").toLowerCase();
  if (/\bleague\b/.test(s)) return true;
  if (/\bsanctioned\b.*\bsingles\b/.test(s) || /\bsanctioned\b.*\bdoubles\b/.test(s)) return true;
  if (/\b(mon|tues|wednes|thurs|fri|satur|sun)day\b.*\b(night|singles|doubles)\b/.test(s))
    return true;
  if (/\bweekly\b/.test(s)) return true;
  return false;
}

const DOW_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const Route = createFileRoute("/_authenticated/events/pdga/$eventRef")({
  head: ({ params }) => ({
    meta: [
      { title: `PDGA Event ${params.eventRef} — DG Dashboard` },
      {
        name: "description",
        content: "Rounds, tee times, crew overlay, results, and ratings for a PDGA event.",
      },
      { property: "og:title", content: `PDGA Event ${params.eventRef} — DG Dashboard` },
      {
        property: "og:description",
        content: "Rounds, tee times, crew overlay, results, and ratings for a PDGA event.",
      },
    ],
  }),
  component: EventDetailPage,
});

function fmtDate(iso: string | null) {
  if (!iso) return "TBD";
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function EventDetailPage() {
  const { eventRef } = Route.useParams();
  const load = useServerFn(getPdgaEventBundle);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["pdga-event-bundle", eventRef],
    queryFn: () => load({ data: { eventRef } }),
    staleTime: 60_000,
  });

  // Bidirectional link to the Disc Golf Scene event + course. Cached in
  // pdga_dgs_links so this is a one-shot fetch per event.
  const resolveDgs = useServerFn(resolvePdgaDgsLink);
  const dgsQuery = useQuery({
    queryKey: ["pdga-dgs-link", eventRef],
    queryFn: () => resolveDgs({ data: { eventRef } }),
    staleTime: 10 * 60 * 1000,
  });
  const dgs = dgsQuery.data ?? null;
  const dgsSchedule = dgs?.dgs_schedule ?? [];
  // Days are the natural grouping: DGS publishes several blocks per date.
  const dgsScheduleDays = useMemo(() => {
    const map = new Map<string, typeof dgsSchedule>();
    for (const row of dgsSchedule) {
      const key = row.date_label || row.date || "Schedule";
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [dgsSchedule]);
  // PDGA rarely publishes a first tee time; the TD's DGS schedule usually does.
  const dgsFirstStart = dgsSchedule.find((r) => r.start_time)?.start_time ?? null;

  // Per-user recurring weekday selection (leagues only; UI is hidden for tournaments).
  const qc = useQueryClient();
  const getDow = useServerFn(getPdgaEventRecurrenceDow);
  const setDow = useServerFn(setPdgaEventRecurrenceDow);
  const dowQuery = useQuery({
    queryKey: ["pdga-event-dow", eventRef],
    queryFn: () => getDow({ data: { eventRef } }),
    staleTime: 60_000,
  });
  const setDowMutation = useMutation({
    mutationFn: (dow: number | null) =>
      setDow({
        data: {
          eventRef,
          dow,
          title: data?.info.name ?? undefined,
          event_url: data?.info.url ?? null,
        },
      }),
    onSuccess: (res) => {
      qc.setQueryData(["pdga-event-dow", eventRef], {
        scheduledEventId: res.id,
        recurrence_dow: res.recurrence_dow,
      });
      qc.invalidateQueries({ queryKey: ["schedule"] });
      qc.invalidateQueries({ queryKey: ["events-library"] });
      toast.success(
        res.recurrence_dow == null
          ? "Weekly day cleared"
          : `League set to ${DOW_LABELS[res.recurrence_dow]}s`,
      );
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn't save day"),
  });

  const [q, setQ] = useState("");
  const [division, setDivision] = useState<string>("");
  const [showCrewOnly, setShowCrewOnly] = useState(false);

  const roster = data?.roster ?? [];
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return roster.filter((r) => {
      if (division && !r.rounds.some((rd) => rd.division === division) && r.division !== division)
        return false;
      if (showCrewOnly && !r.in_crew && !r.is_me) return false;
      if (
        s &&
        !(
          r.name?.toLowerCase().includes(s) ||
          r.pdga_number.includes(s) ||
          r.crew_display_name?.toLowerCase().includes(s)
        )
      )
        return false;
      return true;
    });
  }, [roster, q, division, showCrewOnly]);

  if (isLoading || !data) {
    return (
      <div className="container mx-auto max-w-5xl p-6 text-sm text-muted-foreground">
        Loading event…
      </div>
    );
  }

  const { info, crew, divisions, tournament, me, schedule, crew_finishes } = data;

  // Group schedule rows by round → { round: { division: {course, layout} } }
  const scheduleByRound = new Map<
    number,
    Array<{ division: string; course_name: string | null; course_layout: string | null }>
  >();
  for (const s of schedule) {
    const arr = scheduleByRound.get(s.round_number) ?? [];
    arr.push({ division: s.division, course_name: s.course_name, course_layout: s.course_layout });
    scheduleByRound.set(s.round_number, arr);
  }
  const roundNumbers = Array.from(scheduleByRound.keys()).sort((a, b) => a - b);

  const today = new Date().toISOString().slice(0, 10);
  const isPast = !!info.end_date && info.end_date < today;
  const hasResults = crew_finishes.length > 0 && crew_finishes.some((f) => f.place != null);
  const isLeague = looksLikeLeague(info.name, info.tier);
  const currentDow = dowQuery.data?.recurrence_dow ?? null;

  return (
    <PageShell>
      <div className="flex items-center justify-end">

        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCcw className={`mr-1 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-xl">{info.name ?? `PDGA event ${eventRef}`}</CardTitle>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {info.tier && <Badge variant="secondary">{info.tier}</Badge>}
                {isLeague && (
                  <Badge
                    variant="outline"
                    className="border-violet-500/40 text-violet-500 text-[10px]"
                  >
                    League
                  </Badge>
                )}
                {info.sanctioning && (
                  <Badge variant="outline" className="text-[10px]">
                    {info.sanctioning}
                  </Badge>
                )}
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {fmtDate(info.start_date)}
                  {info.end_date && info.end_date !== info.start_date
                    ? ` – ${fmtDate(info.end_date)}`
                    : ""}
                </span>
                {info.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {info.location}
                  </span>
                )}
                {isPast && <Badge className="h-4 px-1 text-[9px]">Completed</Badge>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <TrackEventButton
                event={{
                  eventRef,
                  name: info.name ?? `PDGA event ${eventRef}`,
                  eventDate: info.start_date ?? null,
                  location: info.location ?? null,
                  tier: info.tier ?? null,
                  url: info.url ?? `https://www.pdga.com/tour/event/${eventRef}`,
                }}
              />
              <a
                href={info.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent"
              >
                <ExternalLink className="h-3 w-3" /> PDGA event page
              </a>
              {info.registration_url && (
                <a
                  href={info.registration_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent"
                >
                  <Ticket className="h-3 w-3" /> Registration
                  {info.registration_status && (
                    <span className="text-muted-foreground">· {info.registration_status}</span>
                  )}
                </a>
              )}
              {tournament && (
                <Link
                  to="/tournaments/$slug"
                  params={{ slug: tournament.slug }}
                  className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20"
                >
                  <Trophy className="h-3 w-3" /> In-app tournament
                </Link>
              )}
              {dgs?.dgs_event_url && (
                <a
                  href={dgs.dgs_event_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent"
                  title="Disc Golf Scene tournament page"
                >
                  <ExternalLink className="h-3 w-3" /> Disc Golf Scene
                </a>
              )}
              {dgs?.dgs_course_url && (
                <a
                  href={dgs.dgs_course_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent"
                  title="Disc Golf Scene course page"
                >
                  <MapPin className="h-3 w-3" /> {dgs.dgs_course_name ?? "DGS course"}
                </a>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Field" value={roster.length} />
          <Stat label="Rounds" value={roundNumbers.length || "—"} />
          <Stat label="Divisions" value={divisions.length} />
          <Stat
            label="Crew"
            value={crew.length + (me ? 1 : 0)}
            icon={<Users className="h-3.5 w-3.5" />}
          />
          <Stat label="Ref" value={eventRef} />
        </CardContent>
      </Card>

      {isLeague && (
        <Card className="border-violet-500/30 bg-violet-500/[0.04]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4 text-violet-500" /> Weekly schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3 pt-0 text-sm">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Plays on
              </div>
              <div className="font-semibold">
                {currentDow == null ? "Not set" : `Every ${DOW_LABELS[currentDow]}`}
              </div>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Select
                value={currentDow == null ? "none" : String(currentDow)}
                onValueChange={(v) => setDowMutation.mutate(v === "none" ? null : Number(v))}
                disabled={setDowMutation.isPending || dowQuery.isLoading}
              >
                <SelectTrigger className="h-9 w-[180px]">
                  <SelectValue placeholder="Choose a day" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not a weekly league</SelectItem>
                  {DOW_LABELS.map((label, i) => (
                    <SelectItem key={i} value={String(i)}>
                      Every {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="basis-full text-xs text-muted-foreground">
              PDGA doesn't always publish which weekday a sanctioned league runs. Setting the day
              here makes it show up only on that weekday of your calendar, instead of every day in
              the season range.
            </p>
          </CardContent>
        </Card>
      )}

      {dgsScheduleDays.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4" /> Event schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <p className="text-xs text-muted-foreground">
              Times published by the tournament director on Disc Golf Scene.
            </p>
            {dgsScheduleDays.map(([label, rows]) => (
              <div key={label} className="rounded-lg border bg-card/60 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {label}
                </div>
                <div className="mt-2 space-y-2">
                  {rows.map((row, i) => (
                    <div key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                      <span className="font-semibold tabular-nums">
                        {row.start_time ?? "Time TBD"}
                        {row.end_time ? ` – ${row.end_time}` : ""}
                      </span>
                      {row.detail && <span>{row.detail}</span>}
                      {row.course_name && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {row.course_url ? (
                            <a
                              href={row.course_url}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:underline"
                            >
                              {row.course_name}
                            </a>
                          ) : (
                            row.course_name
                          )}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {dgs?.dgs_event_url && (
              <a
                href={dgs.dgs_event_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" /> Full details on Disc Golf Scene
              </a>
            )}
          </CardContent>
        </Card>
      )}

      <LiveScoreboardCard eventRef={eventRef} />

      <EventWeather location={info.location ?? null} date={info.start_date ?? null} />

      <EventOddsInsight pdgaEventRef={eventRef} />

      {me && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">You're registered</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Division
              </div>
              <div className="font-semibold">{me.division ?? "—"}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                First tee
              </div>
              <div className="font-semibold tabular-nums">
                {me.tee_time ?? dgsFirstStart ?? "TBD"}
              </div>
              {!me.tee_time && dgsFirstStart && (
                <div className="text-[10px] text-muted-foreground">
                  From the Disc Golf Scene schedule
                </div>
              )}
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Rating
              </div>
              <div className="font-semibold tabular-nums">{me.current_rating ?? "—"}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                PDGA #
              </div>
              <div className="font-semibold tabular-nums">{me.pdga_number}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {roundNumbers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4" /> Rounds & courses
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {roundNumbers.map((rn) => {
              const rows = scheduleByRound.get(rn) ?? [];
              // Group divisions that play the same course/layout together.
              const grouped = new Map<string, string[]>();
              for (const r of rows) {
                const key = `${r.course_name ?? "TBD"}||${r.course_layout ?? ""}`;
                const arr = grouped.get(key) ?? [];
                arr.push(r.division);
                grouped.set(key, arr);
              }
              return (
                <div key={rn} className="rounded-md border">
                  <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-1.5">
                    <div className="text-sm font-semibold">Round {rn}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {rows.length} division{rows.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div className="divide-y">
                    {Array.from(grouped.entries()).map(([key, divs]) => {
                      const [course, layout] = key.split("||");
                      return (
                        <div
                          key={key}
                          className="grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">{course || "Course TBD"}</div>
                            {layout && (
                              <div className="truncate text-xs text-muted-foreground">{layout}</div>
                            )}
                          </div>
                          <div className="flex max-w-[240px] flex-wrap justify-end gap-1">
                            {divs.sort().map((d) => (
                              <Badge key={d} variant="outline" className="text-[10px]">
                                {d}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {(crew.length > 0 || me) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Your crew here ({crew.length + (me ? 1 : 0)})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {(me ? [me] : []).concat(crew).map((c) => {
                const perRound = c.rounds.filter((r) => r.round_number != null);
                return (
                  <div
                    key={c.pdga_number}
                    className="grid grid-cols-[auto_1fr_auto] items-start gap-2 px-3 py-2 text-sm"
                  >
                    <span
                      className="mt-1 inline-block h-2 w-2 rounded-full"
                      style={{
                        background: c.is_me
                          ? "hsl(var(--primary))"
                          : (c.crew_color ?? "hsl(var(--muted-foreground))"),
                      }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">
                          {c.is_me ? "You" : (c.crew_display_name ?? c.name ?? c.pdga_number)}
                        </span>
                        {c.is_me && <Badge className="h-4 px-1 text-[9px]">You</Badge>}
                        <span className="truncate text-xs text-muted-foreground">
                          #{c.pdga_number}
                          {c.current_rating ? ` · ${c.current_rating}` : ""}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {c.division ?? "—"}
                        {!c.is_me && c.crew_group_name ? ` · ${c.crew_group_name}` : ""}
                      </div>
                      {perRound.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                          {perRound.map((r, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-0.5 tabular-nums"
                            >
                              <span className="font-semibold">R{r.round_number}</span>
                              {r.tee_time ? (
                                <span className="inline-flex items-center gap-0.5">
                                  <Clock className="h-3 w-3" />
                                  {r.tee_time}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">TBD</span>
                              )}
                              {r.pool && <span className="text-muted-foreground">P{r.pool}</span>}
                              {r.starting_hole && (
                                <span className="text-muted-foreground">H{r.starting_hole}</span>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {c.division ?? "—"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {hasResults && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Medal className="h-4 w-4" /> Crew results
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {crew_finishes.map((f) => (
                <div
                  key={f.pdga_number}
                  className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-2 px-3 py-2 text-sm"
                >
                  <span className="w-8 text-right font-bold tabular-nums">
                    {f.place != null ? `#${f.place}` : "—"}
                  </span>
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: f.crew_color ?? "hsl(var(--primary))" }}
                  />
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {f.crew_display_name ?? f.name ?? f.pdga_number}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      #{f.pdga_number}
                      {f.division ? ` · ${f.division}` : ""}
                    </div>
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {f.points != null ? `${f.points} pts` : ""}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Full field</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Player or PDGA #"
                  className="h-8 w-[180px] pl-7"
                />
              </div>
              <Select
                value={division || "any"}
                onValueChange={(v) => setDivision(v === "any" ? "" : v)}
              >
                <SelectTrigger className="h-8 w-[130px]">
                  <SelectValue placeholder="Division" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">All divisions</SelectItem>
                  {divisions.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="inline-flex select-none items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={showCrewOnly}
                  onChange={(e) => setShowCrewOnly(e.target.checked)}
                />
                Crew only
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No players match this filter.</div>
          ) : (
            <div className="max-h-[560px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Player</th>
                    <th className="px-3 py-2 text-left">Division</th>
                    <th className="px-3 py-2 text-right">Rating</th>
                    <th className="px-3 py-2 text-right">First tee</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr
                      key={r.pdga_number}
                      className={
                        r.is_me ? "bg-primary/10" : r.in_crew ? "bg-emerald-500/5" : undefined
                      }
                    >
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          {r.is_me ? (
                            <Badge className="h-4 px-1 text-[9px]">You</Badge>
                          ) : (
                            r.in_crew && (
                              <span
                                className="inline-block h-2 w-2 rounded-full"
                                style={{ background: r.crew_color ?? "hsl(var(--primary))" }}
                              />
                            )
                          )}
                          <span className="truncate">{r.name ?? r.pdga_number}</span>
                          <span className="text-xs text-muted-foreground">#{r.pdga_number}</span>
                        </div>
                      </td>
                      <td className="px-3 py-1.5">
                        <Badge variant="outline" className="text-[10px]">
                          {r.division ?? "—"}
                        </Badge>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {r.current_rating ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.tee_time ?? "TBD"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border bg-card/50 px-3 py-2">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}
