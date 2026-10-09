-- 1. New columns on course_intel for alias merging + modelled difficulty
ALTER TABLE public.course_intel ADD COLUMN IF NOT EXISTS match_key text;
ALTER TABLE public.course_intel ADD COLUMN IF NOT EXISTS est_ssa numeric;
ALTER TABLE public.course_intel ADD COLUMN IF NOT EXISTS est_stroke_value numeric;
ALTER TABLE public.course_intel ADD COLUMN IF NOT EXISTS rating_rounds_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.course_intel ADD COLUMN IF NOT EXISTS avg_score numeric;

UPDATE public.course_intel
   SET match_key = public.course_match_key(course_name)
 WHERE match_key IS DISTINCT FROM public.course_match_key(course_name);

CREATE INDEX IF NOT EXISTS course_intel_match_key_idx ON public.course_intel (match_key);
CREATE INDEX IF NOT EXISTS course_intel_course_id_idx ON public.course_intel (course_id);

-- 2. Rebuild course history by merge key, resolve the real course, fit difficulty
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
BEGIN
  IF _course_id IS NULL AND (mkey IS NULL OR mkey = '') THEN RETURN; END IF;

  IF resolved IS NULL AND mkey <> '' THEN
    SELECT c.id INTO resolved
      FROM public.courses c
     WHERE public.course_match_key(c.name) = mkey
     ORDER BY (c.moderation_status = 'approved') DESC NULLS LAST,
              c.hole_count DESC NULLS LAST,
              c.created_at ASC
     LIMIT 1;
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

-- 3. Full rebuild + alias collapse
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

  DELETE FROM public.course_intel ci
   USING (
     SELECT match_key,
            (array_agg(course_key ORDER BY rounds_count DESC NULLS LAST, length(course_name) DESC))[1] AS keep_key
       FROM public.course_intel
      WHERE match_key IS NOT NULL AND match_key <> ''
      GROUP BY match_key
   ) d
   WHERE ci.match_key = d.match_key AND ci.course_key <> d.keep_key;

  RETURN n;
END; $function$;

-- 4. Layout totals + difficulty model from real holes and approved rating profiles
CREATE OR REPLACE FUNCTION public.refresh_layout_model(_layout_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  h record;
  cid uuid;
  cname text;
  prof record;
  intel record;
BEGIN
  IF _layout_id IS NULL THEN RETURN; END IF;

  SELECT cl.course_id, c.name INTO cid, cname
    FROM public.course_layouts cl
    LEFT JOIN public.courses c ON c.id = cl.course_id
   WHERE cl.id = _layout_id;

  SELECT COUNT(*) AS holes,
         SUM(par) AS par_total,
         SUM(distance_ft) AS dist_total,
         MAX(distance_ft) AS longest,
         MIN(distance_ft) AS shortest,
         COUNT(*) FILTER (WHERE hazards IS NOT NULL AND hazards::text ILIKE '%water%') AS water_holes
    INTO h
    FROM public.holes WHERE layout_id = _layout_id;

  UPDATE public.course_layouts SET
    hole_count = COALESCE(NULLIF(h.holes, 0), hole_count),
    par_total = COALESCE(h.par_total::int, par_total),
    distance_total = COALESCE(h.dist_total::int, distance_total),
    longest_hole_ft = COALESCE(h.longest::int, longest_hole_ft),
    shortest_hole_ft = COALESCE(h.shortest::int, shortest_hole_ft),
    water_hole_count = COALESCE(NULLIF(h.water_holes, 0)::int, water_hole_count),
    design_updated_at = now()
  WHERE id = _layout_id;

  SELECT ssa AS scratch_rating, stroke_value INTO prof
    FROM public.course_rating_profiles
   WHERE status = 'approved'
     AND (course_id = cid OR (cid IS NULL AND cname IS NOT NULL
          AND public.course_match_key(course_name) = public.course_match_key(cname)))
   ORDER BY (course_id = cid) DESC NULLS LAST, updated_at DESC NULLS LAST
   LIMIT 1;

  SELECT est_ssa, est_stroke_value, rating_rounds_count INTO intel
    FROM public.course_intel
   WHERE (cid IS NOT NULL AND course_id = cid)
      OR (cname IS NOT NULL AND match_key = public.course_match_key(cname))
   ORDER BY rating_rounds_count DESC NULLS LAST, rounds_count DESC NULLS LAST
   LIMIT 1;

  UPDATE public.course_layouts SET
    scratch_rating = COALESCE(scratch_rating, prof.scratch_rating, intel.est_ssa),
    stroke_value = COALESCE(stroke_value, prof.stroke_value, intel.est_stroke_value)
  WHERE id = _layout_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.refresh_all_layout_models()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN SELECT id FROM public.course_layouts LOOP
    PERFORM public.refresh_layout_model(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END; $function$;

REVOKE ALL ON FUNCTION public.refresh_all_course_intel() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_all_layout_models() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_layout_model(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_all_course_intel() TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_all_layout_models() TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_layout_model(uuid) TO service_role;

-- 5. One-time backfill
SELECT public.refresh_all_course_intel();
SELECT public.refresh_all_layout_models();