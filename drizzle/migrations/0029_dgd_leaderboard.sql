CREATE OR REPLACE FUNCTION public.get_dgd_leaderboard(_tier text DEFAULT NULL, _limit integer DEFAULT 50)
RETURNS TABLE(rank integer, user_id uuid, username text, display_name text, avatar_url text, dgd_rating integer, tier text, eligible_rounds integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT (row_number() OVER (ORDER BY s.display_rating DESC, s.eligible_rounds DESC, s.user_id))::integer,
         s.user_id, p.username, p.display_name, p.avatar_url,
         public.dgd_scale_1000_public(s.display_rating)::integer,
         COALESCE(t.current_tier, 'GREEN'), s.eligible_rounds
  FROM public.dgd_v13_player_state s
  JOIN public.profiles p ON p.id = s.user_id
  LEFT JOIN public.dgd_tier_state t ON t.user_id = s.user_id
  WHERE auth.uid() IS NOT NULL
    AND s.display_rating IS NOT NULL
    AND COALESCE(p.privacy_prefs->>'show_ratings', 'true') <> 'false'
    AND (_tier IS NULL OR COALESCE(t.current_tier, 'GREEN') = _tier)
  ORDER BY s.display_rating DESC, s.eligible_rounds DESC, s.user_id
  LIMIT LEAST(GREATEST(COALESCE(_limit, 50), 1), 200);
$$;
REVOKE ALL ON FUNCTION public.get_dgd_leaderboard(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dgd_leaderboard(text, integer) TO authenticated;