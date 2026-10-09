import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ExternalLink, Flame, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listDiscTrends, refreshDiscTrends, type DiscTrendRow } from "@/lib/disc-trends.functions";

function flight(row: DiscTrendRow): string | null {
  const parts = [row.speed, row.glide, row.turn, row.fade];
  if (parts.some((p) => p === null || p === undefined)) return null;
  return parts.join(" / ");
}

function weekLabel(weekOf: string | null): string {
  if (!weekOf) return "";
  const [y, m, d] = weekOf.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Weekly best-selling discs, with flight numbers and links to the full listing. */
export function TrendingDiscsCard() {
  const load = useServerFn(listDiscTrends);
  const refresh = useServerFn(refreshDiscTrends);
  const [rows, setRows] = useState<DiscTrendRow[]>([]);
  const [weekOf, setWeekOf] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((res) => {
        if (cancelled) return;
        setRows(res.rows);
        setWeekOf(res.weekOf);
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [load]);

  const pull = async (force: boolean) => {
    setBusy(true);
    try {
      await refresh({ data: { force } });
      const res = await load();
      setRows(res.rows);
      setWeekOf(res.weekOf);
      toast.success(
        res.rows.length ? "Rankings updated." : "No rankings were published this week yet.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the rankings.");
    } finally {
      setBusy(false);
    }
  };

  const visible = expanded ? rows : rows.slice(0, 5);

  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Flame className="h-4 w-4 text-primary" />
            What players are buying
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Weekly best-seller rankings from Infinite Discs
            {weekOf ? ` · week of ${weekLabel(weekOf)}` : ""}. Sales rankings only — not a flight
            rating.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => pull(true)} disabled={busy}>
          <RefreshCw className={`mr-2 h-4 w-4 ${busy ? "animate-spin" : ""}`} />
          {rows.length ? "Update" : "Load rankings"}
        </Button>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">Checking this week's rankings…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No rankings stored yet. Load them to see which molds are selling right now.
        </p>
      ) : (
        <>
          <ul className="mt-4 space-y-2">
            {visible.map((row) => (
              <li
                key={row.id}
                className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 p-2.5"
              >
                <span className="w-7 shrink-0 text-center text-sm font-semibold text-muted-foreground">
                  #{row.rank}
                </span>
                {row.image_url ? (
                  <img
                    src={row.image_url}
                    alt={`${row.name} disc`}
                    loading="lazy"
                    className="h-10 w-10 shrink-0 rounded-full object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{row.name}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    {flight(row) ? (
                      <Badge variant="outline" className="text-[10px]">
                        {flight(row)}
                      </Badge>
                    ) : null}
                    {row.brand ? (
                      <Badge variant="outline" className="text-[10px]">
                        {row.brand}
                      </Badge>
                    ) : null}
                    {row.rating ? (
                      <span className="text-xs text-muted-foreground">
                        {row.rating.toFixed(2)} ★{row.review_count ? ` (${row.review_count})` : ""}
                      </span>
                    ) : null}
                  </div>
                </div>
                <a
                  href={row.product_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-muted-foreground hover:text-primary"
                  aria-label={`View ${row.name} details`}
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </li>
            ))}
          </ul>
          {rows.length > 5 ? (
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Show top 5" : `Show all ${rows.length}`}
            </Button>
          ) : null}
        </>
      )}
    </section>
  );
}
