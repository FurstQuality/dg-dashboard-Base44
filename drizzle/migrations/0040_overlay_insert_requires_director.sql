DROP POLICY IF EXISTS "Create own overlays" ON public.course_event_overlays;
CREATE POLICY "Create own overlays" ON public.course_event_overlays FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid() AND (
    (tournament_id IS NOT NULL AND public.can_manage_event('tournament', tournament_id, auth.uid()))
    OR (league_event_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.league_events le WHERE le.id = league_event_id
        AND public.can_manage_event('league', le.league_id, auth.uid())))
    OR public.can_steward_course(course_id, auth.uid())
  )
);