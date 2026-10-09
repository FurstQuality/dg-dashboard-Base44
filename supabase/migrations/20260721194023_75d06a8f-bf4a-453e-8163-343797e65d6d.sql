ALTER TABLE public.holes
  ADD COLUMN IF NOT EXISTS map_snapshot_path text,
  ADD COLUMN IF NOT EXISTS map_center_lat double precision,
  ADD COLUMN IF NOT EXISTS map_center_lng double precision,
  ADD COLUMN IF NOT EXISTS map_zoom double precision;