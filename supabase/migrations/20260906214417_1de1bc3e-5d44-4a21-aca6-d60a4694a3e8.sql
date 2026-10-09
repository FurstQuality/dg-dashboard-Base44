DROP POLICY IF EXISTS "Registrant or event director views registrations" ON public.tournament_registrations;
DROP POLICY IF EXISTS "Player or event director updates registration" ON public.tournament_registrations;
DROP POLICY IF EXISTS "Player or event director deletes registration" ON public.tournament_registrations;

CREATE POLICY "Registrant or event director views registrations"
  ON public.tournament_registrations FOR SELECT TO authenticated
  USING ((user_id = auth.uid()) OR public.is_event_director(tournament_id, auth.uid()));

CREATE POLICY "Player or event director updates registration"
  ON public.tournament_registrations FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()) OR public.is_event_director(tournament_id, auth.uid()));

CREATE POLICY "Player or event director deletes registration"
  ON public.tournament_registrations FOR DELETE TO authenticated
  USING ((user_id = auth.uid()) OR public.is_event_director(tournament_id, auth.uid()));