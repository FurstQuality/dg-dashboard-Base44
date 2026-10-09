import { Plus, Printer, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  NIGHT_KIND_LABEL,
  NIGHT_KIND_ORDER,
  addMinutes,
  formatDuration,
  formatTime12h,
  newNightItem,
  nightWindowMinutes,
  sortNightAgenda,
  type NightItem,
  type NightItemKind,
} from "@/lib/league-night-schedule";
import { rebuildAgenda, type OpenPlan } from "@/lib/open-td-plan";
import { SectionCard } from "./section-card";

interface Props {
  plan: OpenPlan;
  canEdit: boolean;
  update: (patch: Partial<OpenPlan>) => void;
}

export function PlanSchedule({ plan, canEdit, update }: Props) {
  const items = sortNightAgenda(plan.agenda);
  const onSite = nightWindowMinutes(items);
  const last = items[items.length - 1];

  function setItems(next: NightItem[]) {
    update({ agenda: sortNightAgenda(next) });
  }

  return (
    <SectionCard
      title="Running order"
      blurb="The timeline you read out at the players meeting: check-in, tee times, breaks, scoring, payouts. Every line is editable."
      actions={
        canEdit ? (
          <>
            <Button size="sm" variant="outline" onClick={() => setItems(rebuildAgenda(plan))}>
              <Sparkles className="mr-1 h-3.5 w-3.5" /> Rebuild from event basics
            </Button>
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              <Printer className="mr-1 h-3.5 w-3.5" /> Print
            </Button>
          </>
        ) : null
      }
    >
      <div className="mb-3 text-xs text-muted-foreground">
        {items.length
          ? `${formatTime12h(items[0]!.time)} to ${formatTime12h(
              addMinutes(last!.time, last!.duration_min),
            )} · ${formatDuration(onSite)} on site`
          : "No items yet."}
      </div>

      <div className="grid gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="grid gap-2 rounded-lg border border-border bg-background p-2 sm:grid-cols-[7rem_10rem_1fr_6rem_auto] sm:items-center"
          >
            <Input
              type="time"
              className="h-8"
              value={item.time}
              disabled={!canEdit}
              onChange={(e) =>
                setItems(
                  plan.agenda.map((x) => (x.id === item.id ? { ...x, time: e.target.value } : x)),
                )
              }
            />
            <Select
              value={item.kind}
              disabled={!canEdit}
              onValueChange={(v) =>
                setItems(
                  plan.agenda.map((x) =>
                    x.id === item.id ? { ...x, kind: v as NightItemKind } : x,
                  ),
                )
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NIGHT_KIND_ORDER.map((k) => (
                  <SelectItem key={k} value={k}>
                    {NIGHT_KIND_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="h-8"
              placeholder={NIGHT_KIND_LABEL[item.kind]}
              value={item.label}
              disabled={!canEdit}
              onChange={(e) =>
                setItems(
                  plan.agenda.map((x) => (x.id === item.id ? { ...x, label: e.target.value } : x)),
                )
              }
            />
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={5}
                step={5}
                className="h-8"
                value={item.duration_min}
                disabled={!canEdit}
                onChange={(e) =>
                  setItems(
                    plan.agenda.map((x) =>
                      x.id === item.id
                        ? { ...x, duration_min: Math.max(5, Number(e.target.value) || 30) }
                        : x,
                    ),
                  )
                }
              />
              <span className="text-xs text-muted-foreground">min</span>
            </div>
            {canEdit ? (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                aria-label="Remove item"
                onClick={() => setItems(plan.agenda.filter((x) => x.id !== item.id))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        ))}
      </div>

      {canEdit ? (
        <Button
          className="mt-3"
          variant="secondary"
          size="sm"
          onClick={() => setItems([...plan.agenda, newNightItem(last?.time)])}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Add a line
        </Button>
      ) : null}
    </SectionCard>
  );
}
