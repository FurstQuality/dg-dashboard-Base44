DROP POLICY "Managers manage league divisions" ON public.league_divisions;
CREATE POLICY "Managers manage league divisions" ON public.league_divisions FOR ALL TO authenticated
  USING (public.event_has_capability('league', league_id, auth.uid(), 'event.manage_players'))
  WITH CHECK (public.event_has_capability('league', league_id, auth.uid(), 'event.manage_players'));
DROP POLICY "Managers manage tournament divisions" ON public.tournament_divisions;
CREATE POLICY "Managers manage tournament divisions" ON public.tournament_divisions FOR ALL TO authenticated
  USING (public.event_has_capability('tournament', tournament_id, auth.uid(), 'event.manage_players'))
  WITH CHECK (public.event_has_capability('tournament', tournament_id, auth.uid(), 'event.manage_players'));
DROP POLICY "Managers manage league events" ON public.league_events;
CREATE POLICY "Managers manage league events" ON public.league_events FOR ALL TO authenticated
  USING (public.event_has_capability('league', league_id, auth.uid(), 'event.manage_course_ops')
      OR public.event_has_capability('league', league_id, auth.uid(), 'event.manage_scoring'))
  WITH CHECK (public.event_has_capability('league', league_id, auth.uid(), 'event.manage_course_ops')
      OR public.event_has_capability('league', league_id, auth.uid(), 'event.manage_scoring'));
DROP POLICY "Managers manage tournament rounds" ON public.tournament_rounds;
CREATE POLICY "Managers manage tournament rounds" ON public.tournament_rounds FOR ALL TO authenticated
  USING (public.event_has_capability('tournament', tournament_id, auth.uid(), 'event.manage_course_ops')
      OR public.event_has_capability('tournament', tournament_id, auth.uid(), 'event.manage_scoring'))
  WITH CHECK (public.event_has_capability('tournament', tournament_id, auth.uid(), 'event.manage_course_ops')
      OR public.event_has_capability('tournament', tournament_id, auth.uid(), 'event.manage_scoring'));