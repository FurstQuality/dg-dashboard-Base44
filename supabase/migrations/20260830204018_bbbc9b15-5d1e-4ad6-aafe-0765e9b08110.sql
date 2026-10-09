ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS external_scoring text;
ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS external_scoring text;

ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS tournaments_external_scoring_check;
ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_external_scoring_check
  CHECK (external_scoring IS NULL OR external_scoring IN ('pdga_live','udisc'));
ALTER TABLE public.leagues DROP CONSTRAINT IF EXISTS leagues_external_scoring_check;
ALTER TABLE public.leagues ADD CONSTRAINT leagues_external_scoring_check
  CHECK (external_scoring IS NULL OR external_scoring IN ('pdga_live','udisc'));

CREATE OR REPLACE FUNCTION public.require_event_scoring_source()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.external_scoring IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.course_id IS NULL THEN
    RAISE EXCEPTION 'Pick a course with a built layout, or confirm you will use PDGA Live or UDisc scoring.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.course_layouts cl WHERE cl.course_id = NEW.course_id) THEN
    RAISE EXCEPTION 'This course has no layout built yet. Build the layout in the course builder, or confirm you will use PDGA Live or UDisc scoring.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tournaments_scoring_source ON public.tournaments;
CREATE TRIGGER trg_tournaments_scoring_source
  BEFORE INSERT OR UPDATE OF course_id, external_scoring ON public.tournaments
  FOR EACH ROW EXECUTE FUNCTION public.require_event_scoring_source();

DROP TRIGGER IF EXISTS trg_leagues_scoring_source ON public.leagues;
CREATE TRIGGER trg_leagues_scoring_source
  BEFORE INSERT OR UPDATE OF course_id, external_scoring ON public.leagues
  FOR EACH ROW EXECUTE FUNCTION public.require_event_scoring_source();