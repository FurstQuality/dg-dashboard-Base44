import { Link } from "@tanstack/react-router";
import { computeFeeBreakdown, money, payoutByPlace, payoutTeamSize, type EventFees } from "@/lib/event-fees";

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

/** Payout by place across common turnouts, using the event's own fee settings. */
export function PayoutFieldTable({ fees }: { fees: EventFees }) {
  const team = payoutTeamSize(fees);
  const base = [8, 12, 16, 20, 24, 32, 40, 48, 64, 72, 90];
  const sizes = Array.from(new Set([...base, Math.max(1, fees.typical_field_size)]))
    .filter((s) => team === 1 || s % team === 0)
    .sort((a, b) => a - b);
  const rows = sizes.map((size) => {
    const f = { ...fees, typical_field_size: size };
    const b = computeFeeBreakdown(f);
    return { size, pool: b.payout_pool_cents, places: payoutByPlace(f), remainder: b.remainder_cents ?? 0 };
  });
  const cols = Math.max(1, ...rows.map((r) => r.places.length));

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-3 py-2">
        <div className="text-[14px] font-semibold">Payout table by turnout</div>
        <div className="text-[13px] text-muted-foreground">
          {team > 1 ? "Team payout (each player) " : "Payout "}by place if this many players show up.{" "}
          <Link to="/director/payouts" className="text-primary underline-offset-2 hover:underline">
            Open the payout calculator
          </Link>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-[13px]">
          <thead className="text-left text-muted-foreground">
            <tr className="border-b border-border">
              <th className="sticky left-0 bg-card px-3 py-1.5 font-medium">Players</th>
              <th className="py-1.5 pr-3 font-medium">Pool</th>
              {Array.from({ length: cols }, (_, i) => (
                <th key={i} className="py-1.5 pr-3 font-medium">{ordinal(i + 1)}</th>
              ))}
              <th className="py-1.5 pr-3 font-medium">Left over</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.size}
                className={`border-b border-border/60 ${r.size === fees.typical_field_size ? "bg-primary/10" : ""}`}
              >
                <td className="sticky left-0 bg-card px-3 py-1.5 font-medium">
                  {r.size}
                  {team > 1 ? <span className="text-muted-foreground"> · {Math.floor(r.size / team)} teams</span> : null}
                </td>
                <td className="py-1.5 pr-3 tabular-nums">{money(r.pool)}</td>
                {Array.from({ length: cols }, (_, i) => {
                  const p = r.places[i];
                  return (
                    <td key={i} className="py-1.5 pr-3 tabular-nums">
                      {p ? (
                        <>
                          {money(p.cents)}
                          {team > 1 ? <span className="text-muted-foreground"> ({money(p.per_player_cents)})</span> : null}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  );
                })}
                <td className="py-1.5 pr-3 tabular-nums text-muted-foreground">
                  {r.remainder > 0 ? money(r.remainder) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
