-- A league/series is season-level; course belongs to each night. Parent course is only a default for new nights.
CREATE OR REPLACE FUNCTION public.require_league_core_fields()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.name IS NULL OR btrim(NEW.name) = '' THEN
    RAISE EXCEPTION 'League name is required.' USING ERRCODE = '23514';
  END IF;
  IF NEW.start_date IS NULL THEN
    RAISE EXCEPTION 'League start date is required.' USING ERRCODE = '23514';
  END IF;
  IF NEW.day_of_week IS NULL THEN
    RAISE EXCEPTION 'League day of week is required — pick the weekday the league plays.' USING ERRCODE = '23514';
  END IF;
  IF NEW.format IS NULL OR btrim(NEW.format) = '' THEN
    RAISE EXCEPTION 'League format is required.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

-- A night may be "Course TBD"; readiness shows it, saving never blocks on it.
CREATE OR REPLACE FUNCTION public.require_league_event_core()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.event_date IS NULL THEN
    RAISE EXCEPTION 'Each league night needs a date.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON COLUMN public.leagues.course_id IS 'Default course for newly created nights only. Not authoritative: each league_events row owns its course.';
COMMENT ON COLUMN public.leagues.layout_id IS 'Default layout for newly created nights only. Not authoritative.';
COMMENT ON COLUMN public.league_events.course_id IS 'Authoritative course for this night. NULL = course TBD (readiness issue).';

-- Backfill nights missing a course from the parent default (unambiguous case only; never overwrite existing).
UPDATE public.league_events le
   SET course_id = l.course_id
  FROM public.leagues l
 WHERE le.league_id = l.id AND le.course_id IS NULL AND l.course_id IS NOT NULL;