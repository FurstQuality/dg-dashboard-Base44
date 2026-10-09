/**
 * Shared money contract for leagues and tournaments.
 *
 * Directors describe exactly what a player hands over at check-in, where each
 * dollar goes, and what a winning night or weekend pays back. Stored inside the
 * event `setup` jsonb column as `setup.fees`; the legacy entry/ace/CTP columns
 * are derived from it so older screens keep working.
 */

import {
  SYSTEM_MIN_PLAYER_PAYOUT_CENTS,
  computePayoutSchedule,
  type PayoutPlace,
  type PayoutSchedule,
  type PayoutCurve,
} from "@/lib/payout-engine";

export type FeeDestination =
  | "payout"
  | "ace_pot"
  | "ctp"
  | "club_fund"
  | "series"
  | "course"
  | "charity"
  | "sanctioning"
  | "other";

/** Does the money come out of the entry, or is it collected on top of it? */
export type FeeSource = "from_entry" | "add_on";

export interface FeeLine {
  key: string;
  label: string;
  amount_cents: number;
  destination: FeeDestination;
  source: FeeSource;
  /** Add-ons only: false means the player can skip it. */
  required: boolean;
  note: string;
}

export type PayoutStyle = "none" | "top_percent" | "top_count" | "flat_per_player" | "custom";
export type PayoutKind = "cash" | "merch" | "credit" | "trophy_only";

export interface PayoutPlan {
  style: PayoutStyle;
  /** top_percent: share of the field that cashes, e.g. 40. */
  paid_percent: number;
  /** top_count: fixed number of places paid per division. */
  paid_count: number;
  /** flat_per_player: guaranteed payout per cashing player. */
  flat_amount_cents: number;
  kind: PayoutKind;
  rollover_unclaimed: boolean;
  notes: string;
  /** Players per entry: 1 singles, 2 doubles, 3+ teams. Places pay per team. */
  team_size?: number;
  /** Smallest amount any single player takes home. Fewer places are paid to honour it. */
  min_payout_cents?: number;
  /** Each player's share is rounded to this step (e.g. 500 = nearest $5). 0 = exact distribution. */
  round_to_cents?: number;
  /** PDGA payout curve (how steeply money leans to the top). */
  curve?: PayoutCurve;
  /** Where money that can't be split cleanly goes. Default: added to 1st place. */
  remainder_destination?: RemainderDestination;
}

export type RemainderDestination = "first" | "ace_pot" | "club_fund" | "next_week" | "carry_over" | "added_payout" | "undistributed";

export const REMAINDER_OPTIONS: { value: RemainderDestination; label: string }[] = [
  { value: "first", label: "Add to 1st place" },
  { value: "ace_pot", label: "Ace pot" },
  { value: "club_fund", label: "Club fund" },
  { value: "next_week", label: "Next league night" },
  { value: "carry_over", label: "Carry over to next event" },
  { value: "added_payout", label: "Added payout next event" },
  { value: "undistributed", label: "Leave undistributed" },
];

export function remainderLabel(d: RemainderDestination | undefined): string {
  return REMAINDER_OPTIONS.find((o) => o.value === (d ?? "first"))?.label ?? "Add to 1st place";
}

export interface EventFees {
  entry_fee_cents: number;
  lines: FeeLine[];
  payout: PayoutPlan;
  /** Used to preview the money split — not a cap on sign-ups. */
  typical_field_size: number;
  payment_methods: string[];
  refund_policy: string;
  member_discount_cents: number;
  notes: string;
}

export const FEE_DESTINATION_LABELS: Record<FeeDestination, string> = {
  payout: "Player payout",
  ace_pot: "Ace pot",
  ctp: "CTP prizes",
  club_fund: "Club fund",
  series: "Series / season fund",
  course: "Course or greens fee",
  charity: "Charity",
  sanctioning: "PDGA sanctioning",
  other: "Other",
};

export const FEE_DESTINATION_OPTIONS: { value: FeeDestination; label: string; blurb: string }[] = [
  { value: "ace_pot", label: "Ace pot", blurb: "Carries over until somebody cans one." },
  { value: "ctp", label: "CTP prizes", blurb: "Closest to the pin on marked holes." },
  { value: "club_fund", label: "Club fund", blurb: "Course work, baskets, and club gear." },
  { value: "series", label: "Season / series fund", blurb: "Season-end payout or trophies." },
  { value: "course", label: "Course or greens fee", blurb: "Paid straight to the property." },
  { value: "charity", label: "Charity", blurb: "Donated on behalf of the field." },
  { value: "sanctioning", label: "PDGA sanctioning", blurb: "Per-player sanctioning cost." },
  { value: "payout", label: "Player payout", blurb: "Added back into the prize pool." },
  { value: "other", label: "Other", blurb: "Anything else you collect." },
];

export const PAYOUT_STYLE_OPTIONS: { value: PayoutStyle; label: string; blurb: string }[] = [
  {
    value: "top_percent",
    label: "Top percentage of the field",
    blurb: "Classic league math — the top 40% of each division cashes.",
  },
  {
    value: "top_count",
    label: "Fixed number of places",
    blurb: "Top 3 per division get paid, however big the field is.",
  },
  {
    value: "flat_per_player",
    label: "Flat amount per cashing player",
    blurb: "Everyone who cashes gets the same set amount.",
  },
  {
    value: "custom",
    label: "Director decides each event",
    blurb: "You post the payout table after the field is set.",
  },
  {
    value: "none",
    label: "No payout",
    blurb: "Bragging rights, bag tags, or trophies only.",
  },
];

export const PAYOUT_KIND_OPTIONS: { value: PayoutKind; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "merch", label: "Merchandise / pro shop credit" },
  { value: "credit", label: "League credit toward future nights" },
  { value: "trophy_only", label: "Trophies and bag tags only" },
];

export const PAYMENT_METHOD_OPTIONS = ["Cash", "Card", "Venmo", "CashApp", "PayPal", "Online"];

export function money(cents: number): string {
  const v = (cents || 0) / 100;
  return Number.isInteger(v) ? `$${v}` : `$${v.toFixed(2)}`;
}

export function defaultPayoutPlan(): PayoutPlan {
  return {
    style: "top_percent",
    paid_percent: 40,
    paid_count: 3,
    flat_amount_cents: 0,
    kind: "cash",
    rollover_unclaimed: true,
    notes: "",
    team_size: 1,
    min_payout_cents: 500,
    round_to_cents: 500,
  };
}

export function payoutTeamSize(fees: EventFees): number {
  return Math.max(1, Math.min(8, Math.round(fees.payout.team_size ?? 1)));
}

export function defaultEventFees(kind: "league" | "tournament" = "league"): EventFees {
  const league = kind === "league";
  return {
    entry_fee_cents: league ? 1000 : 4000,
    lines: league
      ? [
          {
            key: "ace_pot",
            label: "Ace pot",
            amount_cents: 100,
            destination: "ace_pot",
            source: "from_entry",
            required: true,
            note: "Rolls over each week until it's hit.",
          },
          {
            key: "club_fund",
            label: "Club fund",
            amount_cents: 100,
            destination: "club_fund",
            source: "from_entry",
            required: true,
            note: "Course upkeep and league supplies.",
          },
        ]
      : [
          {
            key: "sanctioning",
            label: "PDGA player fee",
            amount_cents: 200,
            destination: "sanctioning",
            source: "from_entry",
            required: true,
            note: "",
          },
          {
            key: "ctp",
            label: "CTP entry",
            amount_cents: 500,
            destination: "ctp",
            source: "add_on",
            required: false,
            note: "Optional side action.",
          },
        ],
    payout: defaultPayoutPlan(),
    typical_field_size: league ? 24 : 72,
    payment_methods: ["Cash", "Venmo"],
    refund_policy: league
      ? "Skip a night with no penalty — you only pay when you play."
      : "Full refund up to 7 days out, then 50% minus fees.",
    member_discount_cents: 0,
    notes: "",
  };
}

export function newFeeLine(destination: FeeDestination = "other"): FeeLine {
  return {
    key: `${destination}_${Math.random().toString(36).slice(2, 7)}`,
    label: FEE_DESTINATION_LABELS[destination],
    amount_cents: 100,
    destination,
    source: destination === "course" || destination === "ctp" ? "add_on" : "from_entry",
    required: true,
    note: "",
  };
}

export interface FeeBreakdown {
  entry_fee_cents: number;
  /** Taken out of the entry before anything is paid back. */
  from_entry_cents: number;
  /** Collected on top of the entry, no opt-out. */
  add_on_required_cents: number;
  /** Optional add-ons a player can decline. */
  add_on_optional_cents: number;
  due_required_cents: number;
  due_max_cents: number;
  /** Per player, per event, available to pay back to the field. */
  payout_per_player_cents: number;
  payout_pool_cents: number;
  paid_spots: number;
  /** Places the payout style asks for before the minimum trims them. */
  raw_paid_spots: number;
  /** Money the clean payout steps couldn't place — shown, never dropped. */
  remainder_cents?: number;
  depth_note?: string | null;
  average_payout_cents: number;
  top_payout_cents: number;
  field_size: number;
  /** Entry is over-committed: more is earmarked than collected. */
  over_allocated: boolean;
}

function rawFeeBreakdown(fees: EventFees): FeeBreakdown {
  const entry = Math.max(0, Math.round(fees.entry_fee_cents || 0));
  const field = Math.max(1, Math.round(fees.typical_field_size || 1));
  const entries = Math.max(1, Math.floor(field / payoutTeamSize(fees)));

  let fromEntry = 0;
  let addOnRequired = 0;
  let addOnOptional = 0;
  let addedToPayout = 0;

  for (const line of fees.lines) {
    const amount = Math.max(0, Math.round(line.amount_cents || 0));
    if (line.source === "from_entry") {
      if (line.destination === "payout") continue; // already inside the entry
      fromEntry += amount;
    } else if (line.required) {
      addOnRequired += amount;
      if (line.destination === "payout") addedToPayout += amount;
    } else {
      addOnOptional += amount;
    }
  }

  const perPlayer = Math.max(0, entry - fromEntry) + addedToPayout;
  const pool = perPlayer * field;

  let paidSpots = 0;
  if (fees.payout.style === "top_percent") {
    paidSpots = Math.max(1, Math.ceil((entries * (fees.payout.paid_percent || 0)) / 100));
  } else if (fees.payout.style === "top_count") {
    paidSpots = Math.min(entries, Math.max(1, Math.round(fees.payout.paid_count || 0)));
  } else if (fees.payout.style === "flat_per_player") {
    const flat = Math.max(1, fees.payout.flat_amount_cents || 1);
    paidSpots = Math.max(1, Math.min(entries, Math.floor(pool / (flat * payoutTeamSize(fees)))));
  } else if (fees.payout.style === "custom") {
    paidSpots = Math.max(1, Math.ceil(entries / 3));
  }

  const average = paidSpots > 0 ? Math.round(pool / paidSpots) : 0;
  // A typical taper pays the winner roughly double the average share.
  const top =
    fees.payout.style === "flat_per_player"
      ? Math.max(0, fees.payout.flat_amount_cents || 0) * payoutTeamSize(fees)
      : paidSpots > 1
        ? Math.round(average * 1.8)
        : average;

  return {
    entry_fee_cents: entry,
    from_entry_cents: fromEntry,
    add_on_required_cents: addOnRequired,
    add_on_optional_cents: addOnOptional,
    due_required_cents: entry + addOnRequired,
    due_max_cents: entry + addOnRequired + addOnOptional,
    payout_per_player_cents: fees.payout.style === "none" ? 0 : perPlayer,
    payout_pool_cents: fees.payout.style === "none" ? 0 : pool,
    paid_spots: fees.payout.style === "none" ? 0 : paidSpots,
    raw_paid_spots: fees.payout.style === "none" ? 0 : paidSpots,
    average_payout_cents: fees.payout.style === "none" ? 0 : average,
    top_payout_cents: fees.payout.style === "none" ? 0 : top,
    field_size: field,
    over_allocated: fromEntry > entry,
  };
}

export type PlacePayout = PayoutPlace;

/** Real breakdown: paid places, top payout and remainder come from the shared payout engine. */
export function computeFeeBreakdown(fees: EventFees): FeeBreakdown {
  const b = rawFeeBreakdown(fees);
  const sched = scheduleFromBreakdown(fees, b);
  if (!sched) return b;
  const n = sched.places.length;
  return {
    ...b,
    paid_spots: n,
    average_payout_cents: n ? Math.round(sched.total_paid_cents / n) : 0,
    top_payout_cents: sched.places[0]?.cents ?? 0,
    remainder_cents: sched.remainder_cents,
    depth_note: sched.depth_note,
  };
}

/** Estimated payout per place (per team when team_size > 1). */
export function payoutByPlace(fees: EventFees): PlacePayout[] {
  return scheduleFromBreakdown(fees, rawFeeBreakdown(fees))?.places ?? [];
}

export function payoutSchedule(fees: EventFees): PayoutSchedule | null {
  return scheduleFromBreakdown(fees, rawFeeBreakdown(fees));
}

function scheduleFromBreakdown(fees: EventFees, b: FeeBreakdown): PayoutSchedule | null {
  const style = fees.payout.style;
  if (style === "none" || style === "custom" || b.payout_pool_cents <= 0) return null;
  const team = payoutTeamSize(fees);
  if (style === "flat_per_player") {
    const flat = Math.max(0, fees.payout.flat_amount_cents || 0) * team;
    const places = Array.from({ length: b.paid_spots }, (_, i) => ({
      place: i + 1,
      cents: flat,
      per_player_cents: flat / team,
    }));
    const total = flat * places.length;
    return {
      places,
      pool_cents: b.payout_pool_cents,
      total_paid_cents: total,
      remainder_cents: Math.max(0, b.payout_pool_cents - total),
      team_size: team,
      min_player_cents: flat / team,
      min_team_cents: flat,
      max_places: places.length,
      requested_places: places.length,
      depth_note: null,
      curve_version: "flat@1",
    };
  }
  return computePayoutSchedule({
    pool_cents: b.payout_pool_cents,
    team_size: team,
    requested_places: b.raw_paid_spots,
    min_player_cents: fees.payout.min_payout_cents ?? SYSTEM_MIN_PLAYER_PAYOUT_CENTS,
    round_player_cents: fees.payout.round_to_cents ?? 500,
    curve: fees.payout.curve,
    remainder_to: (fees.payout.remainder_destination ?? "first") === "first" ? "first" : "hold",
  });
}


/** Plain-language lines a player can read before they pay. */
export function describeFees(fees: EventFees, unit = "night"): string[] {
  const b = computeFeeBreakdown(fees);
  const out: string[] = [];

  out.push(
    b.due_required_cents === 0
      ? `Free to play — nothing due at check-in.`
      : `${money(b.due_required_cents)} due at check-in each ${unit}${
          b.add_on_optional_cents > 0
            ? `, up to ${money(b.due_max_cents)} if you buy into every optional pot.`
            : "."
        }`,
  );

  for (const line of fees.lines) {
    if (!line.amount_cents) continue;
    const where =
      line.source === "from_entry"
        ? `comes out of your entry`
        : line.required
          ? `added on top`
          : `optional add-on`;
    out.push(
      `${money(line.amount_cents)} ${line.label.toLowerCase()} — ${where}${
        line.note ? `. ${line.note}` : "."
      }`,
    );
  }

  if (fees.payout.style === "none") {
    out.push(
      fees.payout.kind === "trophy_only"
        ? "No cash payout — trophies and bragging rights only."
        : "No payout on this one.",
    );
  } else if (fees.payout.style === "custom") {
    out.push("Payout table is posted once the field is set.");
  } else {
    const kindLabel =
      PAYOUT_KIND_OPTIONS.find((k) => k.value === fees.payout.kind)?.label.toLowerCase() ?? "cash";
    const who =
      fees.payout.style === "top_percent"
        ? `top ${fees.payout.paid_percent}% of each division`
        : fees.payout.style === "top_count"
          ? `top ${fees.payout.paid_count} in each division`
          : `every cashing player`;
    out.push(
      `${money(b.payout_per_player_cents)} of every entry goes back to players — with ${b.field_size} out, that's about ${money(b.payout_pool_cents)} across roughly ${b.paid_spots} spots (${who}), paid in ${kindLabel}.`,
    );
    if (b.top_payout_cents > 0) {
      out.push(`Win it and you're looking at around ${money(b.top_payout_cents)}.`);
    }
  }

  if (fees.payout.rollover_unclaimed && fees.lines.some((l) => l.destination === "ace_pot")) {
    out.push("Unhit ace pot rolls over to the next event.");
  }
  if (fees.member_discount_cents > 0) {
    out.push(`Club members save ${money(fees.member_discount_cents)}.`);
  }
  if (fees.payment_methods.length) {
    out.push(`Pay with ${fees.payment_methods.join(", ")}.`);
  }
  if (fees.refund_policy.trim()) out.push(fees.refund_policy.trim());
  if (fees.notes.trim()) out.push(fees.notes.trim());

  return out;
}

export function summarizeFees(fees: EventFees, unit = "night"): string {
  const b = computeFeeBreakdown(fees);
  if (b.due_required_cents === 0) return `Free to play`;
  const payout =
    fees.payout.style === "none"
      ? "no payout"
      : fees.payout.style === "custom"
        ? "payout posted at the event"
        : fees.payout.style === "top_percent"
          ? `top ${fees.payout.paid_percent}% paid`
          : fees.payout.style === "top_count"
            ? `top ${fees.payout.paid_count} paid`
            : `${money(fees.payout.flat_amount_cents)} per cashing player`;
  return `${money(b.due_required_cents)}/${unit} · ${money(b.payout_per_player_cents)} back to players · ${payout}`;
}

/** Checks surfaced on the review step. */
export function feeChecks(fees: EventFees): { label: string; pass: boolean }[] {
  const b = computeFeeBreakdown(fees);
  return [
    {
      label: "Entry covers everything taken out of it",
      pass: !b.over_allocated,
    },
    {
      label: "Payout plan chosen",
      pass:
        fees.payout.style === "none" ||
        fees.payout.style === "custom" ||
        (fees.payout.style === "top_percent" && fees.payout.paid_percent > 0) ||
        (fees.payout.style === "top_count" && fees.payout.paid_count > 0) ||
        (fees.payout.style === "flat_per_player" && fees.payout.flat_amount_cents > 0),
    },
    { label: "At least one way to pay listed", pass: fees.payment_methods.length > 0 },
  ];
}

export function normalizeFees(raw: unknown, kind: "league" | "tournament" = "league"): EventFees {
  const base = defaultEventFees(kind);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<EventFees>;
  const lines = Array.isArray(r.lines)
    ? r.lines
        .filter((l): l is FeeLine => !!l && typeof l === "object")
        .map((l, i) => ({
          key: l.key || `line_${i}`,
          label: l.label || "Fee",
          amount_cents: Math.max(0, Math.round(Number(l.amount_cents) || 0)),
          destination: (FEE_DESTINATION_LABELS[l.destination as FeeDestination]
            ? l.destination
            : "other") as FeeDestination,
          source: (l.source === "add_on" ? "add_on" : "from_entry") as FeeSource,
          required: l.required !== false,
          note: typeof l.note === "string" ? l.note : "",
        }))
    : base.lines;
  return {
    entry_fee_cents: Math.max(0, Math.round(Number(r.entry_fee_cents ?? base.entry_fee_cents))),
    lines,
    payout: { ...defaultPayoutPlan(), ...(r.payout ?? {}) },
    typical_field_size: Math.max(1, Math.round(Number(r.typical_field_size ?? base.typical_field_size))),
    payment_methods: Array.isArray(r.payment_methods) ? r.payment_methods : base.payment_methods,
    refund_policy: typeof r.refund_policy === "string" ? r.refund_policy : base.refund_policy,
    member_discount_cents: Math.max(0, Math.round(Number(r.member_discount_cents ?? 0))),
    notes: typeof r.notes === "string" ? r.notes : "",
  };
}

/** Legacy columns kept in step with the detailed plan. */
export function feesToColumns(fees: EventFees, unit = "night") {
  const sum = (d: FeeDestination) =>
    fees.lines.filter((l) => l.destination === d).reduce((t, l) => t + (l.amount_cents || 0), 0);
  return {
    entry_fee_cents: Math.max(0, Math.round(fees.entry_fee_cents || 0)),
    ace_pot_cents: sum("ace_pot"),
    ctp_cents: sum("ctp"),
    payout_notes: describeFees(fees, unit).join(" "),
  };
}

/**
 * Fees for an event row: the detailed plan when the director saved one,
 * otherwise rebuilt from the legacy entry / ace pot / CTP columns.
 */
export function feesFromEventRow(
  row: {
    setup?: unknown;
    entry_fee_cents?: number | null;
    ace_pot_cents?: number | null;
    ctp_cents?: number | null;
    payout_notes?: string | null;
  },
  kind: "league" | "tournament" = "league",
): EventFees {
  const stored =
    row.setup && typeof row.setup === "object" ? (row.setup as { fees?: unknown }).fees : null;
  if (stored) return normalizeFees(stored, kind);

  const lines: FeeLine[] = [];
  if (row.ace_pot_cents)
    lines.push({
      key: "ace_pot",
      label: "Ace pot",
      amount_cents: row.ace_pot_cents,
      destination: "ace_pot",
      source: "from_entry",
      required: true,
      note: "",
    });
  if (row.ctp_cents)
    lines.push({
      key: "ctp",
      label: "CTP prizes",
      amount_cents: row.ctp_cents,
      destination: "ctp",
      source: "from_entry",
      required: true,
      note: "",
    });

  return {
    ...defaultEventFees(kind),
    entry_fee_cents: row.entry_fee_cents ?? 0,
    lines,
    payout: { ...defaultPayoutPlan(), style: "custom" },
    refund_policy: "",
    notes: row.payout_notes ?? "",
  };
}
