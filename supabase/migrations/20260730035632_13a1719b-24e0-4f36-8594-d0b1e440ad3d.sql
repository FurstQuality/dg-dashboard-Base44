ALTER TABLE public.tracker_event_rounds DROP CONSTRAINT IF EXISTS tracker_event_rounds_event_round_div_key;
CREATE UNIQUE INDEX IF NOT EXISTS tracker_event_rounds_event_round_div_pool_key
  ON public.tracker_event_rounds (event_id, round_number, division, pool) NULLS NOT DISTINCT;