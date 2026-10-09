/**
 * Week view — a Sunday-to-Saturday grid showing which nights carry leagues and
 * which weekends carry tournaments.
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  DOW_LABELS,
  KIND_LABEL,
  addDays,
  formatTime,
  groupByWeekDays,
  parseISODate,
  type PlannerOccurrence,
} from "@/lib/planner";
import { PlannerLink } from "@/components/planner/planner-link";
import { AddToScheduleButton } from "@/components/planner/add-to-schedule-button";

const KIND_TONE: Record<PlannerOccurrence["kind"], string> = {
  league: "border-l-violet-400/70",
  tournament: "border-l-cyan-400/70",
  casual: "border-l-emerald-400/70",
};

export function WeekGrid({
  weekStart,
  occurrences,
  onWeekChange,
  today,
}: {
  weekStart: string;
  occurrences: PlannerOccurrence[];
  onWeekChange: (iso: string) => void;
  today: string;
}) {
  const days = groupByWeekDays(occurrences, weekStart);
  const rangeLabel = `${parseISODate(weekStart).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} – ${parseISODate(addDays(weekStart, 6)).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">{rangeLabel}</div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onWeekChange(addDays(weekStart, -7))}
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => onWeekChange(weekStart)}>
            This week
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onWeekChange(addDays(weekStart, 7))}
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
        {days.map((day) => (
          <div
            key={day.iso}
            className={`rounded-xl border p-2 ${
              day.iso === today ? "border-primary/60 bg-primary/5" : "border-border bg-card/60"
            }`}
          >
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-sm font-semibold">{DOW_LABELS[day.dow]}</span>
              <span className="text-xs text-muted-foreground">
                {parseISODate(day.iso).toLocaleDateString(undefined, {
                  month: "numeric",
                  day: "numeric",
                })}
              </span>
            </div>

            {day.rows.length === 0 ? (
              <p className="py-3 text-xs text-muted-foreground">Nothing scheduled yet</p>
            ) : (
              <ul className="space-y-2">
                {day.rows.map((occ) => (
                  <li
                    key={`${occ.id}:${day.iso}`}
                    className={`rounded-lg border border-border/60 border-l-2 bg-background/60 p-2 ${KIND_TONE[occ.kind]}`}
                  >
                    <div className="min-w-0">
                      <div className="min-w-0">
                        <PlannerLink
                          occurrence={occ}
                          className="block text-sm font-medium leading-snug hover:underline [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden"
                        >
                          {occ.title}
                        </PlannerLink>
                        <p className="truncate text-xs text-muted-foreground">
                          {[formatTime(occ.startTime), occ.courseName ?? occ.location]
                            .filter(Boolean)
                            .join(" · ") || KIND_LABEL[occ.kind]}
                        </p>
                      </div>
                      {occ.sanctioned ? (
                        <Badge variant="outline" className="mt-1 text-[10px]">
                          PDGA
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-1.5">
                      <AddToScheduleButton
                        occurrence={occ}
                        variant="ghost"
                        className="h-7 px-1.5 text-xs"
                      />
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
