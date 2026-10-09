CREATE OR REPLACE FUNCTION public.progress_rounds_leaderboard(_limit integer DEFAULT 50)
RETURNS TABLE (user_id uuid, total bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.created_by AS user_id, count(*)::bigint AS total
  FROM public.rounds r
  WHERE auth.uid() IS NOT NULL
    AND r.created_by IS NOT NULL
  GROUP BY r.created_by
  ORDER BY count(*) DESC
  LIMIT greatest(1, least(coalesce(_limit, 50), 200));
$$;

CREATE OR REPLACE FUNCTION public.progress_aces_leaderboard(_limit integer DEFAULT 50)
RETURNS TABLE (user_id uuid, total bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.user_id, count(*)::bigint AS total
  FROM public.xp_events e
  WHERE auth.uid() IS NOT NULL
    AND e.action_key = 'ace'
    AND e.user_id IS NOT NULL
  GROUP BY e.user_id
  ORDER BY count(*) DESC
  LIMIT greatest(1, least(coalesce(_limit, 50), 200));
$$;

REVOKE ALL ON FUNCTION public.progress_rounds_leaderboard(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.progress_aces_leaderboard(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.progress_rounds_leaderboard(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.progress_aces_leaderboard(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.progress_rounds_leaderboard(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.progress_aces_leaderboard(integer) TO service_role;