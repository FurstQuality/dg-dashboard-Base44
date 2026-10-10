-- A league may only join a series its editor owns (or that it already belongs to).
CREATE OR REPLACE FUNCTION public.guard_league_series_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.series_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.series_id IS DISTINCT FROM OLD.series_id)
     AND auth.uid() IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.event_series s WHERE s.id = NEW.series_id AND s.owner_id = auth.uid())
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'You can only add a league to a series you run.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_league_series_link ON public.leagues;
CREATE TRIGGER trg_guard_league_series_link BEFORE INSERT OR UPDATE OF series_id ON public.leagues
FOR EACH ROW EXECUTE FUNCTION public.guard_league_series_link();