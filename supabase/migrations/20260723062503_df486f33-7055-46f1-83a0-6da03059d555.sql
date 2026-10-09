
REVOKE EXECUTE ON FUNCTION public.friend_suggestions(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_conversation_member(uuid, uuid) FROM anon;
