CREATE OR REPLACE FUNCTION public.can_enter_event_clubhouse(_tournament_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_event_director(_tournament_id, auth.uid())
    OR EXISTS (SELECT 1 FROM tournament_registrations r WHERE r.tournament_id = _tournament_id AND r.user_id = auth.uid() AND r.status <> 'withdrawn')
  )
$$;
REVOKE ALL ON FUNCTION public.can_enter_event_clubhouse(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_enter_event_clubhouse(uuid) TO authenticated;