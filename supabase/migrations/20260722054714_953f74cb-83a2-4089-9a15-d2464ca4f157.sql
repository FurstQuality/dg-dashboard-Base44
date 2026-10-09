ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS flythrough_url text,
  ADD COLUMN IF NOT EXISTS flythrough_path text,
  ADD COLUMN IF NOT EXISTS flythrough_poster_url text;