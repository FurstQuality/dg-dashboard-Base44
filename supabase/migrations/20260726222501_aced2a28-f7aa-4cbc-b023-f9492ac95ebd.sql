-- 1. Columns
ALTER TABLE public.external_rounds
  ADD COLUMN IF NOT EXISTS mock_pdga_rating integer,
  ADD COLUMN IF NOT EXISTS mock_pdga_source text;

ALTER TABLE public.round_ratings
  ADD COLUMN IF NOT EXISTS mock_pdga_rating integer,
  ADD COLUMN IF NOT EXISTS mock_pdga_source text;

CREATE INDEX IF NOT EXISTS external_rounds_mock_rating_idx
  ON public.external_rounds(user_id, played_on DESC)
  WHERE mock_pdga_rating IS NOT NULL;

-- 2. Normalizer
CREATE OR REPLACE FUNCTION public.normalize_course_name(_name text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(btrim(regexp_replace(coalesce(_name, ''), '\s+', ' ', 'g')));
$$;

-- 3. Core resolver
CREATE OR REPLACE FUNCTION public.compute_mock_pdga_rating(
  _user_id uuid, _course_id uuid, _course_name text, _layout_name text,
  _score numeric, _to_par numeric, _played_on date
) RETURNS TABLE(rating integer, source text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  norm text := public.normalize_course_name(_course_name);
  est integer;
  found_any boolean := false;
BEGIN
  IF _score IS NULL OR _score <= 0 THEN
    RETURN QUERY SELECT NULL::int, NULL::text; RETURN;
  END IF;

  RETURN QUERY
  WITH tier1 AS (
    SELECT round(1000 - ((_score - p.ssa) * p.stroke_value))::int AS r, 'approved_profile'::text AS s
      FROM public.course_rating_profiles p
     WHERE p.status = 'approved' AND p.stroke_value > 0
       AND (
         (_course_id IS NOT NULL AND p.course_id = _course_id)
         OR public.normalize_course_name(p.course_name) = norm
       )
     ORDER BY (case when _course_id IS NOT NULL AND p.course_id = _course_id then 0 else 1 end),
              p.updated_at DESC
     LIMIT 1
  ),
  pdga_hist AS (
    SELECT AVG(er.ssa)::numeric AS avg_ssa,
           AVG(CASE WHEN (er.score - er.ssa) <> 0
                    THEN (1000 - er.round_rating)::numeric / (er.score - er.ssa) END) AS sv,
           COUNT(*) AS n,
           COUNT(DISTINCT er.pdga_event_ref) AS ev
      FROM public.external_rounds er
     WHERE er.source = 'pdga' AND er.round_rating IS NOT NULL AND er.ssa IS NOT NULL
       AND er.format = 'singles'
       AND public.normalize_course_name(er.course_name) = norm
       AND er.played_on >= (coalesce(_played_on, current_date) - interval '24 months')::date
  ),
  tier2 AS (
    SELECT round(1000 - ((_score - avg_ssa) * coalesce(sv, 10)))::int AS r, 'pdga_course_history'::text AS s
      FROM pdga_hist WHERE n >= 6 AND ev >= 2 AND avg_ssa IS NOT NULL
  ),
  user_hist AS (
    SELECT AVG(er.ssa)::numeric AS avg_ssa,
           AVG(CASE WHEN (er.score - er.ssa) <> 0
                    THEN (1000 - er.round_rating)::numeric / (er.score - er.ssa) END) AS sv,
           COUNT(*) AS n
      FROM public.external_rounds er
     WHERE er.user_id = _user_id AND er.round_rating IS NOT NULL AND er.ssa IS NOT NULL
       AND er.format = 'singles'
       AND public.normalize_course_name(er.course_name) = norm
  ),
  tier3 AS (
    SELECT round(1000 - ((_score - avg_ssa) * coalesce(sv, 10)))::int AS r, 'user_course_history'::text AS s
      FROM user_hist WHERE n >= 3 AND avg_ssa IS NOT NULL
  ),
  picked AS (
    SELECT r, s FROM tier1
    UNION ALL SELECT r, s FROM tier2 WHERE NOT EXISTS(SELECT 1 FROM tier1)
    UNION ALL SELECT r, s FROM tier3 WHERE NOT EXISTS(SELECT 1 FROM tier1) AND NOT EXISTS(SELECT 1 FROM tier2)
  )
  SELECT r, s FROM picked LIMIT 1;

  GET DIAGNOSTICS found_any = ROW_COUNT;
  IF found_any THEN RETURN; END IF;

  est := public.estimate_chainlink_from_par(_user_id, _score, _to_par);
  IF est IS NOT NULL THEN
    RETURN QUERY SELECT est, 'par_estimate'::text; RETURN;
  END IF;

  RETURN QUERY SELECT NULL::int, NULL::text;
END; $$;

-- 4. Clamped wrapper
CREATE OR REPLACE FUNCTION public.compute_mock_pdga_rating_clamped(
  _user_id uuid, _course_id uuid, _course_name text, _layout_name text,
  _score numeric, _to_par numeric, _played_on date
) RETURNS TABLE(rating integer, source text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE raw_rating int; raw_source text; anchor int;
BEGIN
  SELECT r.rating, r.source INTO raw_rating, raw_source
    FROM public.compute_mock_pdga_rating(_user_id, _course_id, _course_name, _layout_name, _score, _to_par, _played_on) r;
  IF raw_rating IS NULL THEN
    RETURN QUERY SELECT NULL::int, NULL::text; RETURN;
  END IF;
  SELECT pdga_rating INTO anchor FROM public.profiles WHERE id = _user_id;
  IF anchor IS NOT NULL AND raw_source IS DISTINCT FROM 'pdga_official' THEN
    raw_rating := GREATEST(anchor - 200, LEAST(anchor + 80, raw_rating));
  END IF;
  RETURN QUERY SELECT raw_rating, raw_source;
END; $$;

-- 5. Trigger: external_rounds
CREATE OR REPLACE FUNCTION public.set_mock_pdga_on_external_round()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r_int int; r_src text;
BEGIN
  IF NEW.source = 'pdga' AND NEW.round_rating IS NOT NULL THEN
    NEW.mock_pdga_rating := NEW.round_rating;
    NEW.mock_pdga_source := 'pdga_official';
    RETURN NEW;
  END IF;
  IF NEW.format IS DISTINCT FROM 'singles' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.mock_pdga_rating IS NOT NULL
     AND NEW.score IS NOT DISTINCT FROM OLD.score
     AND NEW.to_par IS NOT DISTINCT FROM OLD.to_par
     AND NEW.course_name IS NOT DISTINCT FROM OLD.course_name THEN
    RETURN NEW;
  END IF;
  SELECT c.rating, c.source INTO r_int, r_src
    FROM public.compute_mock_pdga_rating_clamped(
      NEW.user_id, NULL, NEW.course_name, NEW.layout_name,
      NEW.score::numeric, NEW.to_par::numeric, NEW.played_on
    ) c;
  NEW.mock_pdga_rating := r_int;
  NEW.mock_pdga_source := r_src;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS set_mock_pdga_on_external_round ON public.external_rounds;
CREATE TRIGGER set_mock_pdga_on_external_round
  BEFORE INSERT OR UPDATE ON public.external_rounds
  FOR EACH ROW EXECUTE FUNCTION public.set_mock_pdga_on_external_round();

-- 6. Trigger: round_ratings
CREATE OR REPLACE FUNCTION public.set_mock_pdga_on_round_rating()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Live Chainlink rounds already compute a real PDGA-style round_rating.
  IF NEW.round_rating IS NOT NULL THEN
    NEW.mock_pdga_rating := NEW.round_rating;
    NEW.mock_pdga_source := 'chainlink_live';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS set_mock_pdga_on_round_rating ON public.round_ratings;
CREATE TRIGGER set_mock_pdga_on_round_rating
  BEFORE INSERT OR UPDATE ON public.round_ratings
  FOR EACH ROW EXECUTE FUNCTION public.set_mock_pdga_on_round_rating();

-- 7. Backfill
DO $$
DECLARE r record; c record;
BEGIN
  FOR r IN SELECT id, user_id, course_name, layout_name, score, to_par, played_on, source, round_rating, format
             FROM public.external_rounds
            WHERE mock_pdga_rating IS NULL AND score IS NOT NULL
  LOOP
    IF r.source = 'pdga' AND r.round_rating IS NOT NULL THEN
      UPDATE public.external_rounds
         SET mock_pdga_rating = r.round_rating, mock_pdga_source = 'pdga_official'
       WHERE id = r.id;
    ELSIF r.format = 'singles' THEN
      SELECT rating, source INTO c
        FROM public.compute_mock_pdga_rating_clamped(
          r.user_id, NULL, r.course_name, r.layout_name,
          r.score::numeric, r.to_par::numeric, r.played_on);
      IF c.rating IS NOT NULL THEN
        UPDATE public.external_rounds
           SET mock_pdga_rating = c.rating, mock_pdga_source = c.source
         WHERE id = r.id;
      END IF;
    END IF;
  END LOOP;
END $$;

UPDATE public.round_ratings
   SET mock_pdga_rating = round_rating, mock_pdga_source = 'chainlink_live'
 WHERE mock_pdga_rating IS NULL AND round_rating IS NOT NULL;