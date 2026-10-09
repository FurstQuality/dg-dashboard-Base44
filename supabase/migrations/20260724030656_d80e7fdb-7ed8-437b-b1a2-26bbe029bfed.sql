REVOKE EXECUTE ON FUNCTION public.friend_suggestions(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.friend_suggestions(uuid, integer) TO service_role;