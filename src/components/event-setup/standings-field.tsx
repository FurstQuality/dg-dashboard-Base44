import { Input } from "@/components/ui/input";
import { Field, OptionRow } from "@/components/event-setup/controls";
import {
  LEAGUE_POINTS_SYSTEM_OPTIONS,
  activeWeeks,
  summarizeStandings,
  type LeagueSchedule,
} from "@/lib/event-setup";
import {
  STANDINGS_STYLE_OPTIONS,
  standingsUsesBestN,
  standingsUsesPoints,
} from "@/lib/competition-model";

/** Season standings rules for a league. Lives on the Scoring step. */
export function StandingsField({
  value,
  onChange,
}: {
  value: LeagueSchedule;
  onChange: (next: LeagueSchedule) => void;
}) {
  const set = (patch: Partial<LeagueSchedule>) => onChange({ ...value, ...patch });
  const active = activeWeeks(value);

  return (
  <Field
    label="How standings work"
    hint="Most leagues treat every night as its own event. Season tables and dropped nights are opt-in."
  >
    <div className="grid gap-2 sm:grid-cols-2">
      {STANDINGS_STYLE_OPTIONS.map((o) => (
        <OptionRow
          key={o.value}
          label={o.label}
          blurb={o.blurb}
          selected={value.standings_style === o.value}
          onSelect={() => set({ standings_style: o.value })}
        />
      ))}
    </div>
    {(standingsUsesPoints(value.standings_style) || value.standings_style === "average") && (
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {standingsUsesPoints(value.standings_style) && (
          <label className="space-y-1.5">
            <span className="block text-[13px] font-medium">Points system</span>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={value.points_system}
              onChange={(e) =>
                set({ points_system: e.target.value as LeagueSchedule["points_system"] })
              }
            >
              {LEAGUE_POINTS_SYSTEM_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {standingsUsesBestN(value.standings_style) && (
          <label className="space-y-1.5">
            <span className="block text-[13px] font-medium">Nights that count</span>
            <Input
              type="number"
              min="1"
              max={Math.max(active.length, 1)}
              value={value.best_n_weeks}
              onChange={(e) => {
                const n = parseInt(e.target.value) || 1;
                set({ best_n_weeks: Math.max(1, Math.min(n, Math.max(active.length, 1))) });
              }}
            />
            <span className="block text-[12px] text-muted-foreground">
              {active.length > 0
                ? `Best ${Math.min(value.best_n_weeks, active.length)} of ${active.length} nights count; the rest are dropped.`
                : "Available once the season dates are set."}
            </span>
          </label>
        )}
        {value.standings_style === "average" && (
          <label className="space-y-1.5">
            <span className="block text-[13px] font-medium">Minimum nights to be ranked</span>
            <Input
              type="number"
              min="1"
              value={value.min_nights_for_average}
              onChange={(e) =>
                set({ min_nights_for_average: Math.max(1, parseInt(e.target.value) || 1) })
              }
            />
          </label>
        )}
      </div>
    )}
    <p className="mt-2 text-[13px] text-muted-foreground">{summarizeStandings(value)}</p>
  </Field>
  );
}
