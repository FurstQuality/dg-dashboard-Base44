
ALTER TABLE public.range_sessions ADD COLUMN IF NOT EXISTS session_discs jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.range_sessions ADD COLUMN IF NOT EXISTS wind_gust_mph integer;
ALTER TABLE public.range_sessions ADD COLUMN IF NOT EXISTS wind_deg integer;
ALTER TABLE public.range_sessions ADD COLUMN IF NOT EXISTS temperature_f integer;
ALTER TABLE public.range_sessions ADD COLUMN IF NOT EXISTS weather_synced_at timestamptz;

ALTER TABLE public.putting_sessions ADD COLUMN IF NOT EXISTS session_discs jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.putting_sessions ADD COLUMN IF NOT EXISTS wind_gust_mph integer;
ALTER TABLE public.putting_sessions ADD COLUMN IF NOT EXISTS wind_deg integer;
ALTER TABLE public.putting_sessions ADD COLUMN IF NOT EXISTS temperature_f integer;
ALTER TABLE public.putting_sessions ADD COLUMN IF NOT EXISTS weather_synced_at timestamptz;
