-- 1. user_progress: no client-side value writes
DROP POLICY IF EXISTS "progress self write" ON public.user_progress;
DROP POLICY IF EXISTS "progress self insert" ON public.user_progress;

CREATE POLICY "user_progress owner insert blank" ON public.user_progress
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND xp = 0 AND level = 0 AND coins = 0
    AND streak_days = 0 AND longest_streak = 0
  );

REVOKE UPDATE ON public.user_progress FROM authenticated;
GRANT SELECT, INSERT ON public.user_progress TO authenticated;
GRANT ALL ON public.user_progress TO service_role;

-- 2. live_sync_registry: reads only for users, writes only for the service role
DROP POLICY IF EXISTS "Signed-in players can refresh registry metadata" ON public.live_sync_registry;
DROP POLICY IF EXISTS "Signed-in players can register events for live sync" ON public.live_sync_registry;

REVOKE INSERT, UPDATE, DELETE ON public.live_sync_registry FROM authenticated;
GRANT SELECT ON public.live_sync_registry TO authenticated;
GRANT ALL ON public.live_sync_registry TO service_role;

-- 3. SECURITY DEFINER functions should not be callable by anonymous clients
REVOKE ALL ON FUNCTION public.friends_live_rounds() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.friends_live_rounds() TO authenticated;

REVOKE ALL ON FUNCTION public.guard_director_review() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_profile_director_flag() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_director_badge() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_all_course_intel() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_all_layout_models() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_layout_model(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.merge_duplicate_courses(uuid, uuid) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.is_approved_creator(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_approved_director(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_approved_creator(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_approved_director(uuid) TO authenticated;
