REVOKE ALL ON FUNCTION public.friend_suggestions(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.friend_suggestions(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.friend_suggestions(uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.are_friends(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.are_friends(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.are_friends(uuid, uuid) TO service_role;