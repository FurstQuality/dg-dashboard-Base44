
REVOKE EXECUTE ON FUNCTION public.is_round_participant(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_see_event_rsvps(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_round_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_event_rsvps(uuid, uuid) TO authenticated;
