import { Textarea } from "@/components/ui/textarea";
import {
  CARD_CREATION_OPTIONS,
  SCORING_MODE_OPTIONS,
  START_FORMAT_OPTIONS,
  TIEBREAKER_OPTIONS,
  normalizeSetup,
  type EventSetupState,
  type StartFormat,
} from "@/lib/event-setup";
import { Field, OptionRow, Segmented, StepIntro, YesNo } from "./controls";
import { StandingsField } from "./standings-field";
import { HandicapField } from "./handicap-field";
import type { LeagueSchedule } from "@/lib/event-setup";

export function ScoringStep({
  value,
  onChange,
  startFormat,
  onStartFormatChange,
  schedule,
  onScheduleChange,
}: {
  value: EventSetupState;
  onChange: (next: EventSetupState) => void;
  /** Owned by the wizard's schedule step; shown here so the answer set stays together. */
  startFormat?: StartFormat;
  onStartFormatChange?: (v: StartFormat) => void;
  /** League only: season standings rules, edited here alongside the scoring answers. */
  schedule?: LeagueSchedule;
  onScheduleChange?: (next: LeagueSchedule) => void;
}) {
  const s = value;
  const set = (patch: Partial<EventSetupState>) => onChange(normalizeSetup({ ...s, ...patch }));

  /** Distinct courses this event plays, so each can carry its own card notes. */
  const courses: { id: string; name: string; layout: string | null }[] = [];
  const seen = new Set<string>();
  for (const stop of schedule?.rotation ?? []) {
    if (!stop.course_id || seen.has(stop.course_id)) continue;
    seen.add(stop.course_id);
    courses.push({
      id: stop.course_id,
      name: stop.course_name ?? "Course",
      layout: stop.layout_name ?? null,
    });
  }


  return (
    <div className="space-y-6">
      <StepIntro
        title="Scoring"
        blurb="How rounds start, who builds cards, and what counts toward player stats."
      />

      {startFormat && onStartFormatChange ? (
        <Field label="Start format">
          <div className="grid gap-2 sm:grid-cols-3">
            {START_FORMAT_OPTIONS.map((o) => (
              <OptionRow
                key={o.value}
                selected={startFormat === o.value}
                onSelect={() => onStartFormatChange(o.value)}
                label={o.label}
                blurb={o.blurb}
              />
            ))}
          </div>
        </Field>
      ) : null}

      {schedule && onScheduleChange ? (
        <StandingsField value={schedule} onChange={onScheduleChange} />
      ) : null}

      <Field label="Scoring method" hint="What decides the standings.">
        <div className="grid gap-2 sm:grid-cols-3">
          {SCORING_MODE_OPTIONS.map((o) => (
            <OptionRow
              key={o.value}
              selected={s.scoring_mode === o.value}
              onSelect={() => set({ scoring_mode: o.value })}
              label={o.label}
              blurb={o.blurb}
            />
          ))}
        </div>
      </Field>

      <Field label="Who creates scorecards">
        <div className="grid gap-2 sm:grid-cols-2">
          {CARD_CREATION_OPTIONS.map((o) => (
            <OptionRow
              key={o.value}
              selected={s.card_creation === o.value}
              onSelect={() => set({ card_creation: o.value })}
              label={o.label}
              blurb={o.blurb}
            />
          ))}
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Track scorecard statistics"
          hint={
            s.format_family === "singles"
              ? "Putts, fairways, and scrambles are credited to each player."
              : "Not available for team scores — putts and fairways can't be credited to one player."
          }
        >
          {s.format_family === "singles" ? (
            <Segmented
              value={s.stats_mode}
              options={[
                { value: "standard", label: "Track stats" },
                { value: "off", label: "Scores only" },
              ]}
              onChange={(v) => set({ stats_mode: v })}
            />
          ) : (
            <p className="rounded-lg border border-dashed border-border px-3 py-2 text-[13px] text-muted-foreground">
              Scores only. Cards record the team score for each hole.
            </p>
          )}
        </Field>


        <Field
          label="Use handicaps"
          hint="Levels the field with rating-based strokes so every player can win the night."
        >
          <YesNo
            value={s.handicap_enabled}
            onChange={(v) => set({ handicap_enabled: v })}
            disabled={s.format_family !== "singles"}
          />
        </Field>
      </div>

      {s.handicap_enabled && s.format_family === "singles" ? (
        <HandicapField value={s.handicap} onChange={(h) => set({ handicap: h })} />
      ) : null}

      <Field label="How ties are broken">
        <div className="grid gap-2 sm:grid-cols-2">
          {TIEBREAKER_OPTIONS.map((o) => (
            <OptionRow
              key={o.value}
              selected={s.tiebreaker === o.value}
              onSelect={() => set({ tiebreaker: o.value })}
              label={o.label}
              blurb={o.blurb}
            />
          ))}
        </div>
      </Field>

      <Field
        label={courses.length > 1 ? "Scorecard message for every course" : "Scorecard message"}
        hint="Shown on every card at the start of the round — pace reminders, ace pot, CTP format."
      >
        <Textarea
          rows={3}
          value={s.scorecard_message}
          onChange={(e) => set({ scorecard_message: e.target.value })}
          placeholder="CTP flags on the marked holes. Ace pot pays at the end of the night. Keep pace with the card ahead."
        />
      </Field>

      {courses.length > 1 ? (
        <Field
          label="Notes for each course"
          hint="Cards built at a course show that course's notes under the message above — OB calls, mandos, layout quirks."
        >
          <div className="space-y-3">
            {courses.map((c) => (
              <div key={c.id} className="rounded-lg border border-border p-3">
                <div className="mb-2 text-[13px] font-medium">
                  {c.name}
                  {c.layout ? (
                    <span className="ml-1 font-normal text-muted-foreground">— {c.layout}</span>
                  ) : null}
                </div>
                <Textarea
                  rows={3}
                  value={s.course_notes[c.id] ?? ""}
                  aria-label={`Scorecard notes for ${c.name}`}
                  onChange={(e) =>
                    set({ course_notes: { ...s.course_notes, [c.id]: e.target.value } })
                  }
                  placeholder="Hole 4 water is OB. Mando left of the tall oak on 9. CTP on 7."
                />
              </div>
            ))}
          </div>
        </Field>
      ) : null}

    </div>
  );
}
