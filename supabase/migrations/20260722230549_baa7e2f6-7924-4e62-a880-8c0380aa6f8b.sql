
-- Estimator for rounds without SSA/round_rating (UDisc case).
-- Uses the player's official PDGA rating (or 900 fallback) as the anchor,
-- subtracts 10 pts per stroke over par, and gives a hot-round bonus of +2/stroke
-- for anything better than -5 vs par. Requires a valid score (>0) and to_par present.
CREATE OR REPLACE FUNCTION public.estimate_chainlink_from_par(_user_id uuid, _score numeric, _to_par numeric)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  anchor integer;
  base numeric;
  bonus numeric := 0;
  hot numeric;
BEGIN
  IF _score IS NULL OR _score <= 0 OR _to_par IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT pdga_rating INTO anchor FROM public.profiles WHERE id = _user_id;
  IF anchor IS NULL THEN anchor := 900; END IF;

  base := anchor - (_to_par * 10);

  -- Hot round bonus: every stroke better than -5 vs par worth +2 extra
  IF _to_par < -5 THEN
    hot := (-5) - _to_par;  -- positive strokes beyond -5
    bonus := hot * 2;
  END IF;

  RETURN GREATEST(500, LEAST(1100, ROUND(base + bonus)::int));
END; $$;

REVOKE EXECUTE ON FUNCTION public.estimate_chainlink_from_par(uuid, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.estimate_chainlink_from_par(uuid, numeric, numeric) TO service_role;

-- Update trigger to fall back to the estimator when SSA/round_rating are missing.
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
    IF NEW.chainlink_rating IS NULL THEN
      NEW.chainlink_rating := public.estimate_chainlink_from_par(
        NEW.user_id, NEW.score::numeric, NEW.to_par::numeric
      );
    END IF;
  END IF;
  RETURN NEW;
END; $$;

-- Backfill every existing round missing a Chainlink rating.
UPDATE public.external_rounds er
   SET chainlink_rating = public.estimate_chainlink_from_par(er.user_id, er.score::numeric, er.to_par::numeric)
 WHERE chainlink_rating IS NULL
   AND score IS NOT NULL AND score > 0
   AND to_par IS NOT NULL;
