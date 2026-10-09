GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.friend_suggestions(uuid, integer) TO authenticated, service_role;