
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
BEGIN
  IF _score IS NULL OR _score <= 0 OR _to_par IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT pdga_rating INTO anchor FROM public.profiles WHERE id = _user_id;
  IF anchor IS NULL THEN anchor := 900; END IF;

  -- 8 pts per stroke vs par; softer slope than PDGA (~10) since UDisc rounds
  -- lack real SSA and casual layouts play easier than tournament setups.
  base := anchor - (_to_par * 8);

  -- Cap upside at anchor + 40 so casual hot rounds don't inflate the rating.
  -- Floor at anchor - 120 to keep truly bad rounds meaningful without extremes.
  RETURN GREATEST(anchor - 120, LEAST(anchor + 40, ROUND(base)::int));
END; $$;

REVOKE EXECUTE ON FUNCTION public.estimate_chainlink_from_par(uuid, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.estimate_chainlink_from_par(uuid, numeric, numeric) TO service_role;

-- Rebackfill UDisc rounds with the new curve.
UPDATE public.external_rounds er
   SET chainlink_rating = public.estimate_chainlink_from_par(er.user_id, er.score::numeric, er.to_par::numeric)
 WHERE source = 'udisc'
   AND score IS NOT NULL AND score > 0
   AND to_par IS NOT NULL;
