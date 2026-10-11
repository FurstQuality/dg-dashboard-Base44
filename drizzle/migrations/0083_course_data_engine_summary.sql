CREATE OR REPLACE FUNCTION public.course_data_engine_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE out jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  SELECT jsonb_build_object(
    'courses', (SELECT count(*) FROM courses WHERE merged_into_course_id IS NULL),
    'location', (SELECT jsonb_object_agg(coalesce(location_quality,'unknown'), n) FROM (SELECT location_quality, count(*) n FROM courses WHERE merged_into_course_id IS NULL GROUP BY 1) x),
    'sources', (SELECT jsonb_object_agg(source, n) FROM (SELECT source, count(*) n FROM course_sources GROUP BY 1) y),
    'snapshots', (SELECT count(*) FROM source_snapshots),
    'observations', (SELECT count(*) FROM field_observations),
    'pending_matches', (SELECT count(*) FROM course_match_candidates WHERE status = 'pending'),
    'holes', (SELECT count(*) FROM holes),
    'par_confirmed', (SELECT count(*) FROM holes WHERE par_confirmed),
    'states', (SELECT jsonb_agg(row_to_json(s) ORDER BY s.courses DESC) FROM (
       SELECT coalesce(nullif(state,''),'—') AS state, count(*) AS courses,
              count(*) FILTER (WHERE location_quality IN ('verified_gps','source_coordinate','address_geocoded','park_geocoded')) AS exact_pins
       FROM courses WHERE merged_into_course_id IS NULL GROUP BY 1) s)
  ) INTO out;
  RETURN out;
END $$;
REVOKE ALL ON FUNCTION public.course_data_engine_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.course_data_engine_summary() TO authenticated;