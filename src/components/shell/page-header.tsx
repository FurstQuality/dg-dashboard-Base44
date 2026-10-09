import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Mascot } from "@/components/mascot";
import { useResolvedPageMascot } from "@/components/branded-page-frame";
import { HEADER_ASIDE_SLOT_ID, HEADER_NAV_SLOT_ID } from "@/components/hub-tabs";
import { SharePageButton } from "@/components/share/share-page-button";


type Props = {
  /** Page title — rendered as h1. Long titles wrap to two lines. */
  title: string;
  /** One-sentence explanation. Always render one — never leave the shell bare. */
  description?: string;
  /** Primary action (usually a single Button). */
  primaryAction?: ReactNode;
  /** Optional secondary action (link, dropdown, etc.). */
  secondaryAction?: ReactNode;
  /** Optional slot above the title for breadcrumbs or eyebrow copy. */
  eyebrow?: ReactNode;
  /** Optional icon/mascot slot rendered to the left of the title. Defaults to the route's section mascot. */
  leading?: ReactNode;
  /** Set false to hide the auto page mascot. */
  showMascot?: boolean;
  /** Set false to hide the shared "Share / Copy link / Invite a friend" control. */
  shareable?: boolean;
  className?: string;
};



/**
 * Shared page header. Every route uses this — no bespoke header layouts.
 * Renders a large section mascot on the left by default (auto-resolved from
 * the current route), unless `leading` is provided or `showMascot={false}`.
 */
export function PageHeader({
  title,
  description,
  primaryAction,
  secondaryAction,
  eyebrow,
  leading,
  showMascot = true,
  shareable = true,
  className,


}: Props) {

  const routeMascot = useResolvedPageMascot();
  const leadingNode =
    leading ??
    (showMascot ? (
      <div className="glow-ring relative grid h-16 w-16 place-items-center overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/25 via-secondary/15 to-accent/20 sm:h-20 sm:w-20">
        <span
          aria-hidden
          className="pulse-glow absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,color-mix(in_oklab,var(--primary)_45%,transparent),transparent_70%)]"
        />
        <Mascot
          name={routeMascot.name}
          pose={routeMascot.pose}
          size={80}
          className="relative h-14 w-14 object-contain sm:h-[72px] sm:w-[72px]"
        />
      </div>
    ) : null);

  return (
    <>
    <header
      className={cn(
        "grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-4">
        {leadingNode ? <div className="shrink-0">{leadingNode}</div> : null}
        <div className="min-w-0">
          {eyebrow ? (
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {eyebrow}
            </div>
          ) : null}
          <h1 className="text-glow font-display text-2xl font-semibold leading-tight sm:text-3xl line-clamp-2 [text-wrap:balance]">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground [text-wrap:pretty]">{description}</p>
          ) : null}
          
        </div>
      </div>
      <div className="flex min-w-0 flex-col items-stretch gap-2 sm:items-end">
        <div id={HEADER_ASIDE_SLOT_ID} className="w-full min-w-0 empty:hidden sm:max-w-[760px]" />
        {primaryAction || secondaryAction || shareable ? (
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {shareable ? <SharePageButton title={title} /> : null}
            {secondaryAction}
            {primaryAction}
          </div>
        ) : null}

      </div>
    </header>
    {/* Section navigation (sticky pill row) portals in here so it always
        renders beneath the page title and mascot. */}
    <div id={HEADER_NAV_SLOT_ID} className="empty:hidden" />
    </>
  );
}
