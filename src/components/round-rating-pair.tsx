/**
 * RoundRatingPair — shows a round's published rating (PDGA or UDisc) and the
 * DG Dashboard projected rating side by side.
 *
 * Rules:
 *  - When the source published a rating (PDGA, UDisc), that value is the true
 *    round rating and is always shown first.
 *  - The DGD Round Rating (V1.3, 500–1200 scale) is shown beside it when DGD
 *    rated the round. They are different metrics and are labelled as such.
 */
import { useDgdRoundRating } from "@/lib/dgd-identity";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type RoundRatingPairProps = {
  /** external_rounds.source — "pdga" | "udisc" | "disc_golf_scene" | ... */
  source?: string | null;
  /** Rating published by the source (external_rounds.round_rating). */
  publishedRating?: number | null;
  /** Source round id (external_rounds.id / rounds.id) used to look up the DGD Round Rating. */
  roundId?: string | null;
  /** Compact rendering for dense lists. */
  compact?: boolean;
  className?: string;
};

function publishedLabel(source?: string | null): string {
  const s = (source ?? "").toLowerCase();
  if (s === "udisc") return "UDisc";
  if (s === "pdga" || s === "disc_golf_scene") return "PDGA";
  return "Published";
}

export function RoundRatingPair({
  source,
  publishedRating,
  roundId,
  compact,
  className,
}: RoundRatingPairProps) {
  const published = typeof publishedRating === "number" ? publishedRating : null;
  const dgdQ = useDgdRoundRating(roundId);
  const dgd = typeof dgdQ.data === "number" ? dgdQ.data : null;
  if (published == null && dgd == null) return null;

  const label = publishedLabel(source);
  const valueSize = compact ? "text-sm" : "text-lg";
  const chipSize = compact ? "text-[10px] px-1.5" : "text-xs px-2";

  return (
    <TooltipProvider delayDuration={150}>
      <div className={`flex flex-wrap items-center justify-end gap-x-2 gap-y-1 ${className ?? ""}`}>
        {published != null ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-baseline gap-1">
                <span
                  className={`rounded-full bg-primary/10 py-0.5 font-semibold uppercase tracking-wide text-primary ${chipSize}`}
                >
                  {label}
                </span>
                <span
                  className={`font-display font-bold tabular-nums text-primary ${valueSize} leading-none`}
                >
                  {published}
                </span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[240px] text-xs">
              {label === "UDisc"
                ? "Round rating published by UDisc for this round — the true rating for UDisc rounds."
                : label === "PDGA"
                  ? "Official round rating published by the PDGA."
                  : "Round rating published by the source this round came from."}
            </TooltipContent>
          </Tooltip>
        ) : null}

        {dgd != null ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-baseline gap-1">
                <span
                  className={`rounded-full bg-muted py-0.5 font-semibold uppercase tracking-wide text-muted-foreground ${chipSize}`}
                >
                  DGD
                </span>
                <span
                  className={`font-semibold tabular-nums text-muted-foreground ${compact ? "text-xs" : "text-sm"} leading-none`}
                >
                  {dgd}
                </span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[240px] text-xs">
              DGD Round Rating on the 500–1200 DGD scale. A different measure from PDGA and UDisc round ratings.
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
