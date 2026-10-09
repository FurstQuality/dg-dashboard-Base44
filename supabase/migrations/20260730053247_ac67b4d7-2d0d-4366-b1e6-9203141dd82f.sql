ALTER TABLE public.tracker_live_scores
  ADD COLUMN IF NOT EXISTS hole_pars jsonb,
  ADD COLUMN IF NOT EXISTS hole_lengths jsonb,
  ADD COLUMN IF NOT EXISTS hole_length_units text;