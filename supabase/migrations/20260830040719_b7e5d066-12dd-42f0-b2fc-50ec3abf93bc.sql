DROP VIEW IF EXISTS public.my_profile_settings;
REVOKE ALL ON FUNCTION public.assert_self_or_admin(uuid) FROM anon;
