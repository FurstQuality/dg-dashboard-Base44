-- 1) user_achievements: owner-only reads
DROP POLICY IF EXISTS "Authenticated users can view user achievements" ON public.user_achievements;
DROP POLICY IF EXISTS "user_achievements public read" ON public.user_achievements;

CREATE POLICY "Users can view their own achievements"
ON public.user_achievements
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

REVOKE SELECT ON public.user_achievements FROM anon;

-- 2) Revoke public execute on SECURITY DEFINER maintenance function
REVOKE ALL ON FUNCTION public.publish_due_content_drafts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_due_content_drafts() FROM anon;
GRANT EXECUTE ON FUNCTION public.publish_due_content_drafts() TO service_role;