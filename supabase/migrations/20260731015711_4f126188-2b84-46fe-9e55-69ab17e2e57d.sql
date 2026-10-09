-- 1) Lock down writes to shared scraped course-review data.
DROP POLICY IF EXISTS "dgcr_courses_insert_authenticated" ON public.dgcr_courses;
DROP POLICY IF EXISTS "dgcr_courses_update_authenticated" ON public.dgcr_courses;

CREATE POLICY "dgcr_courses_insert_admin"
  ON public.dgcr_courses FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "dgcr_courses_update_admin"
  ON public.dgcr_courses FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

REVOKE INSERT, UPDATE, DELETE ON public.dgcr_courses FROM anon;
GRANT SELECT ON public.dgcr_courses TO authenticated;
GRANT INSERT, UPDATE ON public.dgcr_courses TO authenticated; -- still gated by the admin policies above
GRANT ALL ON public.dgcr_courses TO service_role;

-- 2) Stop signed-out callers from executing SECURITY DEFINER functions.
REVOKE EXECUTE ON FUNCTION public.find_duplicate_courses(text, text, text, double precision, double precision, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_duplicate_courses(text, text, text, double precision, double precision, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.bump_beta_comment_count() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bump_beta_vote_count() FROM anon, PUBLIC;