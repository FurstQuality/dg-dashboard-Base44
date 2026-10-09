/**
 * Tracker event scoring panel.
 *
 * While an event is in progress, this shows the latest running round per crew
 * member (place, to-par, thru). Once the event is over (event_date in the past
 * OR every player's newest row is completed), it flips into a "Final results"
 * view that lists every round each crew member played — score, to par, and
 * a season/final total — so friends can see how their crew scored after the
 * event wraps.
 */
import { formatToPar as fmtToPar } from "@/lib/score-display";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { RefreshCw, Radio, Link2, Loader2, ExternalLink, Trophy } from "lucide-react";
import {
  listTrackerEventLive,
  refreshTrackerEventLive,
  setTrackerEventLiveUrl,
  extractPdgaTournId,
  type TrackerLiveScore,
} from "@/lib/tracker-live.functions";
import type { TrackerMember } from "@/lib/tracker.functions";
import { crewSwatchStyle } from "@/lib/tracker-colors";

type Props = {
  eventId: string;
  eventDate?: string | null;
  pdgaEventRef: string | null;
  liveScoringUrl: string | null;
  liveLastSyncedAt: string | null;
  liveCurrentRound: number | null;
  members: TrackerMember[];
  onUrlSaved?: (url: string | null) => void;
};

function fmtSyncedAt(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}


export function LiveScoringPanel({
  eventId,
  eventDate,
  pdgaEventRef,
  liveScoringUrl,
  liveLastSyncedAt,
  liveCurrentRound,
  members,
  onUrlSaved,
}: Props) {
  const list = useServerFn(listTrackerEventLive);
  const refresh = useServerFn(refreshTrackerEventLive);
  const setUrl = useServerFn(setTrackerEventLiveUrl);

  const [rows, setRows] = useState<TrackerLiveScore[]>([]);
  const [loading, setLoading] = useState(false);
  const [urlDraft, setUrlDraft] = useState(liveScoringUrl ?? "");
  const [showUrl, setShowUrl] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(liveLastSyncedAt);
  const [savingUrl, setSavingUrl] = useState(false);
  const autoSyncedRef = useRef(false);

  useEffect(() => setUrlDraft(liveScoringUrl ?? ""), [liveScoringUrl]);
  useEffect(() => setLastSyncedAt(liveLastSyncedAt), [liveLastSyncedAt]);

  const canSync = useMemo(
    () => !!(extractPdgaTournId(liveScoringUrl) || extractPdgaTournId(pdgaEventRef)),
    [liveScoringUrl, pdgaEventRef],
  );

  const load = useCallback(async () => {
    try {
      const data = await list({ data: { eventId } });
      setRows(data);
    } catch {
      // Silent — the panel just stays empty.
    }
  }, [list, eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const memberByPdga = useMemo(() => {
    const m = new Map<string, TrackerMember>();
    for (const mem of members) m.set(String(mem.pdga_number), mem);
    return m;
  }, [members]);

  // Group all stored rows by player and by round.
  const byPdga = useMemo(() => {
    const map = new Map<string, TrackerLiveScore[]>();
    for (const r of rows) {
      const list = map.get(r.pdga_number) ?? [];
      list.push(r);
      map.set(r.pdga_number, list);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.round_number ?? 0) - (b.round_number ?? 0));
    }
    return map;
  }, [rows]);

  const latestByPdga = useMemo(() => {
    const out: TrackerLiveScore[] = [];
    for (const arr of byPdga.values()) {
      const last = arr[arr.length - 1];
      if (last) out.push(last);
    }
    return out.sort((a, b) => (a.running_place ?? 9999) - (b.running_place ?? 9999));
  }, [byPdga]);

  const today = new Date().toISOString().slice(0, 10);
  const dateIsPast = !!eventDate && eventDate < today;
  // If any player has a completed newest round AND every row is completed, treat as done.
  const allCompleted = latestByPdga.length > 0 && latestByPdga.every((r) => r.completed);
  const isFinal = dateIsPast || allCompleted;

  const onRefresh = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      setLoading(true);
      try {
        const res = (await refresh({ data: { eventId } })) as {
          players: number;
          latestRound: number;
        };
        await load();
        setLastSyncedAt(new Date().toISOString());
        if (!opts.silent) {
          if (res.players === 0) {
            toast.info("No live rows yet — the event may not have started scoring.");
          } else {
            toast.success(
              `Scores updated for ${res.players} card${res.players === 1 ? "" : "s"} · R${res.latestRound}`,
            );
          }
        }
      } catch (e) {
        if (!opts.silent) toast.error(e instanceof Error ? e.message : "Sync failed");
      } finally {
        setLoading(false);
      }
    },
    [eventId, load, refresh],
  );

  // Auto-sync once on mount for past/completed events so friends see final
  // results without having to click Refresh.
  useEffect(() => {
    if (autoSyncedRef.current) return;
    if (!canSync) return;
    const shouldAuto = dateIsPast && rows.length === 0;
    if (!shouldAuto) return;
    autoSyncedRef.current = true;
    void onRefresh({ silent: true });
  }, [canSync, dateIsPast, rows.length, onRefresh]);

  async function onSaveUrl() {
    setSavingUrl(true);
    try {
      const v = urlDraft.trim();
      await setUrl({ data: { eventId, liveUrl: v || null } });
      toast.success(v ? "Live scoring URL saved." : "Live scoring URL cleared.");
      onUrlSaved?.(v || null);
      setShowUrl(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save URL");
    } finally {
      setSavingUrl(false);
    }
  }

  const hasAny = latestByPdga.length > 0;
  const roundsPlayed = useMemo(() => {
    const nums = new Set<number>();
    for (const r of rows) if (r.round_number != null) nums.add(r.round_number);
    return Array.from(nums).sort((a, b) => a - b);
  }, [rows]);

  return (
    <div className="border-t bg-muted/20 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1 font-semibold">
          {isFinal ? (
            <Trophy className="h-3 w-3 text-amber-500" />
          ) : (
            <Radio className="h-3 w-3 text-primary" />
          )}
          {isFinal ? "Final results" : "Live scoring"}
        </span>
        {liveCurrentRound != null && !isFinal && (
          <Badge variant="outline" className="h-4 px-1 text-[9px]">
            R{liveCurrentRound}
          </Badge>
        )}
        {isFinal && roundsPlayed.length > 0 && (
          <Badge variant="outline" className="h-4 px-1 text-[9px]">
            {roundsPlayed.length} round{roundsPlayed.length === 1 ? "" : "s"}
          </Badge>
        )}
        <span className="text-muted-foreground">Synced {fmtSyncedAt(lastSyncedAt)}</span>
        <div className="ml-auto flex items-center gap-1">
          {liveScoringUrl && (
            <a
              href={liveScoringUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Open
            </a>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-1.5 text-[10px]"
            onClick={() => setShowUrl((v) => !v)}
          >
            <Link2 className="h-3 w-3" />
            {liveScoringUrl ? "Change URL" : "Set URL"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-6 gap-1 px-1.5 text-[10px]"
            onClick={() => onRefresh()}
            disabled={loading || !canSync}
            title={
              canSync
                ? isFinal
                  ? "Pull final results from PDGA"
                  : "Refresh live scores"
                : "Paste a PDGA event or live URL first"
            }
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            {isFinal ? "Sync final" : "Refresh"}
          </Button>
        </div>
      </div>

      {showUrl && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input
            className="h-7 flex-1 min-w-[220px] text-[11px]"
            placeholder="https://www.pdga.com/tour/event/98838 or live scoring URL"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
          />
          <Button size="sm" className="h-7 text-[11px]" onClick={onSaveUrl} disabled={savingUrl}>
            {savingUrl ? "Saving..." : "Save"}
          </Button>
          {liveScoringUrl && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px]"
              onClick={() => {
                setUrlDraft("");
                void onSaveUrl();
              }}
            >
              Clear
            </Button>
          )}
        </div>
      )}

      {hasAny ? (
        isFinal ? (
          // ------ FINAL RESULTS: per-player round-by-round breakdown ------
          <div className="mt-2 grid gap-1">
            {latestByPdga.map((last) => {
              const member = memberByPdga.get(last.pdga_number);
              const name = member?.display_name || last.player_name || `#${last.pdga_number}`;
              const initials = name
                .split(/\s+/)
                .filter(Boolean)
                .map((w) => w[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();
              const playerRounds = byPdga.get(last.pdga_number) ?? [];
              const total =
                last.total ?? (playerRounds.reduce((s, r) => s + (r.round_score ?? 0), 0) || null);
              return (
                <div key={last.id} className="rounded border bg-background/70 px-2 py-1.5">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[9px] font-bold text-black"
                      style={crewSwatchStyle(member?.color)}
                    >
                      {initials}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {name}
                      {last.division && (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          {last.division}
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {last.running_place != null ? `#${last.running_place}` : ""}
                    </span>
                    <span
                      className={`text-right text-[11px] font-semibold tabular-nums ${(last.to_par ?? 0) < 0 ? "text-emerald-600 dark:text-emerald-400" : (last.to_par ?? 0) > 0 ? "text-orange-600 dark:text-orange-400" : ""}`}
                    >
                      {fmtToPar(last.to_par)}
                    </span>
                    <span className="w-10 text-right text-[11px] font-semibold tabular-nums">
                      {total ?? "—"}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1 pl-8 text-[10px] leading-tight">
                    {playerRounds.map((r) => (
                      <span
                        key={r.id}
                        className="inline-flex items-center gap-1 rounded border bg-background px-1.5 py-0.5"
                      >
                        <span className="font-semibold">R{r.round_number}</span>
                        <span
                          className={`tabular-nums font-semibold ${(r.round_to_par ?? 0) < 0 ? "text-emerald-600 dark:text-emerald-400" : (r.round_to_par ?? 0) > 0 ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground"}`}
                        >
                          {fmtToPar(r.round_to_par)}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {r.round_score ?? "—"}
                          {r.round_score != null && r.round_to_par != null ? ` · Par ${r.round_score - r.round_to_par}` : ""}
                        </span>
                        {!r.completed && (
                          <span className="text-muted-foreground italic">
                            {r.thru != null && r.thru > 0 ? `thru ${r.thru}` : "in progress"}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          // ------ LIVE / IN-PROGRESS: latest round per player ------
          <div className="mt-2 grid gap-1">
            {latestByPdga.map((r) => {
              const member = memberByPdga.get(r.pdga_number);
              const name = member?.display_name || r.player_name || `#${r.pdga_number}`;
              const total = r.total ?? 0;
              const thruLabel = r.completed
                ? "F"
                : r.thru != null && r.thru > 0
                  ? `${r.thru}`
                  : r.round_started
                    ? "•"
                    : "—";
              return (
                <div
                  key={r.id}
                  className="grid grid-cols-[26px_1fr_56px_44px_36px] items-center gap-2 rounded border bg-background/70 px-2 py-1 text-[11px]"
                >
                  <span className="text-center font-semibold">
                    {r.running_place != null ? `#${r.running_place}` : "—"}
                  </span>
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{name}</span>
                    {r.division && (
                      <span className="ml-1 text-[10px] text-muted-foreground">{r.division}</span>
                    )}
                  </span>
                  <span
                    className={`text-right font-semibold ${(r.to_par ?? 0) < 0 ? "text-emerald-600 dark:text-emerald-400" : (r.to_par ?? 0) > 0 ? "text-orange-600 dark:text-orange-400" : ""}`}
                  >
                    {fmtToPar(r.to_par)}
                  </span>
                  <span className="text-right tabular-nums">{total || "—"}</span>
                  <span className="text-right text-[10px] text-muted-foreground">
                    Thru {thruLabel}
                  </span>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <p className="mt-2 text-[10px] text-muted-foreground">
          {canSync
            ? isFinal
              ? "No scores stored yet. Hit Sync final to pull round-by-round results from PDGA."
              : "No live rows yet. Hit Refresh once cards start posting."
            : "Add this event's PDGA URL or paste a live scoring URL to enable sync."}
        </p>
      )}
    </div>
  );
}
