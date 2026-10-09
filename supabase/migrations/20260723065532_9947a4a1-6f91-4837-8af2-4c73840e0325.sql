ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS favorite_ace text,
  ADD COLUMN IF NOT EXISTS ace_count_manual integer;