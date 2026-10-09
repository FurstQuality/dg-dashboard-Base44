
-- 1) event_rsvps: restrict public SELECT to authenticated
DROP POLICY IF EXISTS "rsvp public read" ON public.event_rsvps;
CREATE POLICY "rsvp authenticated read" ON public.event_rsvps
  FOR SELECT TO authenticated USING (true);

-- 2) rounds family: restrict SELECT to authenticated
DROP POLICY IF EXISTS "Rounds viewable by everyone" ON public.rounds;
CREATE POLICY "Rounds viewable by authenticated" ON public.rounds
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Round players viewable by everyone" ON public.round_players;
CREATE POLICY "Round players viewable by authenticated" ON public.round_players
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Scores viewable by everyone" ON public.round_scores;
CREATE POLICY "Scores viewable by authenticated" ON public.round_scores
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Round ratings are public" ON public.round_ratings;
CREATE POLICY "Round ratings viewable by authenticated" ON public.round_ratings
  FOR SELECT TO authenticated USING (true);

-- Revoke anon SELECT so no residual API access
REVOKE SELECT ON public.event_rsvps FROM anon;
REVOKE SELECT ON public.rounds FROM anon;
REVOKE SELECT ON public.round_players FROM anon;
REVOKE SELECT ON public.round_scores FROM anon;
REVOKE SELECT ON public.round_ratings FROM anon;

-- 3) external_chat_links: fix broken ownership self-join predicates
DROP POLICY IF EXISTS "Owners can add external chat links" ON public.external_chat_links;
DROP POLICY IF EXISTS "Creator or owner can update external chat links" ON public.external_chat_links;
DROP POLICY IF EXISTS "Creator or owner can delete external chat links" ON public.external_chat_links;

CREATE POLICY "Owners can add external chat links"
  ON public.external_chat_links FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND (
      (owner_type = 'club' AND EXISTS (
        SELECT 1 FROM public.clubs c
         WHERE c.id = external_chat_links.owner_id AND c.owner_id = auth.uid()
      )) OR
      (owner_type = 'league' AND EXISTS (
        SELECT 1 FROM public.leagues l
         WHERE l.id = external_chat_links.owner_id AND l.owner_id = auth.uid()
      )) OR
      (owner_type = 'tournament' AND EXISTS (
        SELECT 1 FROM public.tournaments t
         WHERE t.id = external_chat_links.owner_id AND t.owner_id = auth.uid()
      ))
    )
  );

CREATE POLICY "Creator or owner can update external chat links"
  ON public.external_chat_links FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid() OR
    (owner_type = 'club' AND EXISTS (
      SELECT 1 FROM public.clubs c
       WHERE c.id = external_chat_links.owner_id AND c.owner_id = auth.uid()
    )) OR
    (owner_type = 'league' AND EXISTS (
      SELECT 1 FROM public.leagues l
       WHERE l.id = external_chat_links.owner_id AND l.owner_id = auth.uid()
    )) OR
    (owner_type = 'tournament' AND EXISTS (
      SELECT 1 FROM public.tournaments t
       WHERE t.id = external_chat_links.owner_id AND t.owner_id = auth.uid()
    ))
  );

CREATE POLICY "Creator or owner can delete external chat links"
  ON public.external_chat_links FOR DELETE TO authenticated
  USING (
    created_by = auth.uid() OR
    (owner_type = 'club' AND EXISTS (
      SELECT 1 FROM public.clubs c
       WHERE c.id = external_chat_links.owner_id AND c.owner_id = auth.uid()
    )) OR
    (owner_type = 'league' AND EXISTS (
      SELECT 1 FROM public.leagues l
       WHERE l.id = external_chat_links.owner_id AND l.owner_id = auth.uid()
    )) OR
    (owner_type = 'tournament' AND EXISTS (
      SELECT 1 FROM public.tournaments t
       WHERE t.id = external_chat_links.owner_id AND t.owner_id = auth.uid()
    ))
  );

-- 4) leagues + tournaments TD contact exposure: revoke column-level access.
-- The app only writes these fields (via wizards, which run as the owner);
-- no client code reads them. Owners/service-role can still access via
-- privileged server functions.
REVOKE SELECT (td_email, td_phone) ON public.leagues FROM anon, authenticated;
REVOKE SELECT (td_email, td_phone) ON public.tournaments FROM anon, authenticated;

-- Owner-scoped read helpers (SECURITY DEFINER, callable only by the owner)
CREATE OR REPLACE FUNCTION public.get_league_td_contact(_league_id uuid)
RETURNS TABLE(td_name text, td_email text, td_phone text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.td_name, l.td_email, l.td_phone
    FROM public.leagues l
   WHERE l.id = _league_id
     AND l.owner_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.get_league_td_contact(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_league_td_contact(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_tournament_td_contact(_tournament_id uuid)
RETURNS TABLE(td_name text, td_email text, td_phone text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.td_name, t.td_email, t.td_phone
    FROM public.tournaments t
   WHERE t.id = _tournament_id
     AND t.owner_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.get_tournament_td_contact(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tournament_td_contact(uuid) TO authenticated;

-- 5) pdga_friend_invites: remove broad public pending read
DROP POLICY IF EXISTS "pdga_invites_public_pending_read" ON public.pdga_friend_invites;
REVOKE SELECT ON public.pdga_friend_invites FROM anon;
-- Invite share pages fetch by token via a server function using the admin client.

-- 6) friend_suggestions: revoke execute from authenticated (called via server fn now)
REVOKE EXECUTE ON FUNCTION public.friend_suggestions(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.friend_suggestions(uuid, integer) TO service_role;
