import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * "Right now" strip — the first thing under a section's page header.
 *
 * Every bottom-nav destination opens with one of these so a player sees the
 * live state of that section and its next action without scrolling. It renders
 * nothing when there is genuinely nothing to say, so no page carries an empty
 * decorative card.
 */
export function NowStrip({ items }: { items: ReactNode[] }) {
  const shown = items.filter(Boolean);
  if (shown.length === 0) return null;
  return (
    <section
      aria-label="Right now"
      className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
      data-now-strip=""
    >
      {shown}
    </section>
  );
}

export type NowTone = "default" | "live" | "attention";

const WRAP: Record<NowTone, string> = {
  default: "border-border bg-card hover:border-primary/40",
  live: "border-primary/50 bg-primary/[0.06] hover:border-primary",
  attention: "border-primary/30 bg-card hover:border-primary/60",
};

const ICON_WRAP: Record<NowTone, string> = {
  default: "bg-muted text-muted-foreground",
  live: "bg-primary/15 text-primary",
  attention: "bg-primary/10 text-primary",
};

/**
 * One tile inside a NowStrip. Wrap it in a typed `<Link>` from the calling
 * section so route paths stay type-checked.
 */
export function NowTile({
  icon: Icon,
  eyebrow,
  title,
  detail,
  tone = "default",
  badge,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  detail?: string | null;
  tone?: NowTone;
  badge?: string | null;
}) {
  return (
    <div
      className={`flex min-w-0 items-center gap-3 rounded-card border p-3 transition ${WRAP[tone]}`}
    >
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-control ${ICON_WRAP[tone]}`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {eyebrow}
          </span>
          {badge ? (
            <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
              {badge}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block truncate text-sm font-semibold text-foreground">{title}</span>
        {detail ? (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{detail}</span>
        ) : null}
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </div>
  );
}

/** Shared link wrapper so every tile has the same focus ring and tap target. */
export const nowTileLinkClass = "block min-w-0 rounded-card focus-visible:ring-2 ring-ring";
