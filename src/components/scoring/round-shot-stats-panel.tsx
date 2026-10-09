import { channelNonce } from "@/lib/realtime";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3 } from "lucide-react";

export interface RoundShotStatsPanelProps {
  roundId: string | null;
  roundPlayerId: string | null;
  userId: string | null;
}

type Row = {
  hole_number: number;
  c1_in_reg: boolean | null;
  c2_in_reg: boolean | null;
  fairway_hit: boolean | null;
  scramble: boolean | null;
  drive_distance_ft: number | null;
  drive_disc_id: string | null;
  putt_disc_id: string | null;
  c1_putts_made: number | null;
  c1_putts_missed: number | null;
  c2_putts_made: number | null;
  c2_putts_missed: number | null;
};

export function RoundShotStatsPanel({ roundId, roundPlayerId, userId }: RoundShotStatsPanelProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [discNames, setDiscNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    if (!roundId || !roundPlayerId) {
      setRows([]);
      return;
    }
    const load = async () => {
      const { data } = await supabase
        .from("round_scores")
        .select(
          "hole_number, c1_in_reg, c2_in_reg, fairway_hit, scramble, drive_distance_ft, drive_disc_id, putt_disc_id, c1_putts_made, c1_putts_missed, c2_putts_made, c2_putts_missed",
        )
        .eq("round_id", roundId)
        .eq("round_player_id", roundPlayerId);
      if (!cancelled) setRows((data ?? []) as Row[]);
    };
    load();
    const ch = supabase
      .channel(`shot-stats-${roundId}-${roundPlayerId}-${channelNonce()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "round_scores",
          filter: `round_player_id=eq.${roundPlayerId}`,
        },
        load,
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [roundId, roundPlayerId]);

  useEffect(() => {
    let cancelled = false;
    if (!userId) return;
    (async () => {
      const { data } = await supabase
        .from("user_discs")
        .select("id, nickname, mold:disc_molds(name)")
        .eq("user_id", userId);
      if (cancelled) return;
      const m = new Map<string, string>();
      for (const d of (data ?? []) as any[]) {
        m.set(d.id, d.mold?.name ?? d.nickname ?? "Disc");
      }
      setDiscNames(m);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const stats = useMemo(() => {
    let fwAttempts = 0,
      fwHits = 0;
    let c1Reg = 0,
      c2Reg = 0,
      regAttempts = 0;
    let c1Made = 0,
      c1Miss = 0,
      c2Made = 0,
      c2Miss = 0;
    let scrambleOpps = 0,
      scrambleSaves = 0;
    const drives: number[] = [];
    const driveDiscUse = new Map<string, number>();
    const puttDiscUse = new Map<string, number>();

    for (const r of rows) {
      if (r.fairway_hit !== null) {
        fwAttempts++;
        if (r.fairway_hit) fwHits++;
      }
      if (r.c1_in_reg !== null || r.c2_in_reg !== null) {
        regAttempts++;
        if (r.c1_in_reg) c1Reg++;
        if (r.c2_in_reg || r.c1_in_reg) c2Reg++;
      }
      c1Made += r.c1_putts_made ?? 0;
      c1Miss += r.c1_putts_missed ?? 0;
      c2Made += r.c2_putts_made ?? 0;
      c2Miss += r.c2_putts_missed ?? 0;
      if (r.fairway_hit === false) {
        scrambleOpps++;
        if (r.scramble) scrambleSaves++;
      }
      if (r.drive_distance_ft && r.drive_distance_ft > 0) drives.push(r.drive_distance_ft);
      if (r.drive_disc_id)
        driveDiscUse.set(r.drive_disc_id, (driveDiscUse.get(r.drive_disc_id) ?? 0) + 1);
      if (r.putt_disc_id)
        puttDiscUse.set(r.putt_disc_id, (puttDiscUse.get(r.putt_disc_id) ?? 0) + 1);
    }

    const avgDrive = drives.length
      ? Math.round(drives.reduce((s, n) => s + n, 0) / drives.length)
      : 0;
    const maxDrive = drives.length ? Math.max(...drives) : 0;
    const c1Att = c1Made + c1Miss;
    const c2Att = c2Made + c2Miss;

    const topDrives = [...driveDiscUse.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const topPutts = [...puttDiscUse.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);

    return {
      fwAttempts,
      fwHits,
      c1Reg,
      c2Reg,
      regAttempts,
      c1Made,
      c1Miss,
      c2Made,
      c2Miss,
      c1Att,
      c2Att,
      scrambleOpps,
      scrambleSaves,
      drives: drives.length,
      avgDrive,
      maxDrive,
      topDrives,
      topPutts,
    };
  }, [rows]);

  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

  return (
    <div className="rounded-xl border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span className="flex items-center gap-1">
          <BarChart3 className="h-3 w-3" /> Round stats
        </span>
        <span>{rows.length} holes logged</span>
      </div>
      <div className="divide-y divide-border/60 text-sm">
        <StatRow
          label="Fairway hits"
          value={`${stats.fwHits}/${stats.fwAttempts}`}
          sub={`${pct(stats.fwHits, stats.fwAttempts)}%`}
        />
        <StatRow
          label="C1 in reg"
          value={`${stats.c1Reg}/${stats.regAttempts}`}
          sub={`${pct(stats.c1Reg, stats.regAttempts)}%`}
        />
        <StatRow
          label="C2 in reg"
          value={`${stats.c2Reg}/${stats.regAttempts}`}
          sub={`${pct(stats.c2Reg, stats.regAttempts)}%`}
        />
        <StatRow
          label="C1 putting"
          value={`${stats.c1Made}/${stats.c1Att}`}
          sub={`${pct(stats.c1Made, stats.c1Att)}%`}
          tone="ok"
        />
        <StatRow
          label="C2 putting"
          value={`${stats.c2Made}/${stats.c2Att}`}
          sub={`${pct(stats.c2Made, stats.c2Att)}%`}
          tone="ok"
        />
        <StatRow
          label="Scramble"
          value={`${stats.scrambleSaves}/${stats.scrambleOpps}`}
          sub={`${pct(stats.scrambleSaves, stats.scrambleOpps)}%`}
        />
        <StatRow
          label="Avg drive"
          value={stats.avgDrive ? `${stats.avgDrive} ft` : "—"}
          sub={stats.maxDrive ? `max ${stats.maxDrive} ft` : ""}
        />

        {stats.topDrives.length ? (
          <div className="px-3 py-2">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              Most-used drivers
            </div>
            <ul className="space-y-0.5">
              {stats.topDrives.map(([id, n]) => (
                <li key={id} className="flex justify-between text-xs">
                  <span className="truncate">{discNames.get(id) ?? "Disc"}</span>
                  <span className="tabular-nums text-muted-foreground">{n}×</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {stats.topPutts.length ? (
          <div className="px-3 py-2">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              Most-used putters
            </div>
            <ul className="space-y-0.5">
              {stats.topPutts.map(([id, n]) => (
                <li key={id} className="flex justify-between text-xs">
                  <span className="truncate">{discNames.get(id) ?? "Disc"}</span>
                  <span className="tabular-nums text-muted-foreground">{n}×</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {rows.length === 0 ? (
          <div className="px-3 py-3 text-xs text-muted-foreground">
            Log a drive or a putt on any hole to start building round stats.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatRow({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ok";
}) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex items-baseline gap-2">
        <span
          className={"tabular-nums text-sm font-semibold " + (tone === "ok" ? "text-primary" : "")}
        >
          {value}
        </span>
        {sub ? <span className="tabular-nums text-[10px] text-muted-foreground">{sub}</span> : null}
      </span>
    </div>
  );
}
