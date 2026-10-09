import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Field, OptionRow, StepIntro } from "@/components/event-setup/controls";
import {
  LEAGUE_POINTS_SYSTEM_OPTIONS,
  activeWeeks,
  buildPlannedWeeks,
  dayLabel,
  summarizeStandings,
  type LeagueSchedule,
} from "@/lib/event-setup";
import {
  STANDINGS_STYLE_OPTIONS,
  standingsUsesBestN,
  standingsUsesPoints,
} from "@/lib/competition-model";

type HomeCourse = {
  course_id: string | null;
  course_name: string | null;
  layout_id: string | null;
  layout_name: string | null;
  layout_holes?: number | null;
};


type Props = {
  value: LeagueSchedule;
  onChange: (next: LeagueSchedule) => void;
  home: HomeCourse;
};

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ScheduleStep({ value, onChange, home }: Props) {
  const set = (patch: Partial<LeagueSchedule>) => onChange({ ...value, ...patch });

  // Regenerate the plan whenever the slot, venue mode, or rotation changes.
  const signature = useMemo(
    () =>
      [
        value.start_date,
        value.end_date,
        value.day_of_week,
        value.weeks_planned,
        value.venue_mode,
        value.rotation_order,
        value.rotation
          .map((r) => `${r.course_id}:${r.layout_id ?? ""}:${r.layout_holes ?? ""}`)
          .join("|"),
        home.course_id ?? "",
        home.layout_id ?? "",
        home.layout_holes ?? "",
      ].join("~"),
    [value.start_date, value.end_date, value.day_of_week, value.weeks_planned, value.venue_mode, value.rotation_order, value.rotation, home.course_id, home.layout_id, home.layout_holes],

  );

  useEffect(() => {
    const weeks = buildPlannedWeeks(value, home);
    const same =
      weeks.length === value.weeks.length &&
      weeks.every((w, i) => {
        const p = value.weeks[i];
        return (
          p &&
          p.date === w.date &&
          p.course_id === w.course_id &&
          p.layout_id === w.layout_id &&
          p.skipped === w.skipped
        );
      });
    if (!same) onChange({ ...value, weeks });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const active = activeWeeks(value);
  const plannedCount = value.weeks.length;

  // Keep the "weeks that count" figure within the number of nights actually scheduled.
  useEffect(() => {
    if (active.length > 0 && value.best_n_weeks > active.length) {
      onChange({ ...value, best_n_weeks: active.length });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.length]);


  return (
    <div className="space-y-6">
      <StepIntro
        title="Schedule"
        blurb="Set the weekly slot, then say whether league night stays at one course or travels around town."
      />

      <Field label="Weekly slot" hint="When your regulars show up, and how long the season runs.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1.5">
            <span className="block text-[13px] font-medium">Day of week</span>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={value.day_of_week}
              onChange={(e) => set({ day_of_week: parseInt(e.target.value) })}
            >
              {DAY_SHORT.map((d, i) => (
                <option key={d} value={i}>
                  {dayLabel(i)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="block text-[13px] font-medium">Start time</span>
            <Input
              type="time"
              value={value.start_time}
              onChange={(e) => set({ start_time: e.target.value })}
            />
          </label>
          <label className="space-y-1.5">
            <span className="block text-[13px] font-medium">Default holes per night</span>
            <Input
              type="number"
              min="9"
              max="27"
              value={value.holes_played}
              onChange={(e) => set({ holes_played: parseInt(e.target.value) || 18 })}
            />
            <span className="block text-[12px] text-muted-foreground">
              Used for any night without its own hole count. Set a different number per week in the season
              preview below.
            </span>
          </label>
          <label className="space-y-1.5">
            <span className="block text-[13px] font-medium">First league night *</span>
            <Input
              type="date"
              value={value.start_date}
              onChange={(e) => set({ start_date: e.target.value })}
            />
          </label>
          <label className="space-y-1.5">
            <span className="block text-[13px] font-medium">Last league night *</span>
            <Input
              type="date"
              value={value.end_date}
              onChange={(e) => set({ end_date: e.target.value })}
            />
          </label>
          <div className="space-y-1.5">
            <span className="block text-[13px] font-medium">Weeks planned</span>
            <div className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm">
              {plannedCount > 0 ? (
                <span>
                  {plannedCount} league {plannedCount === 1 ? "night" : "nights"}
                  <span className="text-muted-foreground">
                    {" "}
                    ({formatDate(value.weeks[0]!.date)} – {formatDate(value.weeks[plannedCount - 1]!.date)})
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground">Set the first and last league night</span>
              )}
            </div>
            <span className="block text-[12px] text-muted-foreground">
              Set by your dates and day of week. Change the last league night to shorten the season.
            </span>
          </div>
        </div>
      </Field>

      <Field
        label="Create these nights on publish"
        hint="Leave this on and every night above is added to the league schedule right away."
      >
        <div className="flex items-center gap-3">
          <Switch
            checked={value.create_events}
            onCheckedChange={(v) => set({ create_events: v })}
          />
          <span className="text-[13px] text-muted-foreground">
            {value.create_events
              ? `${active.length} nights will be added.`
              : "You'll add nights yourself from the league page."}
          </span>
        </div>
      </Field>
    </div>
  );
}
