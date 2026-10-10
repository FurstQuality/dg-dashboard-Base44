CREATE OR REPLACE FUNCTION public.directory_map_coverage()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE WHEN NOT public.has_role(auth.uid(), 'admin') AND NOT public.has_role(auth.uid(), 'super_admin') THEN NULL ELSE
  jsonb_build_object(
    'canonical', count(*) FILTER (WHERE merged_into_course_id IS NULL AND coalesce(is_ghost,false) = false),
    'directory_ready', count(*) FILTER (WHERE merged_into_course_id IS NULL AND coalesce(is_ghost,false) = false AND moderation_status = 'approved'),
    'pin_ready', count(*) FILTER (WHERE merged_into_course_id IS NULL AND coalesce(is_ghost,false) = false AND moderation_status = 'approved' AND latitude IS NOT NULL AND longitude IS NOT NULL),
    'pin_exact', count(*) FILTER (WHERE merged_into_course_id IS NULL AND coalesce(is_ghost,false) = false AND moderation_status = 'approved' AND latitude IS NOT NULL AND location_quality IN ('verified_gps','source_coordinate','address_geocoded','park_geocoded')),
    'pin_approximate', count(*) FILTER (WHERE merged_into_course_id IS NULL AND coalesce(is_ghost,false) = false AND moderation_status = 'approved' AND latitude IS NOT NULL AND location_quality NOT IN ('verified_gps','source_coordinate','address_geocoded','park_geocoded')),
    'missing_location', count(*) FILTER (WHERE merged_into_course_id IS NULL AND coalesce(is_ghost,false) = false AND moderation_status = 'approved' AND (latitude IS NULL OR longitude IS NULL)),
    'pending_review', count(*) FILTER (WHERE merged_into_course_id IS NULL AND coalesce(is_ghost,false) = false AND moderation_status = 'pending'),
    'rejected', count(*) FILTER (WHERE moderation_status = 'rejected'),
    'ghosts', count(*) FILTER (WHERE coalesce(is_ghost,false) = true),
    'joined', count(*) FILTER (WHERE merged_into_course_id IS NOT NULL)
  ) END
  FROM public.courses;
$$;
REVOKE ALL ON FUNCTION public.directory_map_coverage() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.directory_map_coverage() TO authenticated;

CREATE OR REPLACE FUNCTION public.course_directory_diagnostic(_course_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'approved', moderation_status = 'approved',
    'moderation_status', moderation_status,
    'not_ghost', coalesce(is_ghost,false) = false,
    'not_joined', merged_into_course_id IS NULL,
    'joined_into', merged_into_course_id,
    'has_location', latitude IS NOT NULL AND longitude IS NOT NULL,
    'location_quality', location_quality,
    'should_be_on_map', moderation_status = 'approved' AND coalesce(is_ghost,false) = false AND merged_into_course_id IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL
  )
  FROM public.courses WHERE id = _course_id
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
$$;
REVOKE ALL ON FUNCTION public.course_directory_diagnostic(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.course_directory_diagnostic(uuid) TO authenticated;