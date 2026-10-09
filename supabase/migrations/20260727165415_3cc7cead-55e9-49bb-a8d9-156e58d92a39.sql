
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS scene_profile_urls jsonb NOT NULL DEFAULT '{}'::jsonb;
