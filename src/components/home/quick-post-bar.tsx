import { useEffect, useState } from "react";
import { Dumbbell, HeartHandshake, Swords, Target, TrendingUp, Trophy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { ShareToFeedButton } from "@/components/feed/share-to-feed-button";
import {
  duelDraft,
  eventDraft,
  practiceDraft,
  ratingDraft,
  resultDraft,
  roundDraft,
  type ShareDraft,
} from "@/lib/share-to-feed";

type QuickPost = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  draft: ShareDraft;
};

/**
 * One-click posting row above the composer.
 * Only shows the shortcuts we actually have data for, so nothing is a dead end.
 */
export function QuickPostBar({
  userId,
  onPosted,
  header,
}: {
  userId: string | null;
  onPosted?: () => void;
  /** Optional section header rendered only when shortcuts exist, so an empty bar leaves no orphan heading. */
  header?: React.ReactNode;
}) {
  const [items, setItems] = useState<QuickPost[] | null>(null);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      return;
    }
    let alive = true;
    (async () => {
      const next: QuickPost[] = [];
      try {
        const [rounds, rating, duels, events] = await Promise.all([
          supabase
            .from("external_rounds")
            .select(
              "course_name, layout_name, event_name, played_on, score, to_par, round_rating, place, field_size, division",
            )
            .eq("user_id", userId)
            .order("played_on", { ascending: false })
            .limit(6),
          supabase.rpc("player_rating_average", { _user_id: userId }),
          supabase
            .from("duel_participants")
            .select(
              "duel_id, game_duels!inner(id, title, arena, status, winner_id, wager_xp, completed_at)",
            )
            .eq("user_id", userId)
            .eq("game_duels.status", "completed")
            .order("updated_at", { ascending: false })
            .limit(1),
          supabase
            .from("community_events")
            .select("id, title, kind, location, starts_at, host_id, status")
            .eq("host_id", userId)
            .gte("starts_at", new Date().toISOString())
            .order("starts_at", { ascending: true })
            .limit(1),
        ]);

        const lastRound = (rounds.data ?? [])[0];
        if (lastRound) {
          next.push({
            key: "round",
            label: "Post last round",
            icon: Target,
            draft: roundDraft(lastRound),
          });
        }

        const ratingValue = typeof rating.data === "number" ? rating.data : null;
        if (ratingValue) {
          const counted = (rounds.data ?? []).filter((r) => r.round_rating).length;
          next.push({
            key: "rating",
            label: "Post ratings update",
            icon: TrendingUp,
            draft: ratingDraft({ rating: ratingValue, roundsCounted: counted || null }),
          });
        }

        const faceOff = (rounds.data ?? []).find((r) => r.event_name && r.place);
        if (faceOff) {
          next.push({
            key: "result",
            label: "Share results",
            icon: Trophy,
            draft: resultDraft({
              eventName: faceOff.event_name!,
              division: faceOff.division,
              place: faceOff.place,
              toPar: faceOff.to_par,
              fieldSize: faceOff.field_size,
              courseName: faceOff.course_name,
            }),
          });
        }

        const duelRow = (duels.data ?? [])[0] as
          | {
              game_duels: {
                id: string;
                title: string;
                arena: string | null;
                winner_id: string | null;
                wager_xp: number | null;
              };
            }
          | undefined;
        if (duelRow?.game_duels) {
          const d = duelRow.game_duels;
          next.push({
            key: "duel",
            label: "Share arena battle",
            icon: Swords,
            draft: duelDraft({
              title: d.title,
              arena: d.arena,
              won: d.winner_id === userId,
              wagerXp: d.wager_xp,
            }),
          });
        }

        const outreach = (events.data ?? [])[0];
        if (outreach) {
          next.push({
            key: "outreach",
            label: "Share community outreach",
            icon: HeartHandshake,
            draft: eventDraft(outreach),
          });
        }

        const practice = await latestPracticeDraft(userId);
        if (practice) {
          next.push({
            key: "practice",
            label: "Post practice session",
            icon: Dumbbell,
            draft: practice,
          });
        }
      } catch {
        /* quick posts are a convenience — never block the feed */
      }
      if (alive) setItems(next);
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  return null;
}

/** Most recent practice session (range or putting) as a ready-to-post draft. */
async function latestPracticeDraft(userId: string): Promise<ShareDraft | null> {
  const [range, putting] = await Promise.all([
    supabase
      .from("range_sessions")
      .select("id, started_at, location")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(1),
    supabase
      .from("putting_sessions")
      .select("id, started_at, location")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(1),
  ]);

  const r = (range.data ?? [])[0];
  const p = (putting.data ?? [])[0];
  const useRange = !!r && (!p || (r.started_at ?? "") >= (p.started_at ?? ""));
  const session = useRange ? r : p;
  if (!session) return null;

  if (useRange) {
    const { count } = await supabase
      .from("range_throws")
      .select("id", { count: "exact", head: true })
      .eq("session_id", session.id);
    if (!count) return null;
    return practiceDraft({
      kind: "range",
      reps: count,
      location: session.location,
      startedAt: session.started_at,
    });
  }

  const { data: putts } = await supabase
    .from("putting_putts")
    .select("made")
    .eq("session_id", session.id)
    .limit(2000);
  const rows = putts ?? [];
  if (rows.length === 0) return null;
  const made = rows.filter((x) => x.made).length;
  return practiceDraft({
    kind: "putting",
    reps: rows.length,
    makePct: Math.round((made / rows.length) * 100),
    location: session.location,
    startedAt: session.started_at,
  });
}
