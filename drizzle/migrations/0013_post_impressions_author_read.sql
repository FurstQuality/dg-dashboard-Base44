DROP POLICY IF EXISTS post_impressions_read ON public.post_impressions;
CREATE POLICY post_impressions_read ON public.post_impressions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_impressions.post_id AND p.author_id = auth.uid()) OR public.is_platform_admin(auth.uid()));