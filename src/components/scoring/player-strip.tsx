import * as React from "react";
import { cn } from "@/lib/utils";
import { Check, User } from "lucide-react";

export type PlayerStripItem = {
  id: string;
  name: string;
  isMe?: boolean;
  isGuest?: boolean;
  strokesThisHole?: number | null;
  totalToPar?: number;
  played?: number;
  hasScored?: boolean;
  avatarUrl?: string | null;
};

/**
 * Horizontal snap-scroll strip of players on the card.
 * Tapping a pill selects the active scorer. Never displays a dense spreadsheet.
 */
export function PlayerStrip({
  players,
  activeId,
  onSelect,
  className,
}: {
  players: PlayerStripItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const activeRef = React.useRef<HTMLButtonElement | null>(null);
  React.useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeId]);

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[720px] items-stretch gap-2 flex-wrap px-3 py-1",
        "mobile-scroll-x [scrollbar-width:none] [-ms-overflow-style:none]",
        className,
      )}
    >
      {players.map((p) => {
        const active = p.id === activeId;
        const rel = p.totalToPar ?? 0;
        return (
          <button
            ref={active ? activeRef : undefined}
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            aria-pressed={active}
            aria-label={`${p.name}${p.isMe ? " (you)" : ""}${p.isGuest ? " (guest)" : ""}`}
            className={cn(
              "group flex min-h-11 shrink-0 snap-center items-center gap-2 rounded-full border px-2.5 py-1 text-left transition-colors",
              active
                ? "border-primary bg-primary/10"
                : "border-border bg-background hover:bg-muted",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
            title={p.name}
          >
            <span
              className={cn(
                "relative grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-xs font-bold",
                active && "ring-2 ring-primary ring-offset-1 ring-offset-background",
              )}
            >
              {p.avatarUrl ? (
                <img src={p.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <User className="h-4 w-4 text-muted-foreground" />
              )}
              {p.hasScored ? (
                <span className="absolute -right-0.5 -bottom-0.5 grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-white shadow">
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                </span>
              ) : null}
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="flex items-center gap-1">
                <span className="max-w-[8rem] truncate text-xs font-semibold">
                  {p.name.split(" ")[0]}
                </span>
                {p.isMe ? (
                  <span className="rounded-full bg-primary/15 px-1.5 py-0 text-[9px] font-bold uppercase tracking-wide text-primary">
                    You
                  </span>
                ) : null}
                {p.isGuest ? (
                  <span className="rounded-full bg-muted px-1.5 py-0 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                    G
                  </span>
                ) : null}
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="tabular-nums">
                  {p.strokesThisHole != null ? `H ${p.strokesThisHole}` : "—"}
                </span>
                <span
                  className={cn(
                    "tabular-nums font-semibold",
                    rel < 0 && "text-primary",
                    rel > 0 && "text-destructive",
                  )}
                >
                  {rel === 0 ? "E" : rel > 0 ? `+${rel}` : rel}
                </span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
