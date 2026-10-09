
DROP TRIGGER IF EXISTS trg_require_tournament_core_fields_upd ON public.tournaments;
CREATE TRIGGER trg_require_tournament_core_fields_upd
BEFORE UPDATE ON public.tournaments
FOR EACH ROW WHEN (NEW.course_id IS NULL)
EXECUTE FUNCTION public.require_tournament_core_fields();

DROP TRIGGER IF EXISTS trg_require_league_core_fields_upd ON public.leagues;
CREATE TRIGGER trg_require_league_core_fields_upd
BEFORE UPDATE ON public.leagues
FOR EACH ROW WHEN (NEW.course_id IS NULL)
EXECUTE FUNCTION public.require_league_core_fields();

DROP TRIGGER IF EXISTS trg_require_round_course_upd ON public.rounds;
CREATE TRIGGER trg_require_round_course_upd
BEFORE UPDATE ON public.rounds
FOR EACH ROW WHEN (NEW.course_id IS NULL OR NEW.layout_id IS NULL)
EXECUTE FUNCTION public.require_round_course();

DROP TRIGGER IF EXISTS trg_require_tournament_round_course_upd ON public.tournament_rounds;
CREATE TRIGGER trg_require_tournament_round_course_upd
BEFORE UPDATE ON public.tournament_rounds
FOR EACH ROW WHEN (NEW.course_id IS NULL)
EXECUTE FUNCTION public.require_tournament_round_course();

DROP TRIGGER IF EXISTS trg_require_league_event_core_upd ON public.league_events;
CREATE TRIGGER trg_require_league_event_core_upd
BEFORE UPDATE ON public.league_events
FOR EACH ROW WHEN (NEW.course_id IS NULL OR NEW.event_date IS NULL)
EXECUTE FUNCTION public.require_league_event_core();
