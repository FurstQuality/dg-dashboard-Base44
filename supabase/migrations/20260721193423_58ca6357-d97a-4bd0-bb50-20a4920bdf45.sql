ALTER TABLE public.holes ADD COLUMN IF NOT EXISTS tee_sign_url text;
ALTER TABLE public.holes ADD COLUMN IF NOT EXISTS map_snapshot_url text;
ALTER TABLE public.holes ADD COLUMN IF NOT EXISTS map_center_lat double precision;
ALTER TABLE public.holes ADD COLUMN IF NOT EXISTS map_center_lng double precision;
ALTER TABLE public.holes ADD COLUMN IF NOT EXISTS map_zoom double precision;