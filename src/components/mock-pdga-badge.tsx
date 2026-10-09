import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type MockPdgaSource =
  | "pdga_official"
  | "udisc_official"
  | "source_official"
  | "chainlink_live"
  | "approved_profile"
  | "pdga_course_history"
  | "user_course_history"
  | "par_estimate"
  | null
  | undefined;

const SOURCE_META: Record<
  string,
  { label: string; explain: string; dot: string; text: string; bg: string }
> = {
  pdga_official: {
    label: "PDGA",
    explain: "Official PDGA-issued round rating.",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-500/15",
  },
  udisc_official: {
    label: "UDisc",
    explain: "Round rating published by UDisc for this round.",
    dot: "bg-orange-500",
    text: "text-orange-700 dark:text-orange-300",
    bg: "bg-orange-500/15",
  },
  source_official: {
    label: "Published",
    explain: "Round rating published by the source this round was imported from.",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-500/15",
  },
  chainlink_live: {
    label: "Live",
    explain: "Computed from real course SSA and stroke value during live scoring.",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-500/15",
  },
  approved_profile: {
    label: "Verified",
    explain: "Uses an approved PDGA rating profile for this course.",
    dot: "bg-teal-500",
    text: "text-teal-700 dark:text-teal-300",
    bg: "bg-teal-500/15",
  },
  pdga_course_history: {
    label: "PDGA history",
    explain: "Derived from recent sanctioned rounds played at this course.",
    dot: "bg-cyan-500",
    text: "text-cyan-700 dark:text-cyan-300",
    bg: "bg-cyan-500/15",
  },
  user_course_history: {
    label: "Your history",
    explain: "Fit from your rated rounds at this course.",
    dot: "bg-blue-500",
    text: "text-blue-700 dark:text-blue-300",
    bg: "bg-blue-500/15",
  },
  par_estimate: {
    label: "Estimate",
    explain: "Rough par-anchored estimate — improves as course data grows.",
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
    bg: "bg-muted",
  },
};

export function MockPdgaBadge({
  rating,
  source,
  size = "md",
  showLabel = false,
}: {
  rating: number | null | undefined;
  source: MockPdgaSource;
  size?: "sm" | "md";
  showLabel?: boolean;
}) {
  if (rating == null || !source) return null;
  const meta = SOURCE_META[source] ?? SOURCE_META.par_estimate;
  const isVerified =
    source === "pdga_official" ||
    source === "udisc_official" ||
    source === "source_official" ||
    source === "chainlink_live";
  const pad = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs";
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center gap-1 rounded-md ${meta.bg} ${meta.text} ${pad} font-mono font-semibold tabular-nums`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden />
            {isVerified ? "" : "~"}
            {rating}
            {showLabel ? (
              <span className="ml-0.5 text-[10px] font-normal opacity-80">{meta.label}</span>
            ) : null}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px] text-xs">
          <div className="font-semibold">
            {source === "udisc_official"
              ? "UDisc round rating"
              : isVerified
                ? "PDGA rating"
                : "Mock DGD rating"}
            : {rating}
          </div>
          <div className="mt-1 text-muted-foreground">Source: {meta.label}</div>
          <div className="mt-1">{meta.explain}</div>
          {!isVerified ? (
            <div className="mt-1 text-muted-foreground">
              DGD Rating estimate for this round based on your imported score data. Not an official
              PDGA rating.
            </div>
          ) : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
