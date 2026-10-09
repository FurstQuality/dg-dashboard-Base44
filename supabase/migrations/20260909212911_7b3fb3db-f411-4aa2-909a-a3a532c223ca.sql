CREATE OR REPLACE FUNCTION public.set_chainlink_on_external_round()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END; $function$;

CREATE OR REPLACE FUNCTION public.set_mock_pdga_on_external_round()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END; $function$;

REVOKE EXECUTE ON FUNCTION public.set_chainlink_on_external_round() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_mock_pdga_on_external_round() FROM PUBLIC, anon, authenticated;