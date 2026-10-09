import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { DIRECTOR_STALE, directorKeys } from "@/lib/director-queries";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { LoadingSkeleton } from "@/components/shell";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { listLinkableEvents, setEventSeries, type LinkableEvent } from "@/lib/series.functions";

function fmtDate(iso: string | null) {
  if (!iso) return "Date TBA";
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Links tournaments and leagues the director already runs into one series.
 * Flipping a switch on attaches that stop; flipping it off releases it.
 */
export function SeriesStopLinker({
  seriesId,
  seriesName,
  trigger,
}: {
  seriesId: string;
  seriesName: string;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const fetchEvents = useServerFn(listLinkableEvents);
  const link = useServerFn(setEventSeries);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: directorKeys.linkableEvents(),
    staleTime: DIRECTOR_STALE.medium,
    queryFn: () => fetchEvents({ data: undefined as never }),
    enabled: open,
  });

  const rows = useMemo(() => {
    const list = data ?? [];
    const q = search.trim().toLowerCase();
    const filtered = q ? list.filter((e) => e.name.toLowerCase().includes(q)) : list;
    // Stops already in this series float to the top.
    return [...filtered].sort((a, b) => {
      const aIn = a.series_id === seriesId ? 0 : 1;
      const bIn = b.series_id === seriesId ? 0 : 1;
      return aIn - bIn || (b.date ?? "").localeCompare(a.date ?? "");
    });
  }, [data, search, seriesId]);

  async function toggle(event: LinkableEvent, next: boolean) {
    setPending(event.id);
    try {
      await link({
        data: {
          kind: event.kind,
          event_id: event.id,
          series_id: next ? seriesId : null,
        },
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: directorKeys.linkableEvents() }),
        qc.invalidateQueries({ queryKey: directorKeys.series() }),
        qc.invalidateQueries({ queryKey: directorKeys.seriesReport(seriesId) }),
      ]);
      toast.success(
        next ? `${event.name} is now a stop in ${seriesName}` : `${event.name} left the series`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update that stop");
    } finally {
      setPending(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="secondary" size="sm">
            Manage stops
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Stops in {seriesName}</DialogTitle>
          <DialogDescription>
            Turn on any tournament or league you run to count it as a stop. An event can belong to
            one series at a time.
          </DialogDescription>
        </DialogHeader>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your events"
        />

        {isLoading ? (
          <LoadingSkeleton />
        ) : rows.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            {search
              ? "No events match that search."
              : "You don't have any tournaments or leagues yet. Create one, then link it here."}
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-control border">
            {rows.map((e) => {
              const inThis = e.series_id === seriesId;
              const inOther = !!e.series_id && !inThis;
              return (
                <li key={`${e.kind}-${e.id}`} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{e.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <Badge variant="outline">
                        {e.kind === "tournament" ? "Tournament" : "League"}
                      </Badge>
                      <span>{fmtDate(e.date)}</span>
                      {inOther ? <span>· already in another series</span> : null}
                    </div>
                  </div>
                  <Switch
                    checked={inThis}
                    disabled={pending === e.id || inOther}
                    onCheckedChange={(next) => toggle(e, next)}
                    aria-label={`${inThis ? "Remove" : "Add"} ${e.name}`}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
