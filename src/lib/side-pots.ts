/**
 * Additional payouts, side pots and prizes — pure money rules.
 * Kept fully separate from placement payouts (payout-engine.ts): nothing here
 * ever feeds the competitive purse.
 */

export const AWARD_TYPES = [
  { value: "ace_fund", label: "Ace Fund" },
  { value: "fifty_fifty", label: "50/50" },
  { value: "ctp", label: "Closest to pin" },
  { value: "longest_putt", label: "Longest putt" },
  { value: "longest_drive", label: "Longest drive" },
  { value: "bonus", label: "Bonus" },
  { value: "bounty", label: "Bounty / special award" },
  { value: "sponsor_prize", label: "Sponsor prize" },
  { value: "raffle", label: "Raffle / drawing" },
  { value: "cash_prize", label: "Cash prize" },
  { value: "merchandise_prize", label: "Merchandise prize" },
  { value: "trophy", label: "Trophy / award" },
  { value: "custom", label: "Custom" },
] as const;
export type AwardType = (typeof AWARD_TYPES)[number]["value"];
export const awardTypeLabel = (t: string) => AWARD_TYPES.find((a) => a.value === t)?.label ?? "Prize";

export const VALUE_KINDS = [
  { value: "cash", label: "Cash" },
  { value: "merchandise", label: "Merchandise" },
  { value: "credit", label: "Store credit" },
  { value: "trophy", label: "Trophy" },
  { value: "other", label: "Other value" },
] as const;
export type ValueKind = (typeof VALUE_KINDS)[number]["value"];

export const PAYOUT_RULES = [
  { value: "winner_all", label: "Winner takes all" },
  { value: "split_equal", label: "Split equally between winners" },
  { value: "percent", label: "Winner gets a set percentage" },
  { value: "carry_if_none", label: "Carry over if nobody wins" },
  { value: "custom", label: "Custom" },
] as const;
export type PayoutRule = (typeof PAYOUT_RULES)[number]["value"];

export const PRIZE_STATUSES = [
  { value: "planned", label: "Planned" },
  { value: "available", label: "Available" },
  { value: "awarded", label: "Awarded" },
  { value: "paid", label: "Paid / handed out" },
  { value: "carried_over", label: "Carried over" },
  { value: "cancelled", label: "Cancelled" },
] as const;
export type PrizeStatus = (typeof PRIZE_STATUSES)[number]["value"];

export const REMAINDER_ACTIONS = [
  { value: "carry_over", label: "Carry over" },
  { value: "ace_fund", label: "Add to Ace Fund" },
  { value: "league_fund", label: "League fund" },
  { value: "event_fund", label: "Event fund" },
  { value: "next_event", label: "Next event" },
  { value: "another_prize", label: "Add to another prize" },
  { value: "undistributed", label: "Leave undistributed" },
] as const;

export const MIN_CASH_PAYOUT = 1;

const cents = (n: number) => Math.round(n * 100) / 100;

/** Ace Fund available = carryover + players × per-player + added cash. */
export function aceFundTotal(p: { carryover_in: number; per_player: number; contributors: number; added_cash: number }) {
  const contributions = cents(p.per_player * p.contributors);
  return { carryover: cents(p.carryover_in), contributions, added: cents(p.added_cash), total: cents(p.carryover_in + contributions + p.added_cash) };
}

/** 50/50: gross is split into winner payout and retained — never counted twice. */
export function fiftyFifty(gross: number, winnerPercent: number) {
  const winner = cents((gross * Math.min(100, Math.max(0, winnerPercent))) / 100);
  return { gross: cents(gross), winner, retained: cents(gross - winner) };
}

/**
 * Splits a cash pool between n winners. Exact split to the cent; with rounding
 * each share goes UP to the $5 step (player value protection) and the money
 * that would need adding is reported as extraRequired — never taken from a winner.
 */
export function splitPool(pool: number, winners: number, roundTo5 = false): { shares: number[]; paid: number; remainder: number; extraRequired: number } {
  if (winners <= 0 || pool <= 0) return { shares: [], paid: 0, remainder: cents(Math.max(0, pool)), extraRequired: 0 };
  const exact = Math.floor((pool * 100) / winners) / 100;
  const each = roundTo5 ? Math.ceil(exact / 5) * 5 : exact;
  const shares = Array.from({ length: winners }, () => each);
  const paid = cents(each * winners);
  return { shares, paid, remainder: cents(Math.max(0, pool - paid)), extraRequired: cents(Math.max(0, paid - pool)) };
}

export type PrizeLike = {
  id: string;
  award_type: string;
  value_kind: string;
  amount: number;
  payout_rule: string;
  winner_percent: number;
  per_player: number;
  contributors: number;
  carryover_in: number;
  added_cash: number;
  round_to_5: boolean;
  team_award: boolean;
  team_size: number;
  status: string;
};

/** Money/value available for a prize: Ace Fund total, 50/50 winner share, or its amount. */
export function prizePool(p: PrizeLike): number {
  if (p.award_type === "ace_fund") return aceFundTotal(p).total;
  if (p.award_type === "fifty_fifty") return fiftyFifty(p.amount, p.winner_percent).winner;
  if (p.payout_rule === "percent") return cents((p.amount * p.winner_percent) / 100);
  return cents(p.amount);
}

/** Suggested amount for each winner when one more is added. */
export function suggestedShares(p: PrizeLike, winners: number) {
  const pool = prizePool(p);
  if (p.payout_rule === "split_equal" || p.award_type === "ace_fund") return splitPool(pool, winners, p.round_to_5 && p.value_kind === "cash");
  const shares = Array.from({ length: winners }, (_, i) => (i === 0 ? pool : 0));
  return { shares, paid: pool, remainder: 0, extraRequired: 0 };
}

/** Per-player share of a divisible team prize. */
export function perPlayer(amount: number, teamAward: boolean, teamSize: number) {
  return teamAward && teamSize > 1 ? cents(amount / teamSize) : cents(amount);
}

/** Warning when an automated cash share is below the recommended minimum. */
export function minimumWarning(valueKind: string, share: number): string | null {
  return valueKind === "cash" && share > 0 && share < MIN_CASH_PAYOUT
    ? `This creates a payout below $${MIN_CASH_PAYOUT}.`
    : null;
}

export type RecipientLike = { prize_id: string; amount: number; voided_at: string | null; paid: boolean };

/** Event payout summary: cash and prize value kept in separate buckets. */
export function payoutSummary(prizes: PrizeLike[], recipients: RecipientLike[], placementCash: number) {
  const live = recipients.filter((r) => !r.voided_at);
  const paidFor = (id: string) => cents(live.filter((r) => r.prize_id === id).reduce((s, r) => s + r.amount, 0));
  let additionalCash = 0, prizeValue = 0, aceContrib = 0, acePaid = 0, aceCarry = 0, ffGross = 0, ffWinner = 0, ffRetained = 0;
  for (const p of prizes) {
    if (p.status === "cancelled") continue;
    const awarded = paidFor(p.id);
    if (p.award_type === "ace_fund") {
      const t = aceFundTotal(p);
      aceContrib += t.contributions;
      acePaid += awarded;
      aceCarry += cents(t.total - awarded);
      additionalCash += awarded;
    } else if (p.award_type === "fifty_fifty") {
      const f = fiftyFifty(p.amount, p.winner_percent);
      ffGross += f.gross;
      ffWinner += awarded;
      ffRetained += cents(f.gross - awarded);
      additionalCash += awarded;
    } else if (p.value_kind === "cash") additionalCash += awarded;
    else prizeValue += awarded;
  }
  return {
    placementCash: cents(placementCash),
    additionalCash: cents(additionalCash),
    prizeValue: cents(prizeValue),
    totalCash: cents(placementCash + additionalCash),
    ace: { contributions: cents(aceContrib), paid: cents(acePaid), carryover: cents(aceCarry) },
    fiftyFifty: { gross: cents(ffGross), winner: cents(ffWinner), retained: cents(ffRetained) },
  };
}
