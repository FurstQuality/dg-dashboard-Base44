import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Calendar, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MascotEmptyState } from "@/components/shell";
import { listGamePlanEvents, type GamePlanEvent } from "@/lib/game-plan.functions";
import { DataReadinessPanel } from "@/components/game-plan/data-readiness-panel";

/**
 * Event-level data readiness, embedded inside the unified Data & Sync hub.
 * Shows which imported PDGA / UDisc / course-rating data each upcoming event
 * still needs before projections are trustworthy.
 */
export function EventReadinessList({ initialEventId }: { initialEventId?: string }) {
  const list = useServerFn(listGamePlanEvents);
  const { data, isLoading } = useQuery({
    queryKey: ["game-plan", "events"],
    queryFn: () => list(),
  });
  const events = data?.events ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo<GamePlanEvent | null>(() => {
    if (!events.length) return null;
    return (
      events.find((e) => e.id === selectedId) ??
      (initialEventId ? events.find((e) => e.id === initialEventId) : undefined) ??
      events[0] ??
      null
    );
  }, [events, selectedId, initialEventId]);

  if (isLoading) {
    return <Card className="p-6 text-muted-foreground">Pulling in your upcoming events…</Card>;
  }

  if (events.length === 0) {
    return (
      <MascotEmptyState
        intent="analytics"
        title="No events on your schedule yet."
        description="Add a tournament or league round to your schedule and we'll show exactly which PDGA, UDisc, and course-rating data is still missing."
        actions={
          <>
            <Button asChild size="sm">
              <Link to="/schedule">Open schedule</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/game-plan">Game Plan</Link>
            </Button>
          </>
        }
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card className="p-2 lg:sticky lg:top-4 lg:self-start">
        <div className="px-2 py-1 text-xs uppercase tracking-wide text-muted-foreground">
          My events ({events.length})
        </div>
        <div className="max-h-[70vh] space-y-1 overflow-y-auto">
          {events.map((e) => {
            const active = e.id === selected?.id;
            return (
              <button
                key={e.id}
                onClick={() => setSelectedId(e.id)}
                className={
                  "w-full rounded-md px-3 py-2 text-left text-sm transition-colors " +
                  (active ? "border border-primary/30 bg-primary/10" : "hover:bg-muted")
                }
              >
                <div className="truncate font-medium">{e.title}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {e.starts_on ?? "TBD"}
                  {e.tier ? (
                    <Badge variant="secondary" className="ml-1 px-1 py-0 text-[10px]">
                      {e.tier}
                    </Badge>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {selected ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Selected event
              </div>
              <div className="text-lg font-semibold">{selected.title}</div>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/game-plan" search={{ event: selected.id }}>
                Open in Game Plan
                <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
          <DataReadinessPanel event={selected} />
        </div>
      ) : null}
    </div>
  );
}
