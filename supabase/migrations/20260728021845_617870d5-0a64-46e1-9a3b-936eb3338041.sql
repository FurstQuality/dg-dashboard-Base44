
ALTER TABLE public.scheduled_events
  ADD COLUMN IF NOT EXISTS recurrence_dow smallint NULL
    CHECK (recurrence_dow IS NULL OR (recurrence_dow >= 0 AND recurrence_dow <= 6));

COMMENT ON COLUMN public.scheduled_events.recurrence_dow IS
  'If set (0=Sun..6=Sat), event recurs only on that weekday within [starts_on, ends_on] on the calendar.';

-- Portage Sanctioned Singles → Tuesday
UPDATE public.scheduled_events SET recurrence_dow = 2
  WHERE recurrence_dow IS NULL AND title ILIKE '%portage%' AND title ILIKE '%singles%';

-- Duneland Singles → Wednesday
UPDATE public.scheduled_events SET recurrence_dow = 3
  WHERE recurrence_dow IS NULL AND title ILIKE '%duneland%' AND title ILIKE '%singles%';

-- Heuristic: multi-day PDGA rows with a weekday name in the title
UPDATE public.scheduled_events SET recurrence_dow = CASE
    WHEN title ~* '\ysunday\y'    THEN 0
    WHEN title ~* '\ymonday\y'    THEN 1
    WHEN title ~* '\ytuesday\y'   THEN 2
    WHEN title ~* '\ywednesday\y' THEN 3
    WHEN title ~* '\ythursday\y'  THEN 4
    WHEN title ~* '\yfriday\y'    THEN 5
    WHEN title ~* '\ysaturday\y'  THEN 6
  END
  WHERE recurrence_dow IS NULL
    AND starts_on IS NOT NULL
    AND ends_on IS NOT NULL
    AND ends_on > starts_on
    AND title ~* '\y(sun|mon|tues|wednes|thurs|fri|satur)day\y';
