import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Clock, Pencil, Save, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  AGENDA_KIND_LABEL,
  AgendaItem,
  AgendaKind,
  buildDefaultAgenda,
  dayWindowMinutes,
  formatTime12h,
  groupAgendaByDate,
  newAgendaItem,
  parseAgenda,
} from "@/lib/tournament-schedule";

const KIND_ORDER: AgendaKind[] = [
  "check_in",
  "players_meeting",
  "round",
  "lunch",
  "break",
  "awards",
  "social",
  "other",
];

const KIND_TONE: Record<AgendaKind, string> = {
  check_in: "bg-primary/15 text-primary",
  players_meeting: "bg-primary/15 text-primary",
  round: "bg-emerald-500/15 text-emerald-500",
  lunch: "bg-amber-500/15 text-amber-500",
  break: "bg-muted text-muted-foreground",
  awards: "bg-yellow-500/15 text-yellow-500",
  social: "bg-violet-500/15 text-violet-500",
  other: "bg-muted text-muted-foreground",
};

function humanDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function fmtWindow(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

interface Props {
  tournamentId: string;
  agenda: AgendaItem[];
  canEdit: boolean;
  /** Tournament start date + first round time, for the "generate default" action. */
  startDate: string;
  firstRoundTime?: string | null;
  /** How many rounds the tournament has, to pre-seed the default schedule. */
  rounds?: number;
  onChange?: (next: AgendaItem[]) => void;
}

export function TournamentScheduleSection(props: Props) {
  const [items, setItems] = useState<AgendaItem[]>(props.agenda);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => setItems(props.agenda), [props.agenda]);

  const grouped = useMemo(() => groupAgendaByDate(items), [items]);

  async function save(next: AgendaItem[]) {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("tournaments")
        .update({ agenda: next as any })
        .eq("id", props.tournamentId);
      if (error) throw error;
      props.onChange?.(next);
      toast.success("Schedule saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the schedule.");
    } finally {
      setSaving(false);
    }
  }

  async function generateDefault() {
    const next = buildDefaultAgenda({
      date: props.startDate,
      firstRoundTime: props.firstRoundTime ?? null,
      rounds: props.rounds ?? 2,
    });
    setItems(next);
    await save(next);
  }

  function update(id: string, patch: Partial<AgendaItem>) {
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }
  function remove(id: string) {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }
  function addRow(date: string) {
    setItems((prev) => [...prev, newAgendaItem(date)]);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">Schedule</div>
          <p className="text-xs text-muted-foreground">
            When to arrive, when rounds start, lunch, and awards. Players see this on the event page
            and it drives the calendar.
          </p>
        </div>
        {props.canEdit ? (
          <div className="flex gap-2">
            {!editing && items.length === 0 ? (
              <Button size="sm" variant="secondary" onClick={generateDefault} disabled={saving}>
                <Sparkles className="mr-1 h-3.5 w-3.5" />
                Generate 2-round day
              </Button>
            ) : null}
            {!editing ? (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setItems(props.agenda);
                    setEditing(false);
                  }}
                  disabled={saving}
                >
                  <X className="mr-1 h-3.5 w-3.5" /> Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={async () => {
                    await save(items);
                    setEditing(false);
                  }}
                  disabled={saving}
                >
                  <Save className="mr-1 h-3.5 w-3.5" /> {saving ? "Saving…" : "Save"}
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {items.length === 0 && !editing ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          No agenda yet.{" "}
          {props.canEdit
            ? "Generate a default 2-round day, or add items manually."
            : "The TD hasn't posted a schedule yet."}
        </div>
      ) : null}

      <div className="space-y-4">
        {grouped.map(({ date, items: dayItems }) => (
          <div key={date} className="rounded-lg border border-border bg-background/50 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">{humanDate(date)}</div>
              <div className="text-xs text-muted-foreground">
                <Clock className="mr-1 inline h-3 w-3" />
                On-site ~{fmtWindow(dayWindowMinutes(dayItems))}
              </div>
            </div>

            {!editing ? (
              <ol className="space-y-1.5">
                {dayItems.map((it) => (
                  <li key={it.id} className="flex items-start gap-3 text-sm">
                    <span className="w-20 shrink-0 tabular-nums text-muted-foreground">
                      {formatTime12h(it.time)}
                    </span>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] ${KIND_TONE[it.kind]}`}
                    >
                      {AGENDA_KIND_LABEL[it.kind]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <div className="font-medium leading-tight">
                        {it.label || AGENDA_KIND_LABEL[it.kind]}
                      </div>
                      {it.notes ? (
                        <div className="text-xs text-muted-foreground">{it.notes}</div>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {fmtWindow(it.duration_min)}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="space-y-2">
                {dayItems.map((it) => (
                  <div
                    key={it.id}
                    className="grid grid-cols-2 gap-2 rounded-lg border border-border/60 p-2 sm:grid-cols-12 sm:rounded-none sm:border-0 sm:p-0"
                  >
                    <Input
                      className="col-span-1 sm:col-span-3"
                      type="time"
                      value={it.time}
                      onChange={(e) => update(it.id, { time: e.target.value })}
                    />
                    <select
                      className="col-span-1 rounded-md border border-input bg-background px-2 text-sm sm:col-span-3"
                      value={it.kind}
                      onChange={(e) => update(it.id, { kind: e.target.value as AgendaKind })}
                    >
                      {KIND_ORDER.map((k) => (
                        <option key={k} value={k}>
                          {AGENDA_KIND_LABEL[k]}
                        </option>
                      ))}
                    </select>
                    <Input
                      className="col-span-2 sm:col-span-4"
                      value={it.label}
                      placeholder={AGENDA_KIND_LABEL[it.kind]}
                      onChange={(e) => update(it.id, { label: e.target.value })}
                    />
                    <Input
                      className="col-span-1 sm:col-span-1"
                      type="number"
                      min={5}
                      step={5}
                      value={it.duration_min}
                      onChange={(e) =>
                        update(it.id, { duration_min: parseInt(e.target.value) || 0 })
                      }
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="col-span-1 justify-self-end sm:col-span-1 sm:justify-self-auto"
                      onClick={() => remove(it.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => addRow(date)}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add item to {humanDate(date)}
                </Button>
              </div>
            )}
          </div>
        ))}

        {editing ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => addRow(props.startDate)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add item
            </Button>
            {items.length === 0 ? (
              <Button size="sm" variant="secondary" onClick={generateDefault} disabled={saving}>
                <Sparkles className="mr-1 h-3.5 w-3.5" /> Generate default 2-round day
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
