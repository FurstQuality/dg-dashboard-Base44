import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, ListPlus } from "lucide-react";
import { toast } from "sonner";
import { DirectorTaskLink } from "@/components/director/director-task-link";
import type { DirectorTaskContext } from "@/lib/director-task-links";
import type { ChecklistRow, EventPhase } from "@/lib/sanctioning-plan";

type Item = { id: string; phase: string; label: string; done: boolean; sort_order: number };

const PHASES: { key: EventPhase; title: string; hint: string }[] = [
  {
    key: "pre",
    title: "Before league night",
    hint: "Sanctioning, sign-ups, venue, communication",
  },
  { key: "day_of", title: "During league night", hint: "Check-in, cards, scoring, side games" },
  { key: "post", title: "After league night", hint: "Payouts, reporting, standings, wrap-up" },
];

/** League director console: the weekly and seasonal to-do list for a league. */
export function LeagueChecklist({
  leagueId,
  canManage,
  taskContext,
  phase,
  suggestions,
}: {
  leagueId: string;
  canManage: boolean;
  taskContext?: DirectorTaskContext;
  /** Render only one phase. Omit to render all three. */
  phase?: EventPhase;
  /** Default steps for this league's settings, offered when a phase is empty. */
  suggestions?: ChecklistRow[];
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [newLabel, setNewLabel] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("league_checklist_items")
      .select("id, phase, label, done, sort_order")
      .eq("league_id", leagueId)
      .order("sort_order");
    setItems((data as Item[]) ?? []);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId]);

  async function toggle(id: string, done: boolean) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, done } : i)));
    const { error } = await supabase.from("league_checklist_items").update({ done }).eq("id", id);
    if (error) toast.error(error.message);
  }

  async function add(p: string) {
    const label = (newLabel[p] ?? "").trim();
    if (!label) return;
    const sort_order = items.filter((i) => i.phase === p).length + 1;
    const { error } = await supabase
      .from("league_checklist_items")
      .insert({ league_id: leagueId, phase: p, label, sort_order });
    if (error) return toast.error(error.message);
    setNewLabel((prev) => ({ ...prev, [p]: "" }));
    load();
  }

  async function addSuggested(p: EventPhase) {
    const existing = new Set(items.map((i) => i.label.toLowerCase()));
    const rows = (suggestions ?? [])
      .filter((r) => r.phase === p && !existing.has(r.label.toLowerCase()))
      .map((r, idx) => ({
        league_id: leagueId,
        phase: p,
        label: r.label,
        sort_order: items.filter((i) => i.phase === p).length + idx + 1,
      }));
    if (rows.length === 0) return;
    setAdding(true);
    const { error } = await supabase.from("league_checklist_items").insert(rows);
    setAdding(false);
    if (error) return toast.error(error.message);
    toast.success(`Added ${rows.length} steps`);
    load();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("league_checklist_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  const shown = phase ? PHASES.filter((p) => p.key === phase) : PHASES;

  return (
    <div className="space-y-4">
      {phase ? null : (
        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
          <div>
            <div className="font-display text-lg font-semibold">League prep checklist</div>
            <div className="text-xs text-muted-foreground">
              Everything that keeps the season running week to week.
            </div>
          </div>
          <div className="text-sm">
            <span className="font-semibold">{items.filter((i) => i.done).length}</span>
            <span className="text-muted-foreground">/{items.length} complete</span>
          </div>
        </div>
      )}

      {shown.map((p) => {
        const list = items.filter((i) => i.phase === p.key);
        const suggestedCount = (suggestions ?? []).filter(
          (r) =>
            r.phase === p.key && !list.some((i) => i.label.toLowerCase() === r.label.toLowerCase()),
        ).length;
        return (
          <div key={p.key} className="rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div>
                {phase ? (
                  <div className="text-sm font-semibold">Checklist</div>
                ) : (
                  <div className="text-sm font-semibold">{p.title}</div>
                )}
                <div className="text-xs text-muted-foreground">{p.hint}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {list.filter((i) => i.done).length}/{list.length} done
                </span>
                {canManage && suggestedCount > 0 ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={adding}
                    onClick={() => addSuggested(p.key)}
                  >
                    <ListPlus className="mr-1 h-3.5 w-3.5" />
                    Add {suggestedCount} suggested
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="divide-y divide-border">
              {list.length === 0 ? (
                <div className="px-4 py-3 text-sm text-muted-foreground">
                  Nothing here yet — add the suggested steps or write your own.
                </div>
              ) : (
                list.map((i) => (
                  <div key={i.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <Checkbox
                      id={`chk-${i.id}`}
                      checked={i.done}
                      disabled={!canManage}
                      onCheckedChange={(v) => toggle(i.id, !!v)}
                    />
                    <label
                      htmlFor={`chk-${i.id}`}
                      className={i.done ? "flex-1 text-muted-foreground line-through" : "flex-1"}
                    >
                      {i.label}
                    </label>
                    <DirectorTaskLink text={i.label} context={taskContext} />
                    {canManage ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove checklist item"
                        onClick={() => remove(i.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                ))
              )}
            </div>
            {canManage ? (
              <div className="flex gap-2 border-t border-border p-3">
                <Input
                  value={newLabel[p.key] ?? ""}
                  onChange={(e) => setNewLabel((prev) => ({ ...prev, [p.key]: e.target.value }))}
                  placeholder="Add a checklist item…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") add(p.key);
                  }}
                />
                <Button variant="outline" onClick={() => add(p.key)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
