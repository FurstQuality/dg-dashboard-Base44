CREATE OR REPLACE FUNCTION public.course_listing_set_aside_reasons()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN NULL ELSE
  coalesce(jsonb_agg(jsonb_build_object('status', status, 'reason', reason, 'n', n) ORDER BY n DESC), '[]'::jsonb) END
  FROM (
    SELECT status,
      CASE WHEN status = 'skipped' THEN 'Outside the US: ' || coalesce(nullif(country, ''), 'country not listed')
           ELSE coalesce(nullif(last_error, ''), 'Page could not be read') END AS reason,
      count(*) n
    FROM public.udisc_catalog WHERE status IN ('skipped', 'failed')
    GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 40
  ) r;
$$;
REVOKE ALL ON FUNCTION public.course_listing_set_aside_reasons() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.course_listing_set_aside_reasons() TO authenticated;

CREATE OR REPLACE FUNCTION public.course_source_coverage()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN NULL ELSE
  jsonb_build_object(
    'pdga', count(*) FILTER (WHERE 'pdga' = ANY(srcs)),
    'udisc', count(*) FILTER (WHERE 'udisc' = ANY(srcs)),
    'disc_golf_scene', count(*) FILTER (WHERE 'disc_golf_scene' = ANY(srcs)),
    'multi', count(*) FILTER (WHERE cardinality(srcs) >= 2),
    'single', count(*) FILTER (WHERE cardinality(srcs) = 1),
    'none', count(*) FILTER (WHERE cardinality(srcs) = 0)
  ) END
  FROM (
    SELECT c.id, coalesce(array_agg(DISTINCT s.source) FILTER (WHERE s.source IS NOT NULL), '{}') srcs
    FROM public.courses c LEFT JOIN public.course_sources s ON s.course_id = c.id
    WHERE c.merged_into_course_id IS NULL AND coalesce(c.is_ghost, false) = false AND c.moderation_status = 'approved'
    GROUP BY c.id
  ) x;
$$;
REVOKE ALL ON FUNCTION public.course_source_coverage() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.course_source_coverage() TO authenticated;