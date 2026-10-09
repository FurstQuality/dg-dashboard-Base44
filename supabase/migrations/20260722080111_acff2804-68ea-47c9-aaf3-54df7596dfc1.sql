
-- ============================================================
-- 1. Format tagging on external_rounds
-- ============================================================
ALTER TABLE public.external_rounds
  ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'singles',
  ADD COLUMN IF NOT EXISTS division text,
  ADD COLUMN IF NOT EXISTS included boolean,
  ADD COLUMN IF NOT EXISTS evaluated_on date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'external_rounds_format_check'
  ) THEN
    ALTER TABLE public.external_rounds
      ADD CONSTRAINT external_rounds_format_check
      CHECK (format IN ('singles','doubles','team','other'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS external_rounds_user_format_idx
  ON public.external_rounds(user_id, format, played_on DESC);

-- Backfill doubles from name patterns
UPDATE public.external_rounds
   SET format = 'doubles'
 WHERE format = 'singles'
   AND (
     COALESCE(event_name,'')  ~* '\y(doubles|dubs|best shot|worst shot|captain''?s choice|alt(ernate)? shot|scramble)\y'
  OR COALESCE(layout_name,'') ~* '\y(doubles|dubs|best shot|worst shot|captain''?s choice|alt(ernate)? shot|scramble)\y'
  OR COALESCE(notes,'')       ~* '\y(doubles|dubs)\y'
  OR COALESCE(course_name,'') ~* '\y(doubles|dubs)\y'
   );

-- Backfill team events
UPDATE public.external_rounds
   SET format = 'team'
 WHERE format = 'singles'
   AND (
     COALESCE(event_name,'')  ~* '\y(team event|4[- ]person|3[- ]person|team[- ]scramble|shotgun team)\y'
  OR COALESCE(layout_name,'') ~* '\y(team event|4[- ]person|3[- ]person)\y'
   );

-- PDGA "DOU" divisions
UPDATE public.external_rounds
   SET format = 'doubles'
 WHERE source = 'pdga'
   AND (division ~* '^DOU' OR event_name ~* '\ydoubles\y');

-- ============================================================
-- 2. player_rating_average — singles only, PDGA 12→24mo window
-- ============================================================
CREATE OR REPLACE FUNCTION public.player_rating_average(_user_id uuid)
 RETURNS integer LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $function$
DECLARE
  pdga_count integer;
  window_months int;
  result integer;
BEGIN
  SELECT COUNT(*) INTO pdga_count
    FROM public.external_rounds
   WHERE user_id = _user_id
     AND source = 'pdga'
     AND format = 'singles'
     AND COALESCE(included, true) = true
     AND round_rating IS NOT NULL
     AND played_on >= (now() - interval '12 months')::date;

  IF pdga_count > 0 THEN
    window_months := CASE WHEN pdga_count >= 8 THEN 12 ELSE 24 END;
    WITH ratings AS (
      SELECT round_rating::numeric AS r
        FROM public.external_rounds
       WHERE user_id = _user_id
         AND source = 'pdga'
         AND format = 'singles'
         AND COALESCE(included, true) = true
         AND round_rating IS NOT NULL
         AND played_on >= (now() - make_interval(months => window_months))::date
       ORDER BY played_on DESC
       LIMIT 50
    ),
    stats AS (SELECT AVG(r) AS mean, COALESCE(stddev_pop(r),0) AS sd, COUNT(*) AS n FROM ratings),
    kept AS (SELECT r FROM ratings, stats WHERE stats.n < 8 OR r >= stats.mean - 2.5*stats.sd),
    ranked AS (
      SELECT r, ROW_NUMBER() OVER (ORDER BY r DESC) AS rn, COUNT(*) OVER () AS n FROM kept
    ),
    weighted AS (
      SELECT SUM(r * CASE WHEN rn <= GREATEST(1, CEIL(n::numeric/4)) THEN 2 ELSE 1 END) AS ws,
             SUM(CASE WHEN rn <= GREATEST(1, CEIL(n::numeric/4)) THEN 2 ELSE 1 END) AS w
        FROM ranked
    )
    SELECT COALESCE(ROUND(ws / NULLIF(w,0))::int, 0) INTO result FROM weighted;
    RETURN result;
  END IF;

  -- Fallback: singles only, blended pool, last 8 unweighted
  WITH combined AS (
    SELECT round_rating::numeric AS r, created_at AS ts
      FROM public.round_ratings
     WHERE user_id = _user_id AND round_rating IS NOT NULL
    UNION ALL
    SELECT round_rating::numeric AS r, played_on::timestamptz AS ts
      FROM public.external_rounds
     WHERE user_id = _user_id AND round_rating IS NOT NULL AND format = 'singles'
  ),
  last8 AS (SELECT r FROM combined ORDER BY ts DESC LIMIT 8)
  SELECT COALESCE(ROUND(AVG(r))::int, 0) INTO result FROM last8;
  RETURN result;
END; $function$;

-- ============================================================
-- 3. player_rating_details — same rules + provenance
-- ============================================================
CREATE OR REPLACE FUNCTION public.player_rating_details(_user_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $function$
DECLARE
  pdga_count integer;
  window_months int;
  best_r integer; worst_r integer; last_date date; rating integer; used integer; src text;
BEGIN
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

  RETURN jsonb_build_object(
    'rating', COALESCE(rating, 0),
    'source', src,
    'used_rounds', COALESCE(used, 0),
    'best_round', best_r,
    'worst_round', worst_r,
    'last_round_date', last_date,
    'pdga_rounds_12mo', pdga_count,
    'window_months', COALESCE(window_months, 12)
  );
END; $function$;

-- ============================================================
-- 4. action_items — "What I Need To Do" tracker
-- ============================================================
CREATE TABLE IF NOT EXISTS public.action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  priority smallint NOT NULL DEFAULT 2,
  target_value numeric,
  current_value numeric NOT NULL DEFAULT 0,
  unit text,
  due_date date,
  is_system boolean NOT NULL DEFAULT false,
  system_key text,
  status text NOT NULL DEFAULT 'active',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT action_items_category_check CHECK (category IN ('rating','scoring','tournament','course','community','custom','general')),
  CONSTRAINT action_items_priority_check CHECK (priority BETWEEN 1 AND 3),
  CONSTRAINT action_items_status_check   CHECK (status IN ('active','done','dismissed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS action_items_user_syskey_uk
  ON public.action_items(user_id, system_key) WHERE system_key IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.action_items TO authenticated;
GRANT ALL ON public.action_items TO service_role;

ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own action items" ON public.action_items;
CREATE POLICY "Users manage own action items" ON public.action_items
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS action_items_touch_updated ON public.action_items;
CREATE TRIGGER action_items_touch_updated
BEFORE UPDATE ON public.action_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS action_items_user_status_idx
  ON public.action_items(user_id, status, priority);
