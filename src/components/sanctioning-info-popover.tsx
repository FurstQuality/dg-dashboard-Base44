import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Shared "How sanctioning works" popover — mounted next to bucket/segmented
 * controls on the Events page, DG Statboard PDGA tab, and Rating Studio DGD tab.
 * Copy is intentionally plain and disc-golf-aware.
 */
export function SanctioningInfoPopover({ label = "How sanctioning works" }: { label?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5" /> {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] space-y-2 text-xs leading-relaxed">
        <p>
          The PDGA runs the official rating system. Your PDGA rating only updates from rounds played
          at <strong>PDGA-sanctioned events</strong> — singles events at PDGA tiers{" "}
          <strong>XA, A, B, C, L, XM, and XE</strong>.
        </p>
        <p>
          <strong>XC-tier events</strong> and <strong>doubles events</strong> are not sanctioned, so
          they don't count toward your rating even when they're on PDGA.com.
        </p>
        <p>
          UDisc, Disc Golf Scene, and Disc Golf Dashboard events are <strong>unsanctioned</strong>{" "}
          or <strong>casual</strong> — great for practice and stats inside DGD, but not for your
          PDGA rating.
        </p>
      </PopoverContent>
    </Popover>
  );
}
