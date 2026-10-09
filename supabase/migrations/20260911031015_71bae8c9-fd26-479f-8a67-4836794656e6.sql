-- Any round rating published by the source of record (PDGA, UDisc, Disc Golf
-- Scene sanctioned events) is the TRUE rating for that round. DG Dashboard
-- estimates are only used when the source published nothing.
CREATE OR REPLACE FUNCTION public.set_mock_pdga_on_external_round()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r_int int; r_src text;
BEGIN
  IF NEW.round_rating IS NOT NULL THEN
    NEW.mock_pdga_rating := NEW.round_rating;
    NEW.mock_pdga_source := CASE
      WHEN NEW.source = 'udisc' THEN 'udisc_official'
      WHEN NEW.source IN ('pdga', 'disc_golf_scene') THEN 'pdga_official'
      ELSE 'source_official'
    END;
    RETURN NEW;
  END IF;
  IF NEW.format IS DISTINCT FROM 'singles' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.mock_pdga_rating IS NOT NULL
     AND NEW.mock_pdga_source NOT IN ('udisc_official','pdga_official','source_official')
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

REVOKE EXECUTE ON FUNCTION public.set_mock_pdga_on_external_round() FROM PUBLIC, anon, authenticated;

-- Backfill: existing rows that already carry a source-published rating.
UPDATE public.external_rounds
   SET mock_pdga_rating = round_rating,
       mock_pdga_source = CASE
         WHEN source = 'udisc' THEN 'udisc_official'
         WHEN source IN ('pdga','disc_golf_scene') THEN 'pdga_official'
         ELSE 'source_official'
       END
 WHERE round_rating IS NOT NULL
   AND (mock_pdga_rating IS DISTINCT FROM round_rating
        OR mock_pdga_source NOT IN ('udisc_official','pdga_official','source_official'));