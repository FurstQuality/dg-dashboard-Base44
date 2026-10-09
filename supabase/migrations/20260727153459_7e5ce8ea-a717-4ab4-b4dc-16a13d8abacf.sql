ALTER TABLE public.admin_settings
  ADD COLUMN IF NOT EXISTS platform_config jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS privacy_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;