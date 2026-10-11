ALTER TABLE public.holes ADD COLUMN IF NOT EXISTS par_confirmed boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.holes.par_confirmed IS 'false = par is the automatic default 3, shown as "Par not confirmed"; true once entered or changed by a person/source.';
UPDATE public.holes SET par_confirmed = true WHERE par IS NOT NULL AND par <> 3;

CREATE OR REPLACE FUNCTION public.holes_track_par_confirmed()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.par IS NOT NULL AND NEW.par <> 3 THEN NEW.par_confirmed := true; END IF;
  ELSIF NEW.par IS DISTINCT FROM OLD.par THEN
    NEW.par_confirmed := true;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_holes_par_confirmed ON public.holes;
CREATE TRIGGER trg_holes_par_confirmed BEFORE INSERT OR UPDATE ON public.holes
FOR EACH ROW EXECUTE FUNCTION public.holes_track_par_confirmed();