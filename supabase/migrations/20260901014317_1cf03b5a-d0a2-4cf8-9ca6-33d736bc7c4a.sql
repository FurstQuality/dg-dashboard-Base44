ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS registration_opens timestamp with time zone,
  ADD COLUMN IF NOT EXISTS registration_closes timestamp with time zone;