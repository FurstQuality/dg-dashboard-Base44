
CREATE OR REPLACE FUNCTION public.require_tournament_core_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.course_id IS NULL THEN
    RAISE EXCEPTION 'A course is required for every tournament. Pick a course before publishing.'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.name IS NULL OR btrim(NEW.name) = '' THEN
    RAISE EXCEPTION 'Tournament name is required.' USING ERRCODE = '23514';
  END IF;
  IF NEW.start_date IS NULL OR NEW.end_date IS NULL THEN
    RAISE EXCEPTION 'Tournament start and end dates are required.' USING ERRCODE = '23514';
  END IF;
  IF NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'Tournament end date cannot be before start date.' USING ERRCODE = '23514';
  END IF;
  IF NEW.format IS NULL THEN
    RAISE EXCEPTION 'Tournament format is required.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_tournament_core_fields ON public.tournaments;
CREATE TRIGGER trg_require_tournament_core_fields
BEFORE INSERT ON public.tournaments
FOR EACH ROW EXECUTE FUNCTION public.require_tournament_core_fields();

CREATE OR REPLACE FUNCTION public.require_league_core_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.course_id IS NULL THEN
    RAISE EXCEPTION 'A course is required for every league. Pick the course players compete at each week.'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.name IS NULL OR btrim(NEW.name) = '' THEN
    RAISE EXCEPTION 'League name is required.' USING ERRCODE = '23514';
  END IF;
  IF NEW.start_date IS NULL THEN
    RAISE EXCEPTION 'League start date is required.' USING ERRCODE = '23514';
  END IF;
  IF NEW.day_of_week IS NULL THEN
    RAISE EXCEPTION 'League day of week is required — pick the weekday the league plays.'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.format IS NULL OR btrim(NEW.format) = '' THEN
    RAISE EXCEPTION 'League format is required.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_league_core_fields ON public.leagues;
CREATE TRIGGER trg_require_league_core_fields
BEFORE INSERT ON public.leagues
FOR EACH ROW EXECUTE FUNCTION public.require_league_core_fields();

CREATE OR REPLACE FUNCTION public.require_round_course()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.course_id IS NULL THEN
    RAISE EXCEPTION 'A course is required to start a round.' USING ERRCODE = '23514';
  END IF;
  IF NEW.layout_id IS NULL THEN
    RAISE EXCEPTION 'A layout is required to start a round.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_round_course ON public.rounds;
CREATE TRIGGER trg_require_round_course
BEFORE INSERT ON public.rounds
FOR EACH ROW EXECUTE FUNCTION public.require_round_course();

CREATE OR REPLACE FUNCTION public.require_tournament_round_course()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.course_id IS NULL THEN
    RAISE EXCEPTION 'Each tournament round needs a course.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_tournament_round_course ON public.tournament_rounds;
CREATE TRIGGER trg_require_tournament_round_course
BEFORE INSERT ON public.tournament_rounds
FOR EACH ROW EXECUTE FUNCTION public.require_tournament_round_course();

CREATE OR REPLACE FUNCTION public.require_league_event_core()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.course_id IS NULL THEN
    RAISE EXCEPTION 'Each weekly league event needs a course.' USING ERRCODE = '23514';
  END IF;
  IF NEW.event_date IS NULL THEN
    RAISE EXCEPTION 'Each weekly league event needs a date.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_league_event_core ON public.league_events;
CREATE TRIGGER trg_require_league_event_core
BEFORE INSERT ON public.league_events
FOR EACH ROW EXECUTE FUNCTION public.require_league_event_core();
