ALTER TABLE public.league_events
  ADD COLUMN IF NOT EXISTS start_time time,
  ADD COLUMN IF NOT EXISTS check_in_time time,
  ADD COLUMN IF NOT EXISTS details text,
  ADD COLUMN IF NOT EXISTS entry_fee_cents integer;
COMMENT ON COLUMN public.league_events.start_time IS 'Local tee/start time for this league night; null = league default.';
COMMENT ON COLUMN public.league_events.entry_fee_cents IS 'Per-night fee override; null = league fee.';