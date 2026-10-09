import { channelNonce } from "@/lib/realtime";
import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Minus, Plus, Save, RefreshCw, CloudOff, CloudUpload, Check } from "lucide-react";
import { PlayerLink } from "@/components/shared/entity-link";
import { getQueuedCount, syncOfflineQueue, subscribeOnlineFlush } from "@/lib/offline-queue";

type Round = {
  id: string;
  round_number: number;
  layout_id: string | null;
  course_id: string | null;
};
type Division = { id: string; code: string; name: string };
type Registration = {
  id: string;
  user_id: string;
  division_id: string;
  profile?: { username: string; display_name: string } | null;
};
type Hole = { number: number; par: number };
type ScoreRow = {
  registration_id: string;
  hole_number: number;
  strokes: number;
  penalties: number;
};

export function TdLiveScoring({
  rounds,
  divisions,
  regs,
}: {
  rounds: Round[];
  divisions: Division[];
  regs: Registration[];
}) {
  const scoreableRounds = rounds.filter((r) => r.layout_id);
  const [roundId, setRoundId] = useState<string>(scoreableRounds[0]?.id ?? "");
  const [holes, setHoles] = useState<Hole[]>([]);
  const [activeHole, setActiveHole] = useState<number>(1);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [dirty, setDirty] = useState<Record<string, number>>({}); // key: regId:hole → strokes
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [queued, setQueued] = useState(0);
  const [reloadTick, setReloadTick] = useState(0);

  const round = useMemo(() => rounds.find((r) => r.id === roundId) ?? null, [rounds, roundId]);
  const activePar = holes.find((h) => h.number === activeHole)?.par ?? 3;

  useEffect(() => {
    if (!round?.layout_id) return;
    const layoutId = round.layout_id;
    let alive = true;
    setLoading(true);
    (async () => {
      const [{ data: h }, { data: sc }] = await Promise.all([
        supabase.from("holes").select("number, par").eq("layout_id", layoutId).order("number"),
        supabase
          .from("tournament_scores")
          .select("registration_id, hole_number, strokes, penalties")
          .eq("round_id", round.id),
      ]);
      if (!alive) return;
      setHoles((h as Hole[]) ?? []);
      setScores((sc as ScoreRow[]) ?? []);
      setDirty({});
      setActiveHole(1);
      setLoading(false);
    })();

    // Live merge: any concurrent scoring by players/other TDs shows up immediately.
    const ch = supabase
      .channel(`td-live-${round.id}-${channelNonce()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tournament_scores",
          filter: `round_id=eq.${round.id}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as ScoreRow | null;
          if (!row) return;
          setScores((prev) => {
            const next = prev.filter(
              (s) =>
                !(s.registration_id === row.registration_id && s.hole_number === row.hole_number),
            );
            if (payload.eventType !== "DELETE") next.push(row);
            return next;
          });
        },
      )
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [round?.id, round?.layout_id, reloadTick]);

  // Offline queue reconciliation surface — TDs need to know if any scores are still queued locally.
  const refreshQueue = useCallback(async () => {
    const n = await getQueuedCount();
    setQueued(n);
  }, []);
  useEffect(() => {
    void refreshQueue();
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const unsub = subscribeOnlineFlush((r) => {
      void refreshQueue();
      if (r.synced > 0)
        toast.success(`Synced ${r.synced} queued score${r.synced === 1 ? "" : "s"}`);
    });
    const id = window.setInterval(() => void refreshQueue(), 5000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      unsub();
      window.clearInterval(id);
    };
  }, [refreshQueue]);

  async function forceReconcile() {
    const r = await syncOfflineQueue();
    await refreshQueue();
    setReloadTick((t) => t + 1);
    if (r.synced > 0) toast.success(`Synced ${r.synced} · reloaded latest scores`);
    else toast.success("Reloaded latest scores");
  }

  function currentStrokes(regId: string, hole: number): number | null {
    const dk = `${regId}:${hole}`;
    if (dirty[dk] != null) return dirty[dk];
    const s = scores.find((s) => s.registration_id === regId && s.hole_number === hole);
    return s ? s.strokes + s.penalties : null;
  }

  // Cumulative running totals across the round — TDs need standings context per row.
  const runningByReg = useMemo(() => {
    const map = new Map<string, { thru: number; total: number; toPar: number }>();
    for (const reg of regs) {
      let thru = 0;
      let total = 0;
      let parSum = 0;
      for (const h of holes) {
        const s = currentStrokes(reg.id, h.number);
        if (s == null) continue;
        thru += 1;
        total += s;
        parSum += h.par;
      }
      map.set(reg.id, { thru, total, toPar: total - parSum });
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regs, holes, scores, dirty]);

  function bump(regId: string, hole: number, delta: number) {
    setDirty((prev) => {
      const cur = prev[`${regId}:${hole}`] ?? currentStrokes(regId, hole) ?? activePar;
      const next = Math.max(1, Math.min(20, cur + delta));
      return { ...prev, [`${regId}:${hole}`]: next };
    });
  }

  function setPar(regId: string, hole: number) {
    setDirty((prev) => ({ ...prev, [`${regId}:${hole}`]: activePar }));
  }

  async function save() {
    if (!round) return;
    const entries = Object.entries(dirty);
    if (!entries.length) return;
    setSaving(true);
    const rows = entries.map(([key, strokes]) => {
      const [registration_id, holeStr] = key.split(":");
      return {
        round_id: round.id,
        registration_id,
        hole_number: Number(holeStr),
        strokes,
        penalties: 0,
      };
    });
    const { error } = await supabase.from("tournament_scores").upsert(rows, {
      onConflict: "round_id,registration_id,hole_number",
    });
    setSaving(false);
    if (error) {
      toast.error("Save failed", { description: error.message });
      return;
    }
    setDirty({});
    toast.success(`Saved ${rows.length} score${rows.length === 1 ? "" : "s"}`);
  }

  // Per-hole completion across the current round — helps TDs see progress and jump to gaps.
  const holeCompletion = useMemo(() => {
    const map = new Map<number, { scored: number; total: number }>();
    for (const h of holes) {
      let scored = 0;
      for (const r of regs) {
        if (currentStrokes(r.id, h.number) != null) scored += 1;
      }
      map.set(h.number, { scored, total: regs.length });
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holes, regs, scores, dirty]);

  if (scoreableRounds.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        Add a round with a layout to enable live scoring.
      </div>
    );
  }

  const dirtyCount = Object.keys(dirty).length;

  function jumpToNextGap() {
    const start = activeHole;
    const n = holes.length || 18;
    for (let i = 1; i <= n; i++) {
      const h = ((start - 1 + i) % n) + 1;
      const c = holeCompletion.get(h);
      if (c && c.scored < c.total) {
        setActiveHole(h);
        return;
      }
    }
    toast.success("Every hole has a score for every player");
  }

  const activeCompletion = holeCompletion.get(activeHole);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          {!online ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 font-medium text-destructive">
              <CloudOff className="h-3 w-3" /> Offline{queued > 0 ? ` · ${queued} queued` : ""}
            </span>
          ) : queued > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-500">
              <CloudUpload className="h-3 w-3 animate-pulse" /> Reconciling {queued}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-medium text-primary">
              <Check className="h-3 w-3" /> All synced
            </span>
          )}
          <span className="text-muted-foreground">
            Scores you enter here save straight to the tournament. Player devices sync their own
            scorecards on reconnect.
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={forceReconcile}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Reconcile & reload
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase text-muted-foreground">Round</span>
          <select
            value={roundId}
            onChange={(e) => setRoundId(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm"
          >
            {scoreableRounds.map((r) => (
              <option key={r.id} value={r.id}>
                Round {r.round_number}
              </option>
            ))}
          </select>
          <span className="ml-3 text-xs uppercase text-muted-foreground">Hole</span>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="outline"
              aria-label="Previous hole"
              onClick={() => setActiveHole((h) => Math.max(1, h - 1))}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <div className="min-w-[3rem] rounded-md border border-border bg-background px-2 py-1 text-center text-sm font-semibold tabular-nums">
              {activeHole}
            </div>
            <Button
              size="icon"
              variant="outline"
              aria-label="Next hole"
              onClick={() => setActiveHole((h) => Math.min(holes.length || 18, h + 1))}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <span className="ml-2 rounded-md bg-muted px-2 py-1 text-xs">Par {activePar}</span>
          {activeCompletion ? (
            <span className="rounded-md bg-muted px-2 py-1 text-xs tabular-nums text-muted-foreground">
              {activeCompletion.scored}/{activeCompletion.total} scored
            </span>
          ) : null}
          <Button size="sm" variant="outline" onClick={jumpToNextGap}>
            Next unscored hole
          </Button>
        </div>
        <Button size="sm" onClick={save} disabled={saving || dirtyCount === 0}>
          {saving ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1 h-4 w-4" />
          )}
          Save {dirtyCount > 0 ? `(${dirtyCount})` : ""}
        </Button>
      </div>

      {holes.length > 0 ? (
        <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-2">
          {holes.map((h) => {
            const c = holeCompletion.get(h.number);
            const ratio = c && c.total > 0 ? c.scored / c.total : 0;
            const full = ratio >= 1;
            const partial = ratio > 0 && ratio < 1;
            const isActive = h.number === activeHole;
            return (
              <button
                key={h.number}
                onClick={() => setActiveHole(h.number)}
                title={`Hole ${h.number} · ${c?.scored ?? 0}/${c?.total ?? 0}`}
                className={
                  "h-7 w-7 rounded-md border text-[11px] font-semibold tabular-nums transition " +
                  (isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : full
                      ? "border-primary/40 bg-primary/15 text-foreground"
                      : partial
                        ? "border-amber-500/40 bg-amber-500/10 text-foreground"
                        : "border-border bg-background text-muted-foreground")
                }
              >
                {h.number}
              </button>
            );
          })}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Loading live scores…
        </div>
      ) : (
        <div className="space-y-4">
          {divisions.map((d) => {
            const list = regs
              .filter((r) => r.division_id === d.id)
              .slice()
              .sort((a, b) => {
                const ra = runningByReg.get(a.id);
                const rb = runningByReg.get(b.id);
                if (!ra && !rb) return 0;
                if (!ra) return 1;
                if (!rb) return -1;
                if (rb.thru !== ra.thru) return rb.thru - ra.thru; // players thru more first
                return ra.toPar - rb.toPar; // then lower toPar first
              });
            if (!list.length) return null;
            return (
              <div key={d.id} className="rounded-xl border border-border bg-card">
                <div className="border-b border-border px-4 py-2 text-sm font-semibold">
                  {d.code} – {d.name}
                </div>
                <ul className="divide-y divide-border">
                  {list.map((r) => {
                    const strokes = currentStrokes(r.id, activeHole);
                    const isDirty = dirty[`${r.id}:${activeHole}`] != null;
                    const diff = strokes == null ? null : strokes - activePar;
                    const running = runningByReg.get(r.id);
                    return (
                      <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                        <div className="min-w-0 flex-1 truncate text-sm">
                          <PlayerLink username={r.profile?.username} userId={r.user_id}>
                            {r.profile?.display_name ?? "Player"}
                          </PlayerLink>
                          {running && running.thru > 0 ? (
                            <div className="mt-0.5 flex items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
                              <span>Thru {running.thru}</span>
                              <span>·</span>
                              <span>{running.total}</span>
                              <span
                                className={
                                  running.toPar < 0
                                    ? "font-semibold text-primary"
                                    : running.toPar > 0
                                      ? "font-semibold text-destructive"
                                      : "font-semibold"
                                }
                              >
                                {running.toPar === 0
                                  ? "E"
                                  : running.toPar > 0
                                    ? `+${running.toPar}`
                                    : running.toPar}
                              </span>
                            </div>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="outline"
                            aria-label="Subtract stroke"
                            onClick={() => bump(r.id, activeHole, -1)}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <button
                            onClick={() => setPar(r.id, activeHole)}
                            className={
                              "min-w-[3rem] rounded-md border px-2 py-1 text-center text-sm font-semibold tabular-nums " +
                              (isDirty
                                ? "border-primary bg-primary/10"
                                : "border-border bg-background")
                            }
                            title="Tap to set par"
                          >
                            {strokes ?? "—"}
                          </button>
                          <Button
                            size="icon"
                            variant="outline"
                            aria-label="Add stroke"
                            onClick={() => bump(r.id, activeHole, 1)}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <div
                          className={
                            "w-10 text-right text-xs tabular-nums " +
                            (diff == null
                              ? "text-muted-foreground"
                              : diff < 0
                                ? "text-primary"
                                : diff > 0
                                  ? "text-destructive"
                                  : "text-muted-foreground")
                          }
                        >
                          {diff == null ? "" : diff === 0 ? "E" : diff > 0 ? `+${diff}` : diff}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
