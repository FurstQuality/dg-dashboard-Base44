ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS pdga_rating numeric,
  ADD COLUMN IF NOT EXISTS pdga_rating_votes integer,
  ADD COLUMN IF NOT EXISTS year_established integer;