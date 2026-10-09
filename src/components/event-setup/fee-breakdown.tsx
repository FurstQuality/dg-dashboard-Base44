import { Coins, HandCoins, PiggyBank, Trophy } from "lucide-react";
import {
  FEE_DESTINATION_LABELS,
  PAYOUT_KIND_OPTIONS,
  computeFeeBreakdown,
  describeFees,
  money,
  payoutByPlace,
  payoutTeamSize,
  type EventFees,
} from "@/lib/event-fees";

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Player-facing money card: what you hand over, where it goes, what a win pays.
 * Used on the wizard review step and on the event page before sign-up.
 */
export function FeeBreakdown({
  fees,
  unit = "night",
  compact = false,
}: {
  fees: EventFees;
  unit?: string;
  compact?: boolean;
}) {
  const b = computeFeeBreakdown(fees);
  const places = payoutByPlace(fees);
  const team = payoutTeamSize(fees);
  const entryWord = team === 2 ? "teams" : team > 2 ? "teams" : "spots";
  const payoutKind =
    PAYOUT_KIND_OPTIONS.find((k) => k.value === fees.payout.kind)?.label ?? "Cash";

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-[13px] uppercase tracking-wide text-muted-foreground">
            Due at check-in
          </div>
          <div className="font-display text-2xl font-semibold">
            {b.due_required_cents === 0 ? "Free" : `${money(b.due_required_cents)}`}
            <span className="ml-1 text-[13px] font-normal text-muted-foreground">per {unit}</span>
          </div>
        </div>
        {b.add_on_optional_cents > 0 ? (
          <div className="text-[13px] text-muted-foreground">
            Up to {money(b.due_max_cents)} with every optional pot
          </div>
        ) : null}
      </div>

      {b.over_allocated ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-[13px] text-destructive">
          More is earmarked out of the entry than the entry collects — raise the entry or trim a
          line below.
        </p>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-3">
        <Stat
          icon={<HandCoins className="h-4 w-4 text-primary" />}
          label="Back to players"
          value={`${money(b.payout_per_player_cents)} / player`}
        />
        <Stat
          icon={<PiggyBank className="h-4 w-4 text-primary" />}
          label={`Pool at ${b.field_size} players`}
          value={money(b.payout_pool_cents)}
        />
        <Stat
          icon={<Trophy className="h-4 w-4 text-primary" />}
          label={b.paid_spots > 0 ? `${b.paid_spots} ${entryWord} paid` : "No payout"}
          value={b.top_payout_cents > 0 ? team > 1
                ? `~${money(b.top_payout_cents)} to win (${money(Math.floor(b.top_payout_cents / team))} each)`
                : `~${money(b.top_payout_cents)} to win` : payoutKind}
        />
      </div>

      {fees.lines.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-[13px]">
            <thead className="bg-muted/60 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 font-medium">Where it goes</th>
                <th className="px-3 py-1.5 font-medium">Amount</th>
                <th className="px-3 py-1.5 font-medium">How it's collected</th>
              </tr>
            </thead>
            <tbody>
              {fees.lines.map((line) => (
                <tr key={line.key} className="border-t border-border">
                  <td className="px-3 py-1.5">
                    <div className="font-medium text-foreground">{line.label}</div>
                    <div className="text-muted-foreground">
                      {FEE_DESTINATION_LABELS[line.destination]}
                      {line.note ? ` · ${line.note}` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-1.5">{money(line.amount_cents)}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">
                    {line.source === "from_entry"
                      ? "Out of your entry"
                      : line.required
                        ? "Added to your entry"
                        : "Optional buy-in"}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-border bg-muted/30">
                <td className="px-3 py-1.5 font-medium">Prize pool share of the entry</td>
                <td className="px-3 py-1.5">{money(b.payout_per_player_cents)}</td>
                <td className="px-3 py-1.5 text-muted-foreground">
                  Paid back in {payoutKind.toLowerCase()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}

      {places.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="bg-muted/60 px-3 py-1.5 text-[13px] font-medium text-muted-foreground">
            Payout by place · estimated at {b.field_size} players
            {team > 1 ? ` (${Math.floor(b.field_size / team)} teams of ${team})` : ""}
          </div>
          <div className="grid grid-cols-2 gap-x-4 px-3 py-2 text-[13px] sm:grid-cols-3 lg:grid-cols-4">
            {places.map((p) => (
              <div key={p.place} className="flex justify-between border-b border-border/50 py-1">
                <span className="text-muted-foreground">{ordinal(p.place)}</span>
                <span className="text-right font-medium tabular-nums">
                  {money(p.cents)}
                  {team > 1 ? (
                    <span className="block text-[13px] font-normal text-muted-foreground">
                      {money(p.per_player_cents)} each
                    </span>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
          <p className="px-3 pb-2 text-[13px] text-muted-foreground">
            {fees.payout.style !== "flat_per_player"
              ? `At least ${money(Math.max(100, fees.payout.min_payout_cents ?? 500))} per player${
                  (fees.payout.round_to_cents ?? 500) > 0
                    ? `, rounded to ${money(fees.payout.round_to_cents ?? 500)}`
                    : ""
                }. ${b.depth_note ? `${b.depth_note} ` : ""}${
                  (b.remainder_cents ?? 0) > 0
                    ? `${money(b.remainder_cents ?? 0)} left over after clean payouts — roll it into the ace pot or next week. `
                    : ""
                }`
              : ""}
            Final amounts follow the real turnout and are paid in {payoutKind.toLowerCase()}.
          </p>
        </div>
      ) : null}


      {!compact ? (
        <ul className="space-y-1 text-[13px] text-muted-foreground">
          {describeFees(fees, unit).map((line, i) => (
            <li key={i} className="flex gap-2">
              <Coins className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/60 p-2.5">
      <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-[15px] font-semibold">{value}</div>
    </div>
  );
}
