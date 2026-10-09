import { useState } from "react";
import { CalendarClock, ChevronDown, Info, RefreshCcw, Shield } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  formatUpdateDate,
  nextPdgaUpdateDate,
  previousPdgaUpdateDate,
} from "@/lib/stats/pdga-update";

/**
 * StatLink Phase 2 — Rating lifecycle education panel.
 *
 * Sits on the Overview tab and explains, plainly, when each number moves.
 * Nothing here is computed from user data other than the update calendar —
 * this is a durable reference the user can point teammates at.
 */
export function RatingLifecyclePanel() {
  const prev = previousPdgaUpdateDate();
  const next = nextPdgaUpdateDate();
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <Card className="border-border/70">
        <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-card px-4 py-3 text-left transition-colors hover:bg-muted/40">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted/50">
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
          </span>
          <span className="min-w-0 flex-1 text-sm font-semibold">
            How your ratings are calculated
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <p className="px-4 pb-3 text-xs text-muted-foreground">
            Both numbers use the same PDGA math. DGD runs it live, leans on your last 10 rounds, and
            checks how you score away from home.
          </p>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <LifeCycleColumn
              icon={<Shield className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
              title="Official PDGA Rating"
              badge="Monthly"
              badgeClass="border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300"
              rows={[
                { k: "Counts", v: "PDGA-sanctioned singles rounds only" },
                { k: "Window", v: "Last 12 months (stretches to 24 under 8 rounds)" },
                {
                  k: "Per round",
                  v: "How far your score sat above or below the round's scratch average",
                },
                { k: "Bad rounds", v: "Dropped only if 100+ points AND 2.5σ below your mean" },
                { k: "Weighting", v: "Your most recent 25% of rounds count double" },
                { k: "Updates", v: "Second Tuesday of every month" },
                { k: "Last update", v: formatUpdateDate(prev) },
                { k: "Next update", v: formatUpdateDate(next) },
                { k: "Used for", v: "Division eligibility, official standing" },
              ]}
            />
            <LifeCycleColumn
              icon={<RefreshCcw className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />}
              title="DGD Rating"
              badge="Live"
              badgeClass="border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
              rows={[
                { k: "Counts", v: "PDGA + UDisc imports + singles rounds scored in the app" },
                { k: "Window", v: "Same 12/24-month rolling window as PDGA" },
                { k: "Per round", v: "Same scratch-average math, same drop rule for blow-ups" },
                {
                  k: "Recent form",
                  v: "Your last 10 rounds count triple, the 10 before that double — a rise or slide shows the same day",
                },
                {
                  k: "Away courses",
                  v: "Home courses are the ones you play most. Scoring well elsewhere adds up to +12; only scoring well at home takes up to 12 off",
                },
                {
                  k: "Head to head",
                  v: "Shared rounds against PDGA-rated players can shift it up to ±40",
                },
                { k: "Updates", v: "Immediately after every scored round or PDGA/UDisc sync" },
                { k: "Used for", v: "Current form read-out, projections, coaching" },
                { k: "Not used for", v: "Division eligibility (never affects official standing)" },
              ]}
            />
          </CardContent>
          <div className="border-t border-border/60 px-6 py-2.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="h-3 w-3" />
              PDGA rounds you play <b>before</b> the second-Tuesday cutoff appear on the next
              month's update. That is why DGD and PDGA can disagree for a few weeks — DGD already
              counted the round.
            </span>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function LifeCycleColumn(props: {
  icon: React.ReactNode;
  title: string;
  badge: string;
  badgeClass: string;
  rows: Array<{ k: string; v: string }>;
}) {
  const { icon, title, badge, badgeClass, rows } = props;
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-semibold">{title}</span>
        </div>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badgeClass}`}
        >
          {badge}
        </span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px] leading-tight">
        {rows.map((row) => (
          <div key={row.k} className="contents">
            <dt className="text-muted-foreground">{row.k}</dt>
            <dd className="text-foreground">{row.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
