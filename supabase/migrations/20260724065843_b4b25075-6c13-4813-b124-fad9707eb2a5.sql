
-- Helper: is a user a participant of a round (creator or listed player)?
CREATE OR REPLACE FUNCTION public.is_round_participant(_round_id uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rounds r
    WHERE r.id = _round_id AND r.created_by = _user
  ) OR EXISTS (
    SELECT 1 FROM public.round_players rp
    WHERE rp.round_id = _round_id AND rp.user_id = _user
  );
$$;

-- Helper: can this user see RSVPs for a given event?
CREATE OR REPLACE FUNCTION public.can_see_event_rsvps(_event_id uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_events e
    WHERE e.id = _event_id AND e.host_id = _user
  ) OR EXISTS (
    SELECT 1 FROM public.event_rsvps r
    WHERE r.event_id = _event_id AND r.user_id = _user
  );
$$;

-- rounds: creator + listed players
DROP POLICY IF EXISTS "Rounds viewable by authenticated" ON public.rounds;
CREATE POLICY "rounds visible to participants"
  ON public.rounds FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.is_round_participant(id, auth.uid())
  );

-- round_players: same audience
DROP POLICY IF EXISTS "Round players viewable by authenticated" ON public.round_players;
CREATE POLICY "round_players visible to participants"
  ON public.round_players FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_round_participant(round_id, auth.uid())
  );

-- round_scores
DROP POLICY IF EXISTS "Scores viewable by authenticated" ON public.round_scores;
CREATE POLICY "round_scores visible to participants"
  ON public.round_scores FOR SELECT
  TO authenticated
  USING (public.is_round_participant(round_id, auth.uid()));

-- round_ratings
DROP POLICY IF EXISTS "Round ratings viewable by authenticated" ON public.round_ratings;
CREATE POLICY "round_ratings visible to participants"
  ON public.round_ratings FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_round_participant(round_id, auth.uid())
  );

-- event_rsvps: host, attendee, or self
DROP POLICY IF EXISTS "rsvp authenticated read" ON public.event_rsvps;
CREATE POLICY "rsvps visible to host and attendees"
  ON public.event_rsvps FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.can_see_event_rsvps(event_id, auth.uid())
  );

-- user_progress: owner-only
DROP POLICY IF EXISTS "Authenticated views progress" ON public.user_progress;
CREATE POLICY "user_progress owner read"
  ON public.user_progress FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- avatar_configs, bag_configs, user_discs: authenticated-only (drop anon)
DROP POLICY IF EXISTS "Avatars public read" ON public.avatar_configs;
CREATE POLICY "Avatars authenticated read"
  ON public.avatar_configs FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Bags public read" ON public.bag_configs;
CREATE POLICY "Bags authenticated read"
  ON public.bag_configs FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Discs public read" ON public.user_discs;
CREATE POLICY "Discs authenticated read"
  ON public.user_discs FOR SELECT
  TO authenticated
  USING (true);

REVOKE SELECT ON public.avatar_configs FROM anon;
REVOKE SELECT ON public.bag_configs FROM anon;
REVOKE SELECT ON public.user_discs FROM anon;
REVOKE SELECT ON public.user_progress FROM anon;
