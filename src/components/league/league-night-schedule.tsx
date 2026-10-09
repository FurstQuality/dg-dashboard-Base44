import { useEffect, useMemo, useState } from "react";
import { Clock, Pencil, Plus, Save, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NIGHT_KIND_LABEL,
  NIGHT_KIND_ORDER,
  buildDefaultNightAgenda,
  formatDuration,
  formatTime12h,
  newNightItem,
  nightWindowMinutes,
  sortNightAgenda,
  type NightItem,
  type NightItemKind,
} from "@/lib/league-night-schedule";

const KIND_TONE: Record<NightItemKind, string> = {
  check_in: "bg-primary/15 text-primary",
  players_meeting: "bg-primary/15 text-primary",
  round: "bg-emerald-500/15 text-emerald-500",
  break: "bg-muted text-muted-foreground",
  lunch: "bg-amber-500/15 text-amber-500",
  scoring: "bg-sky-500/15 text-sky-500",
  payouts: "bg-yellow-500/15 text-yellow-500",
  awards: "bg-yellow-500/15 text-yellow-500",
  social: "bg-violet-500/15 text-violet-500",
  other: "bg-muted text-muted-foreground",
};

interface Props {
  leagueId: string;
  agenda: NightItem[];
  canEdit: boolean;
  /** Used when generating the default running order. */
  startTime?: string | null;
  holes?: number | null;
  onChange?: (next: NightItem[]) => void;
}

export function LeagueNightSchedule(props: Props) {
  const [items, setItems] = useState<NightItem[]>(props.agenda);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => setItems(props.agenda), [props.agenda]);

  const ordered = useMemo(() => sortNightAgenda(items), [items]);
  const window = useMemo(() => nightWindowMinutes(items), [items]);

  async function save(next: NightItem[]) {
    setSaving(true);
    try {
      const clean = sortNightAgenda(next).map((x) => ({
        ...x,
        label: x.label.trim() || NIGHT_KIND_LABEL[x.kind],
      }));
      const { error } = await supabase
        .from("leagues")
        .update({ agenda: clean as unknown as never })
        .eq("id", props.leagueId);
      if (error) throw error;
      setItems(clean);
      props.onChange?.(clean);
      toast.success("Night schedule saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the schedule.");
    } finally {
      setSaving(false);
    }
  }

  function generate(rounds: number) {
    const next = buildDefaultNightAgenda({
      startTime: props.startTime ?? null,
      holes: props.holes ?? null,
      rounds,
    });
    setItems(next);
    setEditing(true);
  }

  function update(id: string, patch: Partial<NightItem>) {
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">Night schedule</div>
          <p className="text-xs text-muted-foreground">
            The running order players see every week — check-in, players meeting, tee times, break,
            scoring, and payouts.
          </p>
        </div>
        {props.canEdit ? (
          <div className="flex flex-wrap gap-2">
            {!editing ? (
              <>
                <Button size="sm" variant="secondary" onClick={() => generate(1)}>
                  <Sparkles className="mr-1 h-3.5 w-3.5" /> One round
                </Button>
                <Button size="sm" variant="secondary" onClick={() => generate(2)}>
                  <Sparkles className="mr-1 h-3.5 w-3.5" /> Two rounds
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                  <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={saving}
                  onClick={() => {
                    setItems(props.agenda);
                    setEditing(false);
                  }}
                >
                  <X className="mr-1 h-3.5 w-3.5" /> Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={saving}
                  onClick={async () => {
                    await save(items);
                    setEditing(false);
                  }}
                >
                  <Save className="mr-1 h-3.5 w-3.5" /> {saving ? "Saving…" : "Save schedule"}
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          {props.canEdit
            ? "No running order yet. Start from a one- or two-round night, then edit the times."
            : "The director hasn't posted a running order yet."}
        </div>
      ) : (
        <>
          <div className="mb-2 text-xs text-muted-foreground">
            <Clock className="mr-1 inline h-3 w-3" />
            On site about {formatDuration(window)} · {formatTime12h(ordered[0].time)} start
          </div>

          {!editing ? (
            <ol className="space-y-1.5">
              {ordered.map((it) => (
                <li key={it.id} className="flex items-start gap-3 text-sm">
                  <span className="w-20 shrink-0 tabular-nums text-muted-foreground">
                    {formatTime12h(it.time)}
                  </span>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] ${KIND_TONE[it.kind]}`}
                  >
                    {NIGHT_KIND_LABEL[it.kind]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <div className="font-medium leading-tight">
                      {it.label || NIGHT_KIND_LABEL[it.kind]}
                    </div>
                    {it.notes ? (
                      <div className="text-xs text-muted-foreground">{it.notes}</div>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDuration(it.duration_min)}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="space-y-2">
              {ordered.map((it) => (
                <div
                  key={it.id}
                  className="grid grid-cols-2 gap-2 rounded-lg border border-border/60 p-2 sm:grid-cols-12"
                >
                  <Input
                    className="sm:col-span-2"
                    type="time"
                    aria-label="Start time"
                    value={it.time}
                    onChange={(e) => update(it.id, { time: e.target.value })}
                  />
                  <select
                    className="h-10 rounded-md border border-input bg-background px-2 text-sm sm:col-span-3"
                    aria-label="Item type"
                    value={it.kind}
                    onChange={(e) => update(it.id, { kind: e.target.value as NightItemKind })}
                  >
                    {NIGHT_KIND_ORDER.map((k) => (
                      <option key={k} value={k}>
                        {NIGHT_KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                  <Input
                    className="col-span-2 sm:col-span-4"
                    aria-label="Label"
                    value={it.label}
                    placeholder={NIGHT_KIND_LABEL[it.kind]}
                    onChange={(e) => update(it.id, { label: e.target.value })}
                  />
                  <Input
                    className="sm:col-span-2"
                    type="number"
                    min={5}
                    step={5}
                    aria-label="Minutes"
                    value={it.duration_min}
                    onChange={(e) =>
                      update(it.id, { duration_min: parseInt(e.target.value, 10) || 0 })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${it.label || NIGHT_KIND_LABEL[it.kind]}`}
                    className="justify-self-end sm:col-span-1"
                    onClick={() => setItems((prev) => prev.filter((x) => x.id !== it.id))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Input
                    className="col-span-2 sm:col-span-12"
                    aria-label="Notes players should see"
                    value={it.notes ?? ""}
                    placeholder="Optional note players should see"
                    onChange={(e) => update(it.id, { notes: e.target.value || undefined })}
                  />
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setItems((prev) => [
                    ...prev,
                    newNightItem(sortNightAgenda(prev).at(-1)?.time ?? props.startTime ?? undefined),
                  ])
                }
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Add item
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
