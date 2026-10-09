import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { LIVE_CHANGE_TOPIC } from "@/lib/tracker/live-changes";
import { getMyPrefs } from "@/lib/platform-config.functions";
import { useCallback, useEffect, useMemo, useState } from "react";
import { X, Trash2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type {
  TrackerEvent,
  TrackerTeeTime,
  TrackerMember,
  MemberSnapshot,
  TrackerEventRound,
} from "@/lib/tracker.functions";
import { clearTrackerAlerts } from "@/lib/tracker.functions";
import {
  estimateEventWindow,
  evaluateSameDayConflict,
  inferFormat,
} from "@/lib/tournament-knowledge";
import { fmtDate, SectionIntro } from "./tracker-ui";
import { formatTeeTime, teeTimeSortKey } from "@/lib/tee-time";

export type ChangeRow = {
  id: string;
  group_id: string;
  event_id: string | null;
  member_id: string | null;
  field: string;
  from_value: string | null;
  to_value: string | null;
  severity: string;
  source: string;
  actor_id: string | null;
  created_at: string;
};

export type AlertsProps = {
  changes: ChangeRow[];
  events: TrackerEvent[];
  memberById: Map<string, TrackerMember>;
  snapByNum: Map<string, MemberSnapshot>;
  teeTimes: TrackerTeeTime[];
  /** Per-round course assignments, used to name courses in travel warnings. */
  rounds?: TrackerEventRound[];
  /** Compact mode: rendered inside the Overview "Needs attention" card. */
  embedded?: boolean;
  /** Enables the clear buttons. Without it, alerts are read-only. */
  groupId?: string;
  /** Called after logged alerts are deleted so the page can refetch. */
  onCleared?: () => void | Promise<void>;
};

const dismissKey = (groupId: string) => `tracker:dismissed-alerts:${groupId}`;

/** Alert ids the user cleared locally (derived conflict/travel/stale alerts). */
export function readDismissedAlertIds(groupId: string | undefined): string[] {
  return readDismissed(groupId);
}

function readDismissed(groupId: string | undefined): string[] {
  if (!groupId || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(dismissKey(groupId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeDismissed(groupId: string, ids: string[]) {
  try {
    window.localStorage.setItem(dismissKey(groupId), JSON.stringify(ids.slice(-300)));
  } catch {
    /* storage unavailable — dismissals stay in-memory for this session */
  }
}

/**
 * Derives scheduling conflicts, travel gaps, and stale-sync warnings, then
 * merges them with the PDGA sync change log.
 */
export function buildTrackerAlerts({
  changes,
  events,
  memberById,
  snapByNum,
  teeTimes,
  rounds,
}: Omit<AlertsProps, "embedded">): ChangeRow[] {
  const eventById = new Map(events.map((e) => [e.id, e]));
  /** Course for a specific tee slot: prefer pool/division match, else any round row. */
  const courseFor = (t: TrackerTeeTime): string | null => {
    const pool = t.pool ?? null;
    const candidates = (rounds ?? []).filter(
      (r) =>
        r.event_id === t.event_id && r.round_number === (t.round_number ?? 1) && !!r.course_name,
    );
    if (candidates.length === 0) return null;
    const byPool = pool ? candidates.find((r) => r.pool === pool) : null;
    const byDivision = t.division ? candidates.find((r) => r.division === t.division) : null;
    const generic = candidates.find((r) => r.pool == null && r.division == null);
    return (byPool ?? byDivision ?? generic ?? candidates[0]).course_name ?? null;
  };

  const staleAlerts: ChangeRow[] = [];
  const now = Date.now();
  for (const m of memberById.values()) {
    const s = snapByNum.get(m.pdga_number);
    const hasUpcoming = teeTimes.some((t) => t.member_id === m.id);
    if (!hasUpcoming) continue;
    const age = s?.refreshed_at ? now - new Date(s.refreshed_at).getTime() : Infinity;
    if (age > 24 * 60 * 60 * 1000) {
      staleAlerts.push({
        id: `stale-${m.id}`,
        group_id: "",
        event_id: null,
        member_id: m.id,
        field: "sync_stale",
        from_value: null,
        to_value: s?.refreshed_at ?? "never",
        severity: "warning",
        source: "system",
        actor_id: null,
        created_at: s?.refreshed_at ?? new Date(0).toISOString(),
      });
    }
  }

  const conflictAlerts: ChangeRow[] = [];
  type TTRow = { t: TrackerTeeTime; date: string; ev: TrackerEvent | undefined };
  const byMember = new Map<string, TTRow[]>();
  for (const t of teeTimes) {
    const ev = eventById.get(t.event_id);
    const date = ev?.event_date;
    if (!date) continue;
    const arr = byMember.get(t.member_id) ?? [];
    arr.push({ t, date, ev });
    byMember.set(t.member_id, arr);
  }
  for (const [memberId, rows] of byMember) {
    const byDay = new Map<string, TTRow[]>();
    for (const r of rows) {
      const arr = byDay.get(r.date) ?? [];
      arr.push(r);
      byDay.set(r.date, arr);
    }
    for (const [day, dayRows] of byDay) {
      // Count DISTINCT rounds per event, not raw rows: multi-pool events post
      // one row per pool for the same round, which used to inflate the day's
      // estimated play time (and push finish times hours too late).
      const roundKeys = new Map<string, Set<string>>();
      for (const r of dayRows) {
        const set = roundKeys.get(r.t.event_id) ?? new Set<string>();
        set.add(String(r.t.round_number ?? 1));
        roundKeys.set(r.t.event_id, set);
      }
      const roundsPerEvent = new Map<string, number>();
      for (const [eid, set] of roundKeys) roundsPerEvent.set(eid, set.size);
      const distinctEventIds = Array.from(new Set(dayRows.map((r) => r.t.event_id)));
      if (distinctEventIds.length < 2) continue;

      const eventWindows = distinctEventIds
        .map((eid) => {
          const evRows = dayRows.filter((r) => r.t.event_id === eid);
          const earliest =
            evRows
              .map((r) => r.t.tee_time)
              .filter((x): x is string => !!x)
              .sort((a, b) => teeTimeSortKey(a) - teeTimeSortKey(b))[0] ?? null;
          const ev = eventById.get(eid);
          const format = inferFormat({
            name: ev?.name,
            tier: ev?.tier,
            roundsOnDate: roundsPerEvent.get(eid),
          });
          const win = estimateEventWindow({
            dateISO: day,
            teeTime: earliest,
            format,
            roundsOnDate: roundsPerEvent.get(eid),
          });
          return { eid, ev, format, win };
        })
        .filter((x) => x.win);

      let worst: { severity: "error" | "warning"; reason: string; names: string } | null = null;
      for (let i = 0; i < eventWindows.length; i++) {
        for (let j = i + 1; j < eventWindows.length; j++) {
          const A = eventWindows[i];
          const B = eventWindows[j];
          const evalResult = evaluateSameDayConflict(A.win!, B.win!);
          if (evalResult.severity === "ok") continue;
          const names = `${A.ev?.name ?? "Event"} ⇄ ${B.ev?.name ?? "Event"}`;
          if (!worst || (evalResult.severity === "error" && worst.severity !== "error")) {
            worst = { severity: evalResult.severity, reason: evalResult.reason, names };
          }
        }
      }
      if (worst) {
        conflictAlerts.push({
          id: `conflict-${memberId}-${day}`,
          group_id: "",
          event_id: null,
          member_id: memberId,
          field: "double_booked",
          from_value: day,
          to_value: `${worst.names} — ${worst.reason}`,
          severity: worst.severity,
          source: "system",
          actor_id: null,
          created_at: `${day}T00:00:00Z`,
        });
      }
    }

    // Travel warnings: compare the last slot of one day with the first slot of
    // the next, and spell out the exact rounds, tee times, and courses so the
    // user can judge whether the drive actually fits.
    const days = Array.from(byDay.keys()).sort();
    const legLabel = (r: TTRow) => {
      const round = r.t.round_number ? `Round ${r.t.round_number}` : "Registration";
      const tee = r.t.tee_time ? `${formatTeeTime(r.t.tee_time)} tee` : "tee time TBD";
      const course = courseFor(r.t);
      const parts = [
        `${r.ev?.name ?? "Event"} ${round}`,
        fmtDate(r.date),
        tee,

        course ? `at ${course}` : "course TBD",
        r.ev?.location?.trim() || null,
      ].filter(Boolean);
      return parts.join(" · ");
    };
    for (let i = 1; i < days.length; i++) {
      const prevDay = days[i - 1];
      const curDay = days[i];
      const gap = (new Date(curDay).getTime() - new Date(prevDay).getTime()) / 86400000;
      if (gap > 1) continue;
      const sortByTee = (a: TTRow, b: TTRow) =>
        teeTimeSortKey(a.t.tee_time ?? "") - teeTimeSortKey(b.t.tee_time ?? "");
      const prevRows = [...(byDay.get(prevDay) ?? [])].sort(sortByTee);
      const curRows = [...(byDay.get(curDay) ?? [])].sort(sortByTee);
      const prev = prevRows[prevRows.length - 1];
      const cur = curRows[0];
      if (!prev || !cur) continue;
      const prevLoc = prev.ev?.location?.trim();
      const curLoc = cur.ev?.location?.trim();
      if (!prevLoc || !curLoc || prevLoc === curLoc) continue;
      // Distinct rounds that day for the previous event only — the finish
      // estimate should reflect the rounds actually played, not pool duplicates.
      const prevEventRounds = new Set(
        prevRows
          .filter((r) => r.t.event_id === prev.t.event_id)
          .map((r) => String(r.t.round_number ?? 1)),
      ).size;
      const prevWindow = estimateEventWindow({
        dateISO: prevDay,
        teeTime: prev.t.tee_time,
        format: inferFormat({
          name: prev.ev?.name,
          tier: prev.ev?.tier,
          roundsOnDate: prevEventRounds,
        }),
        roundsOnDate: prevEventRounds,
      });
      const finish = prevWindow
        ? new Date(prevWindow.endMs).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })
        : null;
      // Spell out the actual buffer: finish + one hour of drive/check-in time
      // against the next tee. Only flag it when the buffer is genuinely thin.
      const nextStart = cur.t.tee_time
        ? new Date(
            `${curDay}T${cur.t.tee_time.length === 5 ? `${cur.t.tee_time}:00` : cur.t.tee_time}`,
          )
        : null;
      let verdict: string | null = null;
      let severity: "warning" | "info" = "warning";
      if (prevWindow && nextStart && !Number.isNaN(nextStart.getTime())) {
        const gapHours = (nextStart.getTime() - prevWindow.endMs) / 3_600_000;
        const gapLabel =
          gapHours >= 24
            ? `${Math.round((gapHours / 24) * 10) / 10} days`
            : `${Math.round(gapHours * 10) / 10} hours`;
        if (gapHours >= 4) {
          verdict = `About ${gapLabel} between the estimated finish and the next tee — plenty of room for the drive.`;
          severity = "info";
        } else if (gapHours >= 1.5) {
          verdict = `About ${gapLabel} between the estimated finish and the next tee — workable if the drive is under an hour.`;
          severity = "info";
        } else if (gapHours >= 0) {
          verdict = `Only about ${gapLabel} between the estimated finish and the next tee. Confirm the drive time.`;
        } else {
          verdict = `The first round is likely still running when the next tee goes off. Confirm the drive time.`;
        }
      }
      // Comfortable buffers aren't worth an alert.
      if (severity === "info") continue;
      conflictAlerts.push({
        id: `travel-${memberId}-${curDay}`,
        group_id: "",
        event_id: null,
        member_id: memberId,
        field: "travel_gap",
        from_value: `${legLabel(prev)}${finish ? ` · likely finishes ~${finish}` : ""}`,
        to_value: `${legLabel(cur)}${verdict ? ` — ${verdict}` : ""}`,

        severity: "warning",
        source: "system",
        actor_id: null,
        created_at: `${curDay}T00:00:00Z`,
      });
    }
  }

  return [...conflictAlerts, ...staleAlerts, ...changes].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
}

const DIFF_LABELS: Record<string, string> = {
  tee_time: "tee times",
  division: "divisions",
  pool: "pools",
  starting_hole: "start holes",
  round_added: "rounds added",
  course_name: "course changes",
  round_date: "round dates",
  withdrawn: "withdrawals",
};

export function AlertsView({
  changes,
  events,
  memberById,
  snapByNum,
  teeTimes,
  rounds,
  embedded,
  groupId,
  onCleared,
}: AlertsProps) {
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>(() => readDismissed(groupId));
  const [busy, setBusy] = useState(false);
  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  useEffect(() => {
    setDismissed(readDismissed(groupId));
  }, [groupId]);

  const loadPrefs = useServerFn(getMyPrefs);
  const prefsQuery = useQuery({
    queryKey: ["prefs", "notifications"],
    queryFn: () => loadPrefs(),
    staleTime: 10 * 60_000,
  });
  const all = useMemo(
    () =>
      buildTrackerAlerts({
        // Live event updates follow the player's saved alert settings.
        changes: changes.filter((c) => {
          const topic = LIVE_CHANGE_TOPIC[c.field];
          return !topic || prefsQuery.data?.notifications?.topics?.[topic] !== false;
        }),
        events,
        memberById,
        snapByNum,
        teeTimes,
        rounds,
      }),
    [changes, events, memberById, snapByNum, teeTimes, rounds, prefsQuery.data],
  );

  const dismissedSet = useMemo(() => new Set(dismissed), [dismissed]);
  const combined = useMemo(() => all.filter((c) => !dismissedSet.has(c.id)), [all, dismissedSet]);
  const loggedIds = useMemo(() => new Set(changes.map((c) => c.id)), [changes]);
  const canClear = Boolean(groupId);

  const dismissLocal = useCallback(
    (ids: string[]) => {
      if (!groupId || ids.length === 0) return;
      setDismissed((prev) => {
        const next = Array.from(new Set([...prev, ...ids]));
        writeDismissed(groupId, next);
        return next;
      });
    },
    [groupId],
  );

  const clearOne = useCallback(
    async (c: ChangeRow) => {
      if (!groupId) return;
      setBusy(true);
      try {
        if (loggedIds.has(c.id)) {
          await clearTrackerAlerts({ data: { group_id: groupId, ids: [c.id] } });
          await onCleared?.();
        } else {
          dismissLocal([c.id]);
        }
        toast.success("Alert cleared");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not clear that alert");
      } finally {
        setBusy(false);
      }
    },
    [groupId, loggedIds, onCleared, dismissLocal],
  );

  const clearAll = useCallback(async () => {
    if (!groupId) return;
    setBusy(true);
    try {
      const derived = combined.filter((c) => !loggedIds.has(c.id)).map((c) => c.id);
      const logged = combined.filter((c) => loggedIds.has(c.id));
      if (logged.length > 0) {
        await clearTrackerAlerts({ data: { group_id: groupId } });
        await onCleared?.();
      }
      dismissLocal(derived);
      toast.success("All alerts cleared");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not clear alerts");
    } finally {
      setBusy(false);
    }
  }, [groupId, combined, loggedIds, onCleared, dismissLocal]);

  const restoreDismissed = useCallback(() => {
    if (!groupId) return;
    setDismissed([]);
    writeDismissed(groupId, []);
  }, [groupId]);

  function describe(c: ChangeRow) {
    const mem = c.member_id ? memberById.get(c.member_id) : null;
    const who = mem?.display_name ?? (mem ? `#${mem.pdga_number}` : "Player");
    if (c.field === "sync_stale")
      return `${who}: PDGA snapshot is stale — sync to refresh registration and rating.`;
    if (c.field === "double_booked") return `${who} on ${fmtDate(c.from_value)}: ${c.to_value}`;
    if (c.field === "travel_gap")
      return `${who} plays back-to-back in different towns — ${c.from_value}, then ${c.to_value}. Check the drive between those two courses fits between the finish and the next tee.`;
    const ev = c.event_id ? eventById.get(c.event_id) : null;
    const evName = ev?.name ?? "an event";
    if (c.field === "status" && c.to_value === "withdrawn")
      return `${who} is no longer registered for ${evName}.`;
    if (c.field === "status" && c.to_value === "scheduled")
      return `${who} is registered again for ${evName}.`;
    if (c.field === "event_status" && c.to_value === "withdrawn")
      return `${evName}: nobody in the crew is registered anymore.`;
    if (c.field === "round_status") return `${evName}: ${who} — ${c.to_value}.`;
    if (c.field === "round_score") return `${evName}: ${who} shot ${c.to_value?.replace(/^R(\d+) (.*)$/, "$2 in round $1")}.`;
    if (c.field === "position")
      return `${evName}: ${who} moved from ${c.from_value} to ${c.to_value} in the standings.`;
    if (c.field === "tee_time")
      return c.from_value
        ? `${evName}: ${who}'s tee time changed from ${c.from_value} to ${c.to_value}.`
        : `${evName}: ${who}'s tee time is posted — ${c.to_value}.`;
    if (c.field === "division")
      return `${evName}: ${who} switched from ${c.from_value} to ${c.to_value}.`;
    return [ev?.name ?? null, who, `${c.field}: ${c.from_value ?? "—"} → ${c.to_value ?? "—"}`]
      .filter(Boolean)
      .join(" · ");
  }

  if (combined.length === 0) {
    if (embedded) return null;
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
          <span>
            Nothing needs your attention. Tee-time changes, course swaps, and sync warnings land
            here after the next sync.
          </span>
          {canClear && dismissed.length > 0 && (
            <Button variant="outline" size="sm" onClick={restoreDismissed}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Restore cleared alerts
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  const errorCount = combined.filter(
    (c) => c.severity === "error" || c.severity === "critical",
  ).length;
  const warnCount = combined.filter((c) => c.severity === "warning").length;

  const visibleChangeIds = new Set(combined.map((c) => c.id));
  const syncDiffs = changes.reduce<Record<string, number>>((acc, c) => {
    if (!visibleChangeIds.has(c.id)) return acc;
    acc[c.field] = (acc[c.field] ?? 0) + 1;
    return acc;
  }, {});
  const diffEntries = Object.entries(syncDiffs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const limit = embedded && !expanded ? 4 : combined.length;
  const visible = combined.slice(0, limit);

  return (
    <div className="space-y-3">
      {embedded ? null : (
        <SectionIntro
          title="Alerts"
          description="Scheduling conflicts, travel gaps, sync warnings, and every change captured from PDGA syncs."
          compact
        />
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <div className="flex min-w-0 flex-wrap gap-2 text-xs">
          {errorCount > 0 && (
            <Badge variant="destructive">
              {errorCount} conflict{errorCount === 1 ? "" : "s"}
            </Badge>
          )}
          {warnCount > 0 && (
            <Badge
              variant="secondary"
              className="bg-amber-500/15 text-amber-700 dark:text-amber-300"
            >
              {warnCount} warning{warnCount === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
        {canClear && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 shrink-0 text-xs"
            disabled={busy}
            onClick={clearAll}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Clear all alerts
          </Button>
        )}
      </div>
      {!embedded && diffEntries.length > 0 && (
        <div className="rounded-lg border bg-muted/30 px-3 py-2">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Recent sync diffs
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
            {diffEntries.map(([field, count]) => (
              <Badge key={field} variant="outline">
                {count} {DIFF_LABELS[field] ?? field.replace(/_/g, " ")}
              </Badge>
            ))}
          </div>
        </div>
      )}
      <div className="rounded-lg border">
        <div className="divide-y">
          {visible.map((c) => (
            <div key={c.id} className="flex items-start gap-3 px-3 py-2 text-sm">
              <div
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${c.severity === "error" || c.severity === "critical" ? "bg-red-500" : c.severity === "warning" ? "bg-amber-500" : "bg-primary"}`}
              />
              <div className="min-w-0 flex-1">
                <div className="break-words">{describe(c)}</div>
                <div className="text-[11px] text-muted-foreground">
                  {new Date(c.created_at).toLocaleString()} · {c.source}
                </div>
              </div>
              {canClear && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                  disabled={busy}
                  aria-label="Clear alert"
                  title="Clear alert"
                  onClick={() => clearOne(c)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {embedded && combined.length > 4 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Show fewer" : `Show all ${combined.length} alerts`}
          </Button>
        )}
        {canClear && dismissed.length > 0 && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={restoreDismissed}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Restore cleared alerts
          </Button>
        )}
      </div>
    </div>
  );
}
