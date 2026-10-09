ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pdga_profile_url text,
  ADD COLUMN IF NOT EXISTS scene_profile_url text,
  ADD COLUMN IF NOT EXISTS udisc_profile_url text;