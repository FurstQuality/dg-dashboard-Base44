CREATE OR REPLACE FUNCTION public.clubhouse_event_roster(_tournament_id uuid)
RETURNS TABLE(user_id uuid, display_name text, division_id uuid, checked_in boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (
    public.is_event_director(_tournament_id, auth.uid())
    OR EXISTS (SELECT 1 FROM tournament_registrations r WHERE r.tournament_id = _tournament_id AND r.user_id = auth.uid() AND r.status <> 'withdrawn')
  ) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT r.user_id, COALESCE(p.display_name, 'Player')::text, r.division_id,
           (r.status = 'checked_in' OR r.checked_in_at IS NOT NULL)
    FROM tournament_registrations r
    LEFT JOIN profiles p ON p.id = r.user_id
    WHERE r.tournament_id = _tournament_id AND r.status <> 'withdrawn'
      AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = auth.uid() AND b.blocked_id = r.user_id) OR (b.blocker_id = r.user_id AND b.blocked_id = auth.uid()))
    ORDER BY 2;
END $$;
REVOKE ALL ON FUNCTION public.clubhouse_event_roster(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clubhouse_event_roster(uuid) TO authenticated;