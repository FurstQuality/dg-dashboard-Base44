-- Connector key records: no client write path. Writes happen only through the
-- service-role client, so remove client write privileges entirely and scope the
-- read policy to signed-in owners.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.app_user_connections FROM anon, authenticated;
REVOKE SELECT ON public.app_user_connections FROM anon;
GRANT SELECT ON public.app_user_connections TO authenticated;
GRANT ALL ON public.app_user_connections TO service_role;

DROP POLICY IF EXISTS "Users can view their own connection presence" ON public.app_user_connections;
CREATE POLICY "Users can view their own connection presence"
  ON public.app_user_connections FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Explicit deny for client writes, so a future permissive policy can never
-- let one user overwrite another user's ciphertext.
CREATE POLICY "No client inserts of connector keys"
  ON public.app_user_connections FOR INSERT TO authenticated
  WITH CHECK (false);
CREATE POLICY "No client updates of connector keys"
  ON public.app_user_connections FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);
CREATE POLICY "No client deletes of connector keys"
  ON public.app_user_connections FOR DELETE TO authenticated
  USING (false);

-- Kiosk guest contact details: guarantee every row is attached to exactly one
-- event so the staff-scoped read policies always apply (no unreachable PII).
ALTER TABLE public.kiosk_guest_checkins
  ADD CONSTRAINT kiosk_guest_checkins_one_event_link
  CHECK (
    (tournament_id IS NOT NULL AND league_id IS NULL)
    OR (tournament_id IS NULL AND league_id IS NOT NULL)
  );

-- Staff updates must keep the row inside an event they manage.
DROP POLICY IF EXISTS "Event staff can update kiosk guest check-ins" ON public.kiosk_guest_checkins;
CREATE POLICY "Event staff can update kiosk guest check-ins"
  ON public.kiosk_guest_checkins FOR UPDATE TO authenticated
  USING (
    (tournament_id IS NOT NULL AND (public.is_event_director(tournament_id, auth.uid()) OR public.is_tournament_staff(tournament_id, auth.uid())))
    OR (league_id IS NOT NULL AND public.can_manage_league(league_id, auth.uid()))
  )
  WITH CHECK (
    (tournament_id IS NOT NULL AND (public.is_event_director(tournament_id, auth.uid()) OR public.is_tournament_staff(tournament_id, auth.uid())))
    OR (league_id IS NOT NULL AND public.can_manage_league(league_id, auth.uid()))
  );

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.kiosk_guest_checkins FROM anon;
