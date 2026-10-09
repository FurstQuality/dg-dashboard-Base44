
-- PDGA-first rating: prefer imported PDGA rated rounds when present.
CREATE OR REPLACE FUNCTION public.player_rating_average(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  pdga_count integer;
  result integer;
BEGIN
  -- Count PDGA rated rounds in the last 12 months
  SELECT COUNT(*) INTO pdga_count
  FROM public.external_rounds
  WHERE user_id = _user_id
    AND source = 'pdga'
    AND round_rating IS NOT NULL
    AND played_on >= (now() - interval '12 months')::date;

  IF pdga_count > 0 THEN
    -- PDGA-only path with outlier trim
    WITH ratings AS (
      SELECT round_rating::numeric AS r
      FROM public.external_rounds
      WHERE user_id = _user_id
        AND source = 'pdga'
        AND round_rating IS NOT NULL
        AND played_on >= (now() - interval '12 months')::date
      ORDER BY played_on DESC
      LIMIT 25
    ),
    stats AS (
      SELECT AVG(r) AS mean, COALESCE(stddev_pop(r), 0) AS sd, COUNT(*) AS n FROM ratings
    ),
    kept AS (
      SELECT r FROM ratings, stats
      WHERE stats.n < 8 OR r >= stats.mean - 2.5 * stats.sd
    )
    SELECT COALESCE(ROUND(AVG(r))::int, 0) INTO result FROM kept;
    RETURN result;
  END IF;

  -- Fallback: combined app-scored ratings + non-PDGA imports (last 8, unweighted)
  WITH combined AS (
    SELECT round_rating::numeric AS r, created_at AS ts
      FROM public.round_ratings
     WHERE user_id = _user_id AND round_rating IS NOT NULL
    UNION ALL
    SELECT round_rating::numeric AS r, (played_on::timestamptz) AS ts
      FROM public.external_rounds
     WHERE user_id = _user_id AND round_rating IS NOT NULL
  ),
  last8 AS (
    SELECT r FROM combined ORDER BY ts DESC LIMIT 8
  )
  SELECT COALESCE(ROUND(AVG(r))::int, 0) INTO result FROM last8;
  RETURN result;
END;
$$;

-- Rich details for UI: rating, source, count, best, worst, last_date.
CREATE OR REPLACE FUNCTION public.player_rating_details(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  pdga_count integer;
  best_r integer;
  worst_r integer;
  last_date date;
  rating integer;
  used integer;
  src text;
BEGIN
  SELECT COUNT(*) INTO pdga_count
  FROM public.external_rounds
  WHERE user_id = _user_id
    AND source = 'pdga'
    AND round_rating IS NOT NULL
    AND played_on >= (now() - interval '12 months')::date;

  IF pdga_count > 0 THEN
    src := 'pdga';
    WITH ratings AS (
      SELECT round_rating AS r, played_on
      FROM public.external_rounds
      WHERE user_id = _user_id
        AND source = 'pdga'
        AND round_rating IS NOT NULL
        AND played_on >= (now() - interval '12 months')::date
      ORDER BY played_on DESC
      LIMIT 25
    ),
    stats AS (
      SELECT AVG(r) AS mean, COALESCE(stddev_pop(r), 0) AS sd, COUNT(*) AS n FROM ratings
    ),
    kept AS (
      SELECT r, played_on FROM ratings, stats
      WHERE stats.n < 8 OR r >= stats.mean - 2.5 * stats.sd
    )
    SELECT ROUND(AVG(r))::int, MAX(r), MIN(r), MAX(played_on), COUNT(*)
      INTO rating, best_r, worst_r, last_date, used
      FROM kept;
  ELSE
    src := 'fallback';
    WITH combined AS (
      SELECT round_rating AS r, created_at::date AS d
        FROM public.round_ratings
       WHERE user_id = _user_id AND round_rating IS NOT NULL
      UNION ALL
      SELECT round_rating AS r, played_on AS d
        FROM public.external_rounds
       WHERE user_id = _user_id AND round_rating IS NOT NULL
    ),
    last8 AS (
      SELECT r, d FROM combined ORDER BY d DESC LIMIT 8
    )
    SELECT ROUND(AVG(r))::int, MAX(r), MIN(r), MAX(d), COUNT(*)
      INTO rating, best_r, worst_r, last_date, used
      FROM last8;
  END IF;

  RETURN jsonb_build_object(
    'rating', COALESCE(rating, 0),
    'source', src,
    'used_rounds', COALESCE(used, 0),
    'best_round', best_r,
    'worst_round', worst_r,
    'last_round_date', last_date,
    'pdga_rounds_12mo', pdga_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.player_rating_average(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.player_rating_details(uuid) TO authenticated, anon;
