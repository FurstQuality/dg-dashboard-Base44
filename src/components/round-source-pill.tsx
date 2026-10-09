/**
 * RoundSourcePill — a small, always-visible chip identifying where a round
 * came from. Used across every surface that lists rounds so UDisc and PDGA
 * (and DG Dashboard) rounds are never confused for one another.
 */
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type RoundSource =
  | "pdga"
  | "udisc"
  | "chainlink" // DG Dashboard live-scored round
  | "manual"
  | "sandbox"
  | "external"
  | string
  | null
  | undefined;

const META: Record<string, { label: string; explain: string; className: string }> = {
  pdga: {
    label: "PDGA",
    explain: "Officially sanctioned PDGA round with a verified round rating.",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  udisc: {
    label: "UDisc",
    explain: "Imported from UDisc. Not sanctioned — the rating shown is UDisc's own round rating.",
    className: "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  },
  chainlink: {
    label: "DG",
    explain: "Live-scored inside DG Dashboard.",
    className: "border-primary/40 bg-primary/10 text-primary",
  },
  manual: {
    label: "Manual",
    explain: "Manually entered round.",
    className: "border-border bg-muted text-muted-foreground",
  },
  sandbox: {
    label: "Sandbox",
    explain: "Demo/sandbox data — not a real round.",
    className: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
  external: {
    label: "External",
    explain: "Imported from an external source.",
    className: "border-border bg-muted text-muted-foreground",
  },
};

export function RoundSourcePill({ source, compact }: { source: RoundSource; compact?: boolean }) {
  const key = (source ?? "external").toString().toLowerCase();
  const meta = META[key] ?? META.external;
  const size = compact ? "h-4 px-1.5 text-[9px]" : "h-5 px-2 text-[10px]";
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center rounded-full border font-semibold uppercase tracking-wider ${meta.className} ${size}`}
          >
            {meta.label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px] text-xs">
          {meta.explain}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
