/**
 * Central terminology used across StatLink, Rating Studio, and Game Plan.
 *
 * Every user-facing rating label must come from here so the taxonomy stays
 * consistent: Official PDGA vs DGD Rating (estimate) vs
 * DG Dashboard Projection (modeled future value). Never display a bare
 * "Current Rating" without a source qualifier.
 */

export type RatingSource = "pdga" | "blended" | "estimated";

/** Short label for a rating value, keyed by its source. */
export const RATING_LABEL: Record<RatingSource, string> = {
  pdga: "Official PDGA Rating",
  blended: "DGD Rating",
  estimated: "DG Dashboard Estimate",
};

/** Compact chip label (fits in a pill/badge). */
export const RATING_CHIP: Record<RatingSource, string> = {
  pdga: "PDGA",
  blended: "DGD",
  estimated: "Estimate",
};

/** One-line tooltip explaining what the value represents. */
export const RATING_TOOLTIP: Record<RatingSource, string> = {
  pdga: "Published by the PDGA on the second Tuesday of every month.",
  blended:
    "DGD Rating — compiled from ALL rounds in the app (PDGA, UDisc, and DG Dashboard). The more rounds you upload, the more accurate it becomes. Not an official PDGA rating.",
  estimated:
    "DG Dashboard estimate produced from your recorded rounds. Not an official PDGA rating.",
};

/** Words used for "current rating" in prose — never bare "rating". */
export const CURRENT_RATING_HEADING: Record<RatingSource, string> = {
  pdga: "Official PDGA Rating",
  blended: "DGD Rating",
  estimated: "DGD Rating",
};

/** DG Dashboard projection = a modeled future value, not a current rating. */
export const PROJECTION_LABEL = "DG Dashboard Projection";
export const PROJECTION_TOOLTIP =
  "A modeled projection of where your rating could land — not an official PDGA rating change.";
