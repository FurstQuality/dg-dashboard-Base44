REVOKE ALL ON FUNCTION public.resolve_post_report(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_post_report(uuid, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_post_report(uuid, boolean, text) TO authenticated;
