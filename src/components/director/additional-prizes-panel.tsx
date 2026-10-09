import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Check, Gift, Pencil, Plus, Search, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoadingSkeleton } from "@/components/shell";
import {
  AWARD_TYPES,
  PAYOUT_RULES,
  PRIZE_STATUSES,
  REMAINDER_ACTIONS,
  VALUE_KINDS,
  aceFundTotal,
  awardTypeLabel,
  fiftyFifty,
  minimumWarning,
  payoutSummary,
  perPlayer,
  prizePool,
  suggestedShares,
} from "@/lib/side-pots";
import { getEventFinance } from "@/lib/payouts.functions";
import {
  addPrizeRecipient,
  closeAceFund,
  deletePrize,
  listPrizes,
  markRecipientPaid,
  savePrize,
  searchPrizePlayers,
  voidPrizeRecipient,
  type PrizeRow,
  type RecipientRow,
} from "@/lib/prizes.functions";

type Kind = "tournament" | "league_event";
const usd = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);
const sel = "h-10 w-full rounded-md border border-input bg-background px-2 text-sm";
const statusLabel = (s: string) => PRIZE_STATUSES.find((x) => x.value === s)?.label ?? s;

function poolLabel(p: PrizeRow) {
  if (p.award_type === "ace_fund") return `${usd(aceFundTotal(p).total)} fund`;
  if (p.award_type === "fifty_fifty") return `${usd(p.amount)} collected`;
  return p.value_kind === "cash" ? usd(p.amount) : `${usd(p.amount)} value`;
}
function ruleLabel(p: PrizeRow) {
  if (p.award_type === "fifty_fifty") return `${p.winner_percent}% to winner`;
  if (p.payout_rule === "percent") return `${p.winner_percent}% to winner`;
  if (p.value_kind !== "cash") return VALUE_KINDS.find((v) => v.value === p.value_kind)?.label ?? "Prize";
  return PAYOUT_RULES.find((r) => r.value === p.payout_rule)?.label ?? "";
}

/**
 * Additional Payouts & Prizes — side pots, contests and sponsor prizes,
 * kept apart from the placement purse and reconciled in one summary.
 */
export function AdditionalPrizesPanel({ kind, eventId, placementCash = 0 }: { kind: Kind; eventId: string; placementCash?: number }) {
  const qc = useQueryClient();
  const fetchList = useServerFn(listPrizes);
  const key = ["event-prizes", kind, eventId];
  const q = useQuery({ queryKey: key, queryFn: () => fetchList({ data: { kind, eventId } }) });
  const fetchFin = useServerFn(getEventFinance);
  // Same cache key as the placement payout panel, so this costs no extra request there.
  const fin = useQuery({ queryKey: ["event-finance", eventId], queryFn: () => fetchFin({ data: { eventId } }), enabled: kind === "tournament" });
  const placementFromFinance =
    (fin.data?.divisions ?? []).reduce((s, d) => s + (d.snapshot?.total_paid_cents ?? d.schedule?.total_paid_cents ?? 0), 0) / 100;
  const [editing, setEditing] = useState<Partial<PrizeRow> | null>(null);
  const [awarding, setAwarding] = useState<PrizeRow | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  if (q.isPending) return <LoadingSkeleton />;
  if (q.isError) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const { prizes, recipients, leagueAceBalance, entrants } = q.data;
  const live = (id: string) => recipients.filter((r) => r.prize_id === id && !r.voided_at);
  const summary = payoutSummary(prizes, recipients, placementCash || placementFromFinance);
  const assigned = prizes.filter((p) => p.status !== "cancelled" && live(p.id).length > 0).length;
  const active = prizes.filter((p) => p.status !== "cancelled").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Ace Fund, 50/50, CTPs and sponsor prizes. These never come out of the placement purse. Winners assigned: {assigned} / {active}.
        </p>
        <Button size="sm" onClick={() => setEditing({ award_type: "ctp", value_kind: "cash", payout_rule: "winner_all", visibility: "public", status: "planned", contributors: entrants })}>
          <Plus className="mr-1.5 h-4 w-4" /> Add prize or payout
        </Button>
      </div>

      {prizes.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          <Gift className="h-5 w-5 shrink-0" />
          No side pots or prizes yet. Add an Ace Fund, a CTP or a sponsor prize to track who won what.
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[13px] text-muted-foreground">
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Pool / value</th>
                  <th className="py-2 pr-3">Payout rule</th>
                  <th className="py-2 pr-3">Winner</th>
                  <th className="py-2 pr-3">Payout / prize</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {prizes.map((p) => (
                  <PrizeTableRow key={p.id} p={p} winners={live(p.id)} onEdit={() => setEditing(p)} onAward={() => setAwarding(p)} onChanged={refresh} />
                ))}
              </tbody>
            </table>
          </div>
          {/* Phone cards */}
          <ul className="space-y-3 md:hidden">
            {prizes.map((p) => (
              <li key={p.id} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[13px] text-muted-foreground">{awardTypeLabel(p.award_type)}</div>
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-lg font-semibold">{poolLabel(p)}</div>
                    {p.award_type === "fifty_fifty" && (
                      <div className="text-sm text-muted-foreground">Winner gets {usd(fiftyFifty(p.amount, p.winner_percent).winner)}</div>
                    )}
                  </div>
                  <Badge variant="outline">{statusLabel(p.status)}</Badge>
                </div>
                <WinnerList p={p} winners={live(p.id)} onChanged={refresh} />
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setAwarding(p)}>
                    <UserPlus className="mr-1.5 h-4 w-4" /> Add winner
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                    <Pencil className="mr-1.5 h-4 w-4" /> Edit
                  </Button>
                  <AceCloseButton p={p} onChanged={refresh} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {(leagueAceBalance !== null || prizes.some((p) => p.award_type === "ace_fund")) && (
        <div className="rounded-lg border border-border p-3 text-sm">
          <div className="mb-1 font-semibold">Fund balances</div>
          {leagueAceBalance !== null && <div>League Ace Fund carried forward: {usd(leagueAceBalance)}</div>}
          {prizes
            .filter((p) => p.award_type === "ace_fund")
            .map((p) => {
              const t = aceFundTotal(p);
              const paid = live(p.id).reduce((s, r) => s + r.amount, 0);
              return (
                <div key={p.id} className="text-muted-foreground">
                  {p.name}: opening {usd(t.carryover)} + collected {usd(t.contributions)} + added {usd(t.added)} − paid {usd(paid)} = closing{" "}
                  <span className="font-medium text-foreground">{usd(Math.round((t.total - paid) * 100) / 100)}</span>
                </div>
              );
            })}
        </div>
      )}

      <div className="rounded-lg border border-border p-3 text-sm">
        <div className="mb-2 font-semibold">Payout summary</div>
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          <Line k="Competitive payouts" v={usd(summary.placementCash)} />
          <Line k="Additional cash payouts" v={usd(summary.additionalCash)} />
          <Line k="Prizes & awards (value)" v={usd(summary.prizeValue)} />
          <Line k="Total cash paid" v={usd(summary.totalCash)} strong />
          <Line k="Ace Fund collected" v={usd(summary.ace.contributions)} />
          <Line k="Ace Fund paid" v={usd(summary.ace.paid)} />
          <Line k="Ace Fund carried forward" v={usd(summary.ace.carryover)} />
          <Line k="50/50 collected" v={usd(summary.fiftyFifty.gross)} />
          <Line k="50/50 winner payout" v={usd(summary.fiftyFifty.winner)} />
          <Line k="50/50 kept by club" v={usd(summary.fiftyFifty.retained)} />
        </dl>
      </div>

      {editing && <PrizeDialog kind={kind} eventId={eventId} initial={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
      {awarding && (
        <AwardDialog p={awarding} existing={live(awarding.id).length} onClose={() => setAwarding(null)} onSaved={refresh} />
      )}
    </div>
  );
}

function Line({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className={strong ? "font-semibold" : "text-muted-foreground"}>{k}</dt>
      <dd className={strong ? "font-semibold" : ""}>{v}</dd>
    </div>
  );
}

function PrizeTableRow({ p, winners, onEdit, onAward, onChanged }: { p: PrizeRow; winners: RecipientRow[]; onEdit: () => void; onAward: () => void; onChanged: () => void }) {
  return (
    <tr className="border-t border-border align-top">
      <td className="py-2 pr-3">{awardTypeLabel(p.award_type)}</td>
      <td className="py-2 pr-3 font-medium">
        {p.name}
        {p.hole_number ? <span className="block text-[13px] font-normal text-muted-foreground">Hole {p.hole_number}</span> : null}
        {p.sponsor_name ? <span className="block text-[13px] font-normal text-muted-foreground">Presented by {p.sponsor_name}</span> : null}
        {p.visibility === "staff" && <Badge variant="outline" className="mt-1">Staff only</Badge>}
      </td>
      <td className="py-2 pr-3">{poolLabel(p)}</td>
      <td className="py-2 pr-3">{ruleLabel(p)}</td>
      <td className="py-2 pr-3" colSpan={2}>
        <WinnerList p={p} winners={winners} onChanged={onChanged} />
      </td>
      <td className="py-2 pr-3">
        <Badge variant="outline">{statusLabel(p.status)}</Badge>
      </td>
      <td className="py-2 whitespace-nowrap text-right">
        <Button size="sm" variant="ghost" onClick={onAward} aria-label="Add winner">
          <UserPlus className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={onEdit} aria-label="Edit prize">
          <Pencil className="h-4 w-4" />
        </Button>
        <AceCloseButton p={p} onChanged={onChanged} />
      </td>
    </tr>
  );
}

function WinnerList({ p, winners, onChanged }: { p: PrizeRow; winners: RecipientRow[]; onChanged: () => void }) {
  const voidFn = useServerFn(voidPrizeRecipient);
  const paidFn = useServerFn(markRecipientPaid);
  if (!winners.length)
    return <span className="text-[13px] text-muted-foreground">{p.status === "carried_over" ? "No winner · carried over" : "Winner to be decided"}</span>;
  return (
    <ul className="mt-1 space-y-1">
      {winners.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
          <span>{r.recipient_name}</span>
          <span className="flex items-center gap-1">
            <span className="font-medium">
              {p.value_kind === "cash" ? usd(r.amount) : `${usd(r.amount)} value`}
              {p.team_award && p.team_size > 1 && (
                <span className="ml-1 text-[13px] font-normal text-muted-foreground">({usd(perPlayer(r.amount, true, p.team_size))} each)</span>
              )}
            </span>
            {r.paid ? (
              <Badge variant="secondary"><Check className="mr-1 h-3 w-3" />{p.value_kind === "cash" ? "Paid" : "Handed out"}</Badge>
            ) : (
              <Button size="sm" variant="outline" className="h-8" onClick={() => void paidFn({ data: { id: r.id } }).then(onChanged).catch((e) => toast.error((e as Error).message))}>
                {p.value_kind === "cash" ? "Mark paid" : "Handed out"}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              aria-label="Remove winner"
              onClick={() => {
                const reason = window.prompt("Why remove this winner? (kept in the history)");
                if (!reason || reason.trim().length < 2) return;
                void voidFn({ data: { id: r.id, reason } }).then(onChanged).catch((e) => toast.error((e as Error).message));
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </span>
        </li>
      ))}
    </ul>
  );
}

function AceCloseButton({ p, onChanged }: { p: PrizeRow; onChanged: () => void }) {
  const close = useServerFn(closeAceFund);
  if (p.award_type !== "ace_fund" || ["carried_over", "paid", "cancelled"].includes(p.status)) return null;
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-8"
      onClick={() =>
        void close({ data: { prizeId: p.id } })
          .then((r) => {
            toast.success(r.carried > 0 ? `Ace Fund closed. ${usd(r.carried)} carries over.` : "Ace Fund closed and paid out.");
            onChanged();
          })
          .catch((e) => toast.error((e as Error).message))
      }
    >
      Close fund
    </Button>
  );
}

function PrizeDialog({ kind, eventId, initial, onClose, onSaved }: { kind: Kind; eventId: string; initial: Partial<PrizeRow>; onClose: () => void; onSaved: () => void }) {
  const save = useServerFn(savePrize);
  const del = useServerFn(deletePrize);
  const [f, setF] = useState<Partial<PrizeRow>>({
    name: "",
    amount: 0,
    winner_percent: initial.award_type === "fifty_fifty" ? 50 : 100,
    per_player: 0,
    contributors: 0,
    carryover_in: 0,
    added_cash: 0,
    round_to_5: false,
    remainder_action: "carry_over",
    team_award: false,
    team_size: 1,
    ...initial,
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof PrizeRow>(k: K, v: PrizeRow[K]) => setF((x) => ({ ...x, [k]: v }));
  const isAce = f.award_type === "ace_fund";
  const isFF = f.award_type === "fifty_fifty";
  const nm = (v: string) => Number(v) || 0;

  async function submit() {
    setBusy(true);
    try {
      await save({
        data: {
          id: f.id,
          kind,
          eventId,
          award_type: f.award_type as never,
          name: (f.name || awardTypeLabel(f.award_type ?? "custom")).trim(),
          description: f.description ?? null,
          hole_number: f.hole_number || null,
          division_eligibility: f.division_eligibility || null,
          sponsor_name: f.sponsor_name || null,
          value_kind: (isAce || isFF ? "cash" : f.value_kind) as never,
          amount: f.amount ?? 0,
          cost: f.cost ?? null,
          payout_rule: (isAce && f.payout_rule === "winner_all" ? "split_equal" : f.payout_rule) as never,
          winner_percent: f.winner_percent ?? 100,
          per_player: f.per_player ?? 0,
          contributors: f.contributors ?? 0,
          carryover_in: f.carryover_in ?? 0,
          added_cash: f.added_cash ?? 0,
          round_to_5: !!f.round_to_5,
          remainder_action: f.remainder_action as never,
          team_award: !!f.team_award,
          team_size: f.team_size ?? 1,
          funding_source: (f.funding_source || null) as never,
          visibility: f.visibility as never,
          status: f.status as never,
          notes: f.notes ?? null,
        },
      });
      toast.success("Prize saved.");
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const ace = isAce ? aceFundTotal({ carryover_in: f.carryover_in ?? 0, per_player: f.per_player ?? 0, contributors: f.contributors ?? 0, added_cash: f.added_cash ?? 0 }) : null;
  const ff = isFF ? fiftyFifty(f.amount ?? 0, f.winner_percent ?? 50) : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{f.id ? "Edit prize or payout" : "Add prize or payout"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type">
            <select className={sel} value={f.award_type} onChange={(e) => setF((x) => ({ ...x, award_type: e.target.value, winner_percent: e.target.value === "fifty_fifty" ? 50 : x.winner_percent }))}>
              {AWARD_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </Field>
          <Field label="Name">
            <Input value={f.name ?? ""} placeholder={awardTypeLabel(f.award_type ?? "custom")} onChange={(e) => set("name", e.target.value)} />
          </Field>
          {isAce ? (
            <>
              <Field label="Per player ($)"><Input type="number" min={0} value={f.per_player ?? 0} onChange={(e) => set("per_player", nm(e.target.value))} /></Field>
              <Field label="Players paying in"><Input type="number" min={0} value={f.contributors ?? 0} onChange={(e) => set("contributors", nm(e.target.value))} /></Field>
              <Field label="Starting carryover ($)"><Input type="number" min={0} value={f.carryover_in ?? 0} onChange={(e) => set("carryover_in", nm(e.target.value))} /></Field>
              <Field label="Added cash ($)"><Input type="number" min={0} value={f.added_cash ?? 0} onChange={(e) => set("added_cash", nm(e.target.value))} /></Field>
              <p className="sm:col-span-2 text-sm">
                Carryover {usd(ace!.carryover)} + collected {usd(ace!.contributions)} + added {usd(ace!.added)} = <strong>Ace Fund {usd(ace!.total)}</strong>
              </p>
            </>
          ) : (
            <>
              {!isFF && (
                <Field label="Paid as">
                  <select className={sel} value={f.value_kind} onChange={(e) => set("value_kind", e.target.value)}>
                    {VALUE_KINDS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                  </select>
                </Field>
              )}
              <Field label={isFF ? "Total collected ($)" : f.value_kind === "cash" ? "Amount ($)" : "Retail value ($)"}>
                <Input type="number" min={0} value={f.amount ?? 0} onChange={(e) => set("amount", nm(e.target.value))} />
              </Field>
              {f.value_kind !== "cash" && !isFF && (
                <Field label="Your cost ($, staff only)"><Input type="number" min={0} value={f.cost ?? ""} onChange={(e) => set("cost", e.target.value === "" ? null : nm(e.target.value))} /></Field>
              )}
            </>
          )}
          {(isFF || f.payout_rule === "percent") && (
            <Field label="Winner percentage">
              <Input type="number" min={0} max={100} value={f.winner_percent ?? 50} onChange={(e) => set("winner_percent", nm(e.target.value))} />
            </Field>
          )}
          {ff && (
            <p className="sm:col-span-2 text-sm">
              Collected {usd(ff.gross)} → winner {usd(ff.winner)} · kept by club {usd(ff.retained)}
            </p>
          )}
          {!isFF && (
            <Field label="Payout rule">
              <select className={sel} value={f.payout_rule} onChange={(e) => set("payout_rule", e.target.value)}>
                {PAYOUT_RULES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </Field>
          )}
          {["ctp", "longest_putt", "longest_drive"].includes(f.award_type ?? "") && (
            <Field label="Hole"><Input type="number" min={1} value={f.hole_number ?? ""} onChange={(e) => set("hole_number", e.target.value ? nm(e.target.value) : null)} /></Field>
          )}
          <Field label="Divisions eligible"><Input placeholder="All divisions" value={f.division_eligibility ?? ""} onChange={(e) => set("division_eligibility", e.target.value)} /></Field>
          <Field label="Sponsor"><Input placeholder="Optional" value={f.sponsor_name ?? ""} onChange={(e) => set("sponsor_name", e.target.value)} /></Field>
          <Field label="Funding source">
            <select className={sel} value={f.funding_source ?? ""} onChange={(e) => set("funding_source", e.target.value || null)}>
              <option value="">Not set</option>
              {["entry_fees", "buy_in", "sponsor", "club", "added_cash", "donation", "carryover", "other"].map((s) => (
                <option key={s} value={s}>{s.replace("_", " ").replace(/^./, (c) => c.toUpperCase())}</option>
              ))}
            </select>
          </Field>
          <Field label="Who can see it">
            <select className={sel} value={f.visibility} onChange={(e) => set("visibility", e.target.value)}>
              <option value="public">Everyone, once awarded</option>
              <option value="staff">Staff only</option>
            </select>
          </Field>
          <Field label="Status">
            <select className={sel} value={f.status} onChange={(e) => set("status", e.target.value)}>
              {PRIZE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          {(f.value_kind === "cash" || isAce) && (
            <>
              <Field label="If money is left over">
                <select className={sel} value={f.remainder_action} onChange={(e) => set("remainder_action", e.target.value)}>
                  {REMAINDER_ACTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={!!f.round_to_5} onCheckedChange={(v) => set("round_to_5", v)} /> Round shares up to $5 (never down)
              </label>
            </>
          )}
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={!!f.team_award} onCheckedChange={(v) => set("team_award", v)} /> Team prize
          </label>
          {f.team_award && (
            <Field label="Players per team"><Input type="number" min={1} max={8} value={f.team_size ?? 2} onChange={(e) => set("team_size", nm(e.target.value) || 1)} /></Field>
          )}
          <Field label="Notes (staff only)" wide><Input value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field>
        </div>
        <DialogFooter className="gap-2">
          {f.id && (
            <Button
              variant="ghost"
              onClick={() => void del({ data: { id: f.id! } }).then(() => { onSaved(); onClose(); }).catch((e) => toast.error((e as Error).message))}
            >
              Remove
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={busy}>{busy ? "Saving…" : "Save prize"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`space-y-1 ${wide ? "sm:col-span-2" : ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function AwardDialog({ p, existing, onClose, onSaved }: { p: PrizeRow; existing: number; onClose: () => void; onSaved: () => void }) {
  const search = useServerFn(searchPrizePlayers);
  const add = useServerFn(addPrizeRecipient);
  const [term, setTerm] = useState("");
  const [picked, setPicked] = useState<{ id: string | null; name: string } | null>(null);
  const split = useMemo(() => suggestedShares(p, existing + 1), [p, existing]);
  const [amount, setAmount] = useState(String(split.shares[existing] ?? prizePool(p)));
  const results = useQuery({
    queryKey: ["prize-player-search", term],
    queryFn: () => search({ data: { q: term } }),
    enabled: term.trim().length >= 2,
  });
  const warn = minimumWarning(p.value_kind, Number(amount));
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Award {p.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {picked ? (
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <span className="text-lg font-semibold">{picked.name}</span>
              <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>Change</Button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" autoFocus placeholder="Search players by name" value={term} onChange={(e) => setTerm(e.target.value)} />
              </div>
              <ul className="space-y-1">
                {(results.data ?? []).map((r) => (
                  <li key={r.id}>
                    <Button variant="outline" className="w-full justify-start" onClick={() => setPicked(r)}>{r.name}</Button>
                  </li>
                ))}
                {term.trim().length >= 2 && (
                  <li>
                    <Button variant="ghost" className="w-full justify-start" onClick={() => setPicked({ id: null, name: term.trim() })}>
                      Use “{term.trim()}” (no account)
                    </Button>
                  </li>
                )}
              </ul>
            </>
          )}
          <div className="space-y-1">
            <Label className="text-xs">{p.value_kind === "cash" ? "Payout ($)" : "Prize value ($)"}</Label>
            <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
            {existing > 0 && (p.payout_rule === "split_equal" || p.award_type === "ace_fund") && (
              <p className="text-[13px] text-muted-foreground">
                Split {existing + 1} ways: {usd(split.shares[0] ?? 0)} each{split.remainder > 0 ? ` · ${usd(split.remainder)} left over` : ""}{split.extraRequired > 0 ? ` · rounding up needs ${usd(split.extraRequired)} added — or turn off rounding to pay exact` : ""}. Earlier winners keep their recorded amount — remove and re-add them to change it.
              </p>
            )}
            {warn && (
              <p className="flex items-center gap-1 text-[13px] text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> {warn}</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!picked || busy}
            onClick={async () => {
              if (!picked) return;
              setBusy(true);
              try {
                await add({ data: { prizeId: p.id, userId: picked.id, name: picked.name, amount: Number(amount) || 0 } });
                toast.success(`${picked.name} awarded ${p.name}.`);
                onSaved();
                onClose();
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Award prize
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
