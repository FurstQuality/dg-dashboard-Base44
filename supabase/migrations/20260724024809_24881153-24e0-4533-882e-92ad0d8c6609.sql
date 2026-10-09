GRANT SELECT ON public.courses TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT ALL ON public.courses TO service_role;

GRANT SELECT ON public.holes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holes TO authenticated;
GRANT ALL ON public.holes TO service_role;

GRANT SELECT ON public.course_layouts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_layouts TO authenticated;
GRANT ALL ON public.course_layouts TO service_role;

GRANT SELECT ON public.hole_tees TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hole_tees TO authenticated;
GRANT ALL ON public.hole_tees TO service_role;

GRANT SELECT ON public.hole_baskets TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hole_baskets TO authenticated;
GRANT ALL ON public.hole_baskets TO service_role;

GRANT SELECT ON public.course_features TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_features TO authenticated;
GRANT ALL ON public.course_features TO service_role;

GRANT SELECT ON public.hole_media TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hole_media TO authenticated;
GRANT ALL ON public.hole_media TO service_role;

GRANT SELECT ON public.course_reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_reviews TO authenticated;
GRANT ALL ON public.course_reviews TO service_role;

GRANT SELECT ON public.course_edit_requests TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_edit_requests TO authenticated;
GRANT ALL ON public.course_edit_requests TO service_role;