/**
 * StatLink taxonomy — the single source of truth for how numbers, rounds,
 * and coaching insights are labeled and colored across the ratings surface.
 *
 * Every number displayed in StatLink belongs to exactly one class. The
 * class dictates the badge, tooltip, and color token used, so users can
 * always tell official PDGA data apart from DG Dashboard calculations.
 */

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { createElement } from "react";

/** Four rating classes. Never mix. */
export type RatingClass =
  | "official_pdga" // Verified, published by the PDGA
  | "pdga_pending" // Reported but not yet in an official update
  | "chainlink_calc" // DG Dashboard math (versioned, reproducible)
  | "coaching_insight"; // Interpretive guidance backed by evidence

/** Provenance of a round record. */
export type DataSource =
  | "pdga" // Imported from a PDGA event page or profile
  | "chainlink" // Scored inside DG Dashboard
  | "manual" // Manually entered by the user
  | "external"; // Imported from another platform (UDisc, DGS, etc.)

/** What kind of round it was, independent of source. */
export type RoundType =
  | "sanctioned_tournament"
  | "sanctioned_league"
  | "unsanctioned_tournament"
  | "local_league"
  | "casual"
  | "practice";

/** Where a round sits in the PDGA rating lifecycle. */
export type RoundStatus =
  | "official" // Included in the current official calculation
  | "official_excluded" // Officially published but not currently counted
  | "double_weighted" // In the recent-quarter double weight
  | "pending" // Awaiting official ratings review
  | "estimated" // DG Dashboard estimate only (no official rating)
  | "outside_window" // Older than the active rating window
  | "incomplete"; // DNF or otherwise ineligible

export const RATING_CLASS_META: Record<
  RatingClass,
  { label: string; tone: string; description: string }
> = {
  official_pdga: {
    label: "Official PDGA",
    tone: "rating-official",
    description: "Verified by the PDGA and published in the official ratings.",
  },
  pdga_pending: {
    label: "PDGA Pending",
    tone: "rating-pending",
    description:
      "Reported to the PDGA but not yet included in an official update. This value can change.",
  },
  chainlink_calc: {
    label: "DG Dashboard Calculated",
    tone: "rating-chainlink",
    description:
      "A DG Dashboard calculation. Reproducible from published inputs and a versioned model. Not an official PDGA rating.",
  },
  coaching_insight: {
    label: "Coaching Insight",
    tone: "rating-coach",
    description:
      "Interpretive guidance based on your recorded rounds. Backed by evidence — tap to see supporting holes.",
  },
};

const CLASS_CLASSES: Record<RatingClass, string> = {
  official_pdga: "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300",
  pdga_pending: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300",
  chainlink_calc: "border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  coaching_insight: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300",
};

/**
 * Small class badge. Use in card headers, chart legends, and next to any
 * number whose class is not visually obvious from context.
 */
export function SourceBadge({
  ratingClass,
  compact,
  label,
}: {
  ratingClass: RatingClass;
  compact?: boolean;
  /** Override the visible label (rare — prefer the taxonomy default). */
  label?: string;
}): ReactNode {
  const meta = RATING_CLASS_META[ratingClass];
  return createElement(
    Badge,
    {
      variant: "outline",
      title: meta.description,
      className: `${CLASS_CLASSES[ratingClass]} font-semibold uppercase tracking-wide ${
        compact ? "h-4 px-1.5 text-[9px]" : "h-5 px-2 text-[10px]"
      }`,
    },
    label ?? meta.label,
  );
}

const STATUS_LABELS: Record<RoundStatus, string> = {
  official: "Included · Official",
  official_excluded: "Excluded · Low outlier",
  double_weighted: "Included · 2× recent weight",
  pending: "Pending PDGA update",
  estimated: "DG Dashboard estimate",
  outside_window: "Outside active window",
  incomplete: "Incomplete · Not rated",
};

const STATUS_CLASSES: Record<RoundStatus, string> = {
  official: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  official_excluded: "border-muted-foreground/30 bg-muted/30 text-muted-foreground",
  double_weighted: "border-primary/40 bg-primary/10 text-primary",
  pending: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300",
  estimated: "border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  outside_window: "border-border bg-muted/40 text-muted-foreground",
  incomplete: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300",
};

export function StatusBadge({
  status,
  compact,
}: {
  status: RoundStatus;
  compact?: boolean;
}): ReactNode {
  return createElement(
    Badge,
    {
      variant: "outline",
      className: `${STATUS_CLASSES[status]} font-medium ${
        compact ? "h-4 px-1.5 text-[9px]" : "h-5 px-2 text-[10px]"
      }`,
    },
    STATUS_LABELS[status],
  );
}

/**
 * Canonical round-count ledger. Every card on StatLink that displays a
 * "N rounds" number should pull from this shape so numbers reconcile
 * across the page.
 */
export type PlayerRoundLedger = {
  /** Every round record imported for this player, all sources, all time. */
  careerImported: number;
  /** Rated rounds inside the active PDGA rating window. */
  inActiveWindow: number;
  /** Rounds included in the current official player-rating calculation. */
  usedInOfficialCalc: number;
  /** Rounds getting the recent-quarter 2× weight. */
  doubleWeighted: number;
  /** Rounds excluded from the calc by the low-outlier rule. */
  excludedLowOutlier: number;
  /** Rounds not yet included in an official PDGA update. */
  pending: number;
  /** Rounds marked incomplete / ineligible for rating. */
  incomplete: number;
};

export const CURRENT_FORM_MODEL_VERSION = "form-rating-1.0";
