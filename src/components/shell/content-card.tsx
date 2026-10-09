import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { AccentMascotEmblem, useRouteAccent } from "@/components/shell/route-accent";
import { cn } from "@/lib/utils";

type Props = {
  title: ReactNode;
  /** Optional short subtitle for context. */
  subtitle?: ReactNode;
  /** Right-aligned action slot in the header (button, link, menu). */
  action?: ReactNode;
  children?: ReactNode;
  /** Footer slot for see-more links or aggregate stats. */
  footer?: ReactNode;
  className?: string;
  /** Removes internal padding when the child already provides its own. */
  bare?: boolean;
  /** Drops the decorative mascot emblem (use inside dense stacks of cards). */
  plain?: boolean;
};

/**
 * ContentCard — the general-purpose card used for lists, widgets, and
 * dashboard sections. Standard header + optional footer.
 *
 * Every card carries the current section's accent color and a bright mascot
 * emblem in the corner, so widgets feel branded and color-coded the same way
 * navigation does. Empty content should collapse; if there's nothing to show,
 * render a MascotEmptyState inside instead of an empty ContentCard.
 */
export function ContentCard({
  title,
  subtitle,
  action,
  children,
  footer,
  className,
  bare,
  plain,
}: Props) {
  const { style, mascot, showMascot } = useRouteAccent();
  return (
    <Card
      style={style}
      className={cn(
        "relative flex flex-col gap-3 overflow-hidden rounded-card border accent-panel",
        bare ? "p-0" : "p-4",
        className,
      )}
    >
      {showMascot && !plain ? (
        <AccentMascotEmblem src={mascot} size={104} className="-bottom-5 -right-3 opacity-25" />
      ) : null}
      <header className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold leading-tight text-glow sm:text-lg [text-wrap:balance]">
            {title}
          </h2>
          {subtitle ? <p className="mt-0.5 text-[13px] text-muted-foreground">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      {children ? <div className="relative min-w-0 flex-1">{children}</div> : null}
      {footer ? (
        <div className="relative mt-1 border-t border-border/60 pt-2 text-[12px] text-muted-foreground">
          {footer}
        </div>
      ) : null}
    </Card>
  );
}
