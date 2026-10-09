GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_round_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_event_rsvps(uuid, uuid) TO authenticated;