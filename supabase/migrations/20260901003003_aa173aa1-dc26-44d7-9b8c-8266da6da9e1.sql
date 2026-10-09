ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS youtube_url text,
  ADD COLUMN IF NOT EXISTS tiktok_url text,
  ADD COLUMN IF NOT EXISTS x_url text,
  ADD COLUMN IF NOT EXISTS discgolfscene_url text,
  ADD COLUMN IF NOT EXISTS discord_url text;