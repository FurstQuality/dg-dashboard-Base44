import { CalendarDays, MapPinned } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/event-setup/controls";
import { activeWeeks, weekHoles, type LeagueSchedule, type PlannedWeek } from "@/lib/event-setup";

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

type CourseOption = {
  course_id: string;
  course_name: string | null;
  layout_id: string | null;
  layout_name: string | null;
  layout_holes: number | null;
};

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function optionKey(courseId: string | null, layoutId: string | null): string {
  return `${courseId ?? ""}|${layoutId ?? ""}`;
}

export function SeasonPreview({ value, onChange, home }: Props) {
  const active = activeWeeks(value);

  const options: CourseOption[] =
    value.venue_mode === "rotate"
      ? value.rotation
          .filter((r) => Boolean(r.course_id))
          .map((r) => ({
            course_id: r.course_id,
            course_name: r.course_name,
            layout_id: r.layout_id ?? null,
            layout_name: r.layout_name ?? null,
            layout_holes: r.layout_holes ?? null,
          }))
      : home.course_id
        ? [
            {
              course_id: home.course_id,
              course_name: home.course_name,
              layout_id: home.layout_id ?? null,
              layout_name: home.layout_name ?? null,
              layout_holes: home.layout_holes ?? null,
            },
          ]
        : [];

  /** Keep holes_played in step with the layout and round count. */
  function reconcile(week: PlannedWeek): PlannedWeek {
    return { ...week, holes_played: weekHoles(week, value.holes_played) };
  }

  function updateWeek(index: number, patch: Partial<PlannedWeek>) {
    onChange({
      ...value,
      weeks: value.weeks.map((w, i) => (i === index ? reconcile({ ...w, ...patch }) : w)),
    });
  }

  function applyToAll(key: string) {
    const picked = options.find((o) => optionKey(o.course_id, o.layout_id) === key) ?? null;
    onChange({
      ...value,
      weeks: value.weeks.map((w) =>
        reconcile({
          ...w,
          course_id: picked?.course_id ?? null,
          course_name: picked?.course_name ?? null,
          layout_id: picked?.layout_id ?? null,
          layout_name: picked?.layout_name ?? null,
          layout_holes: picked?.layout_holes ?? null,
          venue_locked: true,
        }),
      ),
    });
  }

  function applyRoundsToAll(rounds: number) {
    onChange({
      ...value,
      weeks: value.weeks.map((w) => reconcile({ ...w, rounds })),
    });
  }

  return (
    <Field
      label="Season preview"
      hint="Pick the course for each night and whether you play one or two rounds. The layout sets the hole count. Skip a holiday week with the toggle."
    >
      {value.weeks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-3 text-[13px] text-muted-foreground">
          Set your first and last league night above to see the season here.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium">Set course for all weeks</span>
            <select
              className="h-8 min-w-[220px] rounded-md border border-input bg-background px-2 text-[13px]"
              aria-label="Set course for all weeks"
              defaultValue=""
              disabled={options.length === 0}
              onChange={(e) => {
                if (!e.target.value) return;
                applyToAll(e.target.value);
              }}
            >
              <option value="">Choose a course…</option>
              {options.map((o) => (
                <option
                  key={optionKey(o.course_id, o.layout_id)}
                  value={optionKey(o.course_id, o.layout_id)}
                >
                  {o.course_name}
                  {o.layout_name ? ` — ${o.layout_name}` : ""}
                  {o.layout_holes ? ` (${o.layout_holes} holes)` : ""}
                </option>
              ))}
            </select>
            <span className="ml-2 text-[13px] font-medium">Rounds for all weeks</span>
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-[13px]"
              aria-label="Set rounds for all weeks"
              defaultValue=""
              onChange={(e) => {
                if (!e.target.value) return;
                applyRoundsToAll(Number(e.target.value));
              }}
            >
              <option value="">Choose…</option>
              <option value="1">1 round</option>
              <option value="2">2 rounds</option>
            </select>
            {options.length === 0 ? (
              <span className="text-[12px] text-muted-foreground">Add a course above first.</span>
            ) : null}
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead className="bg-muted/60 text-left">
                <tr>
                  <th className="px-3 py-2 font-semibold">Week</th>
                  <th className="px-3 py-2 font-semibold">Date</th>
                  <th className="px-3 py-2 font-semibold">Course and layout</th>
                  <th className="px-3 py-2 font-semibold">Rounds</th>
                  <th className="px-3 py-2 font-semibold">Holes</th>
                  <th className="px-3 py-2 text-right font-semibold">Playing</th>
                </tr>
              </thead>
              <tbody>
                {value.weeks.map((w, i) => {
                  const number = value.weeks.slice(0, i + 1).filter((x) => !x.skipped).length;
                  const perRound =
                    w.layout_holes && w.layout_holes > 0 ? w.layout_holes : value.holes_played;
                  const total = weekHoles(w, value.holes_played);
                  return (
                    <tr
                      key={`${w.date}-${i}`}
                      className={`border-t border-border/60 ${w.skipped ? "opacity-55" : ""}`}
                    >
                      <td className="px-3 py-2">
                        {w.skipped ? <span className="text-muted-foreground">—</span> : number}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            type="date"
                            className="h-8 w-[150px]"
                            value={w.date}
                            aria-label={`Date for week ${number}`}
                            onChange={(e) => updateWeek(i, { date: e.target.value })}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {options.length === 0 ? (
                          <span className="flex items-center gap-2 text-muted-foreground">
                            <MapPinned className="h-3.5 w-3.5" />
                            Add a course above first
                          </span>
                        ) : (
                          <select
                            className="h-8 w-full min-w-[180px] rounded-md border border-input bg-background px-2 text-[13px]"
                            aria-label={`Course for week ${number}`}
                            value={optionKey(w.course_id, w.layout_id)}
                            onChange={(e) => {
                              const picked =
                                options.find(
                                  (o) => optionKey(o.course_id, o.layout_id) === e.target.value,
                                ) ?? null;
                              updateWeek(i, {
                                course_id: picked?.course_id ?? null,
                                course_name: picked?.course_name ?? null,
                                layout_id: picked?.layout_id ?? null,
                                layout_name: picked?.layout_name ?? null,
                                layout_holes: picked?.layout_holes ?? null,
                                venue_locked: true,
                              });
                            }}
                          >
                            <option value="|">Course still to be decided</option>
                            {options.map((o) => (
                              <option
                                key={optionKey(o.course_id, o.layout_id)}
                                value={optionKey(o.course_id, o.layout_id)}
                              >
                                {o.course_name}
                                {o.layout_name ? ` — ${o.layout_name}` : ""}
                                {o.layout_holes ? ` (${o.layout_holes} holes)` : ""}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className="h-8 rounded-md border border-input bg-background px-2 text-[13px]"
                          aria-label={`Rounds for week ${number}`}
                          value={String(w.rounds > 0 ? w.rounds : 1)}
                          onChange={(e) => updateWeek(i, { rounds: Number(e.target.value) })}
                        >
                          <option value="1">1 round</option>
                          <option value="2">2 rounds</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-medium">{total}</span>
                        <span className="ml-1 text-[12px] text-muted-foreground">
                          {w.rounds > 1 ? `(${perRound} × ${w.rounds})` : "holes"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Switch
                          checked={!w.skipped}
                          aria-label={`Play the week of ${formatDate(w.date)}`}
                          onCheckedChange={(v) => updateWeek(i, { skipped: !v })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="text-[13px] text-muted-foreground">
        {active.length} league {active.length === 1 ? "night" : "nights"}
        {value.weeks.length > active.length
          ? ` · ${value.weeks.length - active.length} skipped`
          : ""}
      </p>
    </Field>
  );
}
