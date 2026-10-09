import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { formatTeeTime } from "@/lib/tee-time";
import type {
  TrackerEvent,
  TrackerTeeTime,
  TrackerEventRound,
  TrackerMember,
} from "@/lib/tracker.functions";
import { pickTeeRows, resolveRoundCourseLabel } from "@/lib/tracker-rounds";
import { fmtDate, PhasePlaceholder, SectionIntro, SegmentedControl } from "./tracker-ui";

export type TeeSheetProps = {
  events: TrackerEvent[];
  teeTimes: TrackerTeeTime[];
  eventRounds: TrackerEventRound[];
  memberById: Map<string, TrackerMember>;
  tripStart: string | null;
  tripEnd: string | null;
  /** Hide the section heading when the parent already renders one. */
  embedded?: boolean;
};

type Row = {
  key: string;
  date: string | null;
  time: string | null;
  playerName: string;
  playerColor: string | null;
  eventName: string;
  eventLocation: string | null;
  courseName: string | null;
  division: string | null;
  roundLabel: string;
  startingHole: number | null;
};

export function TeeSheetView({
  events,
  teeTimes,
  eventRounds,
  memberById,
  tripStart,
  tripEnd,
  embedded,
}: TeeSheetProps) {
  const [groupBy, setGroupBy] = useState<"day" | "player" | "event" | "course">("day");
  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const roundById = useMemo(() => {
    const m = new Map<string, TrackerEventRound>();
    for (const r of eventRounds) {
      const k = `${r.event_id}:${r.round_number ?? 0}`;
      // Prefer the round-wide row for dates; pool/division rows carry courses.
      if (!m.has(k) || (!r.division && !r.pool)) m.set(k, r);
    }
    return m;
  }, [eventRounds]);

  const rows: Row[] = pickTeeRows(teeTimes)
    .map((t) => {
      const ev = eventById.get(t.event_id);
      const mem = memberById.get(t.member_id);
      if (!ev) return null;
      const rnd = t.round_number != null ? roundById.get(`${t.event_id}:${t.round_number}`) : null;
      const date = rnd?.round_date ?? ev.event_date ?? null;
      return {
        key: t.id,
        date,
        time: t.tee_time ?? null,
        playerName: mem?.display_name ?? (mem ? `#${mem.pdga_number}` : "—"),
        playerColor: mem?.color ?? null,
        eventName: ev.name,
        eventLocation: ev.location ?? null,
        courseName: resolveRoundCourseLabel(
          eventRounds.filter((r) => r.event_id === t.event_id),
          t.round_number ?? null,
          t.division ?? mem?.default_division ?? null,
          t.pool ?? null,
        ),
        division: t.division ?? mem?.default_division ?? null,
        roundLabel: t.round_number != null ? `R${t.round_number}` : "—",
        startingHole: t.starting_hole ?? null,
      } as Row;
    })
    .filter((r): r is Row => !!r)
    .filter((r) => {
      if (!r.date) return true;
      if (tripStart && r.date < tripStart) return false;
      if (tripEnd && r.date > tripEnd) return false;
      return true;
    })
    .sort((a, b) => {
      const da = a.date ?? "9999-12-31";
      const db = b.date ?? "9999-12-31";
      if (da !== db) return da.localeCompare(db);
      return (a.time ?? "99:99").localeCompare(b.time ?? "99:99");
    });

  if (rows.length === 0) {
    return (
      <PhasePlaceholder label="No tee times yet. Import an event or sync from PDGA to fill in the tee sheet." />
    );
  }

  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k =
      groupBy === "day"
        ? (r.date ?? "TBD")
        : groupBy === "player"
          ? r.playerName
          : groupBy === "event"
            ? r.eventName
            : (r.courseName ?? "Course TBD");
    const arr = groups.get(k) ?? [];
    arr.push(r);
    groups.set(k, arr);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {embedded ? (
          <div className="text-xs text-muted-foreground">
            Every scheduled round across the crew, in order.
          </div>
        ) : (
          <SectionIntro
            title="Tee sheet"
            description="Chronological list of every scheduled round across the crew."
            compact
          />
        )}
        <SegmentedControl
          value={groupBy}
          onChange={setGroupBy}
          options={[
            { value: "day", label: "By day" },
            { value: "player", label: "By player" },
            { value: "event", label: "By event" },
            { value: "course", label: "By course" },
          ]}
        />
      </div>
      <div className="space-y-4">
        {Array.from(groups.entries()).map(([k, rs]) => (
          <div key={k} className="rounded-lg border">
            <div className="flex items-center justify-between gap-2 bg-muted/50 px-3 py-1.5 text-xs font-semibold">
              <span className="truncate">{groupBy === "day" ? fmtDate(k) : k}</span>
              <span className="shrink-0 text-muted-foreground">
                {rs.length} tee time{rs.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="divide-y">
              {rs.map((r) => (
                <div
                  key={r.key}
                  className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-3 px-3 py-2 text-sm sm:grid-cols-[80px_minmax(0,1fr)_auto]"
                >
                  <div className="font-mono text-xs text-muted-foreground">
                    {formatTeeTime(r.time) ?? "—"}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {r.playerColor && (
                        <span
                          className="inline-block h-2 w-2 shrink-0 rounded-full"
                          style={{ background: r.playerColor }}
                        />
                      )}
                      <span className="truncate font-medium">{r.playerName}</span>
                      {r.division && (
                        <Badge variant="outline" className="h-4 px-1 text-[9px]">
                          {r.division}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                        {r.roundLabel}
                      </Badge>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {r.eventName}
                      {r.courseName && ` · ${r.courseName}`}
                      {r.startingHole && ` · Hole ${r.startingHole}`}
                    </div>
                    {r.eventLocation && (
                      <div className="truncate text-[11px] text-muted-foreground sm:hidden">
                        {r.eventLocation}
                      </div>
                    )}
                  </div>
                  <div className="hidden text-right text-[11px] text-muted-foreground sm:block">
                    {r.eventLocation}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
