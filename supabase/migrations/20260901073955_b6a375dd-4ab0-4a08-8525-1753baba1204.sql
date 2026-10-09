ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_event_director boolean NOT NULL DEFAULT false;