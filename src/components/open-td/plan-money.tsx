import { Plus, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  centsFromInput,
  computeMoney,
  money,
  planId,
  type OpenPlan,
  type PlanMoney,
} from "@/lib/open-td-plan";
import { SectionCard } from "./section-card";

interface Props {
  plan: OpenPlan;
  canEdit: boolean;
  update: (patch: Partial<OpenPlan>) => void;
}

export function PlanMoneyPanel({ plan, canEdit, update }: Props) {
  const b = computeMoney(plan);

  function setMoney(patch: Partial<PlanMoney>) {
    update({ money: { ...plan.money, ...patch } });
  }

  return (
    <div className="grid gap-4">
      <SectionCard
        title="Divisions and entry fees"
        blurb="Add the divisions you'll offer and how many players you expect in each. The payout table updates as you type."
        actions={
          canEdit ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                update({
                  divisions: [
                    ...plan.divisions,
                    { id: planId(), name: "", entryFeeCents: 2500, players: 0 },
                  ],
                })
              }
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Add division
            </Button>
          ) : null
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[38rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Division</th>
                <th className="py-2 pr-3 font-medium">Entry fee</th>
                <th className="py-2 pr-3 font-medium">Players</th>
                <th className="py-2 pr-3 font-medium">Collected</th>
                <th className="py-2 pr-3 font-medium">Payout</th>
                <th className="py-2 pr-3 font-medium">Suggested split</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {b.perDivision.map((row) => {
                const div = plan.divisions.find((d) => d.id === row.id)!;
                return (
                  <tr key={row.id} className="border-b border-border/60">
                    <td className="py-2 pr-3">
                      <Input
                        className="h-8 min-w-[10rem]"
                        placeholder="MA2 — Intermediate"
                        value={div.name}
                        disabled={!canEdit}
                        onChange={(e) =>
                          update({
                            divisions: plan.divisions.map((d) =>
                              d.id === row.id ? { ...d, name: e.target.value } : d,
                            ),
                          })
                        }
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <Input
                        className="h-8 w-24"
                        value={(div.entryFeeCents / 100).toFixed(2)}
                        disabled={!canEdit}
                        onChange={(e) =>
                          update({
                            divisions: plan.divisions.map((d) =>
                              d.id === row.id
                                ? { ...d, entryFeeCents: centsFromInput(e.target.value) }
                                : d,
                            ),
                          })
                        }
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <Input
                        type="number"
                        min={0}
                        className="h-8 w-20"
                        value={div.players}
                        disabled={!canEdit}
                        onChange={(e) =>
                          update({
                            divisions: plan.divisions.map((d) =>
                              d.id === row.id
                                ? { ...d, players: Math.max(0, Number(e.target.value) || 0) }
                                : d,
                            ),
                          })
                        }
                      />
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{money(row.collectedCents)}</td>
                    <td className="py-2 pr-3 tabular-nums font-medium">{money(row.payoutCents)}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {row.topThreeCents.length
                        ? row.topThreeCents.map((c) => money(c)).join(" · ")
                        : "—"}
                    </td>
                    <td className="py-2">
                      {canEdit ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          aria-label="Remove division"
                          onClick={() =>
                            update({ divisions: plan.divisions.filter((d) => d.id !== row.id) })
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {!b.perDivision.length ? (
                <tr>
                  <td colSpan={7} className="py-4 text-sm text-muted-foreground">
                    No divisions yet. Add the ones your field will actually fill.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Payout, CTP prizes and ace pot"
          blurb="Closest to the pin and the ace pot come out of entry fees before the division payout is split."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Money
              label="Payout share of the purse (%)"
              raw
              value={String(plan.money.payoutPercent)}
              disabled={!canEdit}
              onChange={(v) =>
                setMoney({ payoutPercent: Math.min(100, Math.max(0, Number(v) || 0)) })
              }
            />
            <div>
              <Label className="mb-1 block text-xs font-medium text-muted-foreground">
                Winners receive
              </Label>
              <Select
                value={plan.money.payoutKind}
                disabled={!canEdit}
                onValueChange={(v) => setMoney({ payoutKind: v as PlanMoney["payoutKind"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="merch">Merchandise or pro-shop credit</SelectItem>
                  <SelectItem value="trophy_only">Trophies only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Money
              label="CTP prizes per player"
              value={(plan.money.ctpPerPlayerCents / 100).toFixed(2)}
              disabled={!canEdit}
              onChange={(v) => setMoney({ ctpPerPlayerCents: centsFromInput(v) })}
            />
            <Money
              label="Ace pot per player"
              value={(plan.money.acePotPerPlayerCents / 100).toFixed(2)}
              disabled={!canEdit}
              onChange={(v) => setMoney({ acePotPerPlayerCents: centsFromInput(v) })}
            />
            <Money
              label="Added cash or sponsor value"
              value={(plan.money.addedValueCents / 100).toFixed(2)}
              disabled={!canEdit}
              onChange={(v) => setMoney({ addedValueCents: centsFromInput(v) })}
            />
            <Money
              label="Costs: permits, printing, fees"
              value={(plan.money.expensesCents / 100).toFixed(2)}
              disabled={!canEdit}
              onChange={(v) => setMoney({ expensesCents: centsFromInput(v) })}
            />
          </div>
        </SectionCard>

        <SectionCard title="Where the money lands" blurb="Totals across every division.">
          <dl className="grid gap-2 text-sm">
            <Row label="Players expected" value={String(b.playerCount)} />
            <Row label="Entry fees collected" value={money(b.entryTotalCents)} />
            <Row label="CTP prize pool" value={money(b.ctpTotalCents)} />
            <Row label="Ace pot" value={money(b.acePotTotalCents)} />
            <Row label="Division payout" value={money(b.payoutPoolCents)} strong />
            <Row
              label={b.clubKeepsCents < 0 ? "Short by" : "Left for the club"}
              value={money(Math.abs(b.clubKeepsCents))}
            />
          </dl>
          {b.warnings.length ? (
            <ul className="mt-3 grid gap-2">
              {b.warnings.map((w) => (
                <li
                  key={w}
                  className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground"
                >
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </SectionCard>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={strong ? "font-semibold tabular-nums" : "tabular-nums"}>{value}</dd>
    </div>
  );
}

function Money({
  label,
  value,
  onChange,
  disabled,
  raw,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  raw?: boolean;
}) {
  return (
    <div>
      <Label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-1">
        {raw ? null : <span className="text-sm text-muted-foreground">$</span>}
        <Input value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}
