import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { CoursePicker, type PickedCourse, type PickedLayout } from "@/components/course-picker";
import { Field, OptionRow } from "@/components/event-setup/controls";
import {
  ROTATION_ORDER_OPTIONS,
  VENUE_MODE_OPTIONS,
  type LeagueSchedule,
  type RotationStop,
} from "@/lib/event-setup";

type HomeCourse = {
  course_id: string | null;
  course_name: string | null;
  layout_id: string | null;
  layout_name: string | null;
  layout_holes?: number | null;
};


/** Venue choice and travelling-league rotation. Lives on the Course step. */
export function VenueField({
  value,
  onChange,
  home,
}: {
  value: LeagueSchedule;
  onChange: (next: LeagueSchedule) => void;
  home: HomeCourse;
}) {
  const set = (patch: Partial<LeagueSchedule>) => onChange({ ...value, ...patch });

  function moveStop(index: number, dir: -1 | 1) {
    const next = [...value.rotation];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    set({ rotation: next });
  }

  function addStop(stop: RotationStop) {
    if (value.rotation.some((r) => r.course_id === stop.course_id && r.layout_id === stop.layout_id))
      return;
    set({ rotation: [...value.rotation, stop] });
  }

  return (
    <div className="space-y-4">
  <Field label="Where you play" hint="Pick one course for the whole season, or build a rotation.">
    <div className="grid gap-2 sm:grid-cols-2">
      {VENUE_MODE_OPTIONS.map((o) => (
        <OptionRow
          key={o.value}
          label={o.label}
          blurb={o.blurb}
          selected={value.venue_mode === o.value}
          onSelect={() => {
            if (o.value === "rotate" && value.rotation.length === 0 && home.course_id) {
              set({
                venue_mode: "rotate",
                rotation: [
                  {
                    course_id: home.course_id,
                    course_name: home.course_name ?? "Home course",
                    layout_id: home.layout_id,
                    layout_name: home.layout_name,
                    layout_holes: home.layout_holes ?? null,
                  },

                ],
              });
            } else {
              set({ venue_mode: o.value });
            }
          }}
        />
      ))}
    </div>
  </Field>

  {value.venue_mode === "rotate" && (
    <div className="space-y-4 rounded-xl border border-border bg-card/60 p-4">
      <Field label="Rotation order" hint="How the list maps onto the weeks of your season.">
        <div className="grid gap-2 sm:grid-cols-2">
          {ROTATION_ORDER_OPTIONS.map((o) => (
            <OptionRow
              key={o.value}
              label={o.label}
              blurb={o.blurb}
              selected={value.rotation_order === o.value}
              onSelect={() => set({ rotation_order: o.value })}
            />
          ))}
        </div>
      </Field>

      <Field
        label="Courses in the rotation"
        hint="Order matters — week one starts at the top of the list."
      >
        {value.rotation.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-3 text-[13px] text-muted-foreground">
            No stops yet. Add the courses your league travels to below.
          </p>
        ) : (
          <ol className="space-y-2">
            {value.rotation.map((r, i) => (
              <li
                key={`${r.course_id}-${r.layout_id ?? "any"}`}
                className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2"
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-xs">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{r.course_name}</span>
                  <span className="block text-[12px] text-muted-foreground">
                    {r.layout_name ?? "Layout chosen on the night"}
                    {r.layout_holes ? ` · ${r.layout_holes} holes` : ""}
                  </span>

                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Move ${r.course_name} earlier`}
                  onClick={() => moveStop(i, -1)}
                  disabled={i === 0}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Move ${r.course_name} later`}
                  onClick={() => moveStop(i, 1)}
                  disabled={i === value.rotation.length - 1}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${r.course_name} from the rotation`}
                  onClick={() =>
                    set({ rotation: value.rotation.filter((_, idx) => idx !== i) })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ol>
        )}
      </Field>

      <RotationAdder onAdd={addStop} />
    </div>
  )}
    </div>
  );
}

/** Search-and-add panel for a rotation stop. */
function RotationAdder({ onAdd }: { onAdd: (stop: RotationStop) => void }) {
  const [open, setOpen] = useState(false);
  const [course, setCourse] = useState<PickedCourse | null>(null);
  const [layout, setLayout] = useState<PickedLayout | null>(null);

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" /> Add a course to the rotation
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background p-3">
      <CoursePicker
        courseId={course?.id ?? null}
        layoutId={layout?.id ?? null}
        onCourse={(c) => {
          setCourse(c);
          setLayout(null);
        }}
        onLayout={setLayout}
      />
      <div className="flex items-center gap-2">
        <Button
          type="button"
          disabled={!course}
          onClick={() => {
            if (!course) return;
            onAdd({
              course_id: course.id,
              course_name: course.name,
              layout_id: layout?.id ?? null,
              layout_name: layout?.name ?? null,
              layout_holes: layout?.hole_count ?? course.hole_count ?? null,
            });

            setCourse(null);
            setLayout(null);
            setOpen(false);
          }}
        >
          Add to rotation
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setCourse(null);
            setLayout(null);
            setOpen(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
