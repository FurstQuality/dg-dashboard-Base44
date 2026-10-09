CREATE OR REPLACE FUNCTION public.people_directory_cards(_ids uuid[])
RETURNS TABLE (
  user_id uuid,
  dgd_rating integer,
  rated_rounds integer,
  achievements integer,
  active_goals integer,
  goal_title text,
  goal_progress integer,
  goal_target integer,
  latest_achievement text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    NULLIF(public.player_rating_average(p.id), 0),
    (
      SELECT count(*)::int FROM (
        SELECT 1 FROM public.round_ratings rr
         WHERE rr.user_id = p.id AND rr.round_rating IS NOT NULL
        UNION ALL
        SELECT 1 FROM public.external_rounds er
         WHERE er.user_id = p.id AND er.round_rating IS NOT NULL
      ) x
    ),
    (SELECT count(*)::int FROM public.user_achievements ua WHERE ua.user_id = p.id),
    (SELECT count(*)::int FROM public.user_goals g WHERE g.user_id = p.id AND g.completed_at IS NULL),
    g2.title,
    g2.progress,
    g2.target,
    a2.name
  FROM public.profiles p
  LEFT JOIN LATERAL (
    SELECT g.title, g.progress, g.target
      FROM public.user_goals g
     WHERE g.user_id = p.id AND g.completed_at IS NULL
     ORDER BY g.updated_at DESC
     LIMIT 1
  ) g2 ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(a.name, ua.achievement_key) AS name
      FROM public.user_achievements ua
      LEFT JOIN public.achievements a ON a.key = ua.achievement_key
     WHERE ua.user_id = p.id
     ORDER BY ua.earned_at DESC
     LIMIT 1
  ) a2 ON true
  WHERE p.id = ANY(_ids);
$$;

REVOKE ALL ON FUNCTION public.people_directory_cards(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.people_directory_cards(uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.people_directory_cards(uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.people_directory_cards(uuid[]) TO service_role;