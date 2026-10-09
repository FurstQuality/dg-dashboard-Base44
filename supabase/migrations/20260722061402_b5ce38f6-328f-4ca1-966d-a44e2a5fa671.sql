
-- Friendships
CREATE TABLE public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requester_id <> addressee_id)
);

-- Canonical unique pair (order-independent)
CREATE UNIQUE INDEX friendships_pair_unique
  ON public.friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
CREATE INDEX friendships_requester_idx ON public.friendships (requester_id);
CREATE INDEX friendships_addressee_idx ON public.friendships (addressee_id);
CREATE INDEX friendships_status_idx ON public.friendships (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.friendships TO authenticated;
GRANT ALL ON public.friendships TO service_role;

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own friendships" ON public.friendships
  FOR SELECT TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE POLICY "Send friend request" ON public.friendships
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requester_id AND status = 'pending');

CREATE POLICY "Respond to or update own friendship" ON public.friendships
  FOR UPDATE TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id)
  WITH CHECK (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE POLICY "Remove own friendship" ON public.friendships
  FOR DELETE TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE TRIGGER friendships_updated_at
BEFORE UPDATE ON public.friendships
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Friend suggestions: people you may know based on mutual accepted friendships
CREATE OR REPLACE FUNCTION public.friend_suggestions(_user_id uuid, _limit int DEFAULT 20)
RETURNS TABLE (user_id uuid, mutual_count int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH my_friends AS (
    SELECT CASE WHEN requester_id = _user_id THEN addressee_id ELSE requester_id END AS friend_id
    FROM public.friendships
    WHERE status = 'accepted' AND (_user_id IN (requester_id, addressee_id))
  ),
  -- friends of friends
  fof AS (
    SELECT CASE WHEN f.requester_id = mf.friend_id THEN f.addressee_id ELSE f.requester_id END AS candidate_id,
           mf.friend_id AS via
    FROM public.friendships f
    JOIN my_friends mf ON mf.friend_id IN (f.requester_id, f.addressee_id)
    WHERE f.status = 'accepted'
  ),
  -- exclude self, current friends, and anyone with an existing relationship record
  excluded AS (
    SELECT _user_id AS uid
    UNION SELECT friend_id FROM my_friends
    UNION SELECT CASE WHEN requester_id = _user_id THEN addressee_id ELSE requester_id END
           FROM public.friendships WHERE _user_id IN (requester_id, addressee_id)
  )
  SELECT candidate_id AS user_id, COUNT(DISTINCT via)::int AS mutual_count
  FROM fof
  WHERE candidate_id NOT IN (SELECT uid FROM excluded)
  GROUP BY candidate_id
  ORDER BY mutual_count DESC, candidate_id
  LIMIT _limit;
$$;

GRANT EXECUTE ON FUNCTION public.friend_suggestions(uuid, int) TO authenticated;
