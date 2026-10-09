
DROP INDEX IF EXISTS public.tracker_event_rounds_event_round_div_key;

ALTER TABLE public.tracker_event_rounds
  ADD CONSTRAINT tracker_event_rounds_event_round_div_key
  UNIQUE NULLS NOT DISTINCT (event_id, round_number, division);
