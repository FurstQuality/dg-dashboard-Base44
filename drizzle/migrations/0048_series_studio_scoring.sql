ALTER TABLE public.event_series
  ADD COLUMN IF NOT EXISTS field_size_bonus integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS min_event_points integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS scoring_version text NOT NULL DEFAULT 'series-scoring@1',
  ADD COLUMN IF NOT EXISTS finale_event_id uuid,
  ADD COLUMN IF NOT EXISTS season_start date,
  ADD COLUMN IF NOT EXISTS season_end date;
COMMENT ON COLUMN public.event_series.field_size_bonus IS 'field_size points system: points = division field size + bonus - place.';
COMMENT ON COLUMN public.event_series.min_event_points IS 'Floor for points earned at one event (field_size system).';
COMMENT ON COLUMN public.event_series.finale_event_id IS 'Tournament or league id of the single finale event; NULL = none.';
COMMENT ON COLUMN public.event_series.season_start IS 'Optional explicit season start; public pages derive dates from linked events when NULL.';