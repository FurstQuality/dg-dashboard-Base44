DROP TRIGGER IF EXISTS trg_guard_tournament_series_link ON public.tournaments;
CREATE TRIGGER trg_guard_tournament_series_link BEFORE INSERT OR UPDATE OF series_id ON public.tournaments
FOR EACH ROW EXECUTE FUNCTION public.guard_league_series_link();