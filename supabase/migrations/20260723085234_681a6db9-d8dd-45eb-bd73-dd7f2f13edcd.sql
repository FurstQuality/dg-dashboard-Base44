
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS calendar_shared_with_friends boolean NOT NULL DEFAULT true;
