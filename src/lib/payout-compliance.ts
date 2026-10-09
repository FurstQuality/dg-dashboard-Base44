/**
 * PDGA payout compliance checks, versioned separately from the payout curves.
 * Curves say how money is spread; the ruleset says what a sanctioned event must pay.
 * Values come from the PDGA Competition Manual reference the director supplied.
 */

export const PDGA_RULESET = {
  version: "pdga-cm-2026",
  label: "PDGA 2026 Competition Manual",
  /** Share of the division that must be paid (North America). */
  min_depth: { pro: 0.4, am: 0.45 },
  /** Required Amateur value as a share of net entry fees, by Tier. */
  am_value_pct: { A: 1.1, B: 1.0, C: 0.85 } as Record<"A" | "B" | "C", number>,
} as const;

export const PAYOUT_GUIDANCE_LABEL = "PDGA 2024 payout calculator curves";

export type PayoutMode = "pdga_guided" | "custom" | "true_amateur";
export type DivisionType = "pro" | "am";
export type SanctionTier = "A" | "B" | "C" | "league";

export interface ComplianceInput {
  sanctioned: boolean;
  mode: PayoutMode;
  division_type: DivisionType;
  tier: SanctionTier;
  /** Players or teams in the division. */
  entries: number;
  /** Places actually paid after the minimum was applied. */
  places_paid: number;
  /** Most places the pool can pay at the minimum. */
  max_places: number;
  net_entry_cents: number;
  /** Am: merchandise payout + player pack retail + trophies + added value. */
  am_value_cents?: number;
  /** League Am value percent set by the league (0–2). */
  league_value_pct?: number;
}

export interface ComplianceRow {
  key: "depth" | "am_value" | "pool";
  label: string;
  required: string;
  actual: string;
  pass: boolean;
}

export interface ComplianceResult {
  applies: boolean;
  required_places: number;
  rows: ComplianceRow[];
  advice: string[];
  ruleset_version: string;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const money = (c: number) => `$${(c / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export function requiredPaidPlaces(entries: number, division: DivisionType): number {
  if (entries <= 0) return 0;
  return Math.max(1, Math.ceil(entries * PDGA_RULESET.min_depth[division] - 1e-9));
}

export function checkPayoutCompliance(i: ComplianceInput): ComplianceResult {
  const out: ComplianceResult = { applies: i.sanctioned, required_places: 0, rows: [], advice: [], ruleset_version: PDGA_RULESET.version };
  if (!i.sanctioned || i.entries <= 0) return out;
  const who = i.division_type === "pro" ? "players" : "players";

  // True Amateur has no payout depth; only value.
  if (!(i.mode === "true_amateur" && i.division_type === "am")) {
    const need = requiredPaidPlaces(i.entries, i.division_type);
    out.required_places = need;
    const depth = i.places_paid / i.entries;
    out.rows.push({
      key: "depth",
      label: i.division_type === "pro" ? "Pro payout depth" : "Am payout depth",
      required: `${pct(PDGA_RULESET.min_depth[i.division_type])} (${need} of ${i.entries})`,
      actual: `${pct(depth)} (${i.places_paid})`,
      pass: i.places_paid >= need,
    });
    if (i.places_paid < need) {
      out.advice.push(`PDGA requires at least ${need} of ${i.entries} ${who} to be paid. Your setting pays ${i.places_paid}.`);
    }
    if (i.max_places < need) {
      out.rows.push({ key: "pool", label: "Payout pool", required: `Enough for ${need} paid places`, actual: `Enough for ${i.max_places}`, pass: false });
      out.advice.push("Payout pool too small. PDGA compliance requires more paid places — increase the purse or lower the rounding step.");
    }
  }

  if (i.division_type === "am") {
    const p = i.tier === "league" ? (i.league_value_pct ?? 1) : PDGA_RULESET.am_value_pct[i.tier];
    const required = Math.ceil(Math.round(i.net_entry_cents * p * 100) / 100);
    const actual = Math.round(i.am_value_cents ?? 0);
    out.rows.push({
      key: "am_value",
      label: "Amateur value",
      required: `${money(required)} (${pct(p)} of net entry)`,
      actual: money(actual),
      pass: actual >= required,
    });
    if (actual < required) out.advice.push(`Amateur value is ${money(required - actual)} short of the ${i.tier === "league" ? "league" : `${i.tier}-Tier`} requirement.`);
  }
  return out;
}
