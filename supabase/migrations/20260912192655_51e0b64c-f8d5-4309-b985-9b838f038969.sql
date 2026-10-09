GRANT EXECUTE ON FUNCTION public.controls_event_access(text, uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.can_manage_event(text, uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.can_manage_league(uuid, uuid) TO anon;

DROP POLICY IF EXISTS "Anyone views leagues" ON public.leagues;
CREATE POLICY "Anyone views leagues" ON public.leagues
  FOR SELECT
  USING (
    status <> 'draft'::league_status
    OR (auth.uid() IS NOT NULL AND public.can_manage_event('league', id, auth.uid()))
  );

DROP POLICY IF EXISTS "Anyone can view non-draft tournaments" ON public.tournaments;
CREATE POLICY "Anyone can view non-draft tournaments" ON public.tournaments
  FOR SELECT
  USING (
    status <> 'draft'::tournament_status
    OR (auth.uid() IS NOT NULL AND public.can_manage_event('tournament', id, auth.uid()))
  );