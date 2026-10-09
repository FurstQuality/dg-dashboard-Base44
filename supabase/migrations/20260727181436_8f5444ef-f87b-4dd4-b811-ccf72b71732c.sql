
-- Fix mutable search_path on normalize_course_name
ALTER FUNCTION public.normalize_course_name(text) SET search_path = public;

-- Revoke anon EXECUTE from SECURITY DEFINER functions that should not be callable while signed out
REVOKE EXECUTE ON FUNCTION public.compute_mock_pdga_rating(uuid, uuid, text, text, numeric, numeric, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.compute_mock_pdga_rating_clamped(uuid, uuid, text, text, numeric, numeric, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.consume_feature(uuid, text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.feature_limit(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_effective_tier(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_feature(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pdga_kb_search_courses(text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pdga_kb_search_events(text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pdga_kb_search_players(text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pdga_kb_stats() FROM PUBLIC, anon;
