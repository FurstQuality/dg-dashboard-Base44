REVOKE EXECUTE ON FUNCTION public.guard_director_review() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_profile_director_flag() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_director_badge() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_approved_director(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_approved_creator(uuid) FROM anon;
