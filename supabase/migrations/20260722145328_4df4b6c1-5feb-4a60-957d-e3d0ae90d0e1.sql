ALTER TABLE public.avatar_configs
  ADD COLUMN IF NOT EXISTS rpm_avatar_url text,
  ADD COLUMN IF NOT EXISTS rpm_avatar_updated_at timestamptz;