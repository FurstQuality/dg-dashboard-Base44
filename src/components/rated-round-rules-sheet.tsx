import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Info } from "lucide-react";
import { RATED_ROUND_RULES } from "@/lib/dgd-rated-rules";

/**
 * Compact reusable trigger that opens a sheet listing the DGD Rated round rules.
 * Rendered in the start-round dialog and inside the scorer so players always
 * have the rulebook one tap away.
 */
export function RatedRoundRulesSheet({
  trigger,
  className,
}: {
  trigger?: React.ReactNode;
  className?: string;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            className={
              "inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary transition hover:bg-primary/20 " +
              (className ?? "")
            }
            aria-label="View DGD Rated round rules"
          >
            <Info className="h-3 w-3" /> DGD Rated rules
          </button>
        )}
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>DGD Rated round rules</SheetTitle>
          <SheetDescription>
            DGD ratings mirror the PDGA sanctioned system. Follow these rules and your round counts
            toward your DGD rating and the Statboard.
          </SheetDescription>
        </SheetHeader>
        <ol className="mt-4 space-y-4">
          {RATED_ROUND_RULES.map((rule, i) => (
            <li key={rule.title} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{rule.title}</div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{rule.body}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </SheetContent>
    </Sheet>
  );
}
