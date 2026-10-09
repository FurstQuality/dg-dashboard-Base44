DROP FUNCTION IF EXISTS public.friends_live_rounds(uuid);

CREATE OR REPLACE FUNCTION public.friends_live_rounds()
RETURNS TABLE (
  round_id uuid,
  player_id uuid,
  display_name text,
  username text,
  avatar_url text,
  course_name text,
  started_at timestamp with time zone,
  holes_played integer,
  total_strokes integer,
  total_par integer,
  last_score_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (SELECT auth.uid() AS uid),
  friends AS (
    SELECT CASE WHEN f.requester_id = (SELECT uid FROM me) THEN f.addressee_id ELSE f.requester_id END AS friend_id
    FROM public.friendships f, me
    WHERE f.status = 'accepted'
      AND me.uid IS NOT NULL
      AND (f.requester_id = me.uid OR f.addressee_id = me.uid)
  )
  SELECT
    r.id AS round_id,
    rp.user_id AS player_id,
    p.display_name,
    p.username,
    p.avatar_url,
    c.name AS course_name,
    r.started_at,
    COALESCE(agg.holes_played, 0)::integer AS holes_played,
    COALESCE(agg.total_strokes, 0)::integer AS total_strokes,
    COALESCE(agg.total_par, 0)::integer AS total_par,
    agg.last_score_at
  FROM public.rounds r
  JOIN public.round_players rp ON rp.round_id = r.id
  JOIN friends fr ON fr.friend_id = rp.user_id
  JOIN public.profiles p ON p.id = rp.user_id
  LEFT JOIN public.courses c ON c.id = r.course_id
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE s.strokes > 0) AS holes_played,
      COALESCE(SUM(s.strokes), 0) AS total_strokes,
      COALESCE(SUM(h.par) FILTER (WHERE s.strokes > 0), 0) AS total_par,
      MAX(s.updated_at) AS last_score_at
    FROM public.round_scores s
    LEFT JOIN public.holes h ON h.layout_id = r.layout_id AND h.number = s.hole_number
    WHERE s.round_id = r.id AND s.round_player_id = rp.id
  ) agg ON true
  WHERE r.status = 'in_progress'
    AND r.started_at > now() - interval '12 hours'
  ORDER BY agg.last_score_at DESC NULLS LAST, r.started_at DESC;
$$;

REVOKE ALL ON FUNCTION public.friends_live_rounds() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.friends_live_rounds() TO authenticated;
GRANT EXECUTE ON FUNCTION public.friends_live_rounds() TO service_role;