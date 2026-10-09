ALTER TABLE public.pdga_players
  ADD COLUMN IF NOT EXISTS membership_status text,
  ADD COLUMN IF NOT EXISTS membership_expires date,
  ADD COLUMN IF NOT EXISTS official_expires date,
  ADD COLUMN IF NOT EXISTS career_events integer,
  ADD COLUMN IF NOT EXISTS rating_delta integer,
  ADD COLUMN IF NOT EXISTS photo_url text;