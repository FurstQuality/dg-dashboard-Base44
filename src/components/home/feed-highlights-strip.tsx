import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Radio, Trophy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

/** Strips a trailing "#12345" so tracked players show a clean display name. */
const cleanPdgaName = (name: string | null | undefined) =>
  (name ?? "").replace(/\s*#\s*\d+\s*$/, "").trim() || null;

type Leader = {
  key: string;
  name: string;
  division: string | null;
  toPar: number | null;
  thru: number | null;
  place: number | null;
};

const parLabel = (toPar: number | null) => {
  if (toPar === null) return "E";
  if (toPar === 0) return "E";
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
};

/**
 * Live highlights from the viewer's Tournament Tracker crews: who is on a card
 * right now and how they stand. Renders nothing when no tracked round is live.
 */
export function FeedHighlightsStrip({ userId }: { userId?: string | null }) {
  const [leaders, setLeaders] = useState<Leader[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setLeaders([]);
      return;
    }

    const load = async () => {
      const { data: groups } = await supabase
        .from("tracker_groups")
        .select("id")
        .eq("owner_id", userId)
        .limit(20);
      const groupIds = (groups ?? []).map((g) => g.id);
      if (cancelled) return;
      if (groupIds.length === 0) {
        setLeaders([]);
        return;
      }

      const { data: members } = await supabase
        .from("tracker_group_members")
        .select("pdga_number")
        .in("group_id", groupIds)
        .limit(300);
      const numbers = [...new Set((members ?? []).map((m) => m.pdga_number).filter(Boolean))];
      if (cancelled) return;
      if (numbers.length === 0) {
        setLeaders([]);
        return;
      }

      // Only rounds that have started and are not finished count as live.
      const { data: scores } = await supabase
        .from("tracker_live_scores")
        .select(
          "pdga_number, player_name, division, to_par, thru, running_place, place, updated_at",
        )
        .in("pdga_number", numbers)
        .eq("round_started", true)
        .eq("completed", false)
        .order("updated_at", { ascending: false })
        .limit(60);
      if (cancelled) return;

      const seen = new Set<string>();
      const rows: Leader[] = [];
      for (const s of scores ?? []) {
        const key = String(s.pdga_number ?? "");
        if (!key || seen.has(key)) continue;
        seen.add(key);
        rows.push({
          key,
          name: cleanPdgaName(s.player_name) ?? `#${key}`,
          division: s.division ?? null,
          toPar: s.to_par ?? null,
          thru: s.thru ?? null,
          place: s.running_place ?? s.place ?? null,
        });
      }
      rows.sort((a, b) => (a.toPar ?? 99) - (b.toPar ?? 99));
      setLeaders(rows.slice(0, 4));
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (leaders === null) return <Skeleton className="h-16 w-full rounded-2xl" />;
  if (leaders.length === 0) return null;

  return (
    <section
      aria-label="Live tracker highlights"
      className="rounded-2xl border border-border bg-card p-3"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Radio className="h-3.5 w-3.5 text-primary" />
          Your crew is on the card
        </h2>
        <Link to="/tracker" className="text-xs font-medium text-primary hover:underline">
          Open tracker
        </Link>
      </div>
      <p className="mb-2 text-[12px] leading-snug text-muted-foreground">
        Live scoring for players and events you track, refreshed while their round is in progress.
      </p>
      <ul className="flex gap-2 flex-wrap pb-1">
        {leaders.map((l) => (
          <li
            key={l.key}
            className="min-w-[150px] flex-1 rounded-xl border border-border/70 bg-background/60 px-3 py-2"
          >
            <p className="truncate text-sm font-semibold">{l.name}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{parLabel(l.toPar)}</span>
              {l.thru ? <span>thru {l.thru}</span> : null}
              {l.place ? (
                <span className="flex items-center gap-0.5">
                  <Trophy className="h-3 w-3" />
                  {l.place}
                </span>
              ) : null}
            </p>
            {l.division ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground">{l.division}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
