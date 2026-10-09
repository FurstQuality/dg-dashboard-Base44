import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared frame for every panel in the Event Director Kit. */
export function SectionCard({
  title,
  blurb,
  actions,
  children,
  className,
}: {
  title: string;
  blurb?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-4 sm:p-5", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {blurb ? <p className="mt-1 text-xs text-muted-foreground">{blurb}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
