CREATE OR REPLACE FUNCTION public.refresh_course_intel(_course_id uuid, _course_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  norm text := public.normalize_course_name(_course_name);
  mkey text := public.course_match_key(_course_name);
  key text;
  resolved uuid := _course_id;
  base text;
BEGIN
  IF _course_id IS NULL AND (mkey IS NULL OR mkey = '') THEN RETURN; END IF;

  -- Skip imported scorecard junk: date ranges and bare numbers are not courses.
  IF _course_id IS NULL AND (
       _course_name ~* '^\s*\d{1,2}-[A-Za-z]{3}'
    OR _course_name ~* '\d{1,2}-[A-Za-z]{3}(-\d{2,4})?\s*$'
    OR length(mkey) < 4
  ) THEN RETURN; END IF;

  IF resolved IS NULL AND mkey <> '' THEN
    SELECT c.id INTO resolved
      FROM public.courses c
     WHERE public.course_match_key(c.name) = mkey
     ORDER BY (c.moderation_status = 'approved') DESC NULLS LAST,
              c.hole_count DESC NULLS LAST,
              c.created_at ASC
     LIMIT 1;
  END IF;

  -- Fallback: drop a trailing layout suffix ("Course - Silver") and retry.
  IF resolved IS NULL AND _course_name IS NOT NULL THEN
    base := public.course_match_key(regexp_replace(_course_name, '\s*[-–—]\s*[^-–—]+$', ''));
    IF base IS NOT NULL AND length(base) >= 4 THEN
      SELECT c.id INTO resolved
        FROM public.courses c
       WHERE public.course_match_key(c.name) = base
       ORDER BY (c.moderation_status = 'approved') DESC NULLS LAST,
                c.hole_count DESC NULLS LAST,
                c.created_at ASC
       LIMIT 1;
    END IF;
  END IF;

  IF resolved IS NOT NULL AND (_course_name IS NULL OR mkey = '') THEN
    SELECT public.course_match_key(c.name), public.normalize_course_name(c.name)
      INTO mkey, norm
      FROM public.courses c WHERE c.id = resolved;
  END IF;

  key := CASE WHEN _course_id IS NOT NULL THEN 'id:'||_course_id::text ELSE norm END;

  INSERT INTO public.course_intel AS ci (
    course_key, course_id, course_name, match_key,
    rounds_count, pdga_rounds_count, udisc_rounds_count,
    avg_ssa, avg_stroke_value, avg_round_rating, avg_to_par,
    best_round_rating, hardest_score, easiest_score, last_played_on,
    est_ssa, est_stroke_value, rating_rounds_count, avg_score, updated_at
  )
  SELECT
    key,
    resolved,
    COALESCE(_course_name, MAX(er.course_name)),
    mkey,
    COUNT(*),
    COUNT(*) FILTER (WHERE er.source = 'pdga'),
    COUNT(*) FILTER (WHERE er.source = 'udisc'),
    AVG(er.ssa)::numeric,
    AVG(CASE WHEN (er.score - er.ssa) <> 0 AND er.round_rating IS NOT NULL AND er.ssa IS NOT NULL
             THEN (1000 - er.round_rating)::numeric / (er.score - er.ssa) END),
    AVG(er.round_rating)::numeric,
    AVG(er.to_par)::numeric,
    MAX(er.round_rating),
    MAX(er.score),
    MIN(er.score),
    MAX(er.played_on),
    CASE
      WHEN COUNT(*) FILTER (WHERE er.round_rating IS NOT NULL AND er.score IS NOT NULL) >= 3
       AND regr_slope(er.round_rating, er.score) FILTER (WHERE er.round_rating IS NOT NULL AND er.score IS NOT NULL) < -1
      THEN (1000 - regr_intercept(er.round_rating, er.score) FILTER (WHERE er.round_rating IS NOT NULL AND er.score IS NOT NULL))
           / regr_slope(er.round_rating, er.score) FILTER (WHERE er.round_rating IS NOT NULL AND er.score IS NOT NULL)
      ELSE AVG(er.ssa)::numeric
    END,
    CASE
      WHEN COUNT(*) FILTER (WHERE er.round_rating IS NOT NULL AND er.score IS NOT NULL) >= 3
       AND regr_slope(er.round_rating, er.score) FILTER (WHERE er.round_rating IS NOT NULL AND er.score IS NOT NULL) < -1
      THEN -regr_slope(er.round_rating, er.score) FILTER (WHERE er.round_rating IS NOT NULL AND er.score IS NOT NULL)
      ELSE NULL
    END,
    COUNT(*) FILTER (WHERE er.round_rating IS NOT NULL AND er.score IS NOT NULL),
    AVG(er.score)::numeric,
    now()
  FROM public.external_rounds er
  WHERE er.format = 'singles'
    AND mkey <> '' AND public.course_match_key(er.course_name) = mkey
  HAVING COUNT(*) > 0
  ON CONFLICT (course_key) DO UPDATE SET
    course_id = COALESCE(EXCLUDED.course_id, ci.course_id),
    course_name = COALESCE(EXCLUDED.course_name, ci.course_name),
    match_key = COALESCE(EXCLUDED.match_key, ci.match_key),
    rounds_count = EXCLUDED.rounds_count,
    pdga_rounds_count = EXCLUDED.pdga_rounds_count,
    udisc_rounds_count = EXCLUDED.udisc_rounds_count,
    avg_ssa = EXCLUDED.avg_ssa,
    avg_stroke_value = EXCLUDED.avg_stroke_value,
    avg_round_rating = EXCLUDED.avg_round_rating,
    avg_to_par = EXCLUDED.avg_to_par,
    best_round_rating = EXCLUDED.best_round_rating,
    hardest_score = EXCLUDED.hardest_score,
    easiest_score = EXCLUDED.easiest_score,
    last_played_on = EXCLUDED.last_played_on,
    est_ssa = EXCLUDED.est_ssa,
    est_stroke_value = EXCLUDED.est_stroke_value,
    rating_rounds_count = EXCLUDED.rating_rounds_count,
    avg_score = EXCLUDED.avg_score,
    updated_at = now();
END; $function$;

CREATE OR REPLACE FUNCTION public.refresh_all_course_intel()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN
    SELECT mkey, (array_agg(course_name ORDER BY length(course_name) DESC))[1] AS nm
      FROM (
        SELECT public.course_match_key(course_name) AS mkey, course_name
          FROM public.external_rounds
         WHERE format = 'singles'
           AND course_name IS NOT NULL
           AND public.course_match_key(course_name) <> ''
      ) s
     GROUP BY mkey
  LOOP
    PERFORM public.refresh_course_intel(NULL, r.nm);
    n := n + 1;
  END LOOP;

  -- Keep the freshest, course-linked row per merge key.
  DELETE FROM public.course_intel ci
   USING (
     SELECT match_key,
            (array_agg(course_key ORDER BY updated_at DESC NULLS LAST,
                                          (course_id IS NOT NULL) DESC,
                                          rounds_count DESC NULLS LAST))[1] AS keep_key
       FROM public.course_intel
      WHERE match_key IS NOT NULL AND match_key <> ''
      GROUP BY match_key
   ) d
   WHERE ci.match_key = d.match_key AND ci.course_key <> d.keep_key;

  RETURN n;
END; $function$;

REVOKE ALL ON FUNCTION public.refresh_all_course_intel() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_all_course_intel() TO service_role;

SELECT public.refresh_all_course_intel();
SELECT public.refresh_all_layout_models();

-- Drop leftover junk rows from earlier imports.
DELETE FROM public.course_intel
 WHERE course_id IS NULL
   AND (course_name ~* '^\s*\d{1,2}-[A-Za-z]{3}'
     OR course_name ~* '\d{1,2}-[A-Za-z]{3}(-\d{2,4})?\s*$'
     OR length(coalesce(match_key,'')) < 4);