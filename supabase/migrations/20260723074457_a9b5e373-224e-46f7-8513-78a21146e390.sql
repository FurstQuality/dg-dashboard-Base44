ALTER TABLE public.range_sessions
  ADD COLUMN IF NOT EXISTS cone_markers jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS coaching_challenges jsonb NOT NULL DEFAULT '[]'::jsonb;