
REVOKE EXECUTE ON FUNCTION public.refresh_course_intel(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_hole_intel(uuid, int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_refresh_course_intel_ext() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_refresh_hole_intel() FROM PUBLIC, anon, authenticated;
