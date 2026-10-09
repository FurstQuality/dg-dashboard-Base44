ALTER TABLE public.holes
  ADD COLUMN IF NOT EXISTS flight_path jsonb NOT NULL DEFAULT '[]'::jsonb;