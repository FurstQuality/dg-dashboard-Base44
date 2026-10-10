ALTER TABLE public.league_events ADD COLUMN IF NOT EXISTS format text, ADD COLUMN IF NOT EXISTS payout_notes text;
COMMENT ON COLUMN public.league_events.format IS 'Night-only format override; NULL inherits leagues.format.';
COMMENT ON COLUMN public.league_events.payout_notes IS 'Night-only payout note override; NULL inherits leagues.payout_notes.';