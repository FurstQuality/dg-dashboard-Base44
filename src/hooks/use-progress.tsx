import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { calcLevel } from "@/lib/gamification-utils";
import { channelNonce } from "@/lib/realtime";

export type UserProgress = {
  user_id: string;
  xp: number;
  level: number;
  coins: number;
  streak_days: number;
  longest_streak: number;
  last_active_date: string | null;
  title: string;
};

export function useUserProgress(userId: string | undefined) {
  const [progress, setProgress] = useState<UserProgress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setProgress(null);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("user_progress")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (!alive) return;
      if (data) setProgress(data as UserProgress);
      else {
        // seed a row so triggers have somewhere to update
        await supabase.from("user_progress").insert({ user_id: userId }).select().maybeSingle();
        const { data: after } = await supabase
          .from("user_progress")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();
        if (alive && after) setProgress(after as UserProgress);
      }
      if (alive) setLoading(false);
    })();

    const channel = supabase
      .channel(`user_progress:${userId}:${channelNonce()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_progress", filter: `user_id=eq.${userId}` },
        (payload) => {
          const next = payload.new as UserProgress;
          setProgress((prev) => {
            if (prev && next && calcLevel(next.xp) > calcLevel(prev.xp)) {
              const newLevel = calcLevel(next.xp);
              toast.success(`Level ${newLevel} unlocked!`, {
                description: "Keep grinding to reach the next rank.",
                duration: 5000,
              });
              try {
                confetti({ particleCount: 120, spread: 70, origin: { y: 0.7 } });
              } catch {
                // Confetti is decorative; ignore render failures.
              }
            }
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return { progress, loading };
}

// Listens for new achievement unlocks and shows a celebratory toast.
export function useAchievementUnlockListener(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    const seen = new Set<string>();
    // Seed with existing to avoid replaying on first load
    (async () => {
      const { data } = await supabase
        .from("user_achievements")
        .select("achievement_key")
        .eq("user_id", userId);
      if (mounted && data) data.forEach((r) => seen.add(r.achievement_key));
    })();

    const channel = supabase
      .channel(`user_achievements:${userId}:${channelNonce()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "user_achievements",
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const key = (payload.new as { achievement_key: string }).achievement_key;
          if (seen.has(key)) return;
          seen.add(key);
          const { data: ach } = await supabase
            .from("achievements")
            .select("name, description, tier, xp_reward")
            .eq("key", key)
            .maybeSingle();
          if (!ach) return;
          toast.success(`🏆 ${ach.name}`, {
            description: `${ach.description} · +${ach.xp_reward} XP`,
            duration: 6000,
          });
          try {
            confetti({ particleCount: 90, spread: 60, origin: { y: 0.7 } });
          } catch {
            // Confetti is decorative; ignore render failures.
          }
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [userId]);
}
