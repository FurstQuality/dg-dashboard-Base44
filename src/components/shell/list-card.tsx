import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type ListCardItem = {
  id: string;
  leading?: ReactNode;
  primary: ReactNode;
  secondary?: ReactNode;
  meta?: ReactNode;
  /** Wrap the row in a link/button. Provide either `to` or `onClick` at call site. */
  onSelect?: () => void;
  href?: string;
};

type Props = {
  title: ReactNode;
  action?: ReactNode;
  items: ListCardItem[];
  empty?: ReactNode;
  className?: string;
};

/**
 * ListCard — a titled card containing a compact row list.
 *
 * Rows follow a uniform grid so friends, notifications, rounds, and
 * event lists share alignment. When `items` is empty the card renders
 * the provided `empty` slot (usually an EmptyState).
 */
export function ListCard({ title, action, items, empty, className }: Props) {
  return (
    <Card className={cn("rounded-card border border-border p-4", className)}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <h2 className="font-display text-base font-semibold leading-tight sm:text-lg">{title}</h2>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      {items.length === 0 ? (
        (empty ?? null)
      ) : (
        <ul className="divide-y divide-border/60">
          {items.map((item) => {
            const inner = (
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-2.5">
                {item.leading ? (
                  <div className="shrink-0">{item.leading}</div>
                ) : (
                  <div className="h-8 w-8" />
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{item.primary}</div>
                  {item.secondary ? (
                    <div className="truncate text-[12px] text-muted-foreground">
                      {item.secondary}
                    </div>
                  ) : null}
                </div>
                {item.meta ? (
                  <div className="shrink-0 text-[12px] text-muted-foreground tabular-nums">
                    {item.meta}
                  </div>
                ) : (
                  <div />
                )}
              </div>
            );

            if (item.href) {
              return (
                <li key={item.id}>
                  <a
                    href={item.href}
                    className="block rounded-input hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                  >
                    {inner}
                  </a>
                </li>
              );
            }
            if (item.onSelect) {
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={item.onSelect}
                    className="w-full rounded-input text-left hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                  >
                    {inner}
                  </button>
                </li>
              );
            }
            return <li key={item.id}>{inner}</li>;
          })}
        </ul>
      )}
    </Card>
  );
}
