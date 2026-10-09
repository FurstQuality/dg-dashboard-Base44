CREATE OR REPLACE FUNCTION public.friend_suggestions(_user_id uuid, _limit integer DEFAULT 20)
RETURNS TABLE(
  user_id uuid,
  mutual_count integer,
  shared_clubs integer,
  same_city boolean,
  same_home_course boolean,
  same_state boolean,
  score integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH me AS (
    -- EXECUTE is granted to service_role only; trusted server code verifies the
    -- caller before passing _user_id. A signed-in caller may only ask for self.
    SELECT CASE
      WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN NULL::uuid
      ELSE _user_id
    END AS uid
  ),
  my_profile AS (
    SELECT
      lower(btrim(COALESCE(p.location, ''))) AS city,
      COALESCE(public.normalize_us_state(p.home_state), public.normalize_us_state(p.location)) AS state,
      lower(btrim(COALESCE(p.home_course, ''))) AS home_course
    FROM public.profiles p, me
    WHERE me.uid IS NOT NULL AND p.id = me.uid
  ),
  my_clubs AS (
    SELECT cm.club_id FROM public.club_members cm, me
    WHERE me.uid IS NOT NULL AND cm.user_id = me.uid
  ),
  my_friends AS (
    SELECT CASE WHEN requester_id = (SELECT uid FROM me) THEN addressee_id ELSE requester_id END AS friend_id
    FROM public.friendships, me
    WHERE me.uid IS NOT NULL AND status = 'accepted'
      AND (me.uid IN (requester_id, addressee_id))
  ),
  fof AS (
    SELECT CASE WHEN f.requester_id = mf.friend_id THEN f.addressee_id ELSE f.requester_id END AS candidate_id,
           mf.friend_id AS via
    FROM public.friendships f
    JOIN my_friends mf ON mf.friend_id IN (f.requester_id, f.addressee_id)
    WHERE f.status = 'accepted'
  ),
  mutuals AS (
    SELECT candidate_id, COUNT(DISTINCT via)::int AS mutual_count
    FROM fof GROUP BY candidate_id
  ),
  club_mates AS (
    SELECT cm.user_id AS candidate_id, COUNT(DISTINCT cm.club_id)::int AS shared_clubs
    FROM public.club_members cm
    JOIN my_clubs mc ON mc.club_id = cm.club_id
    GROUP BY cm.user_id
  ),
  locals AS (
    SELECT
      p.id AS candidate_id,
      (mp.city <> '' AND lower(btrim(COALESCE(p.location, ''))) = mp.city) AS same_city,
      (mp.home_course <> '' AND lower(btrim(COALESCE(p.home_course, ''))) = mp.home_course) AS same_home_course,
      (mp.state IS NOT NULL AND COALESCE(public.normalize_us_state(p.home_state), public.normalize_us_state(p.location)) = mp.state) AS same_state
    FROM public.profiles p, my_profile mp
    WHERE (mp.city <> '' AND lower(btrim(COALESCE(p.location, ''))) = mp.city)
       OR (mp.home_course <> '' AND lower(btrim(COALESCE(p.home_course, ''))) = mp.home_course)
       OR (mp.state IS NOT NULL AND COALESCE(public.normalize_us_state(p.home_state), public.normalize_us_state(p.location)) = mp.state)
  ),
  excluded AS (
    SELECT uid FROM me WHERE uid IS NOT NULL
    UNION SELECT friend_id FROM my_friends
    UNION SELECT CASE WHEN requester_id = (SELECT uid FROM me) THEN addressee_id ELSE requester_id END
           FROM public.friendships, me WHERE me.uid IS NOT NULL AND me.uid IN (requester_id, addressee_id)
    UNION SELECT b.blocked_id FROM public.blocks b, me WHERE me.uid IS NOT NULL AND b.blocker_id = me.uid
  ),
  candidates AS (
    SELECT candidate_id FROM mutuals
    UNION SELECT candidate_id FROM club_mates
    UNION SELECT candidate_id FROM locals
  )
  SELECT
    c.candidate_id AS user_id,
    COALESCE(m.mutual_count, 0) AS mutual_count,
    COALESCE(cl.shared_clubs, 0) AS shared_clubs,
    COALESCE(l.same_city, false) AS same_city,
    COALESCE(l.same_home_course, false) AS same_home_course,
    COALESCE(l.same_state, false) AS same_state,
    (
      COALESCE(cl.shared_clubs, 0) * 40
      + CASE WHEN COALESCE(l.same_city, false) THEN 30 ELSE 0 END
      + CASE WHEN COALESCE(l.same_home_course, false) THEN 25 ELSE 0 END
      + LEAST(COALESCE(m.mutual_count, 0), 10) * 8
      + CASE WHEN COALESCE(l.same_state, false) THEN 10 ELSE 0 END
    )::int AS score
  FROM candidates c
  LEFT JOIN mutuals m ON m.candidate_id = c.candidate_id
  LEFT JOIN club_mates cl ON cl.candidate_id = c.candidate_id
  LEFT JOIN locals l ON l.candidate_id = c.candidate_id
  WHERE c.candidate_id IS NOT NULL
    AND c.candidate_id NOT IN (SELECT uid FROM excluded WHERE uid IS NOT NULL)
  ORDER BY score DESC, mutual_count DESC, c.candidate_id
  LIMIT COALESCE(_limit, 20);
$function$;

REVOKE ALL ON FUNCTION public.friend_suggestions(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.friend_suggestions(uuid, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.friend_suggestions(uuid, integer) TO service_role;