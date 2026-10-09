import type { ReactNode } from "react";
import { Database } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * WidgetNote — the one-line explanation that sits directly under a widget
 * heading. Every widget must say, in plain words, what its data is and where
 * it comes from, so no number on a page is unexplained.
 */
export function WidgetNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("mt-0.5 text-[13px] leading-snug text-muted-foreground", className)}>
      {children}
    </p>
  );
}

/**
 * WidgetSourceNote — names the systems a widget's data is pulled from
 * (for example PDGA, UDisc, Disc Golf Scene, or rounds scored in DG Dashboard)
 * plus an optional note about which round types are counted.
 */
export function WidgetSourceNote({
  sources,
  note,
  className,
}: {
  sources: string[];
  note?: ReactNode;
  className?: string;
}) {
  if (sources.length === 0 && !note) return null;
  return (
    <p
      className={cn(
        "mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] leading-snug text-muted-foreground",
        className,
      )}
    >
      <Database className="h-3 w-3 shrink-0" aria-hidden />
      {sources.length ? (
        <span>
          <span className="font-medium">Data source:</span> {sources.join(" · ")}
        </span>
      ) : null}
      {note ? <span>{note}</span> : null}
    </p>
  );
}
