DROP POLICY IF EXISTS "Signed-in players can read verifications" ON public.contribution_verifications;
CREATE POLICY "Verifiers, contributors and admins read verifications"
ON public.contribution_verifications FOR SELECT TO authenticated
USING (
  verifier_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.contributions c WHERE c.id = contribution_verifications.contribution_id AND c.user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);