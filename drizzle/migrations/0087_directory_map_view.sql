CREATE INDEX IF NOT EXISTS courses_directory_latlng_idx ON public.courses (latitude, longitude)
  WHERE moderation_status = 'approved' AND merged_into_course_id IS NULL AND latitude IS NOT NULL;

-- One canonical directory map query. Returns the filtered set's bounding box and
-- total, plus either grid clusters (dense, zoomed-out views) or pins in view.
-- Reads canonical courses only; never requires a layout, par or source link.
CREATE OR REPLACE FUNCTION public.directory_map_view(
  _south double precision, _west double precision, _north double precision, _east double precision,
  _zoom double precision,
  _q text DEFAULT NULL, _states text[] DEFAULT NULL, _holes text DEFAULT NULL,
  _min_rating numeric DEFAULT NULL, _difficulty text DEFAULT NULL, _scoring text DEFAULT NULL,
  _force_pins boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cell double precision := 80.0 / power(2, greatest(least(coalesce(_zoom, 4), 18), 1));
  in_view int; result jsonb; agg jsonb;
  qq text := nullif(trim(regexp_replace(coalesce(_q, ''), '[%_,()]', ' ', 'g')), '');
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _dmv (id uuid, name text, slug text, city text, state text, country text,
    latitude double precision, longitude double precision, cover_url text, hole_count int, difficulty text,
    source text, pdga_rating numeric, pdga_rating_votes int, year_established int, location_quality text,
    layout_count int, layout_verified boolean) ON COMMIT DROP;
  TRUNCATE _dmv;
  INSERT INTO _dmv
  SELECT c.id, c.name, c.slug, c.city, c.state, c.country, c.latitude, c.longitude, c.cover_url, c.hole_count,
         c.difficulty, c.source, c.pdga_rating, c.pdga_rating_votes, c.year_established, c.location_quality,
         coalesce(l.n, 0), coalesce(l.verified, false)
  FROM public.courses c
  LEFT JOIN LATERAL (
    SELECT count(*)::int n, bool_or(coalesce(hole_count,0) > 0 AND coalesce(distance_total,0) > 0) verified
    FROM public.course_layouts WHERE course_id = c.id
  ) l ON true
  WHERE c.moderation_status = 'approved' AND coalesce(c.is_ghost, false) = false
    AND c.merged_into_course_id IS NULL AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL
    AND (qq IS NULL OR c.name ILIKE '%'||qq||'%' OR c.city ILIKE '%'||qq||'%' OR c.state ILIKE '%'||qq||'%')
    AND (_states IS NULL OR lower(c.state) = ANY (SELECT lower(s) FROM unnest(_states) s))
    AND (_holes IS NULL OR _holes = 'any'
         OR (_holes = '9' AND c.hole_count <= 9)
         OR (_holes = '18' AND c.hole_count BETWEEN 10 AND 18)
         OR (_holes = '24+' AND c.hole_count >= 19))
    AND (_min_rating IS NULL OR c.pdga_rating >= _min_rating)
    AND (_difficulty IS NULL OR _difficulty = 'any' OR c.difficulty = _difficulty);

  IF _scoring = 'verified' THEN DELETE FROM _dmv WHERE NOT layout_verified;
  ELSIF _scoring = 'ready' THEN DELETE FROM _dmv WHERE layout_count = 0;
  ELSIF _scoring = 'pending' THEN DELETE FROM _dmv WHERE layout_count > 0;
  END IF;

  SELECT jsonb_build_object('total', count(*),
    'bbox', CASE WHEN count(*) = 0 THEN NULL ELSE jsonb_build_array(min(latitude), min(longitude), max(latitude), max(longitude)) END)
  INTO agg FROM _dmv;

  SELECT count(*) INTO in_view FROM _dmv
   WHERE latitude BETWEEN _south AND _north
     AND (CASE WHEN _west <= _east THEN longitude BETWEEN _west AND _east ELSE longitude >= _west OR longitude <= _east END);

  IF NOT _force_pins AND in_view > 1500 THEN
    SELECT jsonb_agg(jsonb_build_object('lat', lat, 'lng', lng, 'n', n)) INTO result FROM (
      SELECT avg(latitude) lat, avg(longitude) lng, count(*) n FROM _dmv
       WHERE latitude BETWEEN _south AND _north
         AND (CASE WHEN _west <= _east THEN longitude BETWEEN _west AND _east ELSE longitude >= _west OR longitude <= _east END)
       GROUP BY floor(latitude / cell), floor(longitude / cell)) g;
    RETURN agg || jsonb_build_object('in_view', in_view, 'clusters', coalesce(result, '[]'::jsonb), 'pins', '[]'::jsonb);
  END IF;

  SELECT jsonb_agg(to_jsonb(d)) INTO result FROM (
    SELECT * FROM _dmv
     WHERE latitude BETWEEN _south AND _north
       AND (CASE WHEN _west <= _east THEN longitude BETWEEN _west AND _east ELSE longitude >= _west OR longitude <= _east END)
     LIMIT 4000) d;
  RETURN agg || jsonb_build_object('in_view', in_view, 'clusters', NULL, 'pins', coalesce(result, '[]'::jsonb));
END $$;
GRANT EXECUTE ON FUNCTION public.directory_map_view(double precision,double precision,double precision,double precision,double precision,text,text[],text,numeric,text,text,boolean) TO anon, authenticated;