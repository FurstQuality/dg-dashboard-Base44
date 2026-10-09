CREATE OR REPLACE FUNCTION public.friend_leaderboard()
RETURNS TABLE (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  pdga_rating integer,
  xp integer,
  level integer,
  title text,
  streak_days integer,
  achievements integer,
  duel_wins integer,
  duels_played integer,
  is_self boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (SELECT auth.uid() AS id),
  circle AS (
    SELECT (SELECT id FROM me) AS uid
    UNION
    SELECT CASE WHEN f.requester_id = (SELECT id FROM me) THEN f.addressee_id ELSE f.requester_id END
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND ((SELECT id FROM me) IN (f.requester_id, f.addressee_id))
  )
  SELECT
    c.uid,
    p.username,
    p.display_name,
    p.avatar_url,
    p.pdga_rating,
    COALESCE(up.xp, 0)::integer,
    COALESCE(up.level, 1)::integer,
    COALESCE(up.title, 'Rookie'),
    COALESCE(up.streak_days, 0)::integer,
    COALESCE((SELECT count(*) FROM public.user_achievements ua WHERE ua.user_id = c.uid), 0)::integer,
    COALESCE((SELECT count(*) FROM public.game_duels d WHERE d.winner_id = c.uid), 0)::integer,
    COALESCE((SELECT count(*) FROM public.duel_participants dp WHERE dp.user_id = c.uid AND dp.invite_status = 'accepted'), 0)::integer,
    c.uid = (SELECT id FROM me)
  FROM circle c
  JOIN public.profiles p ON p.id = c.uid
  LEFT JOIN public.user_progress up ON up.user_id = c.uid
  WHERE auth.uid() IS NOT NULL
$$;

REVOKE EXECUTE ON FUNCTION public.friend_leaderboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.friend_leaderboard() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resolve_duel(_duel uuid, _winner uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _stake integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_duel_participant(_duel, auth.uid()) THEN
    RAISE EXCEPTION 'Only players in this challenge can settle it.';
  END IF;
  IF NOT public.is_duel_participant(_duel, _winner) THEN
    RAISE EXCEPTION 'The winner must be a player in this challenge.';
  END IF;

  SELECT wager_xp INTO _stake FROM public.game_duels WHERE id = _duel;

  UPDATE public.game_duels
     SET winner_id = _winner, status = 'completed', completed_at = now()
   WHERE id = _duel AND status <> 'completed';

  IF FOUND THEN
    PERFORM public.award_xp(_winner, 'duel_win', GREATEST(COALESCE(_stake, 25), 5), 'duel', _duel::text, '{}'::jsonb);
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_duel(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_duel(uuid, uuid) TO authenticated, service_role;