import * as React from "react";
import { Link } from "@tanstack/react-router";
import {
  Flag,
  ChevronUp,
  ChevronDown,
  Flame,
  Scissors,
  Share2,
  Search,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type LiveScoreRow = {
  name: string;
  total: number;
  toPar: number;
  thru: number;
  isMe: boolean;
  division?: string | null;
};

/**
 * Live Scores — tournament / league leaderboard with position deltas,
 * hot-round highlight, adjustable cut line, name filter, and a share link.
 * Designed for the fullscreen scorer sidebar.
 */
export function LiveScoresPanel({
  eventKind,
  eventId,
  eventName,
  rows,
  totalHoles,
}: {
  eventKind: "tournament" | "league";
  eventId: string;
  eventName: string;
  rows: LiveScoreRow[];
  totalHoles: number;
}) {
  const [query, setQuery] = React.useState("");
  const [division, setDivision] = React.useState<string>("all");
  const [cutTop, setCutTop] = React.useState<number>(() =>
    Math.max(4, Math.round(rows.length * 0.4)),
  );
  const [showAll, setShowAll] = React.useState(false);
  const [pulse, setPulse] = React.useState(false);

  // Track previous positions per player name to compute deltas.
  const prevPosRef = React.useRef<Map<string, number>>(new Map());
  const [deltas, setDeltas] = React.useState<Map<string, number>>(new Map());
  const [updatedAt, setUpdatedAt] = React.useState(Date.now());
  const [now, setNow] = React.useState(Date.now());

  React.useEffect(() => {
    const nextPos = new Map<string, number>();
    rows.forEach((r, i) => nextPos.set(r.name, i));
    const d = new Map<string, number>();
    const prev = prevPosRef.current;
    if (prev.size) {
      nextPos.forEach((newIdx, name) => {
        const oldIdx = prev.get(name);
        if (oldIdx != null && oldIdx !== newIdx) d.set(name, oldIdx - newIdx); // +up / -down
      });
    }
    setDeltas(d);
    prevPosRef.current = nextPos;
    setUpdatedAt(Date.now());
    setPulse(true);
    const t = window.setTimeout(() => setPulse(false), 1200);
    return () => window.clearTimeout(t);
    // Compare shallow signature — rerun when scores meaningfully change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.map((r) => `${r.name}:${r.total}:${r.thru}`).join("|")]);

  React.useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(iv);
  }, []);

  // Distinct divisions across the field, sorted with the caller's row order preserved.
  const divisions = React.useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const r of rows) {
      const d = (r.division ?? "").trim();
      if (!d || seen.has(d)) continue;
      seen.add(d);
      list.push(d);
    }
    return list;
  }, [rows]);

  // Filter by division (if any) and free-text name search.
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (division !== "all" && (r.division ?? "") !== division) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, query, division]);

  // Leader of the currently visible slice — used to compute gap-to-lead per row.
  const leaderTotal = filtered.length ? filtered[0].total : 0;

  const hotName = React.useMemo(() => {
    const min = Math.max(1, Math.floor(totalHoles / 2));
    const eligible = filtered.filter((r) => r.thru >= min);
    if (!eligible.length) return null;
    const hot = [...eligible].sort((a, b) => a.toPar - b.toPar)[0];
    return hot?.name ?? null;
  }, [filtered, totalHoles]);

  const visible = showAll ? filtered : filtered.slice(0, 25);
  const cutSafe = Math.min(Math.max(1, cutTop), rows.length);
  const ageMin = Math.max(0, Math.floor((now - updatedAt) / 60_000));
  const ageLabel = ageMin === 0 ? "just now" : `${ageMin}m ago`;

  const share = async () => {
    const url = `${window.location.origin}/events/${eventId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Live leaderboard link copied", { description: url });
    } catch {
      toast.info(url);
    }
  };

  return (
    <div className="shrink-0 overflow-hidden rounded-xl border border-primary/40 bg-primary/5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/30 px-3 py-1.5 text-[10px] uppercase tracking-wide">
        <span className="flex items-center gap-1.5 text-primary">
          <Flag className="h-3 w-3" />
          Live scores · {eventName}
          <span
            className={cn(
              "ml-1 inline-block h-1.5 w-1.5 rounded-full bg-primary transition-transform",
              pulse ? "scale-150" : "scale-100",
            )}
            aria-hidden
          />
        </span>
        <span className="flex items-center gap-2 text-muted-foreground">
          <span>
            {rows.length} players · {ageLabel}
          </span>
          <button
            type="button"
            onClick={share}
            className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-background px-2 py-0.5 text-primary hover:bg-primary/10"
            aria-label="Copy live leaderboard link"
          >
            <Share2 className="h-3 w-3" /> Share
          </button>
        </span>
      </div>

      <div className="flex items-center gap-2 border-b border-primary/20 bg-background/60 px-2 py-1.5">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter players"
            className="h-7 pl-7 text-xs"
          />
        </div>
        <label className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          <Scissors className="h-3 w-3" />
          Cut
          <Input
            type="number"
            min={1}
            max={rows.length || 1}
            value={cutSafe}
            onChange={(e) => setCutTop(Number(e.target.value) || 1)}
            className="h-7 w-14 text-xs"
            aria-label="Cut line position"
          />
        </label>
      </div>

      {divisions.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1 border-b border-primary/20 bg-background/40 px-2 py-1">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Division
          </span>
          <button
            type="button"
            onClick={() => setDivision("all")}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              division === "all"
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            All
          </button>
          {divisions.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDivision(d)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                division === d
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-background text-muted-foreground hover:bg-muted",
              )}
            >
              {d}
            </button>
          ))}
        </div>
      ) : null}

      <ul
        className={cn(
          "divide-y divide-primary/10 overflow-auto",
          showAll ? "max-h-[420px]" : "max-h-64",
        )}
      >
        {visible.map((r, i) => {
          const pos = filtered.findIndex((x) => x.name === r.name) + 1;
          const delta = deltas.get(r.name);
          const atCut = pos === cutSafe;
          const isHot = hotName === r.name;
          const gap = r.total - leaderTotal;
          return (
            <React.Fragment key={`${r.name}:${i}`}>
              <li
                className={cn(
                  "flex items-center gap-2 px-3 py-1 text-xs",
                  r.isMe ? "bg-primary/10" : "",
                  pos <= cutSafe ? "" : "opacity-70",
                )}
              >
                <span className="w-5 text-right tabular-nums text-muted-foreground">{pos}</span>
                <span className="w-3">
                  {delta != null && delta !== 0 ? (
                    delta > 0 ? (
                      <ChevronUp className="h-3 w-3 text-primary" aria-label={`Up ${delta}`} />
                    ) : (
                      <ChevronDown
                        className="h-3 w-3 text-destructive"
                        aria-label={`Down ${Math.abs(delta)}`}
                      />
                    )
                  ) : null}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-1 truncate">
                  <span className="truncate">{r.name}</span>
                  {r.isMe ? (
                    <span className="text-[10px] font-semibold text-primary">YOU</span>
                  ) : null}
                  {r.division && division === "all" ? (
                    <span className="rounded-full border border-border bg-background px-1 py-[1px] text-[9px] font-semibold uppercase text-muted-foreground">
                      {r.division}
                    </span>
                  ) : null}
                  {isHot ? (
                    <span
                      className="inline-flex items-center gap-0.5 rounded-full bg-warning/15 px-1 py-[1px] text-[9px] font-semibold uppercase text-warning"
                      title="Hot round"
                    >
                      <Flame className="h-2.5 w-2.5" /> Hot
                    </span>
                  ) : null}
                </span>
                <span
                  className="w-8 text-right tabular-nums text-muted-foreground"
                  title="Holes played"
                >
                  {r.thru}
                </span>
                <span
                  className="w-10 text-right tabular-nums text-muted-foreground"
                  title="Strokes behind leader"
                >
                  {pos === 1 || gap === 0 ? "—" : `+${gap}`}
                </span>
                <span className="w-9 text-right tabular-nums font-semibold">{r.total}</span>
                <span
                  className={cn(
                    "w-10 text-right tabular-nums font-semibold",
                    r.toPar < 0
                      ? "text-primary"
                      : r.toPar > 0
                        ? "text-destructive"
                        : "text-muted-foreground",
                  )}
                >
                  {r.toPar === 0 ? "E" : r.toPar > 0 ? `+${r.toPar}` : r.toPar}
                </span>
              </li>
              {atCut && !query ? (
                <li
                  className="flex items-center gap-2 border-t border-dashed border-warning/60 bg-warning/10 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning"
                  aria-hidden
                >
                  <Scissors className="h-3 w-3" /> Projected cut · top {cutSafe}
                </li>
              ) : null}
            </React.Fragment>
          );
        })}
        {!filtered.length ? (
          <li className="px-3 py-4 text-center text-xs text-muted-foreground">
            No players match “{query}”.
          </li>
        ) : null}
      </ul>

      <div className="flex items-center justify-between border-t border-primary/20 bg-background/60 px-2 py-1 text-[10px] text-muted-foreground">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[11px]"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? "Show top 25" : `Show all ${filtered.length}`}
        </Button>
        <Link
          to="/events"
          className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] hover:bg-muted"
        >
          Events library <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
