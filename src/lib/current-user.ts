import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type ProfileRow = {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  home_course: string | null;
  location: string | null;
  home_state?: string | null;
  pdga_number: string | null;
  pdga_rating: number | null;
};

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, user: session?.user ?? null, loading };
}

/**
 * Columns the browser client may read from `profiles`.
 *
 * `ics_feed_token`, `notification_prefs` and `privacy_prefs` are revoked from
 * the `authenticated` role at the column level so one member cannot read
 * another member's private calendar URL or settings. Never use `select("*")`
 * here — it expands to every column and fails with a permission error.
 */
export const PROFILE_COLUMNS =
  "id, username, display_name, bio, avatar_url, cover_url, home_course, location, pdga_number, pdga_rating, home_state, player_since, preferred_division, favorite_ace, ace_count_manual, calendar_shared_with_friends, pdga_profile_url, scene_profile_url, udisc_profile_url, created_at, updated_at";

export function useMyProfile(user: User | null | undefined) {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    let mounted = true;
    supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (mounted) setProfile(data as unknown as ProfileRow | null);
      });
    return () => {
      mounted = false;
    };
  }, [user?.id]);
  return {
    profile,
    refresh: async () => {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .eq("id", user.id)
        .maybeSingle();
      setProfile(data as unknown as ProfileRow | null);
    },
  };
}

export function useIsSuperAdmin(user: User | null | undefined) {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  useEffect(() => {
    if (!user) {
      setIsSuperAdmin(false);
      return;
    }
    let mounted = true;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle()
      .then(({ data }) => {
        if (mounted) setIsSuperAdmin(!!data);
      });
    return () => {
      mounted = false;
    };
  }, [user?.id]);
  return isSuperAdmin;
}

export function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function timeAgo(iso: string) {
  const d = new Date(iso).getTime();
  const diff = Math.floor((Date.now() - d) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

export async function signedMediaUrl(bucket: string, path: string) {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24);
  return data?.signedUrl ?? null;
}
