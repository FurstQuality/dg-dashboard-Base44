-- Tighten SECURITY DEFINER helpers exposed to authenticated users.
-- has_role and is_conversation_member are only used inside RLS policies;
-- revoke direct client EXECUTE so they can't be probed via RPC.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_conversation_member(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- friend_suggestions is called client-side, but must only return suggestions
-- for the caller. Enforce _user_id = auth.uid() and keep EXECUTE for authenticated.
CREATE OR REPLACE FUNCTION public.friend_suggestions(_user_id uuid, _limit integer DEFAULT 20)
 RETURNS TABLE(user_id uuid, mutual_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT CASE
      WHEN auth.uid() IS NULL THEN NULL::uuid
      WHEN _user_id IS NULL OR _user_id = auth.uid() THEN auth.uid()
      ELSE NULL::uuid
    END AS uid
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
  excluded AS (
    SELECT uid FROM me WHERE uid IS NOT NULL
    UNION SELECT friend_id FROM my_friends
    UNION SELECT CASE WHEN requester_id = (SELECT uid FROM me) THEN addressee_id ELSE requester_id END
           FROM public.friendships, me WHERE me.uid IS NOT NULL AND me.uid IN (requester_id, addressee_id)
  )
  SELECT candidate_id AS user_id, COUNT(DISTINCT via)::int AS mutual_count
  FROM fof
  WHERE candidate_id NOT IN (SELECT uid FROM excluded WHERE uid IS NOT NULL)
  GROUP BY candidate_id
  ORDER BY mutual_count DESC, candidate_id
  LIMIT COALESCE(_limit, 20);
$function$;

REVOKE EXECUTE ON FUNCTION public.friend_suggestions(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.friend_suggestions(uuid, integer) TO authenticated;