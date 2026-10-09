import { Sparkles } from "lucide-react";

/**
 * Tier grouping — raw tier strings arrive from PDGA, UDisc and Disc Golf Scene in
 * many shapes ("A-Tier", "a tier", "Elite Series", "XC", "League play", season
 * names). Players think in tier families, so filtering and sorting work on the
 * family instead of the raw string.
 */
export type TierGroup = "major" | "a" | "b" | "c" | "xc" | "league" | "other";

export const TIER_GROUP_META: Record<TierGroup, { label: string; rank: number }> = {
  major: { label: "Majors & Elite Series", rank: 0 },
  a: { label: "A-tier", rank: 1 },
  b: { label: "B-tier", rank: 2 },
  c: { label: "C-tier", rank: 3 },
  xc: { label: "XC-tier", rank: 4 },
  league: { label: "League / season", rank: 5 },
  other: { label: "Other / unlisted", rank: 6 },
};

export const TIER_GROUP_ORDER: TierGroup[] = ["major", "a", "b", "c", "xc", "league", "other"];

/** Maps a raw tier/season string onto a tier family. */
export function tierGroupOf(tier: string | null | undefined): TierGroup {
  const t = (tier ?? "").trim().toLowerCase();
  if (!t) return "other";
  if (/major|elite\s*series|dgpt|world championship|\bpro\s*worlds\b|^m$|^es$/.test(t))
    return "major";
  if (/\bxc\b|^xc/.test(t)) return "xc";
  if (/league|season|weekly|^l[-\s]?tier$|^l$/.test(t)) return "league";
  if (/^a[-\s]?tier|^a$|\ba-tier\b/.test(t)) return "a";
  if (/^b[-\s]?tier|^b$|\bb-tier\b/.test(t)) return "b";
  if (/^c[-\s]?tier|^c$|\bc-tier\b/.test(t)) return "c";
  return "other";
}

/** Lower number = more prestigious. Used by the "Tier · highest first" sort. */
export function tierRank(tier: string | null | undefined): number {
  return TIER_GROUP_META[tierGroupOf(tier)].rank;
}

// ---------------------------------------------------------------------------
// Smart presets
// ---------------------------------------------------------------------------
export interface SmartPresetPatch {
  kind?: string;
  bucket?: string;
  tierGroup?: string;
  tier?: string;
  status?: string;
  when?: string;
  radius?: string;
  sort?: string;
}

export interface SmartPreset {
  id: string;
  label: string;
  hint: string;
  patch: SmartPresetPatch;
}

export const SMART_PRESETS: SmartPreset[] = [
  {
    id: "sanctioned-near-me",
    label: "Sanctioned near me",
    hint: "PDGA-sanctioned events inside your distance filter — these count toward your rating.",
    patch: { bucket: "sanctioned", when: "upcoming", radius: "50", sort: "distance_asc" },
  },
  {
    id: "big-tiers",
    label: "Majors & A-tiers",
    hint: "The biggest sanctioned fields in the next 12 months, highest tier first.",
    patch: { bucket: "sanctioned", when: "year", tierGroup: "major", sort: "tier_rank_asc" },
  },
  {
    id: "local-c-tiers",
    label: "Local C-tiers",
    hint: "Entry-level sanctioned tournaments close to home.",
    patch: { bucket: "sanctioned", tierGroup: "c", when: "upcoming", sort: "distance_asc" },
  },
  {
    id: "leagues-week",
    label: "Leagues this week",
    hint: "League nights meeting in the next 7 days, closest first.",
    patch: { kind: "league", when: "week", sort: "distance_asc" },
  },
  {
    id: "unsanctioned",
    label: "Unsanctioned & casual",
    hint: "Fun events, doubles and casual rounds that don't touch your rating.",
    patch: { bucket: "unsanctioned", when: "upcoming", sort: "date_asc" },
  },
  {
    id: "registration-open",
    label: "Registration open",
    hint: "Events you can sign up for right now.",
    patch: { status: "registration_open", when: "upcoming", sort: "date_asc" },
  },
];

interface Props {
  /** Current search values for the fields presets touch. */
  current: Record<string, string | number | undefined>;
  onApply: (patch: SmartPresetPatch) => void;
}

/** One-tap filter combinations for the questions players actually ask. */
export function EventsSmartPresets({ current, onApply }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" /> Smart filters
      </span>
      {SMART_PRESETS.map((p) => {
        const on = Object.entries(p.patch).every(
          ([k, v]) => k === "sort" || String(current[k] ?? "") === String(v),
        );
        return (
          <button
            key={p.id}
            type="button"
            title={p.hint}
            onClick={() => onApply(p.patch)}
            aria-pressed={on}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              on
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
