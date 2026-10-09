/** DGD leaderboards: overall, or one Tier at a time — always ranked by DGD Rating, never by a Rating+Tier mix. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TIERS, TIER_LABEL, type Tier } from "@/lib/dgd-tier/engine";
import { DgdBadge } from "./dgd-badge";

type Row = { rank: number; user_id: string; username: string | null; display_name: string | null; dgd_rating: number | null; tier: Tier; eligible_rounds: number | null };

export function DgdLeaderboard({ meId }: { meId?: string | null }) {
  const [tier, setTier] = useState<Tier | null>(null);
  const q = useQuery({
    queryKey: ["dgd-leaderboard", tier],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_dgd_leaderboard", { _tier: tier, _limit: 50 });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const rows = q.data ?? [];
  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5" aria-label="DGD leaderboard">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Trophy className="h-4 w-4 text-primary" aria-hidden />DGD leaderboard</h3>
          <p className="text-sm text-muted-foreground">Ranked by DGD Rating. Pick a Tier to compare players with similar experience.</p>
        </div>
        <div className="flex gap-1 flex-wrap" role="tablist">
          {[null, ...TIERS].map((t) => (
            <button
              key={t ?? "all"}
              role="tab"
              aria-selected={tier === t}
              onClick={() => setTier(t as Tier | null)}
              className={`shrink-0 rounded-full border px-3 py-1 text-sm ${tier === t ? "border-primary bg-primary/15 font-semibold" : "border-border text-muted-foreground hover:text-foreground"}`}
            >
              {t ? TIER_LABEL[t as Tier] : "Overall"}
            </button>
          ))}
        </div>
      </div>
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading the leaderboard…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{tier ? `No ${TIER_LABEL[tier]} players with a DGD Rating yet.` : "No rated players yet. Ratings appear once rounds are processed."}</p>
      ) : (
        <ol className="divide-y divide-border/60">
          {rows.map((r) => (
            <li key={r.user_id} className={`flex items-center gap-3 py-2 ${r.user_id === meId ? "rounded-lg bg-primary/10 px-2" : ""}`}>
              <span className="w-8 text-right text-sm tabular-nums text-muted-foreground">{r.rank}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {r.username ? (
                  <Link to="/players/$username" params={{ username: r.username }} className="hover:underline">{r.display_name ?? r.username}</Link>
                ) : (r.display_name ?? "Player")}
              </span>
              <DgdBadge size="sm" tier={r.tier} rating={r.dgd_rating} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
