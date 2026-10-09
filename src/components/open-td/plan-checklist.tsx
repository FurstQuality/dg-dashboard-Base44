import { useState } from "react";
import { Plus, Printer, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  PHASE_LABEL,
  PHASE_ORDER,
  planId,
  syncTasks,
  taskProgress,
  type OpenPlan,
  type PlanTask,
} from "@/lib/open-td-plan";
import type { EventPhase } from "@/lib/sanctioning-plan";
import { SectionCard } from "./section-card";

interface Props {
  plan: OpenPlan;
  canEdit: boolean;
  update: (patch: Partial<OpenPlan>) => void;
}

export function PlanChecklist({ plan, canEdit, update }: Props) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const progress = taskProgress(plan.tasks);

  function setTasks(next: PlanTask[]) {
    update({ tasks: next });
  }

  function addTask(phase: EventPhase) {
    const label = (drafts[phase] ?? "").trim();
    if (!label) return;
    setTasks([...plan.tasks, { id: planId(), label, phase, done: false, custom: true }]);
    setDrafts((prev) => ({ ...prev, [phase]: "" }));
  }

  return (
    <div className="grid gap-4">
      <SectionCard
        title="Run-of-day checklist"
        blurb="Built from your event settings — sanctioned tiers add their own obligations. Tick items as you go and add anything your club does differently."
        actions={
          canEdit ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setTasks(syncTasks(plan, plan.tasks))}
              >
                <RotateCcw className="mr-1 h-3.5 w-3.5" /> Refresh from settings
              </Button>
              <Button size="sm" variant="secondary" onClick={() => window.print()}>
                <Printer className="mr-1 h-3.5 w-3.5" /> Print
              </Button>
            </>
          ) : null
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {progress.map((p) => (
            <div key={p.phase} className="rounded-lg border border-border bg-background px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium">{PHASE_LABEL[p.phase]}</span>
                <span className="text-xs text-muted-foreground">
                  {p.done}/{p.total}
                </span>
              </div>
              <Progress
                className="mt-2 h-1.5"
                value={p.total ? (p.done / p.total) * 100 : 0}
              />
            </div>
          ))}
        </div>
      </SectionCard>

      {PHASE_ORDER.map((phase) => {
        const rows = plan.tasks.filter((t) => t.phase === phase);
        return (
          <SectionCard key={phase} title={PHASE_LABEL[phase]}>
            <ul className="grid gap-1">
              {rows.map((task) => (
                <li
                  key={task.id}
                  className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-muted/50"
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={task.done}
                    disabled={!canEdit}
                    onCheckedChange={(v) =>
                      setTasks(
                        plan.tasks.map((t) => (t.id === task.id ? { ...t, done: v === true } : t)),
                      )
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <span
                      className={
                        task.done
                          ? "text-sm text-muted-foreground line-through"
                          : "text-sm text-foreground"
                      }
                    >
                      {task.label}
                    </span>
                  </div>
                  <Input
                    className="h-7 w-32 text-xs"
                    placeholder="Who?"
                    value={task.owner ?? ""}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setTasks(
                        plan.tasks.map((t) =>
                          t.id === task.id ? { ...t, owner: e.target.value } : t,
                        ),
                      )
                    }
                  />
                  {canEdit && task.custom ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      aria-label="Remove task"
                      onClick={() => setTasks(plan.tasks.filter((t) => t.id !== task.id))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </li>
              ))}
              {!rows.length ? (
                <li className="px-2 py-3 text-sm text-muted-foreground">
                  Nothing here yet — add the first step below.
                </li>
              ) : null}
            </ul>
            {canEdit ? (
              <div className="mt-3 flex gap-2">
                <Input
                  value={drafts[phase] ?? ""}
                  placeholder={`Add a step — ${PHASE_LABEL[phase].toLowerCase()}`}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [phase]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addTask(phase);
                  }}
                />
                <Button variant="secondary" onClick={() => addTask(phase)}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add
                </Button>
              </div>
            ) : null}
          </SectionCard>
        );
      })}
    </div>
  );
}
