import { cn } from "@/lib/utils";
import { formatToPar, relativeToPar, RATING_LABEL, type RatingSource } from "@/lib/score-display";

/**
 * Standard score block: to-par large, then strokes · Par, then ratings.
 * Ratings stay separate and fully labelled by source.
 */
export function ScoreContext({
  score,
  par,
  ratings = [],
  size = "md",
  className,
}: {
  score: number | null | undefined;
  par: number | null | undefined;
  ratings?: { source: RatingSource; value: number | null | undefined }[];
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const rel = relativeToPar(score, par);
  const big = size === "lg" ? "text-4xl" : size === "sm" ? "text-lg" : "text-2xl";
  return (
    <div className={cn("min-w-0", className)}>
      <div className={cn("font-display font-black tabular-nums leading-none", big)}>
        {rel == null ? (score ?? "—") : formatToPar(rel)}
      </div>
      <div className="mt-1 text-[13px] text-muted-foreground tabular-nums">
        {score == null ? "No score yet" : rel == null ? `${score} strokes · Par unknown` : `${score} strokes · Par ${par}`}
      </div>
      {ratings
        .filter((r) => r.value != null)
        .map((r) => (
          <div key={r.source} className="mt-0.5 text-[13px] tabular-nums">
            <span className="text-muted-foreground">{RATING_LABEL[r.source]}: </span>
            <span className="font-semibold">{Math.round(r.value as number)}</span>
          </div>
        ))}
    </div>
  );
}
