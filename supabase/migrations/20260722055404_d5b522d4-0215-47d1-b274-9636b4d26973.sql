
ALTER TABLE public.holes
  ADD COLUMN IF NOT EXISTS flythrough_path text,
  ADD COLUMN IF NOT EXISTS flythrough_url text;
