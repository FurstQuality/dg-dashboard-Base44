
-- 1. Dedupe external_rounds (keep earliest by created_at per natural key)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, source, course_name, COALESCE(layout_name,''), played_on, COALESCE(score,-9999), format
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.external_rounds
)
DELETE FROM public.external_rounds e
USING ranked r
WHERE e.id = r.id AND r.rn > 1;

-- 2. Prevent future dupes
CREATE UNIQUE INDEX IF NOT EXISTS external_rounds_natural_key_idx
  ON public.external_rounds (user_id, source, course_name, (COALESCE(layout_name,'')), played_on, (COALESCE(score,-9999)), format);

-- 3. Add chainlink_rating to external_rounds
ALTER TABLE public.external_rounds
  ADD COLUMN IF NOT EXISTS chainlink_rating integer;

-- 4. Add chainlink_rating to round_ratings
ALTER TABLE public.round_ratings
  ADD COLUMN IF NOT EXISTS chainlink_rating integer;

-- 5. Shared calc function: PDGA baseline + 20% amplification beyond -5 strokes vs SSA
CREATE OR REPLACE FUNCTION public.compute_chainlink_round(
  _score numeric, _ssa numeric, _stroke_value numeric DEFAULT 10,
  _base_rating integer DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  diff numeric;
  sv numeric := COALESCE(_stroke_value, 10);
  base_rating integer;
  bonus numeric := 0;
BEGIN
  IF _score IS NULL OR _ssa IS NULL THEN
    RETURN _base_rating;
  END IF;
  diff := _score - _ssa;
  base_rating := COALESCE(_base_rating, ROUND(1000 - diff * sv)::int);
  -- Amplify hot rounds (beat SSA by more than 5)
  IF diff < -5 THEN
    bonus := ((-diff) - 5) * (sv * 0.20);
  END IF;
  RETURN base_rating + ROUND(bonus)::int;
END;
$$;

-- 6. Backfill external_rounds
UPDATE public.external_rounds
   SET chainlink_rating = public.compute_chainlink_round(
     score::numeric, ssa::numeric, 10, round_rating
   )
 WHERE (score IS NOT NULL AND ssa IS NOT NULL) OR round_rating IS NOT NULL;

-- Fallback: rounds with only round_rating and no ssa — use round_rating directly
UPDATE public.external_rounds
   SET chainlink_rating = round_rating
 WHERE chainlink_rating IS NULL AND round_rating IS NOT NULL;

-- 7. Backfill round_ratings using scratch_rating as SSA proxy and its stroke_value
UPDATE public.round_ratings
   SET chainlink_rating = public.compute_chainlink_round(
     total_strokes::numeric,
     -- back out ssa from: round_rating = 1000 - (total_strokes - ssa)*sv
     (total_strokes::numeric - ((1000 - round_rating)::numeric / NULLIF(stroke_value,0))),
     stroke_value::numeric,
     round_rating
   );

-- 8. Auto-populate chainlink_rating on future inserts
CREATE OR REPLACE FUNCTION public.set_chainlink_on_external_round()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.chainlink_rating IS NULL THEN
    NEW.chainlink_rating := public.compute_chainlink_round(
      NEW.score::numeric, NEW.ssa::numeric, 10, NEW.round_rating
    );
    IF NEW.chainlink_rating IS NULL AND NEW.round_rating IS NOT NULL THEN
      NEW.chainlink_rating := NEW.round_rating;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_external_rounds_chainlink ON public.external_rounds;
CREATE TRIGGER trg_external_rounds_chainlink
  BEFORE INSERT OR UPDATE OF score, ssa, round_rating ON public.external_rounds
  FOR EACH ROW EXECUTE FUNCTION public.set_chainlink_on_external_round();

CREATE OR REPLACE FUNCTION public.set_chainlink_on_round_rating()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE ssa_calc numeric;
BEGIN
  IF NEW.chainlink_rating IS NULL AND NEW.stroke_value IS NOT NULL AND NEW.stroke_value > 0 THEN
    ssa_calc := NEW.total_strokes::numeric - ((1000 - NEW.round_rating)::numeric / NEW.stroke_value);
    NEW.chainlink_rating := public.compute_chainlink_round(
      NEW.total_strokes::numeric, ssa_calc, NEW.stroke_value::numeric, NEW.round_rating
    );
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_round_ratings_chainlink ON public.round_ratings;
CREATE TRIGGER trg_round_ratings_chainlink
  BEFORE INSERT OR UPDATE OF total_strokes, round_rating, stroke_value ON public.round_ratings
  FOR EACH ROW EXECUTE FUNCTION public.set_chainlink_on_round_rating();
