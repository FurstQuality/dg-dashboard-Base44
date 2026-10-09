import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock, LockOpen, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { LoadingSkeleton } from "@/components/shell";
import { money } from "@/lib/event-fees";
import { checkPayoutCompliance, type SanctionTier } from "@/lib/payout-compliance";
import {
  getEventFinance,
  finalizeDivisionPayout,
  reopenDivisionPayout,
  type DivisionFinance,
} from "@/lib/payouts.functions";

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

export function EventFinancePanel({ eventId }: { eventId: string }) {
  const qc = useQueryClient();
  const fetchFin = useServerFn(getEventFinance);
  const finalize = useServerFn(finalizeDivisionPayout);
  const reopen = useServerFn(reopenDivisionPayout);
  const key = ["event-finance", eventId];
  const q = useQuery({ queryKey: key, queryFn: () => fetchFin({ data: { eventId } }) });
  const [busy, setBusy] = useState<string | null>(null);

  if (q.isPending) return <LoadingSkeleton />;
  if (q.isError) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const fin = q.data;

  const run = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(id);
    try {
      await fn();
      toast.success(ok);
      await qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted-foreground">
        Each division pays out on its own from its registered players. Leftover money: {fin.remainder_label}.
        Locked payouts never change, even if fees, rules or curves change later.
      </p>
      {fin.divisions.map((d) => (
        <DivisionBlock
          key={d.division_id ?? "none"}
          d={d}
          sanctioned={fin.sanctioned}
          tier={fin.tier}
          busy={busy === (d.division_id ?? "none")}
          onLock={() => run(d.division_id ?? "none", () => finalize({ data: { eventId, divisionId: d.division_id } }), `${d.label} payout locked`)}
          onReopen={(reason) => d.snapshot && run(d.division_id ?? "none", () => reopen({ data: { id: d.snapshot!.id, reason } }), `${d.label} payout reopened`)}
        />
      ))}
    </div>
  );
}

function DivisionBlock({
  d, sanctioned, tier, busy, onLock, onReopen,
}: { d: DivisionFinance; sanctioned: boolean; tier: string | null; busy: boolean; onLock: () => void; onReopen: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const [asking, setAsking] = useState(false);
  const locked = d.snapshot;
  const s = locked ? locked.snapshot : d.schedule;
  const isPro = /^(M|F)PO|^MP|^FP|pro/i.test(d.label);
  const compliance = s
    ? checkPayoutCompliance({
        sanctioned,
        mode: "pdga_guided",
        division_type: isPro ? "pro" : "am",
        tier: (["A", "B", "C"].includes(tier ?? "") ? tier : "C") as SanctionTier,
        entries: Math.floor(d.players / (s.team_size || 1)),
        places_paid: s.places.length,
        max_places: s.max_places,
        net_entry_cents: s.pool_cents,
        am_value_cents: s.total_paid_cents,
      })
    : null;

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">{d.label}</h3>
          <p className="text-[13px] text-muted-foreground">
            {d.players} {d.players === 1 ? "player" : "players"} · entry {money(d.entry_fee_cents)}
            {s ? ` · pool ${money(s.pool_cents)} · paid ${money(s.total_paid_cents)}` : ""}
            {s && s.remainder_cents > 0 ? ` · leftover ${money(s.remainder_cents)}` : ""}
          </p>
        </div>
        {locked ? (
          <div className="flex items-center gap-2">
            <Badge><Lock className="mr-1 h-3 w-3" />Locked {new Date(locked.finalized_at).toLocaleDateString()}</Badge>
            <Button size="sm" variant="outline" onClick={() => setAsking((v) => !v)}><LockOpen className="mr-1 h-3.5 w-3.5" />Reopen</Button>
          </div>
        ) : d.schedule ? (
          <Button size="sm" disabled={busy} onClick={onLock}><Lock className="mr-1 h-3.5 w-3.5" />{busy ? "Locking…" : "Lock payout"}</Button>
        ) : null}
      </div>

      {asking && locked ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 p-3">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <span className="text-[13px]">Reopening recalculates this payout. The locked version stays in history.</span>
          <Input className="h-9 max-w-xs" placeholder="Reason, e.g. late scorecard fix" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button size="sm" variant="destructive" disabled={busy || reason.trim().length < 3} onClick={() => { onReopen(reason); setAsking(false); setReason(""); }}>Reopen payout</Button>
        </div>
      ) : null}

      {!s ? (
        <p className="mt-2 text-[13px] text-muted-foreground">No registered players yet, so there's nothing to pay out.</p>
      ) : (
        <>
          {s.depth_note ? <p className="mt-2 text-[13px]">{s.depth_note}</p> : null}
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-[13px] text-muted-foreground">
              <tr><th className="py-1">Place</th><th>{s.team_size > 1 ? "Team" : "Payout"}</th>{s.team_size > 1 ? <th>Per player</th> : null}</tr>
            </thead>
            <tbody>
              {s.places.map((p) => (
                <tr key={p.place} className="border-t border-border">
                  <td className="py-1.5">{ordinal(p.place)}</td>
                  <td>{money(p.cents)}</td>
                  {s.team_size > 1 ? <td>{money(p.per_player_cents)} each</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
          {compliance?.applies && compliance.rows.length ? (
            <div className="mt-3 space-y-1 text-[13px]">
              {compliance.rows.map((r) => (
                <p key={r.key}>
                  <span className={r.pass ? "font-semibold text-primary" : "font-semibold text-destructive"}>{r.pass ? "Pass" : "Needs attention"}</span>{" "}
                  {r.label}: yours {r.actual}, minimum {r.required}
                </p>
              ))}
            </div>
          ) : null}
          <p className="mt-2 text-[12px] text-muted-foreground">
            Curve {s.curve_version}{locked?.ruleset_version ? ` · rules ${locked.ruleset_version}` : ""}
          </p>
        </>
      )}

      {d.history.length ? (
        <details className="mt-3 text-[13px]">
          <summary className="cursor-pointer text-muted-foreground">Earlier locked versions ({d.history.length})</summary>
          <ul className="mt-2 space-y-1">
            {d.history.map((h) => (
              <li key={h.id}>
                Locked {new Date(h.finalized_at).toLocaleString()} · paid {money(h.total_paid_cents)} · reopened {h.superseded_at ? new Date(h.superseded_at).toLocaleString() : ""}: {h.superseded_reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
