import { ReactNode } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  formatUpdateDate,
  nextPdgaUpdateDate,
  previousPdgaUpdateDate,
} from "@/lib/stats/pdga-update";

/**
 * DG Statboard Phase 2 — "How is this calculated?" drawers.
 *
 * These are explainability surfaces for the two ratings shown on DG Statboard.
 * They intentionally repeat the same taxonomy defined in
 * `src/lib/statlink-taxonomy.ts`: Official PDGA vs DG Dashboard Calculated.
 */

function DrawerShell(props: {
  triggerLabel?: string;
  triggerClassName?: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const {
    triggerLabel = "How is this calculated?",
    triggerClassName,
    title,
    subtitle,
    children,
  } = props;
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 gap-1.5 px-2 text-[11px] text-muted-foreground hover:text-foreground ${triggerClassName ?? ""}`}
        >
          <Info className="h-3.5 w-3.5" />
          {triggerLabel}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="text-left">
          <SheetTitle className="font-display text-xl">{title}</SheetTitle>
          <SheetDescription>{subtitle}</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4 text-sm">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border/60 bg-muted/30 p-3">
      <h4 className="mb-1.5 font-semibold text-foreground">{title}</h4>
      <div className="space-y-1.5 text-[13px] leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

/** Explains the Official PDGA Rating shown on DG Statboard. */
export function PdgaCalculationDrawer(props: {
  rating: number | null;
  usedRounds: number;
  windowMonths: number;
  refreshedAt?: string | null;
}) {
  const { rating, usedRounds, windowMonths, refreshedAt } = props;
  const next = nextPdgaUpdateDate();
  const prev = previousPdgaUpdateDate();

  return (
    <DrawerShell
      title="Official PDGA Rating"
      subtitle="How the number in your player profile is produced — and how we mirror it here."
    >
      <Section title="Source">
        <p>
          PDGA publishes this number on your official player page. DG Statboard reads it directly from
          the PDGA and shows the exact value — we do not modify or estimate it.
        </p>
        <p>
          Your current PDGA rating is <b className="text-foreground">{rating ?? "—"}</b>, derived
          from <b className="text-foreground">{usedRounds}</b> rated singles rounds in the last
          <b className="text-foreground"> {windowMonths}</b> months.
        </p>
      </Section>

      <Section title="How PDGA calculates it">
        <ul className="list-disc space-y-1 pl-4">
          <li>
            Every rated round gets a per-round rating based on the round's SSA (Scratch Scoring
            Average) and its per-throw value.
          </li>
          <li>
            The rolling window is <b>12 months</b> for players with 8+ rated rounds in that period,
            otherwise <b>24 months</b>.
          </li>
          <li>Rounds more than 100 points AND 2.5σ below your mean are dropped as outliers.</li>
          <li>
            The most recent 25% of rounds (by date) are <b>double-weighted</b> to reflect current
            form.
          </li>
          <li>The weighted average is your Official PDGA Rating.</li>
        </ul>
      </Section>

      <Section title="When it updates">
        <p>
          PDGA republishes ratings on the <b>second Tuesday of every month</b>. Rounds that finish
          before the cutoff are included in that update.
        </p>
        <p>
          Last update:&nbsp;<b className="text-foreground">{formatUpdateDate(prev)}</b>
          <br />
          Next update:&nbsp;<b className="text-foreground">{formatUpdateDate(next)}</b>
        </p>
        {refreshedAt && (
          <p className="text-xs">
            DG Statboard last synced this value from PDGA on {new Date(refreshedAt).toLocaleString()}.
          </p>
        )}
      </Section>

      <Section title="What this rating does — and doesn't — do">
        <ul className="list-disc space-y-1 pl-4">
          <li>It determines your division eligibility for sanctioned events.</li>
          <li>
            It does <b>not</b> include casual, league, or in-app scored rounds.
          </li>
          <li>It changes only on the monthly update — not after every round.</li>
        </ul>
      </Section>
    </DrawerShell>
  );
}

/** Explains the DGD Rating estimate shown on DG Statboard. */
export function DgdRatingCalculationDrawer(props: {
  rating: number | null;
  base: number | null;
  average: number | null;
  ceiling: number | null;
  floor: number | null;
  recentTrend: number;
  headToHeadDelta: number;
  headToHeadRounds: number;
  sampleSize: number;
}) {
  const {
    rating,
    base,
    average,
    ceiling,
    floor,
    recentTrend,
    headToHeadDelta,
    headToHeadRounds,
    sampleSize,
  } = props;

  return (
    <DrawerShell
      title="DGD Rating"
      subtitle="Compiled from ALL rounds in the app — PDGA, UDisc, and DG Dashboard. The more rounds you upload, the more accurate it becomes."
    >
      <Section title="What it is">
        <p>
          The DGD Rating is a DG Dashboard <b>estimate</b> of how you're playing right now. It is
          built from every round you have in the app — PDGA imports, UDisc imports, and in-app
          scored rounds — so the more rounds you upload, the sharper it gets. It is <b>not</b> an
          official PDGA rating and does not affect division eligibility.
        </p>
        <p>
          Your DGD Rating is <b className="text-foreground">{rating ?? "—"}</b>, produced from
          <b className="text-foreground"> {sampleSize}</b> rated round{sampleSize === 1 ? "" : "s"}.
        </p>
      </Section>

      <Section title="How it's built">
        <ol className="list-decimal space-y-1 pl-4">
          <li>
            <b>Anchor</b> — start from your Official PDGA Rating
            {base != null && (
              <>
                {" "}
                (<b className="text-foreground">{base}</b>)
              </>
            )}
            . If you don't have one, we imply an anchor from rounds against PDGA-rated opponents.
          </li>
          <li>
            <b>Distribution model</b> — analyse the shape of your recent ratings distribution
            (average <b className="text-foreground">{average ?? "—"}</b>, high form
            <b className="text-foreground"> {ceiling ?? "—"}</b>, low form
            <b className="text-foreground"> {floor ?? "—"}</b>).
          </li>
          <li>
            <b>Trend</b> — apply a small recency adjustment (up to ±15) reflecting whether the last
            quarter of rounds is climbing or sliding. Current trend:
            <b
              className={` ${recentTrend > 0 ? "text-emerald-600" : recentTrend < 0 ? "text-red-600" : "text-foreground"}`}
            >
              {" "}
              {recentTrend > 0 ? "+" : ""}
              {recentTrend}
            </b>
            .
          </li>
          <li>
            <b>Head-to-head</b> — cross-check against PDGA-rated players from <b>all</b> sources:
            in-app scored rounds, plus PDGA and UDisc imports where you played the same event as
            another rated user.
            {headToHeadRounds > 0 ? (
              <>
                {" "}
                {headToHeadRounds} such round{headToHeadRounds === 1 ? "" : "s"} contributed
                {headToHeadDelta !== 0 && (
                  <>
                    {" a "}
                    <b className={headToHeadDelta > 0 ? "text-emerald-600" : "text-red-600"}>
                      {headToHeadDelta > 0 ? "+" : ""}
                      {headToHeadDelta}
                    </b>{" "}
                    adjustment
                  </>
                )}
                .
              </>
            ) : (
              <>
                {" "}
                None on file yet — this component activates as more players import rounds from your
                events or you play scored in-app rounds with rated players.
              </>
            )}
          </li>
        </ol>
      </Section>

      <Section title="What we intentionally do NOT do">
        <ul className="list-disc space-y-1 pl-4">
          <li>
            No hidden "ceiling bonus" — peak capability is displayed as the <b>High form</b> number,
            not baked into the rating.
          </li>
          <li>No opaque smoothing — every input is visible on this page.</li>
          <li>
            No mixing with the Official PDGA number — the two live side by side, never merged.
          </li>
        </ul>
      </Section>

      <Section title="When it updates">
        <p>
          Immediately, after every scored round or PDGA sync. Unlike the Official PDGA rating, it is
          designed to move with you between the monthly PDGA cycles.
        </p>
      </Section>
    </DrawerShell>
  );
}
