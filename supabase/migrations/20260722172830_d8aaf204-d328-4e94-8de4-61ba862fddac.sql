
CREATE OR REPLACE FUNCTION public.player_rating_details(_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  pdga_count integer;
  window_months int;
  best_r integer; worst_r integer; last_date date; rating integer; used integer; src text;
  official integer;
BEGIN
  SELECT pdga_rating INTO official FROM public.profiles WHERE id = _user_id;

  SELECT COUNT(*) INTO pdga_count
    FROM public.external_rounds
   WHERE user_id = _user_id AND source = 'pdga' AND format = 'singles'
     AND COALESCE(included, true) = true
     AND round_rating IS NOT NULL
     AND played_on >= (now() - interval '12 months')::date;

  IF pdga_count > 0 THEN
    src := 'pdga';
    window_months := CASE WHEN pdga_count >= 8 THEN 12 ELSE 24 END;
    WITH ratings AS (
      SELECT round_rating AS r, played_on
        FROM public.external_rounds
       WHERE user_id = _user_id AND source = 'pdga' AND format = 'singles'
         AND COALESCE(included, true) = true
         AND round_rating IS NOT NULL
         AND played_on >= (now() - make_interval(months => window_months))::date
       ORDER BY played_on DESC LIMIT 50
    ),
    stats AS (SELECT AVG(r) AS mean, COALESCE(stddev_pop(r),0) AS sd, COUNT(*) AS n FROM ratings),
    kept AS (SELECT r, played_on FROM ratings, stats WHERE stats.n < 8 OR r >= stats.mean - 2.5*stats.sd),
    ranked AS (
      SELECT r, played_on, ROW_NUMBER() OVER (ORDER BY r DESC) AS rn, COUNT(*) OVER () AS n FROM kept
    ),
    weighted AS (
      SELECT SUM(r * CASE WHEN rn <= GREATEST(1, CEIL(n::numeric/4)) THEN 2 ELSE 1 END)::numeric
           / NULLIF(SUM(CASE WHEN rn <= GREATEST(1, CEIL(n::numeric/4)) THEN 2 ELSE 1 END),0) AS avg_weighted,
             MAX(r) AS best, MIN(r) AS worst, MAX(played_on) AS last_played, COUNT(*) AS n
        FROM ranked
    )
    SELECT ROUND(avg_weighted)::int, best, worst, last_played, n
      INTO rating, best_r, worst_r, last_date, used
      FROM weighted;
  ELSE
    src := 'fallback';
    WITH combined AS (
      SELECT round_rating AS r, created_at::date AS d
        FROM public.round_ratings WHERE user_id = _user_id AND round_rating IS NOT NULL
      UNION ALL
      SELECT round_rating AS r, played_on AS d
        FROM public.external_rounds
       WHERE user_id = _user_id AND round_rating IS NOT NULL AND format = 'singles'
    ),
    last8 AS (SELECT r, d FROM combined ORDER BY d DESC LIMIT 8)
    SELECT ROUND(AVG(r))::int, MAX(r), MIN(r), MAX(d), COUNT(*)
      INTO rating, best_r, worst_r, last_date, used FROM last8;
  END IF;

  -- Prefer the official PDGA rating when we have it. It is the source of truth.
  IF official IS NOT NULL THEN
    rating := official;
    src := 'pdga_official';
  END IF;

  RETURN jsonb_build_object(
    'rating', COALESCE(rating, 0),
    'source', src,
    'used_rounds', COALESCE(used, 0),
    'best_round', best_r,
    'worst_round', worst_r,
    'last_round_date', last_date,
    'pdga_rounds_12mo', pdga_count,
    'window_months', COALESCE(window_months, 12),
    'official_pdga', official
  );
END; $function$;

-- Simple average helper: honor the official PDGA rating too
CREATE OR REPLACE FUNCTION public.player_rating_average(_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  pdga_count integer;
  window_months int;
  result integer;
  official integer;
BEGIN
  SELECT pdga_rating INTO official FROM public.profiles WHERE id = _user_id;
  IF official IS NOT NULL THEN RETURN official; END IF;

  SELECT COUNT(*) INTO pdga_count
    FROM public.external_rounds
   WHERE user_id = _user_id AND source = 'pdga' AND format = 'singles'
     AND COALESCE(included, true) = true AND round_rating IS NOT NULL
     AND played_on >= (now() - interval '12 months')::date;

  IF pdga_count > 0 THEN
    window_months := CASE WHEN pdga_count >= 8 THEN 12 ELSE 24 END;
    WITH ratings AS (
      SELECT round_rating::numeric AS r
        FROM public.external_rounds
       WHERE user_id = _user_id AND source = 'pdga' AND format = 'singles'
         AND COALESCE(included, true) = true AND round_rating IS NOT NULL
         AND played_on >= (now() - make_interval(months => window_months))::date
       ORDER BY played_on DESC LIMIT 50
    ),
    stats AS (SELECT AVG(r) AS mean, COALESCE(stddev_pop(r),0) AS sd, COUNT(*) AS n FROM ratings),
    kept AS (SELECT r FROM ratings, stats WHERE stats.n < 8 OR r >= stats.mean - 2.5*stats.sd),
    ranked AS (SELECT r, ROW_NUMBER() OVER (ORDER BY r DESC) AS rn, COUNT(*) OVER () AS n FROM kept),
    weighted AS (
      SELECT SUM(r * CASE WHEN rn <= GREATEST(1, CEIL(n::numeric/4)) THEN 2 ELSE 1 END) AS ws,
             SUM(CASE WHEN rn <= GREATEST(1, CEIL(n::numeric/4)) THEN 2 ELSE 1 END) AS w FROM ranked
    )
    SELECT COALESCE(ROUND(ws / NULLIF(w,0))::int, 0) INTO result FROM weighted;
    RETURN result;
  END IF;

  WITH combined AS (
    SELECT round_rating::numeric AS r, created_at AS ts
      FROM public.round_ratings WHERE user_id = _user_id AND round_rating IS NOT NULL
    UNION ALL
    SELECT round_rating::numeric AS r, played_on::timestamptz AS ts
      FROM public.external_rounds
     WHERE user_id = _user_id AND round_rating IS NOT NULL AND format = 'singles'
  ),
  last8 AS (SELECT r FROM combined ORDER BY ts DESC LIMIT 8)
  SELECT COALESCE(ROUND(AVG(r))::int, 0) INTO result FROM last8;
  RETURN result;
END; $function$;
