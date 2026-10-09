/**
 * Shared entity: notifications.
 *
 * Canonical queryOptions for the current user's notification feed. Reads
 * profile data for actors in a second batched query and merges them into
 * a single denormalized row for UI consumption.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type NotificationRow = {
  id: string;
  type: string;
  actor_id: string | null;
  post_id: string | null;
  created_at: string;
  read_at: string | null;
  /** Type-specific payload (e.g. tracked event name for "event" rows). */
  data: Record<string, unknown> | null;
  actor: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

export function notificationsQueryOptions(userId: string | null | undefined, limit = 60) {
  return queryOptions({
    queryKey: ["notifications", userId, limit] as const,
    enabled: !!userId,
    staleTime: 15_000,
    queryFn: async (): Promise<NotificationRow[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("notifications")
        .select("id, type, actor_id, post_id, created_at, read_at, data")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error || !data) return [];

      const actorIds = [...new Set(data.map((n) => n.actor_id).filter(Boolean))] as string[];
      const { data: actors } = actorIds.length
        ? await supabase
            .from("profiles")
            .select("id, username, display_name, avatar_url")
            .in("id", actorIds)
        : { data: [] as NonNullable<NotificationRow["actor"]>[] };
      const map = new Map((actors ?? []).map((a) => [a.id, a] as const));

      return data.map((n) => ({
        ...(n as Omit<NotificationRow, "actor">),
        actor: n.actor_id ? (map.get(n.actor_id) ?? null) : null,
      }));
    },
  });
}

export async function markAllNotificationsRead(userId: string) {
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
}
