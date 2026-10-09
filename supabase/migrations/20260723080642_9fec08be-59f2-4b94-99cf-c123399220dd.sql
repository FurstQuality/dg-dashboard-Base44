REVOKE EXECUTE ON FUNCTION public.award_achievement(uuid, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.award_xp(uuid, text, integer, text, text, jsonb) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bump_challenge_progress(uuid, challenge_goal_type, integer) FROM anon, authenticated, PUBLIC;