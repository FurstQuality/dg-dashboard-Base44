import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Gift } from "lucide-react";
import { getPublicPrizeWinners } from "@/lib/prizes.functions";
import { awardTypeLabel } from "@/lib/side-pots";

const usd = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);

/** "What else you won" — public side-pot and prize winners after the standings. */
export function AdditionalWinners({ kind, eventId, className = "mt-6" }: { kind: "tournament" | "league_event"; eventId: string; className?: string }) {
  const fetch = useServerFn(getPublicPrizeWinners);
  const q = useQuery({ queryKey: ["public-prize-winners", kind, eventId], queryFn: () => fetch({ data: { kind, eventId } }) });
  const rows = q.data ?? [];
  if (!rows.length) return null;
  return (
    <section className={`${className} rounded-xl border border-border p-4`}>
      <h3 className="mb-3 flex items-center gap-2 text-base font-semibold">
        <Gift className="h-4 w-4 text-primary" /> Additional winners
      </h3>
      <ul className="grid gap-3 sm:grid-cols-2">
        {rows.map((r, i) => (
          <li key={`${r.prize_id}-${i}`} className="rounded-lg border border-border p-3 text-sm">
            <div className="text-[13px] text-muted-foreground">
              {awardTypeLabel(r.award_type)}
              {r.hole_number ? ` · Hole ${r.hole_number}` : ""}
            </div>
            <div className="font-medium">{r.name}</div>
            {r.sponsor_name && <div className="text-[13px] text-muted-foreground">Presented by {r.sponsor_name}</div>}
            <div className="mt-1 flex justify-between gap-2">
              <span>{r.recipient_name}</span>
              <span className="font-semibold">{r.value_kind === "cash" ? usd(r.amount) : `${usd(r.amount)} value`}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
