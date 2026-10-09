-- 1) app_user_connections: never expose the ciphertext through the Data API.
DROP POLICY IF EXISTS "Users can view their own connection presence" ON public.app_user_connections;
REVOKE SELECT ON public.app_user_connections FROM authenticated, anon;

-- 2) beta_feedback_votes: own votes only (admins keep full visibility).
DROP POLICY IF EXISTS "Read votes" ON public.beta_feedback_votes;
CREATE POLICY "Read own votes" ON public.beta_feedback_votes
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  );