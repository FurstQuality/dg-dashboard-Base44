/**
 * Phase 9 — the one DGD badge. Shows Tier color + icon + Tier name and the
 * DGD Rating. The number stays neutral so it never reads as deciding the Tier.
 */
import { Circle, CircleDot, Shield, ShieldCheck, Award } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TIER_LABEL, type Tier } from "@/lib/dgd-tier/engine";

const TIER_STYLE: Record<Tier, { icon: LucideIcon; ring: string; text: string; bg: string }> = {
  GREEN: { icon: Circle, ring: "border-tier-green/60", text: "text-tier-green", bg: "bg-tier-green/10" },
  YELLOW: { icon: CircleDot, ring: "border-tier-yellow/60", text: "text-tier-yellow", bg: "bg-tier-yellow/10" },
  BRONZE: { icon: Shield, ring: "border-tier-bronze/60", text: "text-tier-bronze", bg: "bg-tier-bronze/10" },
  SILVER: { icon: ShieldCheck, ring: "border-tier-silver/60", text: "text-tier-silver", bg: "bg-tier-silver/10" },
  GOLD: { icon: Award, ring: "border-tier-gold/70", text: "text-tier-gold", bg: "bg-tier-gold/10" },
};

export const TIER_EXPLAINER =
  "DGD Rating measures current playing ability. DGD Tier recognizes experience, participation, leadership and contribution to disc golf.";

export function DgdBadge({ tier, rating, size = "md" }: { tier: Tier | null | undefined; rating: number | null | undefined; size?: "sm" | "md" | "lg" }) {
  const t = (tier ?? "GREEN") as Tier;
  const st = TIER_STYLE[t];
  const Icon = st.icon;
  const num = rating == null ? "—" : String(rating);
  const label = `${TIER_LABEL[t]} tier · DGD Rating ${rating == null ? "not rated yet" : rating}`;
  if (size === "sm") {
    return (
      <span aria-label={label} title={label} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${st.ring} ${st.bg}`}>
        <Icon className={`h-3.5 w-3.5 ${st.text}`} aria-hidden />
        <span className={st.text}>{TIER_LABEL[t]}</span>
        <span className="tabular-nums text-foreground">{num}</span>
      </span>
    );
  }
  const big = size === "lg";
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div aria-label={label} className={`inline-flex items-center gap-3 rounded-2xl border-2 ${st.ring} ${st.bg} ${big ? "px-4 py-3" : "px-3 py-2"}`}>
            <Icon className={`${big ? "h-9 w-9" : "h-7 w-7"} ${st.text}`} aria-hidden />
            <div className="leading-none">
              <div className={`font-display font-bold tabular-nums text-foreground ${big ? "text-3xl" : "text-2xl"}`}>{num}</div>
              <div className={`mt-1 text-xs font-semibold uppercase tracking-wider ${st.text}`}>{TIER_LABEL[t]}</div>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[260px] text-xs">{TIER_EXPLAINER}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
