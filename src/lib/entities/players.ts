import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PlayerProfile = {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  home_course: string | null;
  location: string | null;
  pdga_number: string | null;
  pdga_rating: number | null;
};

/** Canonical read for a player profile by id. */
export function playerQueryOptions(id: string | null | undefined) {
  return queryOptions({
    queryKey: ["player", id],
    enabled: !!id,
    staleTime: 60_000,
    queryFn: async (): Promise<PlayerProfile | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, username, display_name, bio, avatar_url, cover_url, home_course, location, pdga_number, pdga_rating",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as PlayerProfile | null) ?? null;
    },
  });
}

/** Canonical read for a player profile by username (public routes). */
export function playerByUsernameQueryOptions(username: string | null | undefined) {
  return queryOptions({
    queryKey: ["player-username", username],
    enabled: !!username,
    staleTime: 60_000,
    queryFn: async (): Promise<PlayerProfile | null> => {
      if (!username) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, username, display_name, bio, avatar_url, cover_url, home_course, location, pdga_number, pdga_rating",
        )
        .eq("username", username)
        .maybeSingle();
      if (error) throw error;
      return (data as PlayerProfile | null) ?? null;
    },
  });
}
