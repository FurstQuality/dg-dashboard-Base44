/**
 * Crew Calendar: week and month grid views of every crew event, broken down by
 * round day. Multi-round events (e.g. a Friday–Sunday National Tour stop) span
 * one calendar day per round, and each day shows the course being played plus
 * every crew member's tee time and division.
 *
 * Mobile renders the same real 7-column calendar (compact cells with member
 * color dots) plus a tap-to-open day detail panel, so nothing is truncated.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  CalendarDays,
  Clock,
  MapPin,
  ExternalLink,
  ListChecks,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  Flag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { crewSwatchStyle, memberInitials } from "@/lib/tracker-colors";
import { formatTeeTime, teeTimeSortKey } from "@/lib/tee-time";
import { pickTeeRows, courseLabel, resolveRoundCourseLabel } from "@/lib/tracker-rounds";
import {
  isLedgestone2026,
  ledgestoneRotation,
  normalizePool,
} from "@/lib/ledgestone-2026-schedule";
import type {
  TrackerMember,
  TrackerEvent,
  TrackerTeeTime,
  TrackerEventRound,
  MemberSnapshot,
} from "@/lib/tracker.functions";
import { Link } from "@tanstack/react-router";

type Props = {
  groupId: string;
  members: TrackerMember[];
  events: TrackerEvent[];
  teeTimes: TrackerTeeTime[];
  eventRounds?: TrackerEventRound[];
  snapshots: MemberSnapshot[];
  tripStart: string | null;
  tripEnd: string | null;
};

const normalizeTee = formatTeeTime;

const teeSortKey = teeTimeSortKey;

function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return toISODate(d);
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function daysInMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function initials(name: string) {
  return memberInitials(name);
}

/** Circular member emblem: profile photo when available, colored initials otherwise. */
function MemberEmblem({
  name,
  color,
  avatarUrl,
  size = 24,
  ring = true,
}: {
  name: string;
  color: string | null;
  avatarUrl: string | null | undefined;
  size?: number;
  ring?: boolean;
}) {
  const dim = { width: size, height: size } as const;
  const fontPx = Math.max(9, Math.round(size * 0.42));
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        title={name}
        loading="lazy"
        style={{ ...dim, borderColor: color ?? undefined }}
        className={cn(
          "shrink-0 rounded-full object-cover",
          ring ? "ring-1 ring-background" : "",
          color ? "border-2" : "",
        )}
      />
    );
  }
  return (
    <span
      title={name}
      style={{ ...dim, ...crewSwatchStyle(color), fontSize: `${fontPx}px` }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-bold text-black",
        ring ? "ring-1 ring-background" : "",
      )}
    >
      {initials(name)}
    </span>
  );
}

function fmtDate(d: string) {
  if (d === "TBD") return "Date TBD";
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** True once a calendar day is in the past — tee times stop mattering then. */
function isPastDay(iso: string | null | undefined) {
  if (!iso || iso === "TBD") return false;
  return new Date(`${iso}T00:00:00`) < new Date(new Date().toDateString());
}

/**
 * Tee time chip. Once a day has been played the tee time is history, so a
 * missing one is not a gap worth flagging — we render nothing instead of "TBD".
 */
function TeeLabel({ tee, past, className }: { tee: string; past: boolean; className?: string }) {
  if (!tee && past) return null;
  return <span className={className}>{tee || "TBD"}</span>;
}

type PlayerSlot = {
  member: TrackerMember;
  name: string;
  avatarUrl: string | null;
  division: string | null;
  pool: string | null;
  tee: string;
  course: string | null;
};

type Occurrence = {
  key: string;
  event: TrackerEvent;
  roundNumber: number | null;
  roundLabel: string | null;
  course: string | null;
  players: PlayerSlot[];
};

/**
 * Hover preview for a player name inside the calendar: who they are, the event
 * and round they're playing that day, the course, their division and tee time.
 */
function PlayerHoverCard({
  groupId,
  player,
  occ,
  rating,
  past,
  children,
}: {
  groupId: string;
  player: PlayerSlot;
  occ: Occurrence;
  rating: number | null;
  past?: boolean;
  children: React.ReactNode;
}) {
  const ev = occ.event;
  const poolLetter = normalizePool(player.pool);
  const rotation =
    poolLetter && isLedgestone2026(ev.name, ev.pdga_event_ref)
      ? ledgestoneRotation(poolLetter)
      : [];
  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent className="z-[70] w-80 space-y-2.5 p-3 text-sm" side="top" align="start">
        <div className="flex items-center gap-2">
          <MemberEmblem
            name={player.name}
            color={player.member.color}
            avatarUrl={player.avatarUrl}
            size={36}
            ring={false}
          />
          <div className="min-w-0 flex-1">
            <Link
              to="/tracker/$groupId/player/$memberId"
              params={{ groupId, memberId: player.member.id }}
              className="block truncate font-semibold leading-tight hover:text-primary hover:underline underline-offset-2"
            >
              {player.name}
            </Link>
            <div className="truncate text-[11px] text-muted-foreground">
              PDGA #{player.member.pdga_number}
              {rating != null && ` · Rated ${rating}`}
            </div>
          </div>
        </div>

        <div className="space-y-1 rounded-md border bg-muted/30 p-2">
          <div className="text-[13px] font-semibold leading-tight">
            {ev.pdga_event_ref ? (
              <Link
                to="/events/pdga/$eventRef"
                params={{ eventRef: ev.pdga_event_ref }}
                className="hover:text-primary hover:underline underline-offset-2"
              >
                {ev.name}
              </Link>
            ) : (
              ev.name
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            {occ.roundNumber !== null && (
              <span className="rounded bg-background px-1.5 py-0.5 font-medium text-foreground">
                {occ.roundLabel || `Round ${occ.roundNumber}`}
              </span>
            )}
            {ev.tier && (
              <span className="rounded bg-background px-1.5 py-0.5 font-medium text-foreground">
                {ev.tier}
              </span>
            )}
            {player.division && (
              <span className="rounded bg-background px-1.5 py-0.5 font-medium text-foreground">
                {player.division}
              </span>
            )}
            {poolLetter && (
              <span className="rounded bg-background px-1.5 py-0.5 font-medium text-foreground">
                Pool {poolLetter}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Flag className="h-3 w-3 shrink-0" />
            <span className="truncate">{player.course ?? occ.course ?? "Course TBD"}</span>
          </div>
          {rotation.length > 0 && (
            <div className="rounded bg-background/70 p-1.5 text-[11px] leading-snug text-muted-foreground">
              <span className="font-medium text-foreground">Pool {poolLetter} rotation:</span>{" "}
              {rotation.map((r) => r.course_name).join(" → ")}
            </div>
          )}

          {ev.location && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{ev.location}</span>
            </div>
          )}
          {(player.tee || !past) && (
            <div className="flex items-center gap-1.5 text-[11px]">
              <Clock className="h-3 w-3 shrink-0 text-primary" />
              <span className="font-semibold text-primary">{player.tee || "Tee time TBD"}</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/tracker/$groupId/player/$memberId"
            params={{ groupId, memberId: player.member.id }}
            className="text-xs font-medium text-primary hover:underline"
          >
            View player
          </Link>
          {ev.url && (
            <a
              href={ev.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> Open on PDGA
            </a>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

export function CrewCalendar({
  groupId,
  members,
  events,
  teeTimes,
  eventRounds = [],
  snapshots,
  tripStart,
  tripEnd,
}: Props) {
  const [mode, setMode] = useState<"week" | "month" | "sheet">("week");

  // Calendar always shows the full slate of upcoming/registered events so
  // players never lose sight of rounds outside the currently selected trip
  // window. Trip range still drives other tracker views.
  void tripStart;
  void tripEnd;
  const inTrip = useMemo(() => events, [events]);

  const snapByNum = useMemo(() => new Map(snapshots.map((s) => [s.pdga_number, s])), [snapshots]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const nameOf = useMemo(
    () => (m: TrackerMember) =>
      m.display_name || snapByNum.get(m.pdga_number)?.name || `#${m.pdga_number}`,
    [snapByNum],
  );

  /**
   * Occurrences keyed by ISO date. A three-round event produces three entries —
   * one per round day — each carrying that round's course and tee times.
   * When the sync has no explicit round dates we lay rounds out on consecutive
   * days starting at the event date, which matches how PDGA weekends run.
   */
  const occurrencesByDay = useMemo(() => {
    const map = new Map<string, Occurrence[]>();
    const roundsFor = (eventId: string) => eventRounds.filter((r) => r.event_id === eventId);

    for (const ev of inTrip) {
      const rounds = roundsFor(ev.id);
      const evTees = pickTeeRows(teeTimes.filter((t) => t.event_id === ev.id));
      const numbers = new Set<number>();
      rounds.forEach((r) => {
        if (typeof r.round_number === "number") numbers.add(r.round_number);
      });
      evTees.forEach((t) => {
        if (typeof t.round_number === "number") numbers.add(t.round_number);
      });

      const dateByRound = new Map<number, string>();
      rounds.forEach((r) => {
        if (typeof r.round_number === "number" && r.round_date)
          dateByRound.set(r.round_number, r.round_date);
      });

      const sorted = [...numbers].sort((a, b) => a - b);
      const base = ev.event_date;
      const slots: Array<{ iso: string | null; round: number | null }> = sorted.length
        ? sorted.map((n) => ({
            iso: dateByRound.get(n) ?? (base ? addDays(base, n - sorted[0]) : null),
            round: n,
          }))
        : [{ iso: base, round: null }];

      // Event-level registrations (no round number yet). Used as the roster
      // for rounds PDGA hasn't posted tee times for, so a future round still
      // lists everyone playing instead of a bare course name.
      const registrations = teeTimes.filter(
        (t) => t.event_id === ev.id && t.round_number == null && t.status !== "withdrawn",
      );

      // Pool assignment per member for this event, taken from whichever round
      // has already been posted.
      const poolByMember = new Map<string, string>();
      for (const t of teeTimes) {
        if (t.event_id !== ev.id || !t.pool) continue;
        if (!poolByMember.has(t.member_id)) poolByMember.set(t.member_id, t.pool);
      }

      for (const slot of slots) {
        if (!slot.iso) continue;
        const roundRows = rounds.filter((r) => (r.round_number ?? null) === slot.round);
        const aggregate = roundRows.find((r) => !r.division && !r.pool) ?? null;
        const poolCourses = new Set(
          roundRows
            .map((r) => courseLabel(r.course_name, r.course_layout))
            .filter(Boolean) as string[],
        );

        const seen = new Set<string>();
        // Prefer an exact round match so a legacy row with no round number
        // never shadows the synced tee time for this day.
        const exact = evTees.filter(
          (t) => slot.round === null || (t.round_number ?? null) === slot.round,
        );
        const roster = exact.length ? exact : registrations;
        const ordered = [
          ...roster,
          ...evTees.filter((t) => !roster.includes(t) && t.round_number == null),
        ];
        const players: PlayerSlot[] = [];
        for (const t of ordered) {
          const matchesRound =
            slot.round === null
              ? true
              : (t.round_number ?? null) === slot.round || t.round_number === null;
          if (!matchesRound) continue;
          if (seen.has(t.member_id)) continue;
          const m = memberById.get(t.member_id);
          if (!m) continue;
          seen.add(t.member_id);
          const division = t.division ?? m.default_division ?? null;
          // A player's pool is fixed for the whole event, so carry it across
          // rounds PDGA hasn't posted tee times for yet — that's what resolves
          // the published pool rotation into a real course instead of "TBD".
          const pool = t.pool ?? poolByMember.get(t.member_id) ?? null;
          players.push({
            member: m,
            name: nameOf(m),
            avatarUrl: snapByNum.get(m.pdga_number)?.avatar_url ?? null,
            division,
            pool,
            tee: normalizeTee(t.tee_time),
            course: resolveRoundCourseLabel(roundRows, slot.round, division, pool),
          });
        }
        players.sort(
          (a, b) => teeSortKey(a.tee) - teeSortKey(b.tee) || a.name.localeCompare(b.name),
        );

        const occ: Occurrence = {
          key: `${ev.id}:${slot.round ?? "x"}:${slot.iso}`,
          event: ev,
          roundNumber: slot.round,
          roundLabel: aggregate?.round_label ?? null,
          // Pool-split rounds play several courses at once — never label the
          // whole round with whichever pool happened to sync first.
          course:
            courseLabel(aggregate?.course_name, aggregate?.course_layout) ??
            (poolCourses.size === 1
              ? [...poolCourses][0]
              : poolCourses.size > 1
                ? `${poolCourses.size} courses by pool`
                : null),
          players,
        };

        const list = map.get(slot.iso) ?? [];
        list.push(occ);
        map.set(slot.iso, list);
      }
    }
    return map;
  }, [inTrip, eventRounds, teeTimes, memberById, nameOf, snapByNum]);

  const [month, setMonth] = useState<Date>(() => {
    const now = new Date();
    const todayIso = toISODate(now);
    const dates = inTrip
      .map((e) => e.event_date)
      .filter((d): d is string => Boolean(d))
      .sort();
    // Default to the current week/month. Only jump ahead when every tracked
    // event is still in the future (nothing to show around today).
    if (dates.length && dates[0] > todayIso) return new Date(dates[0] + "T12:00:00");
    return now;
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [expandedOccs, setExpandedOccs] = useState<Set<string>>(() => new Set());
  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => new Set());
  const toggleKey = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  const grid = useMemo(() => {
    const first = startOfMonth(month);
    const leading = first.getDay();
    const total = daysInMonth(month);
    const cells: Array<{ date: Date; iso: string; inMonth: boolean }> = [];
    for (let i = leading - 1; i >= 0; i--) {
      const d = new Date(first);
      d.setDate(-i);
      cells.push({ date: d, iso: toISODate(d), inMonth: false });
    }
    for (let i = 1; i <= total; i++) {
      const d = new Date(month.getFullYear(), month.getMonth(), i);
      cells.push({ date: d, iso: toISODate(d), inMonth: true });
    }
    while (cells.length < 42) {
      const last = cells[cells.length - 1].date;
      const d = new Date(last);
      d.setDate(d.getDate() + 1);
      cells.push({ date: d, iso: toISODate(d), inMonth: false });
    }
    return cells;
  }, [month]);

  /** Tee sheet: every round day in chronological order with its occurrences. */
  const sheetDays = useMemo(
    () => [...occurrencesByDay.entries()].sort(([a], [b]) => a.localeCompare(b)),
    [occurrencesByDay],
  );

  if (!members.length || !inTrip.length) return null;

  const monthLabel = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const today = toISODate(new Date());

  return (
    <Card>
      <CardHeader className="flex flex-col items-start gap-2 space-y-0 pb-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <CardTitle className="flex min-w-0 items-center gap-2 text-base">
          <CalendarDays className="h-4 w-4 shrink-0 text-primary" /> Crew Calendar
          <Badge variant="secondary" className="ml-1 shrink-0">
            {inTrip.length} event{inTrip.length === 1 ? "" : "s"}
          </Badge>
        </CardTitle>
        <div className="inline-flex w-full rounded-md border p-0.5 sm:w-auto">
          <Button
            size="sm"
            variant={mode === "week" ? "default" : "ghost"}
            className="h-8 flex-1 gap-1 px-2 text-xs sm:flex-none"
            onClick={() => setMode("week")}
          >
            <LayoutGrid className="h-3 w-3" /> Week
          </Button>
          <Button
            size="sm"
            variant={mode === "month" ? "default" : "ghost"}
            className="h-8 flex-1 gap-1 px-2 text-xs sm:flex-none"
            onClick={() => setMode("month")}
          >
            <LayoutGrid className="h-3 w-3" /> Month
          </Button>
          <Button
            size="sm"
            variant={mode === "sheet" ? "default" : "ghost"}
            className="h-8 flex-1 gap-1 px-2 text-xs sm:flex-none"
            onClick={() => setMode("sheet")}
          >
            <ListChecks className="h-3 w-3" /> Tee sheet
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        {mode !== "sheet" ? (
          (() => {
            const isWeek = mode === "week";
            const weekStart = new Date(month);
            weekStart.setDate(month.getDate() - month.getDay());
            weekStart.setHours(12, 0, 0, 0);
            const weekCells: Array<{ date: Date; iso: string; inMonth: boolean }> = [];
            for (let i = 0; i < 7; i++) {
              const d = new Date(weekStart);
              d.setDate(weekStart.getDate() + i);
              weekCells.push({
                date: d,
                iso: toISODate(d),
                inMonth: d.getMonth() === month.getMonth(),
              });
            }
            const cells = isWeek ? weekCells : grid;
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
            const weekLabel = sameMonth
              ? `${weekStart.toLocaleDateString(undefined, { month: "long", day: "numeric" })} – ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`
              : `${weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
            const shift = (dir: 1 | -1) => {
              setSelectedDay(null);
              if (isWeek) {
                const d = new Date(month);
                d.setDate(d.getDate() + dir * 7);
                setMonth(d);
              } else {
                setMonth(new Date(month.getFullYear(), month.getMonth() + dir, 1));
              }
            };
            // Mobile detail panel: selected day, else first day in range with play.
            const firstWithPlay =
              cells.find((c) => (occurrencesByDay.get(c.iso) ?? []).length > 0)?.iso ?? null;
            const detailDay =
              selectedDay && cells.some((c) => c.iso === selectedDay) ? selectedDay : firstWithPlay;

            return (
              <div className="rounded-xl border bg-card">
                <div className="flex items-center justify-between gap-2 px-2 py-2 sm:px-4">
                  <h3 className="min-w-0 truncate font-display text-sm font-bold sm:text-lg">
                    {isWeek ? weekLabel : monthLabel}
                  </h3>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 w-9 p-0"
                      aria-label="Previous"
                      onClick={() => shift(-1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 px-2 text-xs"
                      onClick={() => {
                        setSelectedDay(null);
                        setMonth(new Date());
                      }}
                    >
                      Today
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 w-9 p-0"
                      aria-label="Next"
                      onClick={() => shift(1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Weekday header — shown on every viewport so mobile reads as a real calendar. */}
                <div className="grid grid-cols-7 border-y bg-muted/40 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                    <div key={d} className="px-1 py-1.5 text-center">
                      <span className="sm:hidden">{d[0]}</span>
                      <span className="hidden sm:inline">{d}</span>
                    </div>
                  ))}
                </div>

                {/* ---------- Mobile grid: compact cells + color dots ---------- */}
                <div
                  className={cn(
                    "grid grid-cols-7 sm:hidden",
                    isWeek ? "grid-rows-1" : "grid-rows-6",
                  )}
                >
                  {cells.map((cell) => {
                    const occs = occurrencesByDay.get(cell.iso) ?? [];
                    const isToday = cell.iso === today;
                    const isSelected = cell.iso === detailDay;
                    const dayPlayers = occs.flatMap((o) => o.players);
                    const uniquePlayers = [
                      ...new Map(dayPlayers.map((p) => [p.member.id, p])).values(),
                    ];
                    return (
                      <button
                        key={"mob-" + cell.iso}
                        type="button"
                        onClick={() => setSelectedDay(cell.iso)}
                        className={cn(
                          "flex min-h-[68px] flex-col items-center gap-1 border-b border-r px-0.5 py-1.5",
                          !cell.inMonth && "bg-muted/40 text-muted-foreground opacity-60",
                          isSelected && "bg-primary/10 ring-1 ring-inset ring-primary",
                        )}
                        aria-label={`${fmtDate(cell.iso)}, ${occs.length} event${occs.length === 1 ? "" : "s"}${uniquePlayers.length ? `, ${uniquePlayers.map((p) => p.name).join(", ")}` : ""}`}
                        aria-pressed={isSelected}
                      >
                        <span
                          className={cn(
                            "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                            isToday && "bg-primary text-primary-foreground",
                          )}
                        >
                          {cell.date.getDate()}
                        </span>
                        {occs.length > 0 && (
                          <span className="flex flex-wrap items-center justify-center gap-0.5">
                            {uniquePlayers.slice(0, 4).map((p) => (
                              <MemberEmblem
                                key={p.member.id}
                                name={p.name}
                                color={p.member.color}
                                avatarUrl={p.avatarUrl}
                                size={16}
                                ring={false}
                              />
                            ))}
                            {uniquePlayers.length > 4 && (
                              <span className="text-[9px] font-semibold leading-none text-muted-foreground">
                                +{uniquePlayers.length - 4}
                              </span>
                            )}
                            {uniquePlayers.length === 0 && (
                              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                            )}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* ---------- Mobile day detail ---------- */}
                <div className="sm:hidden">
                  {detailDay ? (
                    <DayDetail
                      groupId={groupId}
                      iso={detailDay}
                      occurrences={occurrencesByDay.get(detailDay) ?? []}
                    />
                  ) : (
                    <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                      No crew rounds scheduled in this {isWeek ? "week" : "month"} yet.
                    </p>
                  )}
                </div>

                {/* ---------- Desktop grid ---------- */}
                <div
                  className={cn(
                    "hidden grid-cols-7 sm:grid",
                    isWeek ? "grid-rows-1" : "grid-rows-6",
                  )}
                >
                  {cells.map((cell) => {
                    const occs = occurrencesByDay.get(cell.iso) ?? [];
                    const isToday = cell.iso === today;
                    const dayExpanded = expandedDays.has(cell.iso);
                    const maxShow = dayExpanded ? occs.length : isWeek ? 5 : 3;
                    return (
                      <div
                        key={cell.iso + (cell.inMonth ? "" : "-o")}
                        className={cn(
                          isWeek
                            ? "flex min-h-[240px] flex-col gap-2 border-b border-r p-2"
                            : "flex min-h-[150px] flex-col gap-1.5 border-b border-r p-2",
                          !cell.inMonth && "bg-muted/40 text-muted-foreground opacity-60",
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={cn(
                              "inline-flex items-center justify-center gap-1 rounded-full text-sm font-semibold",
                              cell.inMonth ? "h-7 w-7" : "h-7 px-1.5",
                              isToday && "bg-primary text-primary-foreground",
                            )}
                          >
                            {!cell.inMonth && (
                              <span className="text-[10px] font-medium uppercase">
                                {cell.date.toLocaleDateString(undefined, { month: "short" })}
                              </span>
                            )}
                            {cell.date.getDate()}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          {occs.slice(0, maxShow).map((occ) => {
                            const occExpanded = expandedOccs.has(occ.key);
                            const occPast = isPastDay(cell.iso);
                            const playerLimit = occExpanded ? occ.players.length : isWeek ? 6 : 4;
                            return (
                              <HoverCard key={occ.key} openDelay={120} closeDelay={80}>
                                <HoverCardTrigger asChild>
                                  <div className="cursor-pointer rounded-md border bg-background/70 px-2 py-1.5 hover:bg-accent/40">
                                    <div
                                      className={cn(
                                        "truncate font-semibold leading-tight",
                                        isWeek ? "text-sm" : "text-xs",
                                      )}
                                    >
                                      {occ.event.name}
                                    </div>
                                    {occ.roundNumber !== null && (
                                      <div className="text-[11px] font-medium text-muted-foreground">
                                        {occ.roundLabel || `Round ${occ.roundNumber}`}
                                      </div>
                                    )}
                                    {(occ.course || occ.event.location) && (
                                      <div className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                                        <Flag className="h-3 w-3 shrink-0" />
                                        <span className="truncate">
                                          {occ.course ?? occ.event.location}
                                        </span>
                                      </div>
                                    )}
                                    {isWeek ? (
                                      <ul className="mt-1.5 space-y-1">
                                        {occ.players.slice(0, playerLimit).map((p) => (
                                          <li
                                            key={p.member.id}
                                            className="flex items-center gap-1.5"
                                          >
                                            <MemberEmblem
                                              name={p.name}
                                              color={p.member.color}
                                              avatarUrl={p.avatarUrl}
                                              size={20}
                                              ring={false}
                                            />
                                            <PlayerHoverCard
                                              groupId={groupId}
                                              player={p}
                                              occ={occ}
                                              rating={
                                                snapByNum.get(p.member.pdga_number)
                                                  ?.current_rating ?? null
                                              }
                                              past={occPast}
                                            >
                                              <span className="min-w-0 flex-1 cursor-pointer truncate text-[11px] hover:text-primary hover:underline underline-offset-2">
                                                {p.name}
                                                {p.division ? (
                                                  <span className="text-muted-foreground">
                                                    {" "}
                                                    · {p.division}
                                                  </span>
                                                ) : null}
                                              </span>
                                            </PlayerHoverCard>
                                            <TeeLabel
                                              tee={p.tee}
                                              past={occPast}
                                              className="shrink-0 text-[11px] font-semibold text-primary"
                                            />
                                          </li>
                                        ))}
                                        {occ.players.length > playerLimit || occExpanded ? (
                                          <li>
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setExpandedOccs((s) => toggleKey(s, occ.key));
                                              }}
                                              className="text-[11px] font-medium text-primary hover:underline"
                                            >
                                              {occExpanded
                                                ? "Show less"
                                                : `+${occ.players.length - playerLimit} more`}
                                            </button>
                                          </li>
                                        ) : null}
                                      </ul>
                                    ) : (
                                      occ.players.length > 0 && (
                                        <ul className="mt-1.5 space-y-0.5">
                                          {occ.players.slice(0, playerLimit).map((p) => (
                                            <li
                                              key={p.member.id}
                                              className="flex items-center gap-1"
                                            >
                                              <MemberEmblem
                                                name={p.name}
                                                color={p.member.color}
                                                avatarUrl={p.avatarUrl}
                                                size={16}
                                                ring={false}
                                              />
                                              <PlayerHoverCard
                                                groupId={groupId}
                                                player={p}
                                                occ={occ}
                                                rating={
                                                  snapByNum.get(p.member.pdga_number)
                                                    ?.current_rating ?? null
                                                }
                                                past={occPast}
                                              >
                                                <span className="min-w-0 flex-1 cursor-pointer truncate text-[10px] hover:text-primary hover:underline underline-offset-2">
                                                  {p.name}
                                                </span>
                                              </PlayerHoverCard>
                                              <TeeLabel
                                                tee={p.tee}
                                                past={occPast}
                                                className="shrink-0 text-[10px] font-semibold text-primary"
                                              />
                                            </li>
                                          ))}
                                          {occ.players.length > playerLimit || occExpanded ? (
                                            <li>
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                  setExpandedOccs((s) => toggleKey(s, occ.key));
                                                }}
                                                className="text-[10px] font-medium text-primary hover:underline"
                                              >
                                                {occExpanded
                                                  ? "Show less"
                                                  : `+${occ.players.length - playerLimit} more`}
                                              </button>
                                            </li>
                                          ) : null}
                                        </ul>
                                      )
                                    )}
                                  </div>
                                </HoverCardTrigger>
                                <HoverCardContent
                                  className="z-40 w-80 space-y-2 p-3 text-sm"
                                  side="top"
                                >
                                  <div className="text-base font-semibold leading-tight">
                                    {occ.event.pdga_event_ref ? (
                                      <Link
                                        to="/events/pdga/$eventRef"
                                        params={{ eventRef: occ.event.pdga_event_ref }}
                                        className="hover:text-primary hover:underline underline-offset-2"
                                      >
                                        {occ.event.name}
                                      </Link>
                                    ) : (
                                      occ.event.name
                                    )}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                    {occ.roundNumber !== null && (
                                      <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">
                                        {occ.roundLabel || `Round ${occ.roundNumber}`}
                                      </span>
                                    )}
                                    {occ.event.tier && (
                                      <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">
                                        {occ.event.tier}
                                      </span>
                                    )}
                                    {(occ.course || occ.event.location) && (
                                      <span className="inline-flex items-center gap-1">
                                        <MapPin className="h-3.5 w-3.5" />
                                        {occ.course ?? occ.event.location}
                                      </span>
                                    )}
                                  </div>
                                  {occ.players.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">
                                      {occPast
                                        ? "No crew tee times were recorded for this round."
                                        : "No crew tee times posted yet."}
                                    </p>
                                  ) : (
                                    <ul className="space-y-1.5">
                                      {occ.players.map((p) => (
                                        <li key={p.member.id} className="flex items-center gap-2">
                                          <MemberEmblem
                                            name={p.name}
                                            color={p.member.color}
                                            avatarUrl={p.avatarUrl}
                                            size={28}
                                            ring={false}
                                          />
                                          <Link
                                            to="/tracker/$groupId/player/$memberId"
                                            params={{ groupId, memberId: p.member.id }}
                                            className="min-w-0 flex-1"
                                          >
                                            <div className="truncate text-sm hover:text-primary hover:underline underline-offset-2">
                                              {p.name}
                                            </div>
                                            <div className="truncate text-[11px] text-muted-foreground">
                                              {[p.division, p.course].filter(Boolean).join(" · ") ||
                                                "Division TBD"}
                                            </div>
                                          </Link>
                                          {(p.tee || !occPast) && (
                                            <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-primary">
                                              <Clock className="h-3 w-3" />
                                              {p.tee || "TBD"}
                                            </span>
                                          )}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                  {occ.event.url && (
                                    <a
                                      href={occ.event.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                    >
                                      <ExternalLink className="h-3 w-3" /> Open on PDGA
                                    </a>
                                  )}
                                </HoverCardContent>
                              </HoverCard>
                            );
                          })}
                          {(occs.length > maxShow || dayExpanded) && (
                            <button
                              type="button"
                              onClick={() => setExpandedDays((s) => toggleKey(s, cell.iso))}
                              className="self-start text-[11px] font-medium text-primary hover:underline"
                            >
                              {dayExpanded ? "Show fewer events" : `+${occs.length - maxShow} more`}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {members.length > 0 && (
                  <div className="flex flex-wrap gap-x-4 gap-y-2 border-t px-3 py-3 text-sm text-muted-foreground sm:px-4">
                    {members.map((m) => {
                      const name = nameOf(m);
                      const avatar = snapByNum.get(m.pdga_number)?.avatar_url ?? null;
                      return (
                        <Link
                          key={m.id}
                          to="/tracker/$groupId/player/$memberId"
                          params={{ groupId, memberId: m.id }}
                          className="inline-flex items-center gap-2 hover:text-primary"
                        >
                          <MemberEmblem
                            name={name}
                            color={m.color}
                            avatarUrl={avatar}
                            size={22}
                            ring={false}
                          />
                          <span className="text-foreground font-medium hover:text-primary hover:underline underline-offset-2">
                            {name}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()
        ) : (
          <div className="space-y-3">
            {sheetDays.length === 0 ? (
              <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                No tee times posted for the crew yet.
              </p>
            ) : (
              sheetDays.map(([date, occs]) => (
                <TeeSheetDay key={date} groupId={groupId} date={date} occurrences={occs} />
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Mobile detail for one selected calendar day — course, round, and every tee time. */
function DayDetail({
  groupId,
  iso,
  occurrences,
}: {
  groupId: string;
  iso: string;
  occurrences: Occurrence[];
}) {
  const past = isPastDay(iso);
  return (
    <div className="border-t px-3 py-3">
      <div className="mb-2 text-sm font-semibold">{fmtDate(iso)}</div>
      {occurrences.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nobody in the crew is playing this day.</p>
      ) : (
        <div className="space-y-2.5">
          {occurrences.map((occ) => (
            <div key={occ.key} className="rounded-lg border bg-background/70 p-2.5">
              <div className="flex flex-wrap items-start justify-between gap-1.5">
                {occ.event.pdga_event_ref ? (
                  <Link
                    to="/events/pdga/$eventRef"
                    params={{ eventRef: occ.event.pdga_event_ref }}
                    className="min-w-0 flex-1 text-sm font-semibold leading-tight hover:text-primary hover:underline underline-offset-2"
                  >
                    {occ.event.name}
                  </Link>
                ) : (
                  <span className="min-w-0 flex-1 text-sm font-semibold leading-tight">
                    {occ.event.name}
                  </span>
                )}
                {occ.event.tier && (
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {occ.event.tier}
                  </Badge>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                {occ.roundNumber !== null && (
                  <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">
                    {occ.roundLabel || `Round ${occ.roundNumber}`}
                  </span>
                )}
                <span className="inline-flex min-w-0 items-center gap-1">
                  <Flag className="h-3 w-3 shrink-0" />
                  <span className="truncate">{occ.course ?? "Course TBD"}</span>
                </span>
                {occ.event.location && (
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{occ.event.location}</span>
                  </span>
                )}
              </div>
              {occ.players.length === 0 ? (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {past
                    ? "No tee times were recorded for this round."
                    : "Tee times not posted yet."}
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {occ.players.map((p) => (
                    <li
                      key={p.member.id}
                      className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5"
                    >
                      <MemberEmblem
                        name={p.name}
                        color={p.member.color}
                        avatarUrl={p.avatarUrl}
                        size={28}
                        ring={false}
                      />
                      <Link
                        to="/tracker/$groupId/player/$memberId"
                        params={{ groupId, memberId: p.member.id }}
                        className="min-w-0 flex-1"
                      >
                        <div className="truncate text-xs font-medium hover:text-primary hover:underline underline-offset-2">
                          {p.name}
                        </div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {[p.division, p.course].filter(Boolean).join(" · ") || "Division TBD"}
                        </div>
                      </Link>
                      {p.tee ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded bg-primary/10 px-1.5 py-1 text-[11px] font-semibold text-primary">
                          <Clock className="h-3 w-3" /> {p.tee}
                        </span>
                      ) : past ? null : (
                        <span className="shrink-0 text-[10px] text-muted-foreground">Tee TBD</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {occ.event.url && (
                <a
                  href={occ.event.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> Open on PDGA
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TeeSheetDay({
  groupId,
  date,
  occurrences,
}: {
  groupId: string;
  date: string;
  occurrences: Occurrence[];
}) {
  const isPast = isPastDay(date);
  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-sm font-semibold">{fmtDate(date)}</span>
        </div>
        {isPast && (
          <Badge variant="outline" className="shrink-0 text-[10px]">
            Past
          </Badge>
        )}
      </div>
      <div className="divide-y">
        {occurrences.map((occ) => (
          <div key={occ.key} className="p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {occ.event.pdga_event_ref ? (
                <Link
                  to="/events/pdga/$eventRef"
                  params={{ eventRef: occ.event.pdga_event_ref }}
                  className="font-medium hover:text-primary hover:underline underline-offset-2"
                >
                  {occ.event.name}
                </Link>
              ) : (
                <span className="font-medium">{occ.event.name}</span>
              )}
              {occ.roundNumber !== null && (
                <Badge variant="secondary" className="text-[10px]">
                  {occ.roundLabel || `Round ${occ.roundNumber}`}
                </Badge>
              )}
              {occ.event.tier && (
                <Badge variant="outline" className="text-[10px]">
                  {occ.event.tier}
                </Badge>
              )}
              <span className="inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                <Flag className="h-3 w-3 shrink-0" />
                <span className="truncate">{occ.course ?? "Course TBD"}</span>
              </span>
              {occ.event.location && (
                <span className="inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{occ.event.location}</span>
                </span>
              )}
              {occ.event.url && (
                <a
                  href={occ.event.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> PDGA
                </a>
              )}
            </div>
            {occ.players.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {isPast
                  ? "No tee times were recorded for this round."
                  : "Tee times not posted yet."}
              </p>
            ) : (
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {occ.players.map((p) => (
                  <li
                    key={p.member.id}
                    className="flex items-center gap-2.5 rounded-md border bg-card px-2.5 py-2 text-sm"
                  >
                    <MemberEmblem
                      name={p.name}
                      color={p.member.color}
                      avatarUrl={p.avatarUrl}
                      size={32}
                      ring={false}
                    />
                    <Link
                      to="/tracker/$groupId/player/$memberId"
                      params={{ groupId, memberId: p.member.id }}
                      className="min-w-0 flex-1"
                    >
                      <div className="truncate text-xs font-medium hover:text-primary hover:underline underline-offset-2">
                        {p.name}
                      </div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        #{p.member.pdga_number}
                        {p.division ? ` · ${p.division}` : ""}
                        {p.course ? ` · ${p.course}` : ""}
                      </div>
                    </Link>
                    <div className="shrink-0 text-right">
                      {p.tee ? (
                        <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                          <Clock className="h-3 w-3" /> {p.tee}
                        </span>
                      ) : isPast ? null : (
                        <span className="text-[10px] text-muted-foreground">Tee TBD</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
